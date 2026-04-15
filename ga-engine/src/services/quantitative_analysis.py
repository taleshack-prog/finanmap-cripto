"""
FinanMap Cripto - Análise Quantitativa
Volatilidade, correlação, beta, momentum, z-score, Sharpe rolling
"""

import numpy as np
import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ─── VOLATILIDADE ───────────────────────────────────────────

def historical_volatility(closes: list[float], window: int = 14, annualize: bool = True) -> dict:
    """
    Volatilidade histórica em janelas 7, 14 e 30 dias.
    Annualizada = vol_diária × √252 (ou √8760 para hora)
    """
    arr = np.array(closes, dtype=float)
    returns = np.diff(arr) / arr[:-1]

    results = {}
    for w in [7, 14, 30]:
        if len(returns) >= w:
            vol = np.std(returns[-w:], ddof=1)
            if annualize:
                vol *= np.sqrt(365 * 24)  # hourly candles
            results[f"vol_{w}d"] = round(float(vol * 100), 4)  # em %
        else:
            results[f"vol_{w}d"] = None

    # Volatilidade atual vs histórica (percentil)
    if len(returns) >= 30:
        current_vol = np.std(returns[-14:], ddof=1)
        all_vols    = [np.std(returns[i:i+14], ddof=1) for i in range(len(returns) - 14)]
        percentil   = float(np.mean(np.array(all_vols) <= current_vol) * 100)
        results["vol_percentil"] = round(percentil, 1)
        results["regime"] = (
            "alta_vol"  if percentil > 75 else
            "baixa_vol" if percentil < 25 else
            "normal"
        )
    else:
        results["vol_percentil"] = None
        results["regime"]        = "insuficiente"

    return results


# ─── Z-SCORE ────────────────────────────────────────────────

def price_zscore(closes: list[float], window: int = 20) -> dict:
    """
    Z-score do preço atual em relação à média móvel.
    Z > +2 = sobrecomprado (mean reversion: venda)
    Z < -2 = sobrevendido  (mean reversion: compra)
    """
    arr = np.array(closes, dtype=float)
    if len(arr) < window:
        return {"zscore": None, "signal": "insuficiente", "score": 0.0}

    window_data = arr[-window:]
    mean        = np.mean(window_data)
    std         = np.std(window_data, ddof=1)

    if std == 0:
        return {"zscore": 0.0, "signal": "neutro", "score": 0.0}

    zscore = (arr[-1] - mean) / std

    # Score para o GA: mean reversion
    # Z muito alto = preço deve cair = score negativo (venda)
    # Z muito baixo = preço deve subir = score positivo (compra)
    score = -np.tanh(zscore / 2)   # tanh normaliza para -1 a +1

    signal = (
        "sobrecomprado" if zscore > 2  else
        "sobrevendido"  if zscore < -2 else
        "neutro"
    )

    return {
        "zscore":  round(float(zscore), 4),
        "mean":    round(float(mean), 2),
        "std":     round(float(std), 2),
        "signal":  signal,
        "score":   round(float(score), 4),
    }


# ─── MOMENTUM ───────────────────────────────────────────────

def momentum(closes: list[float], windows: list[int] = [7, 14, 30]) -> dict:
    """
    Retorno acumulado em diferentes janelas temporais.
    Momentum positivo = tendência de alta persistente
    """
    arr     = np.array(closes, dtype=float)
    results = {}
    scores  = []

    for w in windows:
        if len(arr) > w:
            ret = (arr[-1] - arr[-w-1]) / arr[-w-1] * 100
            results[f"mom_{w}d"] = round(float(ret), 4)
            # Score normalizado: retorno / volatilidade esperada
            score = np.tanh(ret / 10)   # 10% = score 0.76
            scores.append(float(score))
        else:
            results[f"mom_{w}d"] = None

    # Score agregado de momentum
    if scores:
        # Ponderado: momentum curto tem mais peso
        weights = [0.5, 0.3, 0.2][:len(scores)]
        total_w = sum(weights)
        mom_score = sum(s * w for s, w in zip(scores, weights)) / total_w
        results["momentum_score"] = round(mom_score, 4)
        results["signal"] = (
            "forte_alta"  if mom_score >  0.5 else
            "alta"        if mom_score >  0.1 else
            "fraca_baixa" if mom_score < -0.5 else
            "baixa"       if mom_score < -0.1 else
            "neutro"
        )
    else:
        results["momentum_score"] = 0.0
        results["signal"]         = "insuficiente"

    return results


# ─── SHARPE ROLLING ─────────────────────────────────────────

def sharpe_rolling(closes: list[float], window: int = 30, risk_free: float = 0.05 / 8760) -> dict:
    """
    Sharpe ratio calculado em janela deslizante.
    Mede se o ativo está compensando bem o risco no período recente.
    """
    arr     = np.array(closes, dtype=float)
    returns = np.diff(arr) / arr[:-1]

    if len(returns) < window:
        return {"sharpe_rolling": None, "score": 0.0}

    window_rets = returns[-window:]
    mean_ret    = np.mean(window_rets) - risk_free
    std_ret     = np.std(window_rets, ddof=1)

    if std_ret == 0:
        return {"sharpe_rolling": 0.0, "score": 0.0}

    sharpe = float(mean_ret / std_ret * np.sqrt(8760))  # anualizado
    score  = float(np.tanh(sharpe / 3))   # Sharpe 3 = score ~0.95

    return {
        "sharpe_rolling": round(sharpe, 4),
        "score":          round(score, 4),
        "signal": (
            "excelente" if sharpe >  2 else
            "bom"       if sharpe >  1 else
            "neutro"    if sharpe >  0 else
            "ruim"
        ),
    }


# ─── CORRELAÇÃO E BETA ──────────────────────────────────────

def correlation_matrix(assets: dict[str, list[float]]) -> dict:
    """
    Matriz de correlação entre múltiplos ativos.
    assets = {"BTC": [...], "ETH": [...], "SOL": [...]}
    Retorna matriz + correlação de cada ativo vs BTC
    """
    symbols = list(assets.keys())
    min_len = min(len(v) for v in assets.values())

    if min_len < 10:
        return {"error": "Dados insuficientes", "matrix": {}}

    # Calcula retornos
    returns = {}
    for sym, closes in assets.items():
        arr = np.array(closes[-min_len:], dtype=float)
        returns[sym] = np.diff(arr) / arr[:-1]

    # Matriz de correlação
    matrix = {}
    for s1 in symbols:
        matrix[s1] = {}
        for s2 in symbols:
            corr = float(np.corrcoef(returns[s1], returns[s2])[0, 1])
            matrix[s1][s2] = round(corr, 4)

    # Beta de cada ativo vs BTC (se BTC presente)
    betas = {}
    if "BTC" in returns:
        btc_ret = returns["BTC"]
        btc_var = float(np.var(btc_ret, ddof=1))
        for sym in symbols:
            if sym != "BTC" and btc_var > 0:
                cov  = float(np.cov(returns[sym], btc_ret)[0, 1])
                beta = cov / btc_var
                betas[sym] = round(beta, 4)

    return {
        "matrix":  matrix,
        "betas":   betas,
        "symbols": symbols,
        "periods": min_len - 1,
    }


def beta_vs_btc(asset_closes: list[float], btc_closes: list[float]) -> dict:
    """
    Beta de um ativo vs BTC.
    Beta > 1 = mais volátil que BTC
    Beta < 1 = menos volátil que BTC
    Beta < 0 = movimento inverso ao BTC (raro em cripto)
    """
    min_len = min(len(asset_closes), len(btc_closes))
    if min_len < 10:
        return {"beta": None, "score": 0.0}

    asset_ret = np.diff(np.array(asset_closes[-min_len:], dtype=float))
    btc_ret   = np.diff(np.array(btc_closes[-min_len:],  dtype=float))

    btc_var = float(np.var(btc_ret, ddof=1))
    if btc_var == 0:
        return {"beta": None, "score": 0.0}

    cov  = float(np.cov(asset_ret, btc_ret)[0, 1])
    beta = cov / btc_var

    # Score: beta muito alto = risco elevado = score negativo para gestão de risco
    score = float(np.tanh(-abs(beta - 1) / 2))   # beta=1 é neutro

    return {
        "beta":   round(beta, 4),
        "score":  round(score, 4),
        "signal": (
            "alta_volatilidade"  if beta > 1.5  else
            "normal"             if beta > 0.5  else
            "baixa_volatilidade" if beta > 0    else
            "inverso"
        ),
    }


# ─── SCORE QUANTITATIVO CONSOLIDADO ─────────────────────────

def quantitative_score(
    closes:      list[float],
    btc_closes:  Optional[list[float]] = None,
    vol_window:  int = 14,
    mom_windows: list[int] = None,
    zs_window:   int = 20,
    sr_window:   int = 30,
) -> dict:
    """
    Score quantitativo consolidado para uso no GA e no robô.
    Retorna score de -1 (bearish/risco alto) a +1 (bullish/risco baixo)
    com breakdown de cada componente.
    """
    if mom_windows is None:
        mom_windows = [7, 14, 30]

    if len(closes) < 30:
        return {"score": 0.0, "confidence": 0.0, "breakdown": {}}

    # Calcula cada componente
    vol_data = historical_volatility(closes, vol_window)
    zs_data  = price_zscore(closes, zs_window)
    mom_data = momentum(closes, mom_windows)
    sr_data  = sharpe_rolling(closes, sr_window)

    # Beta vs BTC (se disponível)
    beta_data = {}
    if btc_closes and len(btc_closes) >= 10:
        beta_data = beta_vs_btc(closes, btc_closes)

    # Scores individuais
    zs_score  = zs_data.get("score", 0.0)    # mean reversion
    mom_score = mom_data.get("momentum_score", 0.0)
    sr_score  = sr_data.get("score", 0.0)
    beta_score = beta_data.get("score", 0.0)

    # Penalidade por alta volatilidade
    vol_percentil = vol_data.get("vol_percentil", 50) or 50
    vol_penalty   = -(vol_percentil - 50) / 100   # -0.5 a +0.5

    # Score final ponderado
    weights = {
        "zscore":   0.30,   # mean reversion é forte em cripto
        "momentum": 0.35,   # momentum domina no curto prazo
        "sharpe":   0.20,   # qualidade do retorno recente
        "vol":      0.10,   # penalidade de volatilidade
        "beta":     0.05,   # risco relativo ao BTC
    }

    final_score = (
        weights["zscore"]   * zs_score   +
        weights["momentum"] * mom_score  +
        weights["sharpe"]   * sr_score   +
        weights["vol"]      * vol_penalty +
        weights["beta"]     * beta_score
    )

    final_score = float(np.clip(final_score, -1.0, 1.0))
    confidence  = float(min(abs(final_score) * 2, 1.0))

    direction = (
        "BUY"  if final_score >  0.1 else
        "SELL" if final_score < -0.1 else
        "HOLD"
    )

    return {
        "score":      round(final_score, 4),
        "confidence": round(confidence, 4),
        "direction":  direction,
        "breakdown": {
            "zscore":   {"score": round(zs_score, 4),   "value": zs_data.get("zscore"),  "signal": zs_data.get("signal")},
            "momentum": {"score": round(mom_score, 4),  "value": mom_data.get("mom_14d"), "signal": mom_data.get("signal")},
            "sharpe":   {"score": round(sr_score, 4),   "value": sr_data.get("sharpe_rolling"), "signal": sr_data.get("signal")},
            "vol":      {"score": round(vol_penalty, 4),"regime": vol_data.get("regime"),  "percentil": vol_percentil},
            "beta":     {"score": round(beta_score, 4), "value": beta_data.get("beta"),   "signal": beta_data.get("signal")},
        },
        "volatility":  vol_data,
        "zscore":      zs_data,
        "momentum":    mom_data,
        "sharpe":      sr_data,
        "beta":        beta_data,
    }
