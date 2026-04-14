"""
FinanMap Cripto - Rota de Portfólio
Busca saldo real da Binance via CCXT + opção de adicionar ativos manualmente
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import os, time, logging
import ccxt

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Stablecoins conhecidas
STABLECOINS = {
    "USDT", "USDC", "BUSD", "DAI", "TUSD", "FDUSD", "PYUSD",
    "FRAX", "USDE", "USDP", "GUSD", "LUSD", "MIM", "CUSD",
    "SUSD", "ALUSD", "DOLA", "USDD", "HUSD", "USTC", "CELO",
    "EURT", "EURS", "SEUR", "XSGD", "IDRT", "BIDR", "BVND",
}

# Memecoins top 10
MEMECOINS = {
    "DOGE", "SHIB", "PEPE", "FLOKI", "BONK",
    "WIF", "BOME", "MEME", "NEIRO", "DOGS",
}

# Altcoins top ranking
ALTCOINS_TOP = {
    "ETH", "BNB", "SOL", "XRP", "ADA", "AVAX", "DOT", "MATIC",
    "LINK", "UNI", "ATOM", "LTC", "BCH", "NEAR", "APT", "ARB",
    "OP", "INJ", "SUI", "TIA", "TON", "IMX", "MKR", "AAVE",
    "GRT", "FIL", "SAND", "MANA", "AXS", "CHZ", "ENJ", "VET",
    "ALGO", "EGLD", "HBAR", "ICP", "FLOW", "XTZ", "EOS", "ZEC",
}


def categorize(symbol: str) -> str:
    if symbol == "BTC":
        return "bitcoin"
    if symbol in STABLECOINS:
        return "stablecoin"
    if symbol in MEMECOINS:
        return "memecoin"
    if symbol in ALTCOINS_TOP:
        return "altcoin"
    return "other"


def get_binance_balances(api_key: str, secret: str) -> list:
    """Busca saldos reais da Binance via CCXT"""
    try:
        exchange = ccxt.binance({
            "apiKey": api_key,
            "secret": secret,
            "enableRateLimit": True,
        })
        balance = exchange.fetch_balance()
        result = []

        for symbol, data in balance["total"].items():
            if data > 0:
                # Pega preço em USDT
                price_usdt = 1.0
                if symbol not in STABLECOINS:
                    try:
                        ticker = exchange.fetch_ticker(f"{symbol}/USDT")
                        price_usdt = ticker["last"] or 0
                        change_24h = ticker.get("percentage", 0) or 0
                    except Exception:
                        price_usdt = 0
                        change_24h = 0
                else:
                    change_24h = 0

                value_usdt = data * price_usdt
                if value_usdt < 0.01:
                    continue  # ignora dust

                result.append({
                    "symbol":     symbol,
                    "quantity":   data,
                    "price_usdt": price_usdt,
                    "value_usdt": round(value_usdt, 2),
                    "change_24h": round(change_24h, 2),
                    "category":   categorize(symbol),
                    "source":     "binance",
                })

        return sorted(result, key=lambda x: x["value_usdt"], reverse=True)

    except ccxt.AuthenticationError:
        raise ValueError("API Key ou Secret inválidos")
    except ccxt.NetworkError as e:
        raise ConnectionError(f"Erro de rede: {e}")
    except Exception as e:
        raise ValueError(f"Erro ao buscar saldos: {e}")


def get_prices_for_symbols(symbols: list) -> dict:
    """Busca preços atuais para lista de símbolos"""
    exchange = ccxt.binance({"enableRateLimit": True})
    prices = {}
    for symbol in symbols:
        if symbol in STABLECOINS:
            prices[symbol] = {"price": 1.0, "change_24h": 0.0}
            continue
        try:
            ticker = exchange.fetch_ticker(f"{symbol}/USDT")
            prices[symbol] = {
                "price":      ticker["last"] or 0,
                "change_24h": ticker.get("percentage", 0) or 0,
            }
            time.sleep(0.05)
        except Exception:
            prices[symbol] = {"price": 0, "change_24h": 0}
    return prices


# ── FastAPI app ──────────────────────────────────────────────

app = FastAPI(title="FinanMap - Portfolio Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BINANCE_KEY    = os.getenv("BINANCE_API_KEY", "")
BINANCE_SECRET = os.getenv("BINANCE_SECRET", "")


class ManualAsset(BaseModel):
    symbol:   str
    quantity: float
    exchange: Optional[str] = "manual"


class ManualPortfolioRequest(BaseModel):
    assets: List[ManualAsset]


@app.get("/portfolio/binance")
async def portfolio_binance(
    api_key: Optional[str] = Query(None),
    secret:  Optional[str] = Query(None),
):
    """Busca saldo real da Binance"""
    key = api_key or BINANCE_KEY
    sec = secret or BINANCE_SECRET
    if not key or not sec:
        raise HTTPException(status_code=400, detail="API Key e Secret necessários")
    try:
        assets = get_binance_balances(key, sec)
        total  = sum(a["value_usdt"] for a in assets)

        # Calcula % de alocação
        for a in assets:
            a["allocation_pct"] = round(a["value_usdt"] / total * 100, 2) if total > 0 else 0

        # Agrupa por categoria
        by_category = {}
        for a in assets:
            cat = a["category"]
            if cat not in by_category:
                by_category[cat] = {"total_usdt": 0, "count": 0, "assets": []}
            by_category[cat]["total_usdt"] += a["value_usdt"]
            by_category[cat]["count"]      += 1
            by_category[cat]["assets"].append(a["symbol"])

        return {
            "total_usdt":  round(total, 2),
            "assets":      assets,
            "by_category": by_category,
            "count":       len(assets),
            "timestamp":   int(time.time()),
            "source":      "binance_real",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/portfolio/manual")
async def portfolio_manual(req: ManualPortfolioRequest):
    """Adiciona ativos manualmente e busca preços reais"""
    symbols = [a.symbol.upper() for a in req.assets]
    prices  = get_prices_for_symbols(symbols)
    assets  = []

    for a in req.assets:
        sym    = a.symbol.upper()
        p      = prices.get(sym, {"price": 0, "change_24h": 0})
        val    = a.quantity * p["price"]
        assets.append({
            "symbol":     sym,
            "quantity":   a.quantity,
            "price_usdt": p["price"],
            "value_usdt": round(val, 2),
            "change_24h": p["change_24h"],
            "category":   categorize(sym),
            "source":     a.exchange,
        })

    assets.sort(key=lambda x: x["value_usdt"], reverse=True)
    total = sum(a["value_usdt"] for a in assets)
    for a in assets:
        a["allocation_pct"] = round(a["value_usdt"] / total * 100, 2) if total > 0 else 0

    return {
        "total_usdt": round(total, 2),
        "assets":     assets,
        "count":      len(assets),
        "timestamp":  int(time.time()),
        "source":     "manual",
    }


@app.get("/portfolio/prices")
async def portfolio_prices(
    symbols: str = Query("BTC,ETH,SOL,BNB,DOGE"),
):
    """Preços atuais para lista de símbolos"""
    symbol_list = [s.strip().upper() for s in symbols.split(",")]
    prices = get_prices_for_symbols(symbol_list)
    return {
        "prices":    prices,
        "timestamp": int(time.time()),
    }
