"""
Módulo de Análise Técnica - FinanMap Cripto
Indicadores: RSI, MACD, Bollinger Bands, EMA, SMA, ATR, Volume
"""

import numpy as np
from typing import Optional


def sma(prices: list[float], period: int) -> list[float]:
    """Média Móvel Simples"""
    result = [None] * (period - 1)
    for i in range(period - 1, len(prices)):
        result.append(sum(prices[i - period + 1:i + 1]) / period)
    return result


def ema(prices: list[float], period: int) -> list[float]:
    """Média Móvel Exponencial"""
    k = 2 / (period + 1)
    result = [None] * (period - 1)
    result.append(sum(prices[:period]) / period)
    for i in range(period, len(prices)):
        result.append(prices[i] * k + result[-1] * (1 - k))
    return result


def rsi(prices: list[float], period: int = 14) -> list[float]:
    """
    Relative Strength Index (0-100)
    > 70 = sobrecomprado (sinal de venda)
    < 30 = sobrevendido  (sinal de compra)
    """
    if len(prices) < period + 1:
        return [None] * len(prices)

    deltas = [prices[i] - prices[i - 1] for i in range(1, len(prices))]
    gains = [max(d, 0) for d in deltas]
    losses = [abs(min(d, 0)) for d in deltas]

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    result = [None] * (period + 1)

    if avg_loss == 0:
        result.append(100.0)
    else:
        rs = avg_gain / avg_loss
        result.append(100 - (100 / (1 + rs)))

    for i in range(period, len(deltas)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        if avg_loss == 0:
            result.append(100.0)
        else:
            rs = avg_gain / avg_loss
            result.append(100 - (100 / (1 + rs)))

    return result


def macd(
    prices: list[float],
    fast: int = 12,
    slow: int = 26,
    signal: int = 9
) -> dict:
    """
    MACD (Moving Average Convergence Divergence)
    Retorna: macd_line, signal_line, histogram
    Cruzamento macd > signal = compra
    Cruzamento macd < signal = venda
    """
    ema_fast   = ema(prices, fast)
    ema_slow   = ema(prices, slow)

    macd_line  = [
        (f - s) if f is not None and s is not None else None
        for f, s in zip(ema_fast, ema_slow)
    ]

    valid_macd = [v for v in macd_line if v is not None]
    signal_raw = ema(valid_macd, signal)
    padding    = [None] * (len(macd_line) - len(signal_raw))
    signal_line = padding + signal_raw

    histogram  = [
        (m - s) if m is not None and s is not None else None
        for m, s in zip(macd_line, signal_line)
    ]

    return {
        "macd":      macd_line,
        "signal":    signal_line,
        "histogram": histogram,
    }


def bollinger_bands(
    prices: list[float],
    period: int = 20,
    std_dev: float = 2.0
) -> dict:
    """
    Bollinger Bands
    Preço > upper band = sobrecomprado
    Preço < lower band = sobrevendido
    %B = posição do preço dentro das bandas (0-1)
    """
    middle = sma(prices, period)
    upper, lower, pct_b = [], [], []

    for i, m in enumerate(middle):
        if m is None:
            upper.append(None)
            lower.append(None)
            pct_b.append(None)
        else:
            window = prices[i - period + 1:i + 1]
            std    = np.std(window, ddof=0)
            u      = m + std_dev * std
            l      = m - std_dev * std
            upper.append(u)
            lower.append(l)
            band_width = u - l
            pb = (prices[i] - l) / band_width if band_width > 0 else 0.5
            pct_b.append(pb)

    return {"upper": upper, "middle": middle, "lower": lower, "pct_b": pct_b}


def atr(
    highs: list[float],
    lows: list[float],
    closes: list[float],
    period: int = 14
) -> list[float]:
    """
    Average True Range — mede volatilidade
    Usado para calibrar stop loss e tamanho de posição
    """
    true_ranges = []
    for i in range(1, len(closes)):
        tr = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1])
        )
        true_ranges.append(tr)

    if len(true_ranges) < period:
        return [None] * len(closes)

    result = [None] * period
    result.append(sum(true_ranges[:period]) / period)

    for i in range(period, len(true_ranges)):
        result.append((result[-1] * (period - 1) + true_ranges[i]) / period)

    return result


def volume_analysis(
    volumes: list[float],
    closes: list[float],
    period: int = 20
) -> dict:
    """
    Análise de Volume
    OBV: On-Balance Volume (acumulação/distribuição)
    Volume ratio: volume atual vs média
    """
    obv = [0.0]
    for i in range(1, len(closes)):
        if closes[i] > closes[i - 1]:
            obv.append(obv[-1] + volumes[i])
        elif closes[i] < closes[i - 1]:
            obv.append(obv[-1] - volumes[i])
        else:
            obv.append(obv[-1])

    vol_sma = sma(volumes, period)
    vol_ratio = [
        (v / m) if m and m > 0 else None
        for v, m in zip(volumes, vol_sma)
    ]

    return {"obv": obv, "vol_ratio": vol_ratio, "vol_sma": vol_sma}


def volume_delta(
    volumes: list[float],
    closes:  list[float],
    highs:   list[float],
    lows:    list[float],
    period:  int = 5
) -> dict:
    """
    Volume Delta — pressão real de compra vs venda.
    Detecta desequilíbrio antes do preço mover.
    Especialmente útil para ETH e SOL que têm movimentos bruscos.

    Método: estima buy/sell volume pelo posicionamento do close
    no range do candle (técnica de Wyckoff simplificada).
    close perto do high → compradores dominam → delta positivo
    close perto do low  → vendedores dominam → delta negativo
    """
    deltas = []
    for i in range(len(closes)):
        rng = highs[i] - lows[i]
        if rng > 0:
            # Proporção do close no range [0=low, 1=high]
            close_pos = (closes[i] - lows[i]) / rng
            # Buy volume estimado
            buy_vol  = volumes[i] * close_pos
            sell_vol = volumes[i] * (1 - close_pos)
            deltas.append(buy_vol - sell_vol)
        else:
            deltas.append(0.0)

    # Suaviza com SMA do período
    delta_sma = sma(deltas, period)

    # Normaliza para [-1, 1]
    max_delta = max(abs(d) for d in deltas if d is not None) or 1
    delta_norm = [
        (d / max_delta) if d is not None else 0.0
        for d in deltas
    ]

    # Score cumulativo dos últimos N candles
    scores = []
    for i in range(len(deltas)):
        window = deltas[max(0, i - period + 1):i + 1]
        cum = sum(window)
        scores.append(cum / (max_delta * period) if max_delta > 0 else 0.0)

    return {
        "delta":      deltas,
        "delta_norm": delta_norm,
        "delta_sma":  delta_sma,
        "score":      [max(-1.0, min(1.0, s)) for s in scores],
    }


def atr_normalized(
    highs:   list[float],
    lows:    list[float],
    closes:  list[float],
    period:  int = 14,
    lookback: int = 50,
) -> dict:
    """
    ATR Normalizado — volatilidade atual vs histórica.
    Usado para:
    1. Reduzir tamanho de posição quando volatilidade está alta
    2. Evitar entrar quando SOL/ETH estão em regime de alta volatilidade
    3. Calibrar stop loss dinamicamente

    atr_ratio > 1.5 → volatilidade acima da média → cautela
    atr_ratio < 0.7 → volatilidade abaixo da média → mercado consolidando
    """
    atr_values = atr(highs, lows, closes, period)

    # Remove Nones
    valid_atrs = [v for v in atr_values if v is not None]
    if not valid_atrs:
        return {
            "atr":       atr_values,
            "atr_pct":   [None] * len(closes),
            "atr_ratio": [1.0] * len(closes),
            "regime":    ["normal"] * len(closes),
        }

    # ATR como % do preço
    atr_pct = []
    for i, v in enumerate(atr_values):
        if v is not None and closes[i] > 0:
            atr_pct.append(v / closes[i] * 100)
        else:
            atr_pct.append(None)

    # ATR ratio: atual vs média histórica
    atr_ratio = []
    for i in range(len(atr_pct)):
        window = [x for x in atr_pct[max(0, i - lookback):i + 1] if x is not None]
        if len(window) > 5:
            avg = sum(window) / len(window)
            ratio = atr_pct[i] / avg if avg > 0 and atr_pct[i] is not None else 1.0
        else:
            ratio = 1.0
        atr_ratio.append(ratio)

    # Regime de volatilidade
    regime = []
    for r in atr_ratio:
        if r > 1.8:
            regime.append("muito_alta")
        elif r > 1.3:
            regime.append("alta")
        elif r < 0.6:
            regime.append("muito_baixa")
        elif r < 0.8:
            regime.append("baixa")
        else:
            regime.append("normal")

    return {
        "atr":       atr_values,
        "atr_pct":   atr_pct,
        "atr_ratio": atr_ratio,
        "regime":    regime,
    }


def momentum_candles(
    closes: list[float],
    period: int = 3,
) -> list[float]:
    """
    Momentum de N candles — tendência de curtíssimo prazo.
    Mais responsivo que MACD para SOL e ETH.
    Retorna variação percentual acumulada dos últimos N candles.
    """
    result = [0.0] * len(closes)
    for i in range(period, len(closes)):
        if closes[i - period] > 0:
            result[i] = (closes[i] - closes[i - period]) / closes[i - period]
    return result


def rvp_score(
    win_rate:       float,
    take_profit_pct: float,
    stop_loss_pct:  float,
    vol_delta_score: float = 0.0,
    atr_ratio:      float  = 1.0,
) -> dict:
    """
    RVP — Risco/Valor/Probabilidade.
    Integra Kelly + volume delta + ATR normalizado.

    rvp > 1.5 → entrada favorável
    rvp 1.0-1.5 → entrada marginal
    rvp < 1.0 → evitar

    Ajustes:
    - vol_delta positivo → aumenta probabilidade estimada
    - atr_ratio alto → reduz RVP (mais risco)
    """
    if stop_loss_pct <= 0:
        return {"rvp": 0.0, "approved": False, "reason": "stop_loss_zero"}

    # Ajusta win rate com volume delta
    adjusted_wr = min(0.95, win_rate + vol_delta_score * 0.1)

    # Valor esperado básico
    ev = (adjusted_wr * take_profit_pct) - ((1 - adjusted_wr) * stop_loss_pct)

    # RVP = valor esperado / risco, ajustado pela volatilidade
    rvp = (ev / stop_loss_pct) / max(atr_ratio, 0.5)

    approved = rvp > 1.0

    return {
        "rvp":         round(rvp, 4),
        "ev":          round(ev, 4),
        "adjusted_wr": round(adjusted_wr, 4),
        "atr_ratio":   round(atr_ratio, 4),
        "approved":    approved,
        "reason":      "ok" if approved else f"rvp_baixo_{rvp:.2f}",
    }


# ─────────────────────────────────────────────────────────────
# GERADOR DE SINAIS COMBINADO
# ─────────────────────────────────────────────────────────────

def generate_technical_signals(
    closes: list[float],
    highs:  Optional[list[float]] = None,
    lows:   Optional[list[float]] = None,
    volumes: Optional[list[float]] = None,
) -> dict:
    """
    Gera sinal consolidado de análise técnica.
    Retorna score de -1 (venda forte) a +1 (compra forte)
    com breakdown de cada indicador.
    """
    if len(closes) < 30:
        return {"signal": 0.0, "confidence": 0.0, "breakdown": {}}

    rsi_vals  = rsi(closes)
    macd_vals = macd(closes)
    bb_vals   = bollinger_bands(closes)

    # Pegar último valor válido de cada indicador
    def last(lst):
        for v in reversed(lst):
            if v is not None:
                return v
        return None

    rsi_now   = last(rsi_vals)
    macd_now  = last(macd_vals["macd"])
    sig_now   = last(macd_vals["signal"])
    hist_now  = last(macd_vals["histogram"])
    bb_pct    = last(bb_vals["pct_b"])
    price_now = closes[-1]
    bb_upper  = last(bb_vals["upper"])
    bb_lower  = last(bb_vals["lower"])
    ema20_now = last(ema(closes, 20))
    ema50_now = last(ema(closes, 50))

    scores = {}

    # RSI
    if rsi_now is not None:
        if rsi_now < 30:
            scores["rsi"] = (30 - rsi_now) / 30        # 0 a 1 (compra)
        elif rsi_now > 70:
            scores["rsi"] = -(rsi_now - 70) / 30       # 0 a -1 (venda)
        else:
            scores["rsi"] = (50 - rsi_now) / 50 * 0.3  # neutro leve

    # MACD
    if macd_now is not None and sig_now is not None:
        if macd_now > sig_now:
            scores["macd"] = min(abs(hist_now or 0) / (abs(macd_now) + 1e-9), 1.0)
        else:
            scores["macd"] = -min(abs(hist_now or 0) / (abs(macd_now) + 1e-9), 1.0)

    # Bollinger Bands
    if bb_pct is not None:
        if bb_pct < 0.2:
            scores["bollinger"] = (0.2 - bb_pct) / 0.2
        elif bb_pct > 0.8:
            scores["bollinger"] = -(bb_pct - 0.8) / 0.2
        else:
            scores["bollinger"] = 0.0

    # EMA Trend (20 vs 50)
    if ema20_now and ema50_now:
        diff_pct = (ema20_now - ema50_now) / ema50_now
        scores["ema_trend"] = max(min(diff_pct * 10, 1.0), -1.0)

    # Volume confirma? (opcional)
    if volumes and highs and lows:
        vol_data  = volume_analysis(volumes, closes)
        atr_vals  = atr(highs, lows, closes)
        atr_now   = last(atr_vals)
        vol_ratio = last(vol_data["vol_ratio"])

        if vol_ratio and vol_ratio > 1.5:
            # Volume alto confirma direção atual do preço
            price_dir = 1 if closes[-1] > closes[-2] else -1
            scores["volume"] = 0.3 * price_dir
        else:
            scores["volume"] = 0.0

        if atr_now:
            scores["atr_stop"] = atr_now  # usado pelo robô para calibrar stop

    # Score final ponderado
    weights = {
        "rsi": 0.30, "macd": 0.30,
        "bollinger": 0.20, "ema_trend": 0.15,
        "volume": 0.05,
    }
    total_w = 0.0
    total_s = 0.0
    for k, w in weights.items():
        if k in scores and k != "atr_stop":
            total_s += scores[k] * w
            total_w += w

    final_score = total_s / total_w if total_w > 0 else 0.0
    confidence  = min(abs(final_score) * 2, 1.0)

    return {
        "signal":      round(final_score, 4),
        "confidence":  round(confidence, 4),
        "direction":   "BUY" if final_score > 0.1 else "SELL" if final_score < -0.1 else "HOLD",
        "breakdown": {
            "rsi":       {"value": round(rsi_now, 2) if rsi_now else None, "score": round(scores.get("rsi", 0), 4)},
            "macd":      {"value": round(macd_now, 6) if macd_now else None, "score": round(scores.get("macd", 0), 4)},
            "bollinger": {"pct_b": round(bb_pct, 4) if bb_pct else None, "score": round(scores.get("bollinger", 0), 4)},
            "ema_trend": {"ema20": round(ema20_now, 2) if ema20_now else None, "ema50": round(ema50_now, 2) if ema50_now else None, "score": round(scores.get("ema_trend", 0), 4)},
        },
        "price": price_now,
        "bb_upper": round(bb_upper, 2) if bb_upper else None,
        "bb_lower": round(bb_lower, 2) if bb_lower else None,
    }
