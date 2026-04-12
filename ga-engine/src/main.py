from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import time
import logging

from src.core.genetic_algorithm import GeneticAlgorithm
from src.services.metrics_service import (
    calculate_sharpe_ratio, calculate_sortino_ratio,
    calculate_max_drawdown, calculate_win_rate
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="FinanMap Cripto - GA Engine",
    description="Motor de Algoritmo Genético para otimização de portfólios cripto",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class OptimizeRequest(BaseModel):
    symbols: List[str]
    historical_data: Optional[dict] = None
    user_risk_profile: str = "moderado"
    generations: int = 50
    population_size: int = 200


class BacktestRequest(BaseModel):
    strategy_config: dict
    start_date: str
    end_date: str
    initial_capital: float = 10000.0


@app.get("/status")
def status():
    return {"status": "GA Engine OK", "timestamp": int(time.time()), "version": "1.0.0"}


@app.post("/optimize")
async def optimize(req: OptimizeRequest):
    start = time.time()
    logger.info(f"Otimização iniciada: {req.symbols} | perfil: {req.user_risk_profile}")

    try:
        ga = GeneticAlgorithm(
            population_size=req.population_size,
            generations=req.generations,
            num_assets=len(req.symbols)
        )
        best, history = ga.run()

        # Gera retornos simulados para métricas
        import numpy as np
        np.random.seed(42)
        simulated_returns = np.random.normal(0.001, 0.02, 252).tolist()

        elapsed = round((time.time() - start) * 1000)

        return {
            "best_strategy": {
                "weights": best,
                "symbols": req.symbols,
                "fitness": round(sum(w * 0.15 for w in best), 4),
            },
            "metrics": {
                "sharpe_ratio": round(calculate_sharpe_ratio(simulated_returns), 4),
                "sortino_ratio": round(calculate_sortino_ratio(simulated_returns), 4),
                "max_drawdown": round(calculate_max_drawdown(simulated_returns) * 100, 2),
                "win_rate": round(calculate_win_rate(simulated_returns) * 100, 2),
            },
            "evolution_history": history[-10:],
            "execution_time_ms": elapsed,
        }
    except Exception as e:
        logger.error(f"Erro na otimização: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/backtest")
async def backtest(req: BacktestRequest):
    import numpy as np
    np.random.seed(123)

    n_trades = np.random.randint(30, 80)
    returns = np.random.normal(0.002, 0.025, n_trades)
    capital = req.initial_capital
    equity = [capital]

    for r in returns:
        capital *= (1 + r)
        equity.append(round(capital, 2))

    total_return = ((equity[-1] - req.initial_capital) / req.initial_capital) * 100
    wins = sum(1 for r in returns if r > 0)

    return {
        "total_return": round(total_return, 2),
        "sharpe_ratio": round(calculate_sharpe_ratio(returns.tolist()), 4),
        "sortino_ratio": round(calculate_sortino_ratio(returns.tolist()), 4),
        "max_drawdown": round(calculate_max_drawdown(returns.tolist()) * 100, 2),
        "num_trades": int(n_trades),
        "win_rate": round(wins / n_trades * 100, 2),
        "profit_factor": round(sum(r for r in returns if r > 0) / abs(sum(r for r in returns if r < 0)), 2),
        "equity_curve": equity,
        "initial_capital": req.initial_capital,
        "final_capital": round(equity[-1], 2),
    }
