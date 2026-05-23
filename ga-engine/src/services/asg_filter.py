"""
FinanMap Cripto - Filtro ASG (Algorithmic System Generation)
Baseado na metodologia de Sérgio Gargantini e Bruno Marques.

Pilares:
1. Linha Azul (HMA 50) — divisor de águas direcional
2. Filtro absoluto: acima=só compra, abaixo=só vende
3. Placar estatístico: CVD + agressão confirmam direção

Assertividade reportada: 65-78% com redução significativa de drawdown.
"""
import numpy as np
import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)

# Cache para evitar recálculo frequente
_asg_cache: dict = {}
ASG_CACHE_TTL = 60  # 1 minuto


def _cache_get(key: str):
    e = _asg_cache.get(key)
    if e and time.time() - e["ts"] < ASG_CACHE_TTL:
        return e["data"]
    return None


def _cache_set(key: str, data):
    _asg_cache[key] = {"ts": time.time(), "data": data}


def calculate_wma(prices: np.ndarray, period: int) -> np.ndarray:
    """Weighted Moving Average manual — evita dependência talib."""
    weights = np.arange(1, period + 1, dtype=float)
    result  = np.full(len(prices), np.nan)
    for i in range(period - 1, len(prices)):
        window = prices[i - period + 1 : i + 1]
        result[i] = np.dot(window, weights) / weights.sum()
    return result


def calculate_hma(prices: np.ndarray, period: int = 50) -> float:
    """
    Hull Moving Average (HMA) — Linha Azul do ASG.
    HMA = WMA(2 × WMA(n/2) − WMA(n), √n)
    Mais responsivo que EMA/SMA, menos lag.
    """
    if len(prices) < period + int(np.sqrt(period)):
        return float(prices[-1])  # fallback: preço atual

    half   = int(period / 2)
    sqrt_p = int(np.sqrt(period))

    wma_half = calculate_wma(prices, half)
    wma_full = calculate_wma(prices, period)

    # Raw HMA
    raw_hma = 2 * wma_half - wma_full

    # Remove NaN antes do WMA final
    valid = raw_hma[~np.isnan(raw_hma)]
    if len(valid) < sqrt_p:
        return float(prices[-1])

    wma_sqrt = calculate_wma(valid, sqrt_p)
    return float(wma_sqrt[-1])


def calculate_asg_line(closes: list, period: int = 50) -> float:
    """
    Calcula a Linha Azul (HMA 50) como divisor de águas do mercado.
    Retorna o valor atual da linha.
    """
    arr = np.array(closes, dtype=float)
    return calculate_hma(arr, period)


def calculate_statistical_scoreboard(
    cvd_score:       float,
    aggression_ratio: float,
    price_change_5m: float,
) -> dict:
    """
    Placar estatístico ASG — combina CVD, agressão e momentum.
    Score > 0 = pressão compradora
    Score < 0 = pressão vendedora
    """
    # Normaliza cada componente para -1 a +1
    cvd_norm  = float(np.clip(cvd_score, -1, 1))
    agg_norm  = (aggression_ratio - 0.5) * 2  # 0.5=neutro → 0, 1.0=max buy → +1
    mom_norm  = float(np.clip(price_change_5m * 100, -1, 1))

    # Score ponderado
    score = 0.50 * cvd_norm + 0.30 * agg_norm + 0.20 * mom_norm

    return {
        "score":           round(score, 4),
        "cvd_component":   round(cvd_norm, 4),
        "agg_component":   round(agg_norm, 4),
        "mom_component":   round(mom_norm, 4),
        "bias":            "bull" if score > 0.1 else "bear" if score < -0.1 else "neutral",
    }


def validate_asg_signal(
    current_price:    float,
    linha_azul:       float,
    signal:           str,          # "BUY" ou "SELL"
    cvd_score:        float,
    aggression_ratio: float = 0.5,
    price_change_5m:  float = 0.0,
) -> dict:
    """
    Aplica o filtro direcional absoluto do ASG.

    Regra de ouro:
    - Acima da Linha Azul → APENAS COMPRAS (bloqueio total de vendas)
    - Abaixo da Linha Azul → APENAS VENDAS (bloqueio total de compras)

    Retorna:
    - decision: "EXECUTE" ou "BLOCK"
    - rationale: explicação
    - asg_bias: "bull" ou "bear"
    - linha_azul: valor atual
    - distance_pct: distância percentual do preço à linha
    """
    distance_pct = (current_price - linha_azul) / linha_azul * 100
    above_line   = current_price > linha_azul
    asg_bias     = "bull" if above_line else "bear"

    scoreboard = calculate_statistical_scoreboard(
        cvd_score, aggression_ratio, price_change_5m
    )

    if above_line:
        # Contexto COMPRADOR — acima da Linha Azul
        if signal == "BUY":
            if cvd_score > 0 or scoreboard["score"] > 0:
                decision  = "EXECUTE"
                rationale = (
                    f"✅ ASG BULL | Preço ${current_price:.4f} > Linha Azul ${linha_azul:.4f} "
                    f"(+{distance_pct:.2f}%) | CVD={cvd_score:+.3f} | "
                    f"Placar={scoreboard['score']:+.3f}"
                )
            else:
                decision  = "BLOCK"
                rationale = (
                    f"⚠️ ASG BLOCK | Acima da Linha Azul mas CVD={cvd_score:+.3f} fraco "
                    f"| Placar={scoreboard['score']:+.3f} — aguardando confirmação"
                )
        else:  # SELL acima da linha
            decision  = "BLOCK"
            rationale = (
                f"🚫 ASG BLOCK | Sinal SELL bloqueado: preço ACIMA da Linha Azul "
                f"(+{distance_pct:.2f}%) — contexto comprador"
            )
    else:
        # Contexto VENDEDOR — abaixo da Linha Azul
        if signal == "BUY":
            decision  = "BLOCK"
            rationale = (
                f"🚫 ASG BLOCK | Sinal BUY bloqueado: preço ABAIXO da Linha Azul "
                f"({distance_pct:.2f}%) — contexto vendedor. "
                f"Evita entrada contra tendência!"
            )
        else:  # SELL abaixo da linha
            if cvd_score < 0 or scoreboard["score"] < 0:
                decision  = "EXECUTE"
                rationale = (
                    f"✅ ASG BEAR | Preço ${current_price:.4f} < Linha Azul ${linha_azul:.4f} "
                    f"({distance_pct:.2f}%) | CVD={cvd_score:+.3f} | "
                    f"Placar={scoreboard['score']:+.3f}"
                )
            else:
                decision  = "BLOCK"
                rationale = (
                    f"⚠️ ASG BLOCK | Abaixo da Linha Azul mas CVD={cvd_score:+.3f} fraco "
                    f"| Placar={scoreboard['score']:+.3f}"
                )

    return {
        "decision":    decision,
        "rationale":   rationale,
        "asg_bias":    asg_bias,
        "above_line":  above_line,
        "linha_azul":  round(linha_azul, 6),
        "distance_pct": round(distance_pct, 4),
        "scoreboard":  scoreboard,
    }


def apply_asg_filter(
    closes:           list,
    current_price:    float,
    signal:           str,
    cvd_score:        float,
    aggression_ratio: float = 0.5,
    price_change_5m:  float = 0.0,
    symbol:           str   = "",
    hma_period:       int   = 50,
) -> dict:
    """
    Função principal — calcula a Linha Azul e aplica o filtro ASG.
    Usa cache para evitar recálculo frequente.
    """
    cache_key = f"asg_{symbol}"
    cached    = _cache_get(cache_key)

    if cached:
        linha_azul = cached["linha_azul"]
    else:
        linha_azul = calculate_asg_line(closes, hma_period)
        _cache_set(cache_key, {"linha_azul": linha_azul})

    result = validate_asg_signal(
        current_price    = current_price,
        linha_azul       = linha_azul,
        signal           = signal,
        cvd_score        = cvd_score,
        aggression_ratio = aggression_ratio,
        price_change_5m  = price_change_5m,
    )

    if result["decision"] == "BLOCK":
        logger.warning(f"[ASG] {symbol} | {result['rationale']}")
    else:
        logger.info(f"[ASG] {symbol} | {result['rationale']}")

    return result
