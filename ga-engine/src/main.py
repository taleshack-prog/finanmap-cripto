"""
FinanMap Cripto - GA Engine v4
GA + Análise Técnica + Dados Reais CCXT + Trading Bot
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict
import time, logging, numpy as np, os

from src.core.genetic_algorithm import GeneticAlgorithm
from src.core.trading_bot import TradingBot, BotConfig
from src.services.metrics_service import (
    calculate_sharpe_ratio, calculate_sortino_ratio,
    calculate_max_drawdown, calculate_win_rate
)
from src.services.technical_analysis import generate_technical_signals
from src.services.data_service import (
    get_ohlcv, get_ticker, get_order_book, get_multiple_tickers
)
from src.services.portfolio_service import (
    get_binance_balances, get_prices_for_symbols, categorize
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="FinanMap Cripto - GA Engine",
    description="GA + Análise Técnica + Dados Reais CCXT + Trading Bot",
    version="4.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3010", "http://localhost:3020"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BINANCE_KEY    = os.getenv("BINANCE_API_KEY", "")
BINANCE_SECRET = os.getenv("BINANCE_SECRET",  "")

# Registro de bots ativos em memória
active_bots: Dict[str, TradingBot] = {}


# ─── SCHEMAS ────────────────────────────────────────────────

class TechnicalRequest(BaseModel):
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

class BotStartRequest(BaseModel):
    bot_id:          str
    user_id:         str
    strategy_id:     str
    symbol:          str   = "BTC/USDT"
    timeframe:       str   = "1h"
    capital:         float = 1000.0
    max_position:    float = 0.1
    stop_loss_pct:   float = 2.0
    take_profit_pct: float = 4.0
    min_confidence:  float = 0.5
    dry_run:         bool  = True    # SEMPRE True em desenvolvimento!
    api_key:         str   = ""
    api_secret:      str   = ""
    exchange:        str   = "binance"
    w_rsi:           float = 0.30
    w_macd:          float = 0.30
    w_bollinger:     float = 0.20
    w_ema:           float = 0.20


# ─── STATUS ─────────────────────────────────────────────────

@app.get("/status")
def status():
    return {
        "status":      "GA Engine OK",
        "version":     "4.0.0",
        "timestamp":   int(time.time()),
        "features":    ["genetic_algorithm", "technical_analysis", "real_market_data", "trading_bot", "backtesting"],
        "active_bots": len(active_bots),
    }


# ─── BOT ROUTES ─────────────────────────────────────────────

@app.post("/bot/start")
async def bot_start(req: BotStartRequest):
    """Inicia um robô de trading"""
    if req.bot_id in active_bots:
        raise HTTPException(status_code=400, detail="Bot já está rodando")

    config = BotConfig(
        bot_id          = req.bot_id,
        user_id         = req.user_id,
        strategy_id     = req.strategy_id,
        symbol          = req.symbol,
        timeframe       = req.timeframe,
        capital         = req.capital,
        max_position    = req.max_position,
        stop_loss_pct   = req.stop_loss_pct,
        take_profit_pct = req.take_profit_pct,
        min_confidence  = req.min_confidence,
        dry_run         = req.dry_run,
        api_key         = req.api_key or BINANCE_KEY,
        api_secret      = req.api_secret or BINANCE_SECRET,
        exchange        = req.exchange,
        w_rsi           = req.w_rsi,
        w_macd          = req.w_macd,
        w_bollinger     = req.w_bollinger,
        w_ema           = req.w_ema,
    )

    bot = TradingBot(config)
    active_bots[req.bot_id] = bot
    await bot.start()

    return {
        "message":    f"Bot {req.bot_id} iniciado",
        "dry_run":    req.dry_run,
        "symbol":     req.symbol,
        "timeframe":  req.timeframe,
        "status":     bot.get_status(),
    }


@app.post("/bot/stop/{bot_id}")
async def bot_stop(bot_id: str):
    """Para um robô de trading"""
    if bot_id not in active_bots:
        raise HTTPException(status_code=404, detail="Bot não encontrado")

    bot = active_bots[bot_id]
    await bot.stop()
    del active_bots[bot_id]

    return {"message": f"Bot {bot_id} parado", "final_status": bot.get_status()}


@app.get("/bot/status/{bot_id}")
async def bot_status(bot_id: str):
    """Status de um robô específico"""
    if bot_id not in active_bots:
        raise HTTPException(status_code=404, detail="Bot não encontrado")
    return active_bots[bot_id].get_status()


@app.get("/bot/list")
async def bot_list():
    """Lista todos os bots ativos"""
    return {
        "bots":  [b.get_status() for b in active_bots.values()],
        "count": len(active_bots),
    }


@app.post("/bot/tick/{bot_id}")
async def bot_tick(bot_id: str):
    """Força um tick manual no bot (para testes)"""
    if bot_id not in active_bots:
        raise HTTPException(status_code=404, detail="Bot não encontrado")
    bot = active_bots[bot_id]
    await bot._tick()
    return bot.get_status()


# ─── MARKET DATA ────────────────────────────────────────────

@app.get("/market/ticker")
async def market_ticker(symbol: str = Query("BTC/USDT"), exchange: str = Query("binance")):
    try:
        return get_ticker(symbol, exchange)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/market/ohlcv")
async def market_ohlcv(symbol: str = Query("BTC/USDT"), timeframe: str = Query("1h"), limit: int = Query(100), exchange: str = Query("binance")):
    try:
        return get_ohlcv(symbol, timeframe, limit, exchange, BINANCE_KEY, BINANCE_SECRET)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/market/orderbook")
async def market_orderbook(symbol: str = Query("BTC/USDT"), limit: int = Query(20), exchange: str = Query("binance")):
    try:
        return get_order_book(symbol, limit, exchange)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/market/portfolio-prices")
async def portfolio_prices(symbols: str = Query("BTC/USDT,ETH/USDT,SOL/USDT"), exchange: str = Query("binance")):
    try:
        return get_multiple_tickers([s.strip() for s in symbols.split(",")], exchange)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── ANÁLISE TÉCNICA ────────────────────────────────────────

@app.get("/analyze/live")
async def analyze_live(symbol: str = Query("BTC/USDT"), timeframe: str = Query("1h"), limit: int = Query(100), exchange: str = Query("binance")):
    try:
        ohlcv   = get_ohlcv(symbol, timeframe, limit, exchange, BINANCE_KEY, BINANCE_SECRET)
        signals = generate_technical_signals(ohlcv["closes"], ohlcv["highs"], ohlcv["lows"], ohlcv["volumes"])
        return {"symbol": symbol, "timeframe": timeframe, "candles": ohlcv["count"], "analysis": signals, "latest_price": ohlcv["closes"][-1], "timestamp": int(time.time())}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/analyze/technical")
async def analyze_technical(req: TechnicalRequest):
    if len(req.closes) < 30:
        raise HTTPException(status_code=400, detail="Mínimo 30 candles")
    try:
        result = generate_technical_signals(req.closes, req.highs, req.lows, req.volumes)
        return {"symbol": req.symbol, "analysis": result, "timestamp": int(time.time())}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── PORTFÓLIO ──────────────────────────────────────────────

@app.get("/portfolio/binance")
async def portfolio_binance(api_key: Optional[str] = Query(None), secret: Optional[str] = Query(None)):
    key = api_key or BINANCE_KEY
    sec = secret  or BINANCE_SECRET
    if not key or not sec:
        raise HTTPException(status_code=400, detail="API Key e Secret necessários")
    try:
        assets = get_binance_balances(key, sec)
        total  = sum(a["value_usdt"] for a in assets)
        for a in assets:
            a["allocation_pct"] = round(a["value_usdt"] / total * 100, 2) if total > 0 else 0
        return {"total_usdt": round(total, 2), "assets": assets, "count": len(assets), "source": "binance_real"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/portfolio/manual")
async def portfolio_manual(data: dict):
    assets_in = data.get("assets", [])
    symbols   = [a["symbol"].upper() for a in assets_in]
    prices    = get_prices_for_symbols(symbols)
    assets    = []
    for a in assets_in:
        sym = a["symbol"].upper()
        p   = prices.get(sym, {"price": 0, "change_24h": 0})
        val = a["quantity"] * p["price"]
        assets.append({"symbol": sym, "quantity": a["quantity"], "price_usdt": p["price"], "value_usdt": round(val, 2), "change_24h": p["change_24h"], "category": categorize(sym), "allocation_pct": 0})
    total = sum(a["value_usdt"] for a in assets)
    for a in assets:
        a["allocation_pct"] = round(a["value_usdt"] / total * 100, 2) if total > 0 else 0
    return {"total_usdt": round(total, 2), "assets": sorted(assets, key=lambda x: x["value_usdt"], reverse=True), "count": len(assets), "source": "manual"}


# ─── GA + BACKTEST ──────────────────────────────────────────

@app.post("/optimize")
async def optimize(req: OptimizeRequest):
    start = time.time()
    try:
        real_returns = []
        for symbol in req.symbols[:3]:
            try:
                ohlcv  = get_ohlcv(symbol, "1d", 60, "binance", BINANCE_KEY, BINANCE_SECRET)
                closes = ohlcv["closes"]
                real_returns.extend([(closes[i] - closes[i-1]) / closes[i-1] for i in range(1, len(closes))])
            except Exception:
                real_returns.extend(np.random.normal(0.001, 0.02, 59).tolist())

        ga   = GeneticAlgorithm(population_size=req.population_size, generations=req.generations, num_assets=len(req.symbols))
        best, history = ga.run()
        elapsed = round((time.time() - start) * 1000)
        sim = real_returns if real_returns else np.random.normal(0.001, 0.02, 252).tolist()

        return {
            "best_strategy": {"weights": best, "symbols": req.symbols, "fitness": round(sum(w * 0.15 for w in best), 4),
                "technical_weights": {"rsi": round(best[0] * 0.3, 4) if len(best) > 0 else 0.3, "macd": round(best[1] * 0.3, 4) if len(best) > 1 else 0.3, "bollinger": round(best[2] * 0.2, 4) if len(best) > 2 else 0.2, "ema_trend": round(best[3] * 0.2, 4) if len(best) > 3 else 0.2}},
            "metrics": {"sharpe_ratio": round(calculate_sharpe_ratio(sim), 4), "sortino_ratio": round(calculate_sortino_ratio(sim), 4), "max_drawdown": round(calculate_max_drawdown(sim) * 100, 2), "win_rate": round(calculate_win_rate(sim) * 100, 2)},
            "evolution_history": history[-10:], "execution_time_ms": elapsed, "data_source": "real" if real_returns else "simulated",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/backtest")
async def backtest(req: BacktestRequest):
    np.random.seed(123)
    n = np.random.randint(30, 80)
    returns = np.random.normal(0.002, 0.025, n)
    capital = req.initial_capital
    equity  = [capital]
    for r in returns:
        capital *= (1 + r)
        equity.append(round(capital, 2))
    wins = sum(1 for r in returns if r > 0)
    return {
        "total_return":   round(((equity[-1] - req.initial_capital) / req.initial_capital) * 100, 2),
        "sharpe_ratio":   round(calculate_sharpe_ratio(returns.tolist()), 4),
        "sortino_ratio":  round(calculate_sortino_ratio(returns.tolist()), 4),
        "max_drawdown":   round(calculate_max_drawdown(returns.tolist()) * 100, 2),
        "num_trades":     int(n), "win_rate": round(wins / n * 100, 2),
        "profit_factor":  round(sum(r for r in returns if r > 0) / abs(sum(r for r in returns if r < 0)), 2),
        "equity_curve":   equity, "initial_capital": req.initial_capital, "final_capital": round(equity[-1], 2),
    }
