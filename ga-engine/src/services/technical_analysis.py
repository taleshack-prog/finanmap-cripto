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
