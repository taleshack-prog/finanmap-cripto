"""
FinanMap Cripto - Serviço de Dados de Mercado via CCXT
Busca dados reais de exchanges: preços, OHLCV, order book, funding rate
"""

import ccxt
import time
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Cache simples em memória para evitar rate limit
_cache: dict = {}
CACHE_TTL = 300  # 5 minutos — candles 1h mudam a cada hora


def _cache_get(key: str):
    entry = _cache.get(key)
    if entry and time.time() - entry["ts"] < CACHE_TTL:
        return entry["data"]
    return None


def _cache_set(key: str, data):
    _cache[key] = {"ts": time.time(), "data": data}


def get_exchange(exchange_name: str = "binance", api_key: str = "", secret: str = ""):
    """Inicializa conexão com a exchange via CCXT"""
    try:
        exchange_class = getattr(ccxt, exchange_name)
        params = {
            "enableRateLimit": True,
            "timeout": 10000,  # 10 segundos máximo
            "options": {
                "defaultType": "spot",
            }
        }
        if api_key:
            params["apiKey"] = api_key
            params["secret"] = secret
        return exchange_class(params)
    except AttributeError:
        raise ValueError(f"Exchange '{exchange_name}' não suportada pelo CCXT")


def get_ohlcv(
    symbol:        str = "BTC/USDT",
    timeframe:     str = "1h",
    limit:         int = 100,
    exchange_name: str = "binance",
    api_key:       str = "",
    secret:        str = "",
) -> dict:
    """
    Busca dados OHLCV (candles) reais.
    Retorna: opens, highs, lows, closes, volumes, timestamps
    """
    cache_key = f"ohlcv_{exchange_name}_{symbol}_{timeframe}_{limit}"
    cached = _cache_get(cache_key)
    if cached:
        logger.info(f"Cache hit: {cache_key}")
        return cached

    try:
        exchange = get_exchange(exchange_name, api_key, secret)
        raw = exchange.fetch_ohlcv(symbol, timeframe, limit=limit)

        result = {
            "symbol":     symbol,
            "timeframe":  timeframe,
            "exchange":   exchange_name,
            "timestamps": [r[0] for r in raw],
            "opens":      [r[1] for r in raw],
            "highs":      [r[2] for r in raw],
            "lows":       [r[3] for r in raw],
            "closes":     [r[4] for r in raw],
            "volumes":    [r[5] for r in raw],
            "count":      len(raw),
        }

        _cache_set(cache_key, result)
        logger.info(f"OHLCV {symbol} {timeframe}: {len(raw)} candles")
        return result

    except ccxt.NetworkError as e:
        raise ConnectionError(f"Erro de rede ao buscar {symbol}: {e}")
    except ccxt.ExchangeError as e:
        raise ValueError(f"Erro da exchange ao buscar {symbol}: {e}")


def get_ticker(
    symbol:        str = "BTC/USDT",
    exchange_name: str = "binance",
) -> dict:
    """Preço atual, bid, ask, volume 24h"""
    cache_key = f"ticker_{exchange_name}_{symbol}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    try:
        exchange = get_exchange(exchange_name)
        t = exchange.fetch_ticker(symbol)

        result = {
            "symbol":       symbol,
            "price":        t["last"],
            "bid":          t["bid"],
            "ask":          t["ask"],
            "high_24h":     t["high"],
            "low_24h":      t["low"],
            "volume_24h":   t["baseVolume"],
            "change_24h":   t["percentage"],
            "timestamp":    t["timestamp"],
        }

        _cache_set(cache_key, result)
        return result

    except Exception as e:
        raise ValueError(f"Erro ao buscar ticker {symbol}: {e}")


def get_order_book(
    symbol:        str = "BTC/USDT",
    limit:         int = 20,
    exchange_name: str = "binance",
) -> dict:
    """
    Order book: bids e asks
    Analisa pressão compradora vs vendedora
    """
    try:
        exchange = get_exchange(exchange_name)
        ob = exchange.fetch_order_book(symbol, limit)

        bids      = ob["bids"][:limit]
        asks      = ob["asks"][:limit]
        bid_vol   = sum(b[1] for b in bids)
        ask_vol   = sum(a[1] for a in asks)
        total_vol = bid_vol + ask_vol

        # Pressão: >0.5 = mais compradores, <0.5 = mais vendedores
        buy_pressure = bid_vol / total_vol if total_vol > 0 else 0.5

        # Spread
        best_bid = bids[0][0] if bids else 0
        best_ask = asks[0][0] if asks else 0
        spread   = ((best_ask - best_bid) / best_bid * 100) if best_bid > 0 else 0

        return {
            "symbol":       symbol,
            "buy_pressure": round(buy_pressure, 4),
            "sell_pressure": round(1 - buy_pressure, 4),
            "spread_pct":   round(spread, 4),
            "bid_volume":   round(bid_vol, 4),
            "ask_volume":   round(ask_vol, 4),
            "best_bid":     best_bid,
            "best_ask":     best_ask,
            "bids":         bids[:5],
            "asks":         asks[:5],
        }

    except Exception as e:
        raise ValueError(f"Erro ao buscar order book {symbol}: {e}")


def get_multiple_tickers(
    symbols:       list[str],
    exchange_name: str = "binance",
) -> list[dict]:
    """Busca preços de múltiplos ativos de uma vez"""
    results = []
    for symbol in symbols:
        try:
            results.append(get_ticker(symbol, exchange_name))
            time.sleep(0.1)  # respeitar rate limit
        except Exception as e:
            logger.warning(f"Erro ao buscar {symbol}: {e}")
            results.append({"symbol": symbol, "error": str(e)})
    return results
