"""
FinanMap Cripto - GA Population v2
10 robôs competindo com backtest vetorizado (rápido e que abre trades de verdade)
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


# ─── GENE RANGES ────────────────────────────────────────────
GENE_RANGES = {
    "w_rsi":           (0.05, 0.50),
    "w_macd":          (0.05, 0.50),
    "w_bollinger":     (0.05, 0.40),
    "w_ema":           (0.05, 0.40),
    "stop_loss_pct":   (1.0,  5.0),
    "take_profit_pct": (2.0,  10.0),
    "capital_pct":     (0.05, 0.25),
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
    id:               str
    chromosome:       Chromosome
    fitness:          float = 0.0
    sortino:          float = 0.0
    win_rate:         float = 0.0
    max_dd:           float = 0.0
    trades:           int   = 0
    total_return:     float = 0.0
    generation:       int   = 0


# ─── INDICADORES VETORIZADOS ────────────────────────────────

def _compute_rsi(closes: np.ndarray, period: int = 14) -> np.ndarray:
    delta  = np.diff(closes)
    gain   = np.where(delta > 0, delta, 0.0)
    loss   = np.where(delta < 0, -delta, 0.0)
    avg_g  = np.convolve(gain,  np.ones(period)/period, mode='valid')
    avg_l  = np.convolve(loss,  np.ones(period)/period, mode='valid')
    rs     = np.where(avg_l > 0, avg_g / avg_l, 100.0)
    rsi    = 100 - 100 / (1 + rs)
    pad    = np.full(len(closes) - len(rsi), np.nan)
    return np.concatenate([pad, rsi])

def _compute_ema(closes: np.ndarray, period: int) -> np.ndarray:
    k   = 2 / (period + 1)
    ema = np.full(len(closes), np.nan)
    start = period - 1
    ema[start] = np.mean(closes[:period])
    for i in range(start + 1, len(closes)):
        ema[i] = closes[i] * k + ema[i-1] * (1 - k)
    return ema

def _compute_bb_pct(closes: np.ndarray, period: int = 20) -> np.ndarray:
    pct_b = np.full(len(closes), np.nan)
    for i in range(period - 1, len(closes)):
        window = closes[i - period + 1:i + 1]
        m      = np.mean(window)
        s      = np.std(window)
        if s > 0:
            upper  = m + 2 * s
            lower  = m - 2 * s
            pct_b[i] = (closes[i] - lower) / (upper - lower)
    return pct_b

def _compute_signals(closes: np.ndarray) -> dict:
    """Calcula todos os indicadores vetorizados de uma vez"""
    rsi    = _compute_rsi(closes, 14)
    ema20  = _compute_ema(closes, 20)
    ema50  = _compute_ema(closes, 50)
    bb_pct = _compute_bb_pct(closes, 20)
    ema12  = _compute_ema(closes, 12)
    ema26  = _compute_ema(closes, 26)
    macd   = ema12 - ema26

    # Normaliza scores para [-1, +1]
    rsi_score = np.where(
        ~np.isnan(rsi),
        np.where(rsi < 40, (40 - rsi) / 40,
        np.where(rsi > 60, -(rsi - 60) / 40, 0)),
        0
    )
    macd_sign  = np.sign(macd)
    macd_score = np.where(~np.isnan(macd), macd_sign * np.minimum(np.abs(macd) / (np.abs(macd).mean() + 1e-9), 1.0), 0)
    bb_score   = np.where(~np.isnan(bb_pct),
        np.where(bb_pct < 0.3,  (0.3 - bb_pct) / 0.3,
        np.where(bb_pct > 0.7, -(bb_pct - 0.7) / 0.3, 0)), 0)
    ema_score  = np.where(
        ~np.isnan(ema20) & ~np.isnan(ema50),
        np.clip((ema20 - ema50) / (ema50 + 1e-9) * 20, -1, 1),
        0
    )

    return {
        "rsi":   rsi_score,
        "macd":  macd_score,
        "bb":    bb_score,
        "ema":   ema_score,
    }


# ─── BACKTEST VETORIZADO ────────────────────────────────────

def _backtest_vectorized(chromosome: Chromosome, closes: np.ndarray) -> dict:
    """
    Backtest rápido e vetorizado.
    Calcula os indicadores uma vez e simula trades candle a candle.
    """
    signals = _compute_signals(closes)
    n = len(closes)

    # Score composto ponderado pelo cromossomo
    rsi_s  = np.nan_to_num(signals["rsi"],  nan=0.0)
    macd_s = np.nan_to_num(signals["macd"], nan=0.0)
    bb_s   = np.nan_to_num(signals["bb"],   nan=0.0)
    ema_s  = np.nan_to_num(signals["ema"],  nan=0.0)

    score = (
        chromosome.w_rsi       * rsi_s  +
        chromosome.w_macd      * macd_s +
        chromosome.w_bollinger * bb_s   +
        chromosome.w_ema       * ema_s
    )

    returns   = []
    position  = None   # None | {"entry_price": float, "entry_idx": int}
    min_idx   = 50     # começa após indicadores aquecidos

    for i in range(min_idx, n):
        s     = score[i]
        price = closes[i]

        if np.isnan(s):
            continue

        # Gerencia posição aberta
        if position is not None:
            entry     = position["entry_price"]
            pnl_pct   = (price - entry) / entry * 100

            # Stop loss
            if pnl_pct <= -chromosome.stop_loss_pct:
                returns.append(-chromosome.stop_loss_pct / 100)
                position = None
                continue

            # Take profit
            if pnl_pct >= chromosome.take_profit_pct:
                returns.append(chromosome.take_profit_pct / 100)
                position = None
                continue

            # Sinal de venda
            if s < -0.05:
                returns.append((price - entry) / entry)
                position = None
                continue

        # Sinal de compra — abre posição
        if position is None and s > 0.05:
            position = {"entry_price": price, "entry_idx": i}

    # Fecha posição aberta no último candle
    if position is not None:
        entry = position["entry_price"]
        ret   = (closes[-1] - entry) / entry
        returns.append(ret)

    return {"returns": returns}


# ─── GA POPULATION ──────────────────────────────────────────

class GAPopulation:

    def __init__(
        self,
        population_size: int   = 10,
        generations:     int   = 20,
        symbol:          str   = "BTC/USDT",
        timeframe:       str   = "1h",
        data_limit:      int   = 200,
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
        logger.info(f"Buscando {self.data_limit} candles {self.symbol} {self.timeframe}")
        ohlcv = get_ohlcv(
            symbol        = self.symbol,
            timeframe     = self.timeframe,
            limit         = self.data_limit,
            exchange_name = self.exchange,
            api_key       = self.api_key,
            secret        = self.api_secret,
        )
        self.closes_np = np.array(ohlcv["closes"], dtype=float)
        logger.info(f"Dados carregados: {len(self.closes_np)} candles | "
                    f"range ${self.closes_np.min():,.0f} – ${self.closes_np.max():,.0f}")

    def _new_individual(self, gen: int, chrom: Optional[Chromosome] = None) -> Individual:
        c = chrom or Chromosome.random()
        uid = f"bot_g{gen}_{random.randint(1000,9999)}"
        return Individual(id=uid, chromosome=c, generation=gen)

    def _evaluate(self, ind: Individual) -> Individual:
        try:
            result  = _backtest_vectorized(ind.chromosome, self.closes_np)
            returns = result["returns"]

            if len(returns) < 3:
                ind.fitness = -1.0
                return ind

            arr          = np.array(returns)
            ind.trades   = len(returns)
            ind.win_rate = float(np.sum(arr > 0) / len(arr) * 100)
            ind.max_dd   = float(np.min(np.minimum.accumulate(1 + arr) - 1) * 100)
            ind.total_return = float((np.prod(1 + arr) - 1) * 100)
            ind.sortino  = calculate_sortino_ratio(returns)

            # Fitness: Sortino + bônus win rate + penalidade drawdown
            ind.fitness = (
                ind.sortino
                + max(0, ind.win_rate - 50) * 0.02
                + ind.max_dd * 0.01
            )
        except Exception as e:
            logger.warning(f"Erro em {ind.id}: {e}")
            ind.fitness = -1.0
        return ind

    def _evaluate_parallel(self):
        with ThreadPoolExecutor(max_workers=4) as ex:
            futures = {ex.submit(self._evaluate, ind): i for i, ind in enumerate(self.population)}
            for fut in as_completed(futures):
                idx = futures[fut]
                self.population[idx] = fut.result()

    def _crossover(self, pa: Individual, pb: Individual, gen: int) -> Individual:
        ga, gb = pa.chromosome.to_dict(), pb.chromosome.to_dict()
        child_genes = {g: ga[g] if random.random() < 0.5 else gb[g] for g in GENE_NAMES}
        return self._new_individual(gen, Chromosome.from_dict(child_genes))

    def _mutate(self, ind: Individual) -> Individual:
        genes = ind.chromosome.to_dict()
        for gene, (lo, hi) in GENE_RANGES.items():
            if random.random() < self.mutation_rate:
                genes[gene] += random.gauss(0, self.mutation_sigma * (hi - lo))
        ind.chromosome = Chromosome.from_dict(genes)
        return ind

    def _next_gen(self, gen: int) -> list[Individual]:
        sorted_pop = sorted(self.population, key=lambda x: x.fitness, reverse=True)
        elites     = sorted_pop[:self.elite_size]
        new_pop    = [self._new_individual(gen, Chromosome.from_dict(e.chromosome.to_dict())) for e in elites]

        while len(new_pop) < self.population_size:
            pa = random.choice(elites)
            pb = random.choice([e for e in elites if e.id != pa.id] or elites)
            child = self._crossover(pa, pb, gen)
            child = self._mutate(child)
            new_pop.append(child)

        return new_pop[:self.population_size]

    def run(self) -> dict:
        t0 = time.time()
        logger.info(f"GA v2 | {self.population_size} robôs × {self.generations} gerações | {self.symbol}")

        self._fetch_data()
        self.population = [self._new_individual(1) for _ in range(self.population_size)]

        for gen in range(1, self.generations + 1):
            self._evaluate_parallel()
            self.population.sort(key=lambda x: x.fitness, reverse=True)
            best = self.population[0]

            if self.best_ever is None or best.fitness > self.best_ever.fitness:
                self.best_ever = best

            avg_fit = np.mean([x.fitness for x in self.population])
            rec = {
                "generation":    gen,
                "best_fitness":  round(best.fitness, 4),
                "avg_fitness":   round(float(avg_fit), 4),
                "best_trades":   best.trades,
                "best_win_rate": round(best.win_rate, 1),
                "best_sortino":  round(best.sortino, 4),
                "best_max_dd":   round(best.max_dd, 2),
                "best_return":   round(best.total_return, 2),
                "best_genes":    best.chromosome.to_dict(),
            }
            self.history.append(rec)

            logger.info(
                f"Gen {gen:02d}/{self.generations} | "
                f"fit={best.fitness:.4f} sortino={best.sortino:.2f} "
                f"trades={best.trades} wr={best.win_rate:.0f}% "
                f"ret={best.total_return:.1f}% dd={best.max_dd:.1f}%"
            )

            # Parada antecipada se convergiu
            if gen >= 5:
                last = [h["best_fitness"] for h in self.history[-5:]]
                if max(last) - min(last) < 0.0005 and best.fitness > 0:
                    logger.info(f"Convergência na geração {gen}")
                    break

            if gen < self.generations:
                self.population = self._next_gen(gen + 1)

        best  = self.best_ever
        elapsed = round(time.time() - t0, 2)

        return {
            "best_chromosome": best.chromosome.to_dict(),
            "best_fitness":    round(best.fitness, 4),
            "best_sortino":    round(best.sortino, 4),
            "best_win_rate":   round(best.win_rate, 1),
            "best_max_dd":     round(best.max_dd, 2),
            "best_trades":     best.trades,
            "best_return":     round(best.total_return, 2),
            "best_id":         best.id,
            "generations_run": len(self.history),
            "history":         self.history,
            "elapsed_seconds": elapsed,
            "symbol":          self.symbol,
            "timeframe":       self.timeframe,
            "data_candles":    len(self.closes_np) if self.closes_np is not None else 0,
        }
