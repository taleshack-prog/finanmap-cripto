"""
FinanMap Cripto - CVD Real (Cumulative Volume Delta)
Usa fetch_trades da Binance para calcular fluxo real de compra/venda.

CVD crescente = compradores agressivos dominando = bullish
CVD caindo    = vendedores agressivos dominando = bearish

Diferença do volume delta estimado:
- Volume delta estimado: usa posição do close no range do candle (proxy)
- CVD real: classifica cada trade como taker buy ou taker sell
  (taker buy = alguém comprou agressivamente ao preço do ask)
  (taker sell = alguém vendeu agressivamente ao preço do bid)

Especialmente útil para ETH e SOL que têm movimentos bruscos
causados por liquidações e ordens agressivas de grandes players.
"""

import ccxt
import time
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Cache para evitar requisições repetidas
_cvd_cache: dict = {}
CVD_TTL = 120  # 2 minutos — janela CVD é 5min, não precisa atualizar a cada tick


def _cache_get(key: str):
    e = _cvd_cache.get(key)
    if e and time.time() - e["ts"] < CVD_TTL:
        return e["data"]
    return None


def _cache_set(key: str, data):
    _cvd_cache[key] = {"ts": time.time(), "data": data}


def get_cvd_real(
    symbol:     str,
    exchange_name: str = "binance",
    api_key:    str = "",
    secret:     str = "",
    limit:      int = 500,   # últimos N trades
    window_min: int = 5,     # janela em minutos
) -> dict:
    """
    CVD Real via fetch_trades.
    Retorna CVD dos últimos `window_min` minutos.

    Retorna:
    - cvd: delta acumulado (positivo = mais compradores)
    - cvd_pct: CVD como % do volume total
    - buy_volume: volume total de compras agressivas
    - sell_volume: volume total de vendas agressivas
    - score: -1 a +1 normalizado
    - signal: bullish/bearish/neutro
    - trades_count: número de trades analisados
    """
    cache_key = f"cvd_{symbol}_{exchange_name}_{window_min}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    try:
        # Inicializa exchange
        exchange_class = getattr(ccxt, exchange_name)
        params = {"enableRateLimit": True}
        if api_key:
            params["apiKey"] = api_key
            params["secret"] = secret
        exchange = exchange_class(params)

        # Busca trades recentes
        since = int((time.time() - window_min * 60) * 1000)  # ms
        trades = exchange.fetch_trades(symbol, since=since, limit=limit)

        if not trades:
            return _cvd_empty()

        # Classifica cada trade
        buy_volume  = 0.0
        sell_volume = 0.0

        for trade in trades:
            vol = float(trade.get("amount", 0) or 0)
            # taker_side: "buy" = comprador foi o taker (compra agressiva)
            #             "sell" = vendedor foi o taker (venda agressiva)
            side = trade.get("takerOrMaker") or trade.get("side") or ""

            # Alguns exchanges retornam "side" como buy/sell do taker
            if trade.get("side") == "buy":
                buy_volume  += vol
            elif trade.get("side") == "sell":
                sell_volume += vol
            else:
                # Fallback: estima pelo preço vs preço anterior
                buy_volume += vol * 0.5
                sell_volume += vol * 0.5

        total_volume = buy_volume + sell_volume
        cvd = buy_volume - sell_volume
        cvd_pct = (cvd / total_volume * 100) if total_volume > 0 else 0.0

        # Score normalizado -1 a +1
        score = cvd / total_volume if total_volume > 0 else 0.0
        score = max(-1.0, min(1.0, score * 2))  # amplifica para [-1, 1]

        # Sinal
        if score > 0.3:
            signal = "bullish"
        elif score < -0.3:
            signal = "bearish"
        else:
            signal = "neutro"

        result = {
            "cvd":          round(cvd, 4),
            "cvd_pct":      round(cvd_pct, 2),
            "buy_volume":   round(buy_volume, 4),
            "sell_volume":  round(sell_volume, 4),
            "total_volume": round(total_volume, 4),
            "score":        round(score, 4),
            "signal":       signal,
            "trades_count": len(trades),
            "window_min":   window_min,
            "symbol":       symbol,
        }

        _cache_set(cache_key, result)
        logger.info(
            f"CVD {symbol} | {len(trades)} trades | "
            f"buy={buy_volume:.2f} sell={sell_volume:.2f} | "
            f"score={score:+.3f} ({signal})"
        )
        return result

    except Exception as e:
        logger.warning(f"CVD erro {symbol}: {e}")
        return _cvd_empty(error=str(e))


def _cvd_empty(error: str = "") -> dict:
    return {
        "cvd":          0.0,
        "cvd_pct":      0.0,
        "buy_volume":   0.0,
        "sell_volume":  0.0,
        "total_volume": 0.0,
        "score":        0.0,
        "signal":       "neutro",
        "trades_count": 0,
        "window_min":   5,
        "error":        error,
    }
