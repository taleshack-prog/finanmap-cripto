"""
FinanMap Cripto - GA Population v3 (Barbell Architecture)
Fitness PURO: Sharpe + Profit Factor + MDD cap — SEM on-chain
On-chain separado como advise externo (rota /advise)

Evidência: remoção on-chain +20% trades executados, +15% Sharpe
(ref: "On-Chain vs TA in HFT", SSRN 2024; Chainalysis 2024)
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

# ─── THRESHOLDS ANTIFRÁGEIS ────────────────────────────────
MDD_CAP       = -0.15    # MDD máximo tolerado: -15%
SHARPE_MIN    =  1.8     # Sharpe mínimo para fitness positivo
PROFIT_FACTOR_MIN = 1.2  # Lucros / Perdas mínimo


# ─── GENE RANGES ────────────────────────────────────────────
# Genes puramente técnicos — sem on-chain
GENE_RANGES = {
    "w_rsi":           (0.05, 0.50),   # peso RSI
    "w_macd":          (0.05, 0.50),   # peso MACD
    "w_bollinger":     (0.05, 0.40),   # peso Bollinger
    "w_ema":           (0.05, 0.40),   # peso EMA trend
    "stop_loss_pct":   (1.0,  5.0),    # stop loss %
    "take_profit_pct": (2.0,  10.0),   # take profit %
    "capital_pct":     (0.20, 0.30),   # % capital por trade
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
    capital_pct:     float = 0.1

    def normalize_weights(self):
        total = self.w_rsi + self.w_macd + self.w_bollinger + self.w_ema
        if total > 0:
            self.w_rsi       /= total
            self.w_macd      /= total
            self.w_bollinger /= total
            self.w_ema       /= total

    def clamp(self):
        for gene, (lo, hi) in GENE_RANGES.items():
            setattr(self, gene, max(lo, min(hi, getattr(self, gene))))
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
        c = Chromosome(**{g: d.get(g, getattr(Chromosome(), g)) for g in GENE_NAMES})
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
    k   = 2 / (period + 1)
    ema = np.full(len(closes), np.nan)
    s   = period - 1
    ema[s] = np.mean(closes[:period])
    for i in range(s + 1, len(closes)):
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


# ─── BACKTEST VETORIZADO ────────────────────────────────────

def _backtest_vectorized(chromosome: Chromosome, closes: np.ndarray) -> dict:
    signals = _compute_signals(closes)
    score = (
        chromosome.w_rsi       * signals["rsi"]  +
        chromosome.w_macd      * signals["macd"] +
        chromosome.w_bollinger * signals["bb"]   +
        chromosome.w_ema       * signals["ema"]
    )

    returns  = []
    position = None
    min_idx  = 50

    for i in range(min_idx, len(closes)):
        s     = score[i]
        price = closes[i]
        if np.isnan(s):
            continue

        if position is not None:
            entry   = position["entry_price"]
            pnl_pct = (price - entry) / entry * 100
            if pnl_pct <= -chromosome.stop_loss_pct:
                returns.append(-chromosome.stop_loss_pct / 100)
                position = None
                continue
            if pnl_pct >= chromosome.take_profit_pct:
                returns.append(chromosome.take_profit_pct / 100)
                position = None
                continue
            if s < -0.05:
                returns.append((price - entry) / entry)
                position = None
                continue

        if position is None and s > 0.05:
            position = {"entry_price": price, "entry_idx": i}

    if position is not None:
        returns.append((closes[-1] - position["entry_price"]) / position["entry_price"])

    return {"returns": returns}


# ─── FITNESS BARBELL (INTEGRADO) ────────────────────────────

# Multiplicador ATR por ativo — coeficiente de Hurst implícito
ATR_MULT_BY_ASSET = {
    "BTC/USDT": 1.0,   # mais estável — bandas menores
    "ETH/USDT": 1.6,   # mais volátil — bandas maiores
    "SOL/USDT": 1.8,   # alta volatilidade — bandas largas
    "XRP/USDT": 1.3,   # moderado
    "SUI/USDT": 1.7,   # altcoin volátil
    "ADA/USDT": 1.4,   # moderado
    "ZEC/USDT": 1.5,   # liquidez menor
    "BNB/USDT": 1.2,   # estável
}
ATR_MULT_DEFAULT = 1.5  # padrão para pares não mapeados


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


def _compute_fitness_barbell(
    returns: list,
    highs:   list = None,
    lows:    list = None,
    closes:  list = None,
    symbol:  str  = None,
) -> dict:
    """
    Fitness integrado:
    - Sharpe × √TradeCount × Retorno / MDD  (nosso barbell)
    - PrecisãoRVP — precisão nas zonas de absorção ATR (código externo)
    - Multiplicador ATR por ativo (coeficiente de Hurst implícito)
    - Penaliza retorno negativo e MDD alto
    """
    if len(returns) < 3:
        return {"fitness": -1.0, "disqualified": True, "reason": "poucos_trades"}

    arr = np.array(returns)
    win_rate     = float(np.sum(arr > 0) / len(arr) * 100)
    total_return = float((np.prod(1 + arr) - 1) * 100)
    max_dd       = float(np.min(np.minimum.accumulate(1 + arr) - 1) * 100)
    mean_r       = float(np.mean(arr))
    std_r        = float(np.std(arr, ddof=1))
    sharpe       = float(mean_r / std_r * np.sqrt(8760)) if std_r > 1e-9 else 0.0
    down         = arr[arr < 0]
    std_d        = float(np.std(down, ddof=1)) if len(down) > 1 else 1e-9
    sortino      = float(mean_r / std_d * np.sqrt(8760)) if std_d > 1e-9 else 0.0
    gains        = float(arr[arr > 0].sum())
    losses       = float(abs(arr[arr < 0].sum()))
    pf           = min(gains / losses, 5.0) if losses > 1e-9 else min(gains * 10, 5.0)

    # Sanitiza
    sharpe  = 0.0 if not np.isfinite(sharpe)  else sharpe
    sortino = 0.0 if not np.isfinite(sortino) else sortino
    pf      = 5.0 if not np.isfinite(pf)      else pf

    # MDD cap
    if max_dd < MDD_CAP * 100:
        return {
            "fitness": -2.0, "disqualified": True, "reason": "mdd_excedido",
            "sharpe": sharpe, "sortino": sortino, "profit_factor": pf,
            "win_rate": win_rate, "max_dd": max_dd, "total_return": total_return,
        }

    # ── Precisão RVP por zona ATR (código externo integrado) ─────────────────
    precision_rvp = 0.5  # padrão neutro se não tiver OHLCV
    atr_mult = ATR_MULT_BY_ASSET.get(symbol, ATR_MULT_DEFAULT) if symbol else ATR_MULT_DEFAULT

    # Retorno negativo OU abaixo de 3% = fitness penalizado fortemente
    if total_return <= 0:
        return {
            "fitness": max(-5.0, total_return / 5.0),
            "disqualified": False,
            "sharpe": round(sharpe, 4), "sortino": round(sortino, 4),
            "profit_factor": round(pf, 4), "win_rate": round(win_rate, 1),
            "max_dd": round(max_dd, 2), "total_return": round(total_return, 2),
            "precision_rvp": 0.0, "atr_mult": atr_mult,
        }
    if total_return < 3.0:
        return {
            "fitness": total_return - 3.0,  # negativo se <3%
            "disqualified": False,
            "sharpe": round(sharpe, 4), "sortino": round(sortino, 4),
            "profit_factor": round(pf, 4), "win_rate": round(win_rate, 1),
            "max_dd": round(max_dd, 2), "total_return": round(total_return, 2),
            "precision_rvp": round(precision_rvp, 4), "atr_mult": atr_mult,
        }

    if closes and highs and lows and len(closes) >= 20:
        try:
            atr_vals = _calculate_atr_series(highs, lows, closes, period=14)
            # EMA 20 para zona de referência
            ema20 = [closes[0]]
            alpha = 2 / (20 + 1)
            for c in closes[1:]:
                ema20.append(ema20[-1] * (1 - alpha) + c * alpha)

            # Identifica zonas RVP (preço próximo da EMA20 ± ATR × mult)
            in_rvp_zone = []
            for i in range(len(closes)):
                atr_i = atr_vals[i] if i < len(atr_vals) else 0
                dist  = abs(closes[i] - ema20[i])
                in_rvp_zone.append(dist <= atr_i * atr_mult)

            # Precisão dos trades dentro da zona RVP
            rvp_returns = [r for r, z in zip(returns, in_rvp_zone[:len(returns)]) if z]
            if len(rvp_returns) >= 3:
                precision_rvp = sum(1 for r in rvp_returns if r > 0) / len(rvp_returns)
            else:
                precision_rvp = win_rate / 100  # fallback para win rate geral

        except Exception:
            precision_rvp = win_rate / 100

    # ── Threshold dinâmico ────────────────────────────────────────────────────
    mdd_7d      = abs(max_dd) / 100
    threshold_t = max(0.3, min(0.55 + 0.15 * sharpe - 0.08 * mdd_7d, 0.85))
    penalty     = max(0.0, (threshold_t - sharpe) * 0.5) if sharpe < threshold_t and len(returns) > 10 else 0.0

    # ── Fitness integrado ─────────────────────────────────────────────────────
    trade_count = len(returns)
    mdd_norm    = max(abs(max_dd) / 100, 0.01)

    # Base: Sharpe × √TradeCount × retorno / MDD (nosso barbell)
    score_base = sharpe * np.sqrt(trade_count) * (total_return / 10) / (mdd_norm * 10)

    # Qualidade: Sortino + PF + precisão RVP (código externo)
    quality = (
        0.30 * sortino +
        0.25 * min(pf, 5.0) +
        0.20 * precision_rvp * 10  # normaliza precisão para escala similar
    )

    # Win rate bônus
    wr_bonus = max(0, win_rate - 50) * 0.05

    # Fitness final — máximo 95 reservado para estratégias excepcionais
    fitness = score_base + quality + wr_bonus - penalty
    fitness = float(np.clip(fitness, -10.0, 95.0))

    return {
        "fitness":       round(fitness, 4),
        "disqualified":  False,
        "sharpe":        round(sharpe, 4),
        "sortino":       round(sortino, 4),
        "profit_factor": round(pf, 4),
        "win_rate":      round(win_rate, 1),
        "max_dd":        round(max_dd, 2),
        "total_return":  round(total_return, 2),
        "precision_rvp": round(precision_rvp, 4),
        "atr_mult":      atr_mult,
    }


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
        logger.info(f"[GA v3 Barbell] {self.symbol} {self.timeframe} {self.data_limit} candles")
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
            result  = _backtest_vectorized(ind.chromosome, self.closes_np)
            metrics = _compute_fitness_barbell(
                returns = result["returns"],
                highs   = self.highs_np.tolist(),
                lows    = self.lows_np.tolist(),
                closes  = self.closes_np.tolist(),
                symbol  = self.symbol,
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

        except Exception as e:
            logger.warning(f"Erro em {ind.id}: {e}")
            ind.fitness = -1.0
        return ind

    def _evaluate_parallel(self):
        with ThreadPoolExecutor(max_workers=4) as ex:
            futures = {ex.submit(self._evaluate, ind): i for i, ind in enumerate(self.population)}
            for fut in as_completed(futures):
                self.population[futures[fut]] = fut.result()

    def _crossover(self, pa: Individual, pb: Individual, gen: int) -> Individual:
        ga, gb = pa.chromosome.to_dict(), pb.chromosome.to_dict()
        genes  = {g: ga[g] if random.random() < 0.5 else gb[g] for g in GENE_NAMES}
        return self._new_individual(gen, Chromosome.from_dict(genes))

    def _mutate(self, ind: Individual) -> Individual:
        genes = ind.chromosome.to_dict()
        for gene, (lo, hi) in GENE_RANGES.items():
            if random.random() < self.mutation_rate:
                genes[gene] += random.gauss(0, self.mutation_sigma * (hi - lo))
        ind.chromosome = Chromosome.from_dict(genes)
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
        logger.info(f"GA v3 Barbell | {self.population_size} robôs × {self.generations} gerações | {self.symbol}")
        logger.info(f"Thresholds: MDD<{MDD_CAP*100:.0f}% | Sharpe>{SHARPE_MIN} | PF>{PROFIT_FACTOR_MIN}")

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
                f"pf={best.profit_factor:.2f} wr={best.win_rate:.0f}% "
                f"dd={best.max_dd:.1f}% ret={best.total_return:.1f}% "
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
            "architecture":     "barbell_ta_pure",
            "thresholds": {
                "mdd_cap":          MDD_CAP,
                "sharpe_min":       SHARPE_MIN,
                "profit_factor_min": PROFIT_FACTOR_MIN,
            }
        }
