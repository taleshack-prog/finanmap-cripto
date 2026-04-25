"""
FinanMap Cripto - Market Scan Service
Analisa todos os pares USDT da Binance e recomenda os melhores para o GA evoluir.

Critérios de seleção:
- Volume mínimo $5M/dia (liquidez suficiente)
- Volatilidade moderada (não muito alta, não muito baixa)
- Momentum positivo (tendência de alta)
- Sharpe histórico (retorno ajustado ao risco)

Roda em background a cada 4h — não bloqueia os bots.
"""
import ccxt
import numpy as np
import logging
import time
import httpx
import os
import asyncio
from typing import Optional

logger = logging.getLogger(__name__)

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:3020")

# Filtros mínimos
MIN_VOLUME_USDT = 5_000_000   # $5M volume diário mínimo
MIN_PRICE_USDT  = 0.001        # preço mínimo $0.001
MAX_PAIRS       = 50           # analisa top 50 por volume

# Stablecoins e tokens a ignorar
IGNORE_SYMBOLS = {
    'USDT', 'BUSD', 'USDC', 'TUSD', 'FDUSD', 'DAI', 'USDP',
    'WBTC', 'WETH', 'STETH', 'BETH', 'WBETH',
}


def _calculate_sharpe(returns: list) -> float:
    """Sharpe ratio simples."""
    if len(returns) < 5:
        return 0.0
    arr = np.array(returns)
    mean = float(np.mean(arr))
    std  = float(np.std(arr, ddof=1))
    if std < 1e-9:
        return 0.0
    return float(mean / std * np.sqrt(252))


def _calculate_momentum(closes: list) -> float:
    """Momentum: retorno dos últimos 7 dias normalizado."""
    if len(closes) < 8:
        return 0.0
    ret = (closes[-1] - closes[-8]) / closes[-8]
    return float(np.clip(ret, -1.0, 1.0))


def _calculate_volatility(closes: list) -> float:
    """Volatilidade histórica 7 dias."""
    if len(closes) < 3:
        return 0.0
    arr   = np.array(closes)
    rets  = np.diff(arr) / arr[:-1]
    return float(np.std(rets, ddof=1) * np.sqrt(252) * 100)


def _overall_score(
    sharpe:      float,
    volatility:  float,
    momentum:    float,
    volume:      float,
    change_24h:  float,
) -> float:
    """
    Score geral para ranking de pares.
    Quanto maior, melhor candidato para o GA evoluir.
    """
    # Normaliza volume (log scale)
    vol_score = min(np.log10(max(volume, 1)) / 8, 1.0)  # log10(5M)=6.7, log10(100M)=8

    # Volatilidade ideal: 20-80% anualizada
    if volatility < 10:
        vol_penalty = 0.3   # muito estável — pouco lucro
    elif volatility > 150:
        vol_penalty = 0.3   # muito volátil — risco alto
    else:
        vol_penalty = 1.0   # ideal

    # Momentum positivo é bom
    mom_score = max(0, momentum + 0.1) * 5  # normaliza

    # Score final
    score = (
        0.35 * max(sharpe, 0) +
        0.25 * vol_score +
        0.20 * vol_penalty +
        0.15 * mom_score +
        0.05 * max(change_24h / 10, 0)
    )
    return round(float(np.clip(score, 0, 10)), 4)


async def scan_market(
    api_key: str,
    secret:  str,
    exchange_name: str = "binance",
) -> list:
    """
    Escaneia mercado e retorna top pares rankeados.
    Roda em thread separada para não bloquear event loop.
    """
    def _scan():
        try:
            exchange = ccxt.binance({
                "apiKey":          api_key,
                "secret":          secret,
                "enableRateLimit": True,
                "timeout":         15000,
                "options":         {"defaultType": "spot"},
            })

            logger.info("MarketScan: buscando tickers...")
            t = time.time()
            tickers = exchange.fetch_tickers()
            logger.info(f"MarketScan: {len(tickers)} tickers em {time.time()-t:.1f}s")

            # Filtra pares USDT com volume mínimo
            candidates = []
            for symbol, ticker in tickers.items():
                if not symbol.endswith('/USDT'):
                    continue
                base = symbol.replace('/USDT', '')
                if base in IGNORE_SYMBOLS:
                    continue
                volume = float(ticker.get('quoteVolume') or 0)
                price  = float(ticker.get('last') or 0)
                if volume < MIN_VOLUME_USDT or price < MIN_PRICE_USDT:
                    continue
                candidates.append((symbol, ticker, volume))

            # Ordena por volume e pega top N
            candidates.sort(key=lambda x: x[2], reverse=True)
            candidates = candidates[:MAX_PAIRS]
            logger.info(f"MarketScan: {len(candidates)} candidatos após filtro")

            results = []
            for symbol, ticker, volume in candidates:
                try:
                    # Busca candles históricos (7 dias, 1h)
                    ohlcv = exchange.fetch_ohlcv(symbol, '1h', limit=168)
                    if len(ohlcv) < 24:
                        continue

                    closes  = [c[4] for c in ohlcv]
                    returns = [
                        (closes[i] - closes[i-1]) / closes[i-1]
                        for i in range(1, len(closes))
                    ]

                    sharpe     = _calculate_sharpe(returns)
                    volatility = _calculate_volatility(closes)
                    momentum   = _calculate_momentum(closes)
                    change_24h = float(ticker.get('percentage') or 0)
                    price      = float(ticker.get('last') or 0)

                    score = _overall_score(sharpe, volatility, momentum, volume, change_24h)

                    results.append({
                        "symbol":          symbol,
                        "exchange":        exchange_name,
                        "volume_24h":      round(volume, 2),
                        "price_usdt":      round(price, 8),
                        "change_24h":      round(change_24h, 4),
                        "sharpe_7d":       round(sharpe, 4),
                        "volatility_7d":   round(volatility, 4),
                        "momentum_score":  round(momentum, 4),
                        "liquidity_score": round(min(volume / MIN_VOLUME_USDT, 10), 4),
                        "overall_score":   score,
                        "recomendado":     score >= 1.0 and sharpe > 0.5,
                    })

                    logger.info(
                        f"  {symbol}: score={score:.2f} sharpe={sharpe:.2f} "
                        f"vol={volatility:.1f}% mom={momentum:+.3f}"
                    )

                except Exception as e:
                    logger.warning(f"MarketScan {symbol}: {e}")
                    continue

            # Ordena por score
            results.sort(key=lambda x: x['overall_score'], reverse=True)
            return results

        except Exception as e:
            logger.error(f"MarketScan erro: {e}")
            return []

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _scan)


async def save_market_scan(results: list) -> bool:
    """Salva resultados do scan no banco via backend."""
    if not results:
        return False
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                f"{BACKEND_URL}/api/market/scan",
                json={"results": results}
            )
            if r.status_code == 200:
                logger.info(f"MarketScan: {len(results)} pares salvos no banco")
                return True
            else:
                logger.warning(f"MarketScan save falhou: {r.status_code}")
                return False
    except Exception as e:
        logger.error(f"MarketScan save erro: {e}")
        return False


async def run_market_scan(api_key: str, secret: str):
    """Executa scan completo e salva no banco."""
    logger.info("🔍 MarketScan iniciado...")
    t = time.time()
    results = await scan_market(api_key, secret)
    if results:
        await save_market_scan(results)
        top5 = results[:5]
        logger.info(f"🔍 MarketScan concluído em {time.time()-t:.0f}s | Top 5:")
        for r in top5:
            logger.info(
                f"  {r['symbol']}: score={r['overall_score']:.2f} "
                f"{'✅ RECOMENDADO' if r['recomendado'] else ''}"
            )
    return results
