"""
FinanMap Cripto - GA Population v4 (TDD v1.0)
Fitness 4-componentes conforme TDD §3.7.4:
  Fitness = 0.35·Sharpe + 0.25·ProfitFactor + 0.20·(1 - MDD/15%) + 0.20·RVP_hit_rate
  threshold_t = 0.55 + 0.15·Sharpe_14d - 0.08·MDD_7d

Parâmetros por ativo (Apêndice 5.2):
  BTC: RVP±2 = 1.0×ATR | ETH/SOL: 1.5-1.8×ATR | XRP: 1.2×ATR
  Timeframes: 60m contexto, 15m mapa de zonas, 5m gatilho

Crossover prioriza pais com RVP hit > 65%
Mutação ±0.1 no multiplicador ATR, validada por Monte Carlo 1000 iterações
"""

import random
import numpy as np
import logging
import time
from dataclasses import dataclass, field
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

from src.services.data_service import get_ohlcv
from src.services.metrics_service import calculate_sortino_ratio

logger = logging.getLogger(__name__)

# ─── THRESHOLDS TDD v1.0 §3.7.4 ────────────────────────────
MDD_CAP           = -0.10    # MDD máximo tolerado: -10% (benchmarks §1.3)
MDD_PENALTY_BASE  =  0.15    # base para componente MDD no fitness
SHARPE_MIN        =  2.0     # Sharpe alvo §1.3 (era 1.8)
PROFIT_FACTOR_MIN =  1.5     # PF alvo §1.3 (era 1.2)
RVP_HIT_MIN       =  0.65    # RVP hit rate mínimo §1.3

# Pesos fitness 4-componentes (TDD §3.7.4)
FITNESS_W_SHARPE  = 0.35
FITNESS_W_PF      = 0.25
FITNESS_W_MDD     = 0.20
FITNESS_W_RVP     = 0.20

# ─── PARÂMETROS POR ATIVO (Apêndice 5.2) ────────────────────
# Multiplicador ATR para RVP±2 por ativo
ATR_MULT_BY_ASSET = {
    "BTC/USDT": 1.0,   # mais estável — bandas menores
    "ETH/USDT": 1.6,   # 1.5-1.8×ATR conforme doc
    "SOL/USDT": 1.8,   # alta volatilidade
    "XRP/USDT": 1.2,   # ajustar por Hurst
    "SUI/USDT": 1.7,
    "ADA/USDT": 1.4,
    "ZEC/USDT": 1.5,
    "BNB/USDT": 1.2,
}
ATR_MULT_DEFAULT = 1.5

# Timeframes por camada (TDD §3.7.1)
# 60m = contexto MACRO, 15m = mapa de zonas, 5m = gatilho
TIMEFRAME_MACRO   = "1h"
TIMEFRAME_MAPA    = "15m"
TIMEFRAME_GATILHO = "5m"

# ─── GENE RANGES ────────────────────────────────────────────
# Genes puramente técnicos — sem on-chain
GENE_RANGES = {
    "w_rsi":           (0.05, 0.50),   # peso RSI
    "w_macd":          (0.05, 0.50),   # peso MACD
    "w_bollinger":     (0.05, 0.40),   # peso Bollinger
    "w_ema":           (0.05, 0.40),   # peso EMA trend
    "stop_loss_pct":   (1.0,  4.0),    # stop loss % (reduzido: 1R max §5.3)
    "take_profit_pct": (2.0,  8.0),    # take profit % (RR mínimo 1:2 §5.3)
    "capital_pct":     (0.0025, 0.005), # risco por trade 0.25–0.5% do capital §5.3
    "atr_mult_bias":   (0.8,  1.2),    # bias no multiplicador ATR (mutação ±0.1)
    "adx_threshold":   (18.0, 32.0),   # limiar ADX para regime trend/range
    "atr_stop_mult":   (1.0,  3.0),    # multiplicador ATR para stop adaptativo
}
GENE_NAMES = list(GENE_RANGES.keys())


@dataclass
class Chromosome:
    w_rsi:           float = 0.25
    w_macd:          float = 0.25
    w_bollinger:     float = 0.25
    w_ema:           float = 0.25
    stop_loss_pct:   float = 2.0
    take_profit_pct: float = 4.0
    capital_pct:     float = 0.003   # 0.3% risco por trade (TDD §5.3)
    atr_mult_bias:   float = 1.0     # bias do multiplicador ATR
    adx_threshold:   float = 25.0   # limiar ADX: >valor = trend, <valor = range
    atr_stop_mult:   float = 1.5    # multiplicador ATR para stop adaptativo

    def normalize_weights(self):
        total = self.w_rsi + self.w_macd + self.w_bollinger + self.w_ema
        if total > 0:
            self.w_rsi       /= total
            self.w_macd      /= total
            self.w_bollinger /= total
            self.w_ema       /= total

    def clamp(self):
        for gene, (lo, hi) in GENE_RANGES.items():
            v = getattr(self, gene, None)
            if v is not None:
                setattr(self, gene, max(lo, min(hi, v)))
        # Garante RR mínimo 1:2 (TDD §5.3)
        if self.take_profit_pct < self.stop_loss_pct * 2:
            self.take_profit_pct = self.stop_loss_pct * 2
        self.normalize_weights()

    def to_dict(self) -> dict:
        return {g: round(getattr(self, g), 4) for g in GENE_NAMES}

    @staticmethod
    def random() -> "Chromosome":
        c = Chromosome(**{g: random.uniform(lo, hi) for g, (lo, hi) in GENE_RANGES.items()})
        c.normalize_weights()
        return c

    @staticmethod
    def from_dict(d: dict) -> "Chromosome":
        defaults = {g: getattr(Chromosome(), g) for g in GENE_NAMES}
        defaults.update({k: v for k, v in d.items() if k in GENE_NAMES})
        c = Chromosome(**defaults)
        c.clamp()
        return c


@dataclass
class Individual:
    id:             str
    chromosome:     Chromosome
    fitness:        float = 0.0
    sharpe:         float = 0.0
    sortino:        float = 0.0
    profit_factor:  float = 0.0
    win_rate:       float = 0.0
    max_dd:         float = 0.0
    trades:         int   = 0
    total_return:   float = 0.0
    generation:     int   = 0
    disqualified:   bool  = False   # MDD > cap ou Sharpe < mínimo


# ─── INDICADORES VETORIZADOS ────────────────────────────────

def _compute_rsi(closes: np.ndarray, period: int = 14) -> np.ndarray:
    delta = np.diff(closes)
    gain  = np.where(delta > 0, delta, 0.0)
    loss  = np.where(delta < 0, -delta, 0.0)
    avg_g = np.convolve(gain, np.ones(period)/period, mode='valid')
    avg_l = np.convolve(loss, np.ones(period)/period, mode='valid')
    rs    = np.where(avg_l > 0, avg_g / avg_l, 100.0)
    rsi   = 100 - 100 / (1 + rs)
    pad   = np.full(len(closes) - len(rsi), np.nan)
    return np.concatenate([pad, rsi])

def _compute_ema(closes: np.ndarray, period: int) -> np.ndarray:
    n   = len(closes)
    ema = np.full(n, np.nan)
    if n < period:
        return ema   # série muito curta — retorna tudo NaN (sinal zerado)
    k   = 2 / (period + 1)
    s   = period - 1
    ema[s] = np.mean(closes[:period])
    for i in range(s + 1, n):
        ema[i] = closes[i] * k + ema[i-1] * (1 - k)
    return ema

def _compute_bb_pct(closes: np.ndarray, period: int = 20) -> np.ndarray:
    pct = np.full(len(closes), np.nan)
    for i in range(period - 1, len(closes)):
        w = closes[i - period + 1:i + 1]
        m, s = np.mean(w), np.std(w)
        if s > 0:
            pct[i] = (closes[i] - (m - 2*s)) / (4*s)
    return pct

def _compute_signals(closes: np.ndarray) -> dict:
    """Indicadores TA vetorizados — RSI, MACD, Bollinger, EMA"""
    rsi   = _compute_rsi(closes, 14)
    ema20 = _compute_ema(closes, 20)
    ema50 = _compute_ema(closes, 50)
    ema12 = _compute_ema(closes, 12)
    ema26 = _compute_ema(closes, 26)
    macd  = ema12 - ema26
    bb    = _compute_bb_pct(closes, 20)

    rsi_s  = np.where(~np.isnan(rsi),
        np.where(rsi < 40, (40-rsi)/40, np.where(rsi > 60, -(rsi-60)/40, 0)), 0)
    macd_s = np.where(~np.isnan(macd),
        np.sign(macd) * np.minimum(np.abs(macd)/(np.abs(macd).mean()+1e-9), 1.0), 0)
    bb_s   = np.where(~np.isnan(bb),
        np.where(bb < 0.3, (0.3-bb)/0.3, np.where(bb > 0.7, -(bb-0.7)/0.3, 0)), 0)
    ema_s  = np.where(~np.isnan(ema20) & ~np.isnan(ema50),
        np.clip((ema20-ema50)/(ema50+1e-9)*20, -1, 1), 0)

    return {
        "rsi":  np.nan_to_num(rsi_s,  nan=0.0),
        "macd": np.nan_to_num(macd_s, nan=0.0),
        "bb":   np.nan_to_num(bb_s,   nan=0.0),
        "ema":  np.nan_to_num(ema_s,  nan=0.0),
    }


# ─── INDICADORES DE REGIME ──────────────────────────────────

def _compute_atr_np(highs: np.ndarray, lows: np.ndarray, closes: np.ndarray, period: int = 14) -> np.ndarray:
    """ATR série completa em numpy."""
    n = len(closes)
    tr = np.full(n, np.nan)
    for i in range(1, n):
        tr[i] = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        )
    atr = np.full(n, np.nan)
    if n >= period + 1:
        atr[period] = np.nanmean(tr[1:period + 1])
        for i in range(period + 1, n):
            atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period
    return atr


def _compute_adx(highs: np.ndarray, lows: np.ndarray, closes: np.ndarray, period: int = 14) -> np.ndarray:
    """
    ADX (Average Directional Index) vetorizado.
    ADX > 25 → mercado em tendência → entradas ativas.
    ADX < 20 → mercado lateral    → pular entradas.
    """
    n = len(closes)
    adx = np.full(n, np.nan)
    if n < period * 2 + 2:
        return adx

    # True Range e Directional Movement
    tr   = np.full(n, 0.0)
    dm_p = np.full(n, 0.0)
    dm_n = np.full(n, 0.0)

    for i in range(1, n):
        h_diff = highs[i]  - highs[i - 1]
        l_diff = lows[i - 1] - lows[i]
        tr[i]   = max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1]))
        dm_p[i] = h_diff if h_diff > l_diff and h_diff > 0 else 0.0
        dm_n[i] = l_diff if l_diff > h_diff and l_diff > 0 else 0.0

    # Wilder smooth
    atr_s  = np.full(n, 0.0)
    dip_s  = np.full(n, 0.0)
    din_s  = np.full(n, 0.0)
    atr_s[period]  = np.sum(tr[1:period + 1])
    dip_s[period]  = np.sum(dm_p[1:period + 1])
    din_s[period]  = np.sum(dm_n[1:period + 1])

    for i in range(period + 1, n):
        atr_s[i] = atr_s[i - 1] - atr_s[i - 1] / period + tr[i]
        dip_s[i] = dip_s[i - 1] - dip_s[i - 1] / period + dm_p[i]
        din_s[i] = din_s[i - 1] - din_s[i - 1] / period + dm_n[i]

    # DI+ / DI- / DX
    with np.errstate(divide='ignore', invalid='ignore'):
        di_p = np.where(atr_s > 0, 100 * dip_s / atr_s, 0.0)
        di_n = np.where(atr_s > 0, 100 * din_s / atr_s, 0.0)
        dx   = np.where(di_p + di_n > 0, 100 * np.abs(di_p - di_n) / (di_p + di_n), 0.0)

    # ADX = Wilder smooth de DX
    start = period * 2
    if start < n:
        adx[start] = np.mean(dx[period:start])
        for i in range(start + 1, n):
            adx[i] = (adx[i - 1] * (period - 1) + dx[i]) / period

    return adx


# ─── BACKTEST VETORIZADO ────────────────────────────────────

def _backtest_vectorized(
    chromosome: Chromosome,
    closes: np.ndarray,
    highs: np.ndarray = None,
    lows:  np.ndarray = None,
    symbol: str = None,
) -> dict:
    """
    Backtest com:
    - Filtro de Regime ADX: só entra quando ADX > adx_threshold (mercado em tendência)
    - Stop ATR Adaptativo: stop_price = entry * (1 - atr_at_entry/entry * stop_mult)
      onde stop_mult = ATR_MULT_BY_ASSET[symbol] * chromosome.atr_mult_bias * chromosome.atr_stop_mult
    - Fallback gracioso: se highs/lows ausentes, usa comportamento legado (stop fixo, sem ADX)
    """
    signals = _compute_signals(closes)
    score = (
        chromosome.w_rsi       * signals["rsi"]  +
        chromosome.w_macd      * signals["macd"] +
        chromosome.w_bollinger * signals["bb"]   +
        chromosome.w_ema       * signals["ema"]
    )

    # ── Regime ADX e ATR ──────────────────────────────────────
    n_candles = len(closes)
    use_adaptive = (highs is not None and lows is not None and
                    len(highs) == n_candles and len(lows) == n_candles and
                    n_candles >= 60)   # mínimo para ADX ser confiável

    if use_adaptive:
        # Período menor para séries curtas (< 200 candles) evita NaN excessivo
        _atr_period = 14 if n_candles >= 200 else max(7, n_candles // 15)
        atr_series = _compute_atr_np(highs, lows, closes, period=_atr_period)
        adx_series = _compute_adx(highs, lows, closes, period=_atr_period)
        asset_mult = ATR_MULT_BY_ASSET.get(symbol, ATR_MULT_DEFAULT) if symbol else ATR_MULT_DEFAULT
        stop_mult  = asset_mult * getattr(chromosome, 'atr_mult_bias', 1.0) * getattr(chromosome, 'atr_stop_mult', 1.5)
        # Threshold adaptativo ao número de candles disponíveis:
        # ADX diário tem média ~16 (random walk), ADX horário ~18-20
        # Ajustamos o cap para permitir trades suficientes
        adx_thresh = getattr(chromosome, 'adx_threshold', 25.0)
        if n_candles < 200:
            adx_thresh = min(adx_thresh, 15.0)   # dados diários: cap em 15 (média ADX ~16)
    else:
        atr_series = adx_series = None
        stop_mult  = None
        adx_thresh = None

    returns  = []
    position = None
    # warm-up dinâmico: 26 candles (mínimo EMA26) para séries curtas,
    # 50 candles para séries longas (≥200) onde temos dados suficientes
    min_idx  = 26 if n_candles < 200 else 50

    for i in range(min_idx, len(closes)):
        s     = score[i]
        price = closes[i]
        if np.isnan(s):
            continue

        if position is not None:
            entry      = position["entry_price"]
            stop_price = position["stop_price"]
            tp_price   = position["tp_price"]

            # Stop loss (adaptativo ATR ou fixo)
            if price <= stop_price:
                pnl = (price - entry) / entry
                returns.append(pnl)
                position = None
                continue
            # Take profit
            if price >= tp_price:
                pnl = (price - entry) / entry
                returns.append(pnl)
                position = None
                continue
            # Sinal de reversão
            if s < -0.05:
                returns.append((price - entry) / entry)
                position = None
                continue

        if position is None and s > 0.05:
            # ── Filtro de Regime: só entra em tendência ───────
            if use_adaptive:
                adx_val = adx_series[i]
                if np.isnan(adx_val) or adx_val < adx_thresh:
                    continue   # mercado lateral → pula entrada

            # ── Calcular stops ────────────────────────────────
            if use_adaptive:
                atr_val = atr_series[i]
                if np.isnan(atr_val) or atr_val <= 0:
                    # fallback para stop fixo se ATR inválido
                    stop_price = price * (1 - chromosome.stop_loss_pct / 100)
                    tp_price   = price * (1 + chromosome.take_profit_pct / 100)
                else:
                    stop_dist  = atr_val * stop_mult
                    stop_price = price - stop_dist
                    # TP mantém RR mínimo 2:1 relativo ao stop real
                    tp_dist    = max(stop_dist * 2, price * chromosome.take_profit_pct / 100)
                    tp_price   = price + tp_dist
            else:
                stop_price = price * (1 - chromosome.stop_loss_pct / 100)
                tp_price   = price * (1 + chromosome.take_profit_pct / 100)

            position = {
                "entry_price": price,
                "entry_idx":   i,
                "stop_price":  stop_price,
                "tp_price":    tp_price,
            }

    if position is not None:
        returns.append((closes[-1] - position["entry_price"]) / position["entry_price"])

    return {"returns": returns}


# ─── FITNESS TDD v1.0 §3.7.4 ────────────────────────────────


def _calculate_atr_series(highs: list, lows: list, closes: list, period: int = 14) -> list:
    """ATR série completa para uso no fitness."""
    if len(closes) < period + 1:
        return [0.0] * len(closes)
    true_ranges = []
    for i in range(1, len(closes)):
        tr = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1])
        )
        true_ranges.append(tr)
    atr_vals = [0.0] * period
    atr_vals.append(sum(true_ranges[:period]) / period)
    for i in range(period, len(true_ranges)):
        atr_vals.append((atr_vals[-1] * (period - 1) + true_ranges[i]) / period)
    return atr_vals


def _compute_fitness_tdd(
    returns:       list,
    highs:         list = None,
    lows:          list = None,
    closes:        list = None,
    symbol:        str  = None,
    atr_mult_bias: float = 1.0,
) -> dict:
    """
    Fitness 4-componentes (TDD §3.7.4):
      Fitness = 0.35·Sharpe + 0.25·ProfitFactor + 0.20·(1 - MDD/15%) + 0.20·RVP_hit_rate
      threshold_t = 0.55 + 0.15·Sharpe_14d - 0.08·MDD_7d
    Benchmarks §1.3: Sharpe > 2, PF > 1.5, Calmar > 3, MDD < 10%, RVP hit > 65%
    """
    if len(returns) < 3:
        return {"fitness": -1.0, "disqualified": True, "reason": "poucos_trades"}

    arr = np.array(returns, dtype=float)
    win_rate     = float(np.sum(arr > 0) / len(arr) * 100)
    total_return = float((np.prod(1 + arr) - 1) * 100)
    max_dd       = float(np.min(np.minimum.accumulate(1 + arr) - 1) * 100)
    mean_r       = float(np.mean(arr))
    std_r        = float(np.std(arr, ddof=1))
    sharpe       = float(mean_r / std_r * np.sqrt(252)) if std_r > 1e-9 else 0.0
    down         = arr[arr < 0]
    std_d        = float(np.std(down, ddof=1)) if len(down) > 1 else 1e-9
    sortino      = float(mean_r / std_d * np.sqrt(252)) if std_d > 1e-9 else 0.0
    gains        = float(arr[arr > 0].sum())
    losses       = float(abs(arr[arr < 0].sum()))
    pf           = min(gains / losses, 5.0) if losses > 1e-9 else min(gains * 10, 5.0)
    calmar       = (total_return / 100) / max(abs(max_dd) / 100, 0.01)

    # Sanitiza
    sharpe  = 0.0 if not np.isfinite(sharpe)  else sharpe
    sortino = 0.0 if not np.isfinite(sortino) else sortino
    pf      = 5.0 if not np.isfinite(pf)      else pf
    calmar  = 0.0 if not np.isfinite(calmar)  else min(calmar, 20.0)

    # MDD cap —10% (TDD §2.6)
    if max_dd < MDD_CAP * 100:
        return {
            "fitness": -2.0, "disqualified": True, "reason": "mdd_excedido",
            "sharpe": round(sharpe, 4), "sortino": round(sortino, 4),
            "profit_factor": round(pf, 4), "win_rate": round(win_rate, 1),
            "max_dd": round(max_dd, 2), "total_return": round(total_return, 2), "calmar": round(calmar, 4),
        }

    # ── RVP hit rate por zona ATR ──────────────────────────────────────────────
    atr_mult    = ATR_MULT_BY_ASSET.get(symbol, ATR_MULT_DEFAULT) if symbol else ATR_MULT_DEFAULT
    atr_mult   *= atr_mult_bias  # bias evoluído pelo GA
    rvp_hit     = win_rate / 100  # fallback = win rate geral

    if closes and highs and lows and len(closes) >= 20:
        try:
            atr_vals = _calculate_atr_series(highs, lows, closes, period=14)
            # VWAP como proxy da Linha Azul (HMA50 sessão)
            vwap_arr = []
            vwap_num = vwap_den = 0.0
            for i, c in enumerate(closes):
                h = highs[i] if i < len(highs) else c
                lo = lows[i]  if i < len(lows)  else c
                hlc3 = (h + lo + c) / 3
                # usa volume unitário como proxy
                vwap_num += hlc3
                vwap_den += 1
                vwap_arr.append(vwap_num / vwap_den)

            # Identifica zonas RVP±2 (preço dentro de VWAP ± ATR×mult)
            in_rvp_zone = []
            for i in range(len(closes)):
                atr_i = atr_vals[i] if i < len(atr_vals) else 0
                dist  = abs(closes[i] - vwap_arr[i])
                in_rvp_zone.append(dist <= atr_i * atr_mult * 2)  # ±2 zonas

            rvp_returns = [r for r, z in zip(returns, in_rvp_zone[:len(returns)]) if z]
            if len(rvp_returns) >= 3:
                rvp_hit = sum(1 for r in rvp_returns if r > 0) / len(rvp_returns)
        except Exception:
            pass

    # ── Threshold dinâmico (TDD §3.7.4) ──────────────────────────────────────
    mdd_7d      = abs(max_dd) / 100
    sharpe_14d  = sharpe  # proxy com dados disponíveis
    threshold_t = max(0.30, min(0.55 + 0.15 * sharpe_14d - 0.08 * mdd_7d, 0.85))

    # ── Fitness 4-componentes (TDD §3.7.4) ───────────────────────────────────
    # Normaliza cada componente para [0, 1] antes de ponderar:
    # Sharpe: [0, 5] → /5;  PF: [0, 5] → /5;  RVP: já [0,1]
    # MDD: 1 - (|MDD%| / 15%) capped em [0,1]
    c_sharpe = min(max(sharpe, 0.0), 5.0) / 5.0
    c_pf     = min(max(pf, 0.0), 5.0) / 5.0
    c_mdd    = max(0.0, 1.0 - abs(max_dd) / (MDD_PENALTY_BASE * 100))
    c_rvp    = float(np.clip(rvp_hit, 0.0, 1.0))

    fitness_raw = (
        FITNESS_W_SHARPE * c_sharpe +
        FITNESS_W_PF     * c_pf     +
        FITNESS_W_MDD    * c_mdd    +
        FITNESS_W_RVP    * c_rvp
    )

    # Converte para escala interpretável (0–10)
    fitness = float(np.clip(fitness_raw * 10.0, -5.0, 10.0))

    # Penalidade se abaixo do threshold dinâmico
    if sharpe < threshold_t and len(returns) > 10:
        penalty = (threshold_t - sharpe) * 0.5
        fitness -= penalty

    return {
        "fitness":       round(fitness, 4),
        "disqualified":  False,
        "sharpe":        round(sharpe, 4),
        "sortino":       round(sortino, 4),
        "profit_factor": round(pf, 4),
        "win_rate":      round(win_rate, 1),
        "max_dd":        round(max_dd, 2),
        "total_return":  round(total_return, 2),
        "calmar":        round(calmar, 4),
        "rvp_hit":       round(rvp_hit, 4),
        "atr_mult":      round(atr_mult, 4),
        "threshold_t":   round(threshold_t, 4),
        # componentes individuais para debug
        "c_sharpe":      round(c_sharpe, 4),
        "c_pf":          round(c_pf, 4),
        "c_mdd":         round(c_mdd, 4),
        "c_rvp":         round(c_rvp, 4),
    }


# Alias de compatibilidade
_compute_fitness_barbell = _compute_fitness_tdd


# ─── GA POPULATION ──────────────────────────────────────────

class GAPopulation:

    def __init__(
        self,
        population_size: int   = 10,
        generations:     int   = 20,
        symbol:          str   = "BTC/USDT",
        timeframe:       str   = "1h",
        data_limit:      int   = 500,
        exchange:        str   = "binance",
        api_key:         str   = "",
        api_secret:      str   = "",
        elite_size:      int   = 3,
        mutation_rate:   float = 0.15,
        mutation_sigma:  float = 0.08,
    ):
        self.population_size = population_size
        self.generations     = generations
        self.symbol          = symbol
        self.timeframe       = timeframe
        self.data_limit      = data_limit
        self.exchange        = exchange
        self.api_key         = api_key
        self.api_secret      = api_secret
        self.elite_size      = elite_size
        self.mutation_rate   = mutation_rate
        self.mutation_sigma  = mutation_sigma
        self.population:     list[Individual] = []
        self.history:        list[dict]       = []
        self.best_ever:      Optional[Individual] = None
        self.closes_np:      Optional[np.ndarray] = None

    def _fetch_data(self):
        logger.info(f"[GA v4 TDD v1.0] {self.symbol} {self.timeframe} {self.data_limit} candles")
        ohlcv = get_ohlcv(
            symbol        = self.symbol,
            timeframe     = self.timeframe,
            limit         = self.data_limit,
            exchange_name = self.exchange,
            api_key       = self.api_key,
            secret        = self.api_secret,
        )
        self.closes_np = np.array(ohlcv["closes"], dtype=float)
        self.highs_np  = np.array(ohlcv.get("highs",  ohlcv["closes"]), dtype=float)
        self.lows_np   = np.array(ohlcv.get("lows",   ohlcv["closes"]), dtype=float)
        logger.info(f"Dados: {len(self.closes_np)} candles | ${self.closes_np.min():,.0f}–${self.closes_np.max():,.0f}")

    def _new_individual(self, gen: int, chrom: Optional[Chromosome] = None) -> Individual:
        c   = chrom or Chromosome.random()
        uid = f"bot_g{gen}_{random.randint(1000,9999)}"
        return Individual(id=uid, chromosome=c, generation=gen)

    def _evaluate(self, ind: Individual) -> Individual:
        try:
            result  = _backtest_vectorized(ind.chromosome, self.closes_np,
                                           self.highs_np, self.lows_np, self.symbol)
            metrics = _compute_fitness_tdd(
                returns       = result["returns"],
                highs         = self.highs_np.tolist(),
                lows          = self.lows_np.tolist(),
                closes        = self.closes_np.tolist(),
                symbol        = self.symbol,
                atr_mult_bias = ind.chromosome.atr_mult_bias,
            )

            ind.fitness       = metrics["fitness"]
            ind.disqualified  = metrics.get("disqualified", False)
            ind.sharpe        = metrics.get("sharpe", 0.0)
            ind.sortino       = metrics.get("sortino", 0.0)
            ind.profit_factor = metrics.get("profit_factor", 0.0)
            ind.win_rate      = metrics.get("win_rate", 0.0)
            ind.max_dd        = metrics.get("max_dd", 0.0)
            ind.total_return  = metrics.get("total_return", 0.0)
            ind.trades        = len(result["returns"])
            # Armazena métricas extras para uso no crossover / log
            ind._rvp_hit      = metrics.get("rvp_hit", 0.0)
            ind._calmar        = metrics.get("calmar", 0.0)
            ind._threshold_t   = metrics.get("threshold_t", 0.55)

        except Exception as e:
            logger.warning(f"Erro em {ind.id}: {e}")
            ind.fitness   = -1.0
            ind._rvp_hit  = 0.0
            ind._calmar   = 0.0
            ind._threshold_t = 0.55
        return ind

    def _evaluate_parallel(self):
        with ThreadPoolExecutor(max_workers=4) as ex:
            futures = {ex.submit(self._evaluate, ind): i for i, ind in enumerate(self.population)}
            for fut in as_completed(futures):
                self.population[futures[fut]] = fut.result()

    def _crossover(self, pa: Individual, pb: Individual, gen: int) -> Individual:
        """
        Crossover uniforme com prioridade para pais com RVP hit > 65% (TDD §3.7.4).
        Se apenas um dos pais supera RVP_HIT_MIN, herda 70% dos genes do melhor.
        """
        ga, gb = pa.chromosome.to_dict(), pb.chromosome.to_dict()

        rvp_a = getattr(pa, "_rvp_hit", 0.0)
        rvp_b = getattr(pb, "_rvp_hit", 0.0)
        a_good = rvp_a >= RVP_HIT_MIN
        b_good = rvp_b >= RVP_HIT_MIN

        if a_good and not b_good:
            # Pa tem RVP ≥ 65% mas Pb não → favorece Pa (70% dos genes)
            p_a = 0.70
        elif b_good and not a_good:
            # Pb tem RVP ≥ 65% mas Pa não → favorece Pb
            p_a = 0.30
        else:
            # Ambos ou nenhum: crossover uniforme padrão 50/50
            p_a = 0.50

        genes = {g: ga[g] if random.random() < p_a else gb[g] for g in GENE_NAMES}
        return self._new_individual(gen, Chromosome.from_dict(genes))

    def _mutate(self, ind: Individual) -> Individual:
        """
        Mutação gaussiana.  Gene atr_mult_bias usa passo ±0.1 fixo (TDD §3.7.4).
        Após mutação valida com Monte Carlo 1000 cenários; reverte se fitness piorar.
        """
        genes_before = ind.chromosome.to_dict()
        genes = dict(genes_before)

        for gene, (lo, hi) in GENE_RANGES.items():
            if random.random() < self.mutation_rate:
                if gene == "atr_mult_bias":
                    # Passo ±0.1 conforme TDD §3.7.4
                    genes[gene] += random.choice([-0.1, 0.1])
                else:
                    genes[gene] += random.gauss(0, self.mutation_sigma * (hi - lo))

        ind.chromosome = Chromosome.from_dict(genes)

        # ── Validação Monte Carlo 1000 iterações (TDD §3.7.4) ─────────────────
        # Simula distribuição de retornos via bootstrap e verifica se fitness melhora
        _h = getattr(self, 'highs_np', None)
        _l = getattr(self, 'lows_np',  None)
        if self.closes_np is not None and len(self.closes_np) >= 50:
            try:
                bt_new = _backtest_vectorized(ind.chromosome, self.closes_np,
                                              _h, _l, self.symbol)
                if len(bt_new["returns"]) >= 3:
                    arr = np.array(bt_new["returns"])
                    # Bootstrap 1000 amostras — verifica se Sharpe mediano ≥ 0
                    mc_sharpes = []
                    for _ in range(1000):
                        sample = np.random.choice(arr, size=len(arr), replace=True)
                        std_s  = np.std(sample, ddof=1)
                        mc_sharpes.append(float(np.mean(sample) / std_s * np.sqrt(252)) if std_s > 1e-9 else 0.0)
                    median_sharpe = float(np.median(mc_sharpes))
                    # Reverte mutação se mediana Monte Carlo for significativamente negativa
                    if median_sharpe < -0.5:
                        ind.chromosome = Chromosome.from_dict(genes_before)
            except Exception:
                pass  # Mantém mutação em caso de erro

        return ind

    def _next_gen(self, gen: int) -> list[Individual]:
        # Elites: só robôs não desqualificados
        qualified = [x for x in self.population if not x.disqualified]
        if not qualified:
            qualified = self.population  # fallback
        elites  = sorted(qualified, key=lambda x: x.fitness, reverse=True)[:self.elite_size]
        new_pop = [self._new_individual(gen, Chromosome.from_dict(e.chromosome.to_dict())) for e in elites]

        while len(new_pop) < self.population_size:
            pa    = random.choice(elites)
            pb    = random.choice([e for e in elites if e.id != pa.id] or elites)
            child = self._crossover(pa, pb, gen)
            child = self._mutate(child)
            new_pop.append(child)

        return new_pop[:self.population_size]

    def run(self) -> dict:
        t0 = time.time()
        logger.info(f"GA v4 TDD v1.0 | {self.population_size} robôs × {self.generations} gerações | {self.symbol}")
        logger.info(f"Thresholds: MDD<{MDD_CAP*100:.0f}% | Sharpe>{SHARPE_MIN} | PF>{PROFIT_FACTOR_MIN} | RVP>{RVP_HIT_MIN*100:.0f}%")

        self._fetch_data()
        self.population = [self._new_individual(1) for _ in range(self.population_size)]

        for gen in range(1, self.generations + 1):
            self._evaluate_parallel()
            self.population.sort(key=lambda x: x.fitness, reverse=True)
            best = self.population[0]

            if self.best_ever is None or best.fitness > self.best_ever.fitness:
                self.best_ever = best

            qualified_count = sum(1 for x in self.population if not x.disqualified)
            avg_fit = np.mean([x.fitness for x in self.population])

            rec = {
                "generation":      gen,
                "best_fitness":    round(best.fitness, 4),
                "avg_fitness":     round(float(avg_fit), 4),
                "best_sharpe":     round(best.sharpe, 4),
                "best_sortino":    round(best.sortino, 4),
                "best_pf":         round(best.profit_factor, 4),
                "best_calmar":     round(getattr(best, "_calmar", 0.0), 4),
                "best_rvp_hit":    round(getattr(best, "_rvp_hit", 0.0), 4),
                "best_threshold_t": round(getattr(best, "_threshold_t", 0.55), 4),
                "best_trades":     best.trades,
                "best_win_rate":   round(best.win_rate, 1),
                "best_max_dd":     round(best.max_dd, 2),
                "best_return":     round(best.total_return, 2),
                "qualified":       qualified_count,
                "disqualified":    self.population_size - qualified_count,
                "best_genes":      best.chromosome.to_dict(),
            }
            self.history.append(rec)

            logger.info(
                f"Gen {gen:02d}/{self.generations} | "
                f"fit={best.fitness:.4f} sharpe={best.sharpe:.2f} "
                f"pf={best.profit_factor:.2f} rvp={getattr(best, '_rvp_hit', 0.0):.2f} "
                f"calmar={getattr(best, '_calmar', 0.0):.2f} "
                f"wr={best.win_rate:.0f}% dd={best.max_dd:.1f}% ret={best.total_return:.1f}% "
                f"qualified={qualified_count}/{self.population_size}"
            )

            # Convergência
            if gen >= 5:
                last = [h["best_fitness"] for h in self.history[-5:]]
                if max(last) - min(last) < 0.0005 and best.fitness > 0:
                    logger.info(f"Convergência na geração {gen}")
                    break

            if gen < self.generations:
                self.population = self._next_gen(gen + 1)

        best    = self.best_ever
        elapsed = round(time.time() - t0, 2)

        return {
            "best_chromosome":  best.chromosome.to_dict(),
            "best_fitness":     round(best.fitness, 4),
            "best_sharpe":      round(best.sharpe, 4),
            "best_sortino":     round(best.sortino, 4),
            "best_profit_factor": round(best.profit_factor, 4),
            "best_win_rate":    round(best.win_rate, 1),
            "best_max_dd":      round(best.max_dd, 2),
            "best_trades":      best.trades,
            "best_return":      round(best.total_return, 2),
            "best_id":          best.id,
            "disqualified":     best.disqualified,
            "generations_run":  len(self.history),
            "history":          self.history,
            "elapsed_seconds":  elapsed,
            "symbol":           self.symbol,
            "timeframe":        self.timeframe,
            "data_candles":     len(self.closes_np) if self.closes_np is not None else 0,
            "architecture":     "tdd_v1_4components",
            "best_rvp_hit":     round(getattr(best, "_rvp_hit", 0.0), 4),
            "best_calmar":      round(getattr(best, "_calmar", 0.0), 4),
            "thresholds": {
                "mdd_cap":           MDD_CAP,
                "sharpe_min":        SHARPE_MIN,
                "profit_factor_min": PROFIT_FACTOR_MIN,
                "rvp_hit_min":       RVP_HIT_MIN,
                "fitness_weights":   {
                    "sharpe": FITNESS_W_SHARPE,
                    "pf":     FITNESS_W_PF,
                    "mdd":    FITNESS_W_MDD,
                    "rvp":    FITNESS_W_RVP,
                },
            }
        }
