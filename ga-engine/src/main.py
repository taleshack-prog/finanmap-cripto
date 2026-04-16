"""
FinanMap Cripto - GA Engine v7
GA Population + Técnica + Fluxo + Quantitativa + On-Chain
"""

from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict
import time, logging, numpy as np, os

from src.core.trading_bot import TradingBot, BotConfig
from src.core.ga_population import GAPopulation
from src.services.metrics_service import (
    calculate_sharpe_ratio, calculate_sortino_ratio,
    calculate_max_drawdown, calculate_win_rate
)
from src.services.technical_analysis import generate_technical_signals
from src.services.quantitative_analysis import quantitative_score, correlation_matrix
from src.services.onchain_analysis import (
    get_btc_stats, get_mempool_stats, get_eth_stats,
    get_btc_chart, get_mempool_blocks, onchain_score
)
from src.services.data_service import (
    get_ohlcv, get_ticker, get_order_book, get_multiple_tickers
)
from src.services.portfolio_service import (
    get_binance_balances, get_prices_for_symbols, categorize
)
from src.services.advise_service import get_advise
from src.services.bot_persistence import restore_active_bots

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="FinanMap Cripto - GA Engine",
    description="GA + Técnica + Fluxo + Quantitativa + On-Chain",
    version="7.0.0"
)

@app.on_event("startup")
async def startup_event():
    import asyncio
    asyncio.create_task(restore_active_bots())

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3010", "http://localhost:3020"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

BINANCE_KEY    = os.getenv("BINANCE_API_KEY", "")
BINANCE_SECRET = os.getenv("BINANCE_SECRET",  "")
ETHERSCAN_KEY  = os.getenv("ETHERSCAN_API_KEY", "")

active_bots: Dict[str, TradingBot] = {}
ga_jobs:     Dict[str, dict]       = {}


# ─── SCHEMAS ────────────────────────────────────────────────

class GAPopulationRequest(BaseModel):
    symbol:          str   = "BTC/USDT"
    timeframe:       str   = "1h"
    data_limit:      int   = 500
    population_size: int   = 10
    generations:     int   = 20
    exchange:        str   = "binance"
    job_id:          Optional[str] = None

class BotStartRequest(BaseModel):
    bot_id:           str
    user_id:          str
    strategy_id:      str
    symbol:           str   = "BTC/USDT"
    timeframe:        str   = "1h"
    capital:          float = 1000.0
    max_position:     float = 0.1
    stop_loss_pct:    float = 2.0
    take_profit_pct:  float = 4.0
    min_signal:       float = 0.05
    dry_run:          bool  = True
    api_key:          str   = ""
    api_secret:       str   = ""
    exchange:         str   = "binance"
    w_rsi:            float = 0.25
    w_macd:           float = 0.25
    w_bollinger:      float = 0.25
    w_ema:            float = 0.25
    use_flow_filter:  bool  = True
    min_buy_pressure: float = 0.52
    max_spread_pct:   float = 0.05

class TechnicalRequest(BaseModel):
    closes:  List[float]
    highs:   Optional[List[float]] = None
    lows:    Optional[List[float]] = None
    volumes: Optional[List[float]] = None
    symbol:  Optional[str] = "BTC/USDT"

class QuantRequest(BaseModel):
    closes:     List[float]
    btc_closes: Optional[List[float]] = None
    symbol:     Optional[str] = "BTC/USDT"

class CorrelationRequest(BaseModel):
    assets: Dict[str, List[float]]

class BacktestRequest(BaseModel):
    strategy_config: dict
    start_date:      str
    end_date:        str
    initial_capital: float = 10000.0


# ─── STATUS ─────────────────────────────────────────────────

@app.get("/status")
def status():
    return {
        "status":    "GA Engine OK",
        "version":   "7.0.0",
        "timestamp": int(time.time()),
        "features":  ["ga_population", "trading_bot", "technical", "quantitative", "flow", "onchain"],
        "active_bots": len(active_bots),
        "ga_jobs":     len(ga_jobs),
    }


# ─── ON-CHAIN ROUTES ────────────────────────────────────────

@app.get("/onchain/btc")
async def onchain_btc():
    """Estatísticas on-chain BTC via Blockchain.com"""
    try:
        return await get_btc_stats()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/onchain/mempool")
async def onchain_mempool():
    """Mempool BTC via mempool.space — fees e congestionamento"""
    try:
        stats  = await get_mempool_stats()
        blocks = await get_mempool_blocks()
        return {"mempool": stats, "next_blocks": blocks, "timestamp": int(time.time())}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/onchain/eth")
async def onchain_eth():
    """Gas prices ETH via Etherscan"""
    try:
        return await get_eth_stats(ETHERSCAN_KEY)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/onchain/chart/{chart_name}")
async def onchain_chart(chart_name: str, timespan: str = Query("30days")):
    """
    Gráficos históricos on-chain BTC via Blockchain.com.
    chart_name: hash-rate | n-transactions | estimated-transaction-volume-usd |
                miners-revenue | transaction-fees-usd | mempool-size
    """
    try:
        return await get_btc_chart(chart_name, timespan)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/onchain/score/{symbol}")
async def onchain_score_route(symbol: str = "BTC"):
    """Score on-chain consolidado para uso no robô (-1 a +1)"""
    try:
        return await onchain_score(symbol.upper())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/advise/{symbol}")
async def advise_route(symbol: str = "BTC", strategy_id: Optional[str] = Query(None)):
    """Score on-chain como conselheiro externo — não bloqueia trades"""
    try:
        return await get_advise(symbol.upper(), strategy_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── ANÁLISE COMPLETA (4 camadas) ───────────────────────────

@app.get("/analyze/full")
async def analyze_full(
    symbol:    str = Query("BTC/USDT"),
    timeframe: str = Query("1h"),
    limit:     int = Query(200),
    exchange:  str = Query("binance"),
):
    """
    Análise completa com 4 camadas:
    Técnica (GA) + Quantitativa + Fluxo + On-Chain
    """
    try:
        base_symbol = symbol.replace("/USDT", "").replace("/BTC", "")

        # Busca dados em paralelo
        ohlcv_task    = get_ohlcv(symbol, timeframe, limit, exchange, BINANCE_KEY, BINANCE_SECRET)
        ticker_task   = get_ticker(symbol, exchange)
        ob_task       = get_order_book(symbol, 20, exchange)
        onchain_task  = onchain_score(base_symbol)

        import asyncio
        ohlcv, ticker, ob, onchain = await asyncio.gather(
            asyncio.to_thread(lambda: ohlcv_task),
            asyncio.to_thread(lambda: ticker_task),
            asyncio.to_thread(lambda: ob_task),
            onchain_task,
            return_exceptions=True
        )

        closes = ohlcv["closes"] if isinstance(ohlcv, dict) else []

        # 1. Análise técnica
        tech = generate_technical_signals(
            closes, ohlcv.get("highs"), ohlcv.get("lows"), ohlcv.get("volumes")
        ) if closes else {"signal": 0, "confidence": 0, "direction": "HOLD"}

        # 2. Análise quantitativa
        btc_closes = None
        if symbol != "BTC/USDT" and closes:
            try:
                btc_ohlcv  = get_ohlcv("BTC/USDT", timeframe, limit, exchange, BINANCE_KEY, BINANCE_SECRET)
                btc_closes = btc_ohlcv["closes"]
            except Exception:
                pass
        quant = quantitative_score(closes, btc_closes) if closes else {"score": 0, "direction": "HOLD"}

        # 3. Fluxo
        flow_score = 0.0
        flow       = {}
        if isinstance(ob, dict):
            bp         = ob.get("buy_pressure", 0.5)
            flow_score = float(np.clip((bp - 0.5) * 4, -1, 1))
            ch24       = ticker.get("change_24h", 0) if isinstance(ticker, dict) else 0
            flow = {
                "buy_pressure":  bp,
                "sell_pressure": ob.get("sell_pressure", 0.5),
                "spread_pct":    ob.get("spread_pct", 0),
                "change_24h":    ch24,
                "flow_score":    round(flow_score, 4),
            }

        # 4. On-chain score
        oc_score = onchain.get("score", 0.0) if isinstance(onchain, dict) else 0.0

        # Score técnico normalizado
        tech_dir = tech.get("direction", "HOLD")
        tech_conf = tech.get("confidence", 0)
        tech_score = tech_conf * (1 if tech_dir == "BUY" else -1 if tech_dir == "SELL" else 0)

        # Score combinado das 4 análises
        combined = (
            0.35 * tech_score  +
            0.25 * quant.get("score", 0) +
            0.20 * flow_score  +
            0.20 * oc_score
        )
        combined = float(np.clip(combined, -1, 1))

        return {
            "symbol":    symbol,
            "timeframe": timeframe,
            "price":     closes[-1] if closes else 0,
            "technical": tech,
            "quantitative": quant,
            "flow":      flow,
            "onchain":   onchain if isinstance(onchain, dict) else {"score": 0},
            "combined_score":     round(combined, 4),
            "combined_direction": "BUY" if combined > 0.1 else "SELL" if combined < -0.1 else "HOLD",
            "weights": {"technical": 0.35, "quantitative": 0.25, "flow": 0.20, "onchain": 0.20},
            "timestamp": int(time.time()),
        }
    except Exception as e:
        logger.error(f"Erro analyze/full: {e}")
        raise HTTPException(status_code=400, detail=str(e))


# ─── ANÁLISE QUANTITATIVA ───────────────────────────────────

@app.get("/analyze/quantitative")
async def analyze_quant_live(symbol: str = Query("BTC/USDT"), timeframe: str = Query("1h"), limit: int = Query(500), exchange: str = Query("binance")):
    try:
        ohlcv = get_ohlcv(symbol, timeframe, limit, exchange, BINANCE_KEY, BINANCE_SECRET)
        btc_closes = None
        if symbol != "BTC/USDT":
            btc = get_ohlcv("BTC/USDT", timeframe, limit, exchange, BINANCE_KEY, BINANCE_SECRET)
            btc_closes = btc["closes"]
        result = quantitative_score(ohlcv["closes"], btc_closes)
        return {"symbol": symbol, "candles": len(ohlcv["closes"]), "latest_price": ohlcv["closes"][-1], "quantitative": result, "timestamp": int(time.time())}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/analyze/volatility")
async def analyze_volatility(symbol: str = Query("BTC/USDT"), timeframe: str = Query("1h"), limit: int = Query(200), exchange: str = Query("binance")):
    from src.services.quantitative_analysis import historical_volatility, price_zscore, momentum, sharpe_rolling
    try:
        ohlcv = get_ohlcv(symbol, timeframe, limit, exchange, BINANCE_KEY, BINANCE_SECRET)
        closes = ohlcv["closes"]
        return {"symbol": symbol, "price": closes[-1], "volatility": historical_volatility(closes), "zscore": price_zscore(closes), "momentum": momentum(closes), "sharpe": sharpe_rolling(closes), "timestamp": int(time.time())}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/analyze/correlation/live")
async def analyze_correlation_live(symbols: str = Query("BTC/USDT,ETH/USDT,SOL/USDT"), timeframe: str = Query("1h"), limit: int = Query(200), exchange: str = Query("binance")):
    try:
        symbol_list = [s.strip() for s in symbols.split(",")]
        assets = {}
        for sym in symbol_list:
            ohlcv = get_ohlcv(sym, timeframe, limit, exchange, BINANCE_KEY, BINANCE_SECRET)
            assets[sym.replace("/USDT","").replace("/BTC","")] = ohlcv["closes"]
        return {"symbols": symbol_list, "correlation": correlation_matrix(assets), "timestamp": int(time.time())}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/analyze/live")
async def analyze_live(symbol: str = Query("BTC/USDT"), timeframe: str = Query("1h"), limit: int = Query(100), exchange: str = Query("binance")):
    try:
        ohlcv = get_ohlcv(symbol, timeframe, limit, exchange, BINANCE_KEY, BINANCE_SECRET)
        signals = generate_technical_signals(ohlcv["closes"], ohlcv["highs"], ohlcv["lows"], ohlcv["volumes"])
        return {"symbol": symbol, "timeframe": timeframe, "candles": ohlcv["count"], "analysis": signals, "latest_price": ohlcv["closes"][-1], "timestamp": int(time.time())}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/analyze/technical")
async def analyze_technical(req: TechnicalRequest):
    if len(req.closes) < 30: raise HTTPException(status_code=400, detail="Mínimo 30 candles")
    try:
        return {"symbol": req.symbol, "analysis": generate_technical_signals(req.closes, req.highs, req.lows, req.volumes), "timestamp": int(time.time())}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))


# ─── GA POPULATION ──────────────────────────────────────────

@app.post("/ga/evolve")
async def ga_evolve(req: GAPopulationRequest, background_tasks: BackgroundTasks):
    job_id = req.job_id or f"ga_{int(time.time())}"
    if job_id in ga_jobs and ga_jobs[job_id].get("status") == "running":
        raise HTTPException(status_code=400, detail="Job já rodando")
    ga_jobs[job_id] = {"job_id": job_id, "status": "running", "started_at": int(time.time()), "symbol": req.symbol, "result": None, "error": None}
    def run_ga():
        try:
            ga = GAPopulation(population_size=req.population_size, generations=req.generations, symbol=req.symbol, timeframe=req.timeframe, data_limit=req.data_limit, exchange=req.exchange, api_key=BINANCE_KEY, api_secret=BINANCE_SECRET)
            result = ga.run()
            ga_jobs[job_id].update({"status": "completed", "result": result, "completed_at": int(time.time())})
        except Exception as e:
            ga_jobs[job_id].update({"status": "error", "error": str(e)})
    background_tasks.add_task(run_ga)
    return {"job_id": job_id, "status": "running", "check_at": f"/ga/result/{job_id}"}

@app.post("/ga/evolve/sync")
async def ga_evolve_sync(req: GAPopulationRequest):
    try:
        ga = GAPopulation(population_size=req.population_size, generations=req.generations, symbol=req.symbol, timeframe=req.timeframe, data_limit=req.data_limit, exchange=req.exchange, api_key=BINANCE_KEY, api_secret=BINANCE_SECRET)
        return ga.run()
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/ga/result/{job_id}")
async def ga_result(job_id: str):
    if job_id not in ga_jobs: raise HTTPException(status_code=404, detail="Job não encontrado")
    return ga_jobs[job_id]

@app.get("/ga/jobs")
async def ga_jobs_list():
    return {"jobs": list(ga_jobs.values()), "count": len(ga_jobs)}


# ─── TRADING BOT ────────────────────────────────────────────

@app.post("/bot/start")
async def bot_start(req: BotStartRequest):
    if req.bot_id in active_bots: raise HTTPException(status_code=400, detail="Bot já rodando")
    config = BotConfig(bot_id=req.bot_id, user_id=req.user_id, strategy_id=req.strategy_id, symbol=req.symbol, timeframe=req.timeframe, capital=req.capital, max_position=req.max_position, stop_loss_pct=req.stop_loss_pct, take_profit_pct=req.take_profit_pct, min_signal=req.min_signal, dry_run=req.dry_run, api_key=req.api_key or BINANCE_KEY, api_secret=req.api_secret or BINANCE_SECRET, exchange=req.exchange, w_rsi=req.w_rsi, w_macd=req.w_macd, w_bollinger=req.w_bollinger, w_ema=req.w_ema, use_flow_filter=req.use_flow_filter, min_buy_pressure=req.min_buy_pressure, max_spread_pct=req.max_spread_pct)
    bot = TradingBot(config)
    active_bots[req.bot_id] = bot
    await bot.start()
    return {"message": f"Bot {req.bot_id} iniciado", "dry_run": req.dry_run, "status": bot.get_status()}

@app.post("/bot/stop/{bot_id}")
async def bot_stop(bot_id: str):
    if bot_id not in active_bots: raise HTTPException(status_code=404, detail="Bot não encontrado")
    bot = active_bots[bot_id]
    await bot.stop()
    del active_bots[bot_id]
    return {"message": f"Bot {bot_id} parado", "final_status": bot.get_status()}

@app.get("/bot/status/{bot_id}")
async def bot_status(bot_id: str):
    if bot_id not in active_bots: raise HTTPException(status_code=404, detail="Bot não encontrado")
    return active_bots[bot_id].get_status()

@app.get("/bot/list")
async def bot_list():
    return {"bots": [b.get_status() for b in active_bots.values()], "count": len(active_bots)}

@app.post("/bot/tick/{bot_id}")
async def bot_tick(bot_id: str):
    if bot_id not in active_bots: raise HTTPException(status_code=404, detail="Bot não encontrado")
    await active_bots[bot_id]._tick()
    return active_bots[bot_id].get_status()


# ─── MARKET DATA ────────────────────────────────────────────

@app.get("/market/ticker")
async def market_ticker(symbol: str = Query("BTC/USDT"), exchange: str = Query("binance")):
    try: return get_ticker(symbol, exchange)
    except Exception as e: raise HTTPException(status_code=400, detail=str(e))

@app.get("/market/ohlcv")
async def market_ohlcv(symbol: str = Query("BTC/USDT"), timeframe: str = Query("1h"), limit: int = Query(100), exchange: str = Query("binance")):
    try: return get_ohlcv(symbol, timeframe, limit, exchange, BINANCE_KEY, BINANCE_SECRET)
    except Exception as e: raise HTTPException(status_code=400, detail=str(e))

@app.get("/market/orderbook")
async def market_orderbook(symbol: str = Query("BTC/USDT"), limit: int = Query(20), exchange: str = Query("binance")):
    try: return get_order_book(symbol, limit, exchange)
    except Exception as e: raise HTTPException(status_code=400, detail=str(e))

@app.get("/market/portfolio-prices")
async def portfolio_prices(symbols: str = Query("BTC/USDT,ETH/USDT,SOL/USDT"), exchange: str = Query("binance")):
    try: return get_multiple_tickers([s.strip() for s in symbols.split(",")], exchange)
    except Exception as e: raise HTTPException(status_code=400, detail=str(e))


# ─── PORTFÓLIO ──────────────────────────────────────────────

@app.get("/portfolio/binance")
async def portfolio_binance(api_key: Optional[str] = Query(None), secret: Optional[str] = Query(None)):
    key, sec = api_key or BINANCE_KEY, secret or BINANCE_SECRET
    if not key or not sec: raise HTTPException(status_code=400, detail="API Key e Secret necessários")
    try:
        assets = get_binance_balances(key, sec)
        total  = sum(a["value_usdt"] for a in assets)
        for a in assets: a["allocation_pct"] = round(a["value_usdt"] / total * 100, 2) if total > 0 else 0
        return {"total_usdt": round(total, 2), "assets": assets, "count": len(assets), "source": "binance_real"}
    except Exception as e: raise HTTPException(status_code=400, detail=str(e))

@app.post("/portfolio/manual")
async def portfolio_manual(data: dict):
    assets_in = data.get("assets", [])
    prices    = get_prices_for_symbols([a["symbol"].upper() for a in assets_in])
    assets    = []
    for a in assets_in:
        sym = a["symbol"].upper()
        p   = prices.get(sym, {"price": 0, "change_24h": 0})
        val = a["quantity"] * p["price"]
        assets.append({"symbol": sym, "quantity": a["quantity"], "price_usdt": p["price"], "value_usdt": round(val, 2), "change_24h": p["change_24h"], "category": categorize(sym), "allocation_pct": 0})
    total = sum(a["value_usdt"] for a in assets)
    for a in assets: a["allocation_pct"] = round(a["value_usdt"] / total * 100, 2) if total > 0 else 0
    return {"total_usdt": round(total, 2), "assets": sorted(assets, key=lambda x: x["value_usdt"], reverse=True), "count": len(assets), "source": "manual"}


# ─── BACKTEST ───────────────────────────────────────────────

@app.post("/backtest")
async def backtest(req: BacktestRequest):
    np.random.seed(123)
    n = np.random.randint(30, 80)
    returns = np.random.normal(0.002, 0.025, n)
    capital = req.initial_capital
    equity  = [capital]
    for r in returns:
        capital *= (1 + r); equity.append(round(capital, 2))
    wins = sum(1 for r in returns if r > 0)
    return {"total_return": round(((equity[-1]-req.initial_capital)/req.initial_capital)*100,2), "sharpe_ratio": round(calculate_sharpe_ratio(returns.tolist()),4), "sortino_ratio": round(calculate_sortino_ratio(returns.tolist()),4), "max_drawdown": round(calculate_max_drawdown(returns.tolist())*100,2), "num_trades": int(n), "win_rate": round(wins/n*100,2), "profit_factor": round(sum(r for r in returns if r>0)/abs(sum(r for r in returns if r<0)),2), "equity_curve": equity, "initial_capital": req.initial_capital, "final_capital": round(equity[-1],2)}
