import numpy as np
from typing import List


def calculate_sharpe_ratio(returns: List[float], risk_free_rate: float = 0.05 / 252) -> float:
    arr = np.array(returns)
    excess = arr - risk_free_rate
    return float(np.mean(excess) / np.std(excess) * np.sqrt(252)) if np.std(excess) > 0 else 0.0


def calculate_sortino_ratio(returns: List[float], risk_free_rate: float = 0.05 / 252) -> float:
    arr = np.array(returns)
    excess = arr - risk_free_rate
    downside = arr[arr < 0]
    downside_std = np.sqrt(np.mean(downside ** 2)) if len(downside) > 0 else 0
    return float(np.mean(excess) / downside_std * np.sqrt(252)) if downside_std > 0 else 0.0


def calculate_max_drawdown(returns: List[float]) -> float:
    arr = np.array(returns)
    equity = np.cumprod(1 + arr)
    peak = np.maximum.accumulate(equity)
    drawdown = (equity - peak) / peak
    return float(np.min(drawdown))


def calculate_win_rate(returns: List[float]) -> float:
    arr = np.array(returns)
    return float(np.sum(arr > 0) / len(arr)) if len(arr) > 0 else 0.0


def calculate_profit_factor(returns: List[float]) -> float:
    arr = np.array(returns)
    wins = np.sum(arr[arr > 0])
    losses = abs(np.sum(arr[arr < 0]))
    return float(wins / losses) if losses > 0 else float('inf')


def monte_carlo_simulation(returns: List[float], num_simulations: int = 1000, num_periods: int = 252) -> List[List[float]]:
    arr = np.array(returns)
    results = []
    for _ in range(num_simulations):
        sampled = np.random.choice(arr, size=num_periods, replace=True)
        equity = list(np.cumprod(1 + sampled))
        results.append([round(v, 4) for v in equity])
    return results
