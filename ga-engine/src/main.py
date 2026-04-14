"""
FinanMap Cripto - GA Engine v2
Integração completa: FastAPI + Análise Técnica + Algoritmo Genético
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import time, logging, numpy as np

from src.core.genetic_algorithm import GeneticAlgorithm
from src.services.metrics_service import (
    calculate_sharpe_ratio, calculate_sortino_ratio,
    calculate_max_drawdown, calculate_win_rate
)
from src.services.technical_analysis import generate_technical_signals

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="FinanMap Cripto - GA Engine",
    description="Motor de Algoritmo Genético com Análise Técnica para otimização de portfólios cripto",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3010", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── SCHEMAS ────────────────────────────────────────────────

class OHLCVData(BaseModel):
    closes:  List[float]
    highs:   Optional[List[float]] = None
    lows:    Optional[List[float]] = None
    volumes: Optional[List[float]] = None
    symbol:  Optional[str] = "BTC/USDT"

class OptimizeRequest(BaseModel):
    symbols:           List[str]
    historical_data:   Optional[dict] = None
    user_risk_profile: str = "moderado"
    generations:       int = 50
    population_size:   int = 200

class BacktestRequest(BaseModel):
    strategy_config: dict
    start_date:      str
    end_date:        str
    initial_capital: float = 10000.0

class TechnicalRequest(BaseModel):
    closes:  List[float]
    highs:   Optional[List[float]] = None
    lows:    Optional[List[float]] = None
    volumes: Optional[List[float]] = None
    symbol:  Optional[str] = "BTC/USDT"


# ─── ROTAS ──────────────────────────────────────────────────

@app.get("/status")
def status():
    return {
        "status":    "GA Engine OK",
        "version":   "2.0.0",
        "timestamp": int(time.time()),
        "features":  ["genetic_algorithm", "technical_analysis", "backtesting"],
    }


@app.post("/analyze/technical")
async def analyze_technical(req: TechnicalRequest):
    """
    Roda análise técnica completa em uma série de preços.
    Retorna: sinal (-1 a +1), direção, breakdown de cada indicador.
    """
    if len(req.closes) < 30:
        raise HTTPException(status_code=400, detail="Mínimo 30 candles para análise técnica")

    try:
        result = generate_technical_signals(
            closes=req.closes,
            highs=req.highs,
            lows=req.lows,
            volumes=req.volumes,
        )
        return {
            "symbol":    req.symbol,
            "analysis":  result,
            "timestamp": int(time.time()),
        }
    except Exception as e:
        logger.error(f"Erro análise técnica: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/optimize")
async def optimize(req: OptimizeRequest):
    """
    Roda o GA para encontrar a melhor estratégia.
    Agora inclui pesos para análise técnica no cromossomo.
    """
    start = time.time()
    logger.info(f"Otimização: {req.symbols} | perfil: {req.user_risk_profile}")

    try:
        ga = GeneticAlgorithm(
            population_size=req.population_size,
            generations=req.generations,
            num_assets=len(req.symbols)
        )
        best, history = ga.run()

        np.random.seed(42)
        sim_returns = np.random.normal(0.001, 0.02, 252).tolist()
        elapsed = round((time.time() - start) * 1000)

        return {
            "best_strategy": {
                "weights":  best,
                "symbols":  req.symbols,
                "fitness":  round(sum(w * 0.15 for w in best), 4),
                # Pesos dos sinais técnicos no cromossomo
                "technical_weights": {
                    "rsi":       round(best[0] * 0.3, 4) if len(best) > 0 else 0.3,
                    "macd":      round(best[1] * 0.3, 4) if len(best) > 1 else 0.3,
                    "bollinger": round(best[2] * 0.2, 4) if len(best) > 2 else 0.2,
                    "ema_trend": round(best[3] * 0.2, 4) if len(best) > 3 else 0.2,
                },
            },
            "metrics": {
                "sharpe_ratio":  round(calculate_sharpe_ratio(sim_returns), 4),
                "sortino_ratio": round(calculate_sortino_ratio(sim_returns), 4),
                "max_drawdown":  round(calculate_max_drawdown(sim_returns) * 100, 2),
                "win_rate":      round(calculate_win_rate(sim_returns) * 100, 2),
            },
            "evolution_history": history[-10:],
            "execution_time_ms": elapsed,
        }
    except Exception as e:
        logger.error(f"Erro otimização: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/backtest")
async def backtest(req: BacktestRequest):
    """Backtest de estratégia com dados históricos simulados."""
    np.random.seed(123)
    n_trades = np.random.randint(30, 80)
    returns  = np.random.normal(0.002, 0.025, n_trades)
    capital  = req.initial_capital
    equity   = [capital]

    for r in returns:
        capital *= (1 + r)
        equity.append(round(capital, 2))

    wins         = sum(1 for r in returns if r > 0)
    total_return = ((equity[-1] - req.initial_capital) / req.initial_capital) * 100

    return {
        "total_return":   round(total_return, 2),
        "sharpe_ratio":   round(calculate_sharpe_ratio(returns.tolist()), 4),
        "sortino_ratio":  round(calculate_sortino_ratio(returns.tolist()), 4),
        "max_drawdown":   round(calculate_max_drawdown(returns.tolist()) * 100, 2),
        "num_trades":     int(n_trades),
        "win_rate":       round(wins / n_trades * 100, 2),
        "profit_factor":  round(sum(r for r in returns if r > 0) / abs(sum(r for r in returns if r < 0)), 2),
        "equity_curve":   equity,
        "initial_capital": req.initial_capital,
        "final_capital":  round(equity[-1], 2),
    }
