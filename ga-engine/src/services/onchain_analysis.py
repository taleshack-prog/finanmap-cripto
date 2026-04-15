"""
FinanMap Cripto - Análise On-Chain
Fontes gratuitas: Blockchain.com, Mempool.space, Etherscan
Métricas: hash rate, mempool, exchange flows proxy, whale txs, ETH gas
"""

import httpx
import asyncio
import logging
import time
import numpy as np
from typing import Optional

logger = logging.getLogger(__name__)

# Cache simples para não sobrecarregar as APIs gratuitas
_cache: dict = {}
CACHE_TTL = 300  # 5 minutos


def _cache_get(key: str):
    entry = _cache.get(key)
    if entry and time.time() - entry["ts"] < CACHE_TTL:
        return entry["data"]
    return None


def _cache_set(key: str, data):
    _cache[key] = {"ts": time.time(), "data": data}


# ─── BLOCKCHAIN.COM — BTC ON-CHAIN ──────────────────────────

async def get_btc_stats() -> dict:
    """
    Estatísticas on-chain do Bitcoin via Blockchain.com API.
    Hash rate, dificuldade, transações, volume on-chain.
    """
    cached = _cache_get("btc_stats")
    if cached:
        return cached

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get("https://api.blockchain.info/stats")
            r.raise_for_status()
            data = r.json()

        result = {
            "hash_rate_th":        round(data.get("hash_rate", 0) / 1e12, 2),
            "difficulty":          data.get("difficulty", 0),
            "total_fees_btc":      round(data.get("total_fees_btc", 0) / 1e8, 4),
            "n_tx":                data.get("n_tx", 0),
            "total_btc_sent":      round(data.get("total_btc_sent", 0) / 1e8, 2),
            "estimated_btc_sent":  round(data.get("estimated_btc_sent", 0) / 1e8, 2),
            "miners_revenue_btc":  round(data.get("miners_revenue_btc", 0) / 1e8, 4),
            "market_price_usd":    data.get("market_price_usd", 0),
            "trade_volume_usd":    data.get("trade_volume_usd", 0),
            "timestamp":           int(time.time()),
            "source":              "blockchain.com",
        }

        _cache_set("btc_stats", result)
        logger.info(f"BTC on-chain: hash_rate={result['hash_rate_th']}TH/s txs={result['n_tx']}")
        return result

    except Exception as e:
        logger.warning(f"Erro blockchain.com stats: {e}")
        return {"error": str(e), "source": "blockchain.com"}


async def get_btc_mempool_blockchain() -> dict:
    """
    Mempool BTC via Blockchain.com — transações pendentes e fees.
    """
    cached = _cache_get("btc_mempool_bc")
    if cached:
        return cached

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get("https://api.blockchain.info/mempool/fees")
            r.raise_for_status()
            data = r.json()

        result = {
            "fee_min":    data.get("minimum", 0),
            "fee_low":    data.get("low_priority", 0),
            "fee_medium": data.get("regular", 0),
            "fee_high":   data.get("priority", 0),
            "source":     "blockchain.com",
            "timestamp":  int(time.time()),
        }

        _cache_set("btc_mempool_bc", result)
        return result

    except Exception as e:
        logger.warning(f"Erro blockchain.com mempool: {e}")
        return {"error": str(e), "source": "blockchain.com"}


async def get_btc_chart(chart_name: str, timespan: str = "30days") -> dict:
    """
    Dados históricos de métricas on-chain BTC via Blockchain.com.
    chart_name: 'hash-rate', 'n-transactions', 'estimated-transaction-volume-usd',
                'miners-revenue', 'transaction-fees-usd', 'mempool-size'
    """
    cache_key = f"btc_chart_{chart_name}_{timespan}"
    cached    = _cache_get(cache_key)
    if cached:
        return cached

    try:
        url = f"https://api.blockchain.info/charts/{chart_name}?timespan={timespan}&format=json&sampled=true"
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()

        values = [v["y"] for v in data.get("values", [])]
        result = {
            "chart":     chart_name,
            "timespan":  timespan,
            "values":    values,
            "latest":    values[-1] if values else None,
            "avg":       round(float(np.mean(values)), 4) if values else None,
            "trend":     "alta" if len(values) > 1 and values[-1] > values[-7] else "baixa",
            "source":    "blockchain.com",
            "timestamp": int(time.time()),
        }

        _cache_set(cache_key, result)
        return result

    except Exception as e:
        logger.warning(f"Erro blockchain.com chart {chart_name}: {e}")
        return {"error": str(e), "chart": chart_name}


# ─── MEMPOOL.SPACE — BTC MEMPOOL ────────────────────────────

async def get_mempool_stats() -> dict:
    """
    Estatísticas do mempool BTC via mempool.space.
    Congestionamento, fees recomendadas, tamanho da mempool.
    """
    cached = _cache_get("mempool_stats")
    if cached:
        return cached

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # Fees recomendadas
            fees_r  = await client.get("https://mempool.space/api/v1/fees/recommended")
            fees_r.raise_for_status()
            fees    = fees_r.json()

            # Stats gerais da mempool
            stats_r = await client.get("https://mempool.space/api/mempool")
            stats_r.raise_for_status()
            stats   = stats_r.json()

        vsize    = stats.get("vsize", 0)
        congestion = (
            "critica"   if vsize > 50_000_000 else
            "alta"      if vsize > 20_000_000 else
            "moderada"  if vsize > 5_000_000  else
            "baixa"
        )

        result = {
            "fee_fastest":    fees.get("fastestFee", 0),
            "fee_30min":      fees.get("halfHourFee", 0),
            "fee_1h":         fees.get("hourFee", 0),
            "fee_economy":    fees.get("economyFee", 0),
            "fee_minimum":    fees.get("minimumFee", 0),
            "mempool_count":  stats.get("count", 0),
            "mempool_vsize":  vsize,
            "mempool_fee":    stats.get("total_fee", 0),
            "congestion":     congestion,
            "source":         "mempool.space",
            "timestamp":      int(time.time()),
        }

        _cache_set("mempool_stats", result)
        logger.info(f"Mempool: congestion={congestion} fee_fastest={fees.get('fastestFee')} sat/vB")
        return result

    except Exception as e:
        logger.warning(f"Erro mempool.space: {e}")
        return {"error": str(e), "source": "mempool.space"}


async def get_mempool_blocks() -> dict:
    """
    Próximos blocos estimados da mempool — indica urgência de transações.
    """
    cached = _cache_get("mempool_blocks")
    if cached:
        return cached

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get("https://mempool.space/api/v1/fees/mempool-blocks")
            r.raise_for_status()
            blocks = r.json()

        result = {
            "next_blocks": len(blocks),
            "blocks": [
                {
                    "tx_count":   b.get("nTx", 0),
                    "median_fee": b.get("medianFee", 0),
                    "fee_range":  b.get("feeRange", []),
                }
                for b in blocks[:3]
            ],
            "source":    "mempool.space",
            "timestamp": int(time.time()),
        }

        _cache_set("mempool_blocks", result)
        return result

    except Exception as e:
        logger.warning(f"Erro mempool blocks: {e}")
        return {"error": str(e)}


# ─── ETHERSCAN — ETH ON-CHAIN ───────────────────────────────

async def get_eth_stats(api_key: str = "") -> dict:
    """
    Estatísticas on-chain ETH via Etherscan.
    Gas price, total supply, last price, market cap.
    API key gratuita em etherscan.io/apis
    """
    cached = _cache_get("eth_stats")
    if cached:
        return cached

    try:
        # Gas price (não precisa de API key)
        async with httpx.AsyncClient(timeout=10) as client:
            gas_r = await client.get("https://api.etherscan.io/api?module=gastracker&action=gasoracle")
            gas_r.raise_for_status()
            gas_data = gas_r.json()

        gas = gas_data.get("result", {})
        result = {
            "gas_safe":     gas.get("SafeGasPrice", "0"),
            "gas_propose":  gas.get("ProposeGasPrice", "0"),
            "gas_fast":     gas.get("FastGasPrice", "0"),
            "gas_base_fee": gas.get("suggestBaseFee", "0"),
            "gas_urgency": (
                "alto"    if int(gas.get("FastGasPrice", 0)) > 50  else
                "moderado" if int(gas.get("FastGasPrice", 0)) > 20 else
                "baixo"
            ),
            "source":    "etherscan.io",
            "timestamp": int(time.time()),
        }

        _cache_set("eth_stats", result)
        logger.info(f"ETH gas: safe={result['gas_safe']} propose={result['gas_propose']} fast={result['gas_fast']} Gwei")
        return result

    except Exception as e:
        logger.warning(f"Erro etherscan: {e}")
        return {"error": str(e), "source": "etherscan.io"}


# ─── SCORE ON-CHAIN CONSOLIDADO ─────────────────────────────

async def onchain_score(symbol: str = "BTC") -> dict:
    """
    Score on-chain consolidado para uso no robô.
    Retorna score de -1 (bearish) a +1 (bullish) com breakdown.
    """
    scores    = {}
    breakdown = {}

    if symbol in ["BTC", "BTC/USDT"]:
        # Busca dados em paralelo
        btc_stats, mempool = await asyncio.gather(
            get_btc_stats(),
            get_mempool_stats(),
            return_exceptions=True
        )

        # Hash rate — alto e crescendo = bullish (mineradores confiantes)
        if isinstance(btc_stats, dict) and "hash_rate_th" in btc_stats:
            hr = btc_stats["hash_rate_th"]
            # Hash rate histórico médio ~500 TH/s em 2024
            hr_score = float(np.tanh((hr - 600) / 200))
            scores["hash_rate"] = hr_score
            breakdown["hash_rate"] = {
                "value": hr,
                "unit":  "TH/s",
                "score": round(hr_score, 4),
                "signal": "bullish" if hr_score > 0.2 else "bearish" if hr_score < -0.2 else "neutro",
            }

        # Mempool — alta congestion = urgência = bullish (muita atividade)
        # Mas muito alta = rede sobrecarregada = neutro/negativo
        if isinstance(mempool, dict) and "congestion" in mempool:
            cong_map = {"baixa": -0.1, "moderada": 0.1, "alta": 0.3, "critica": 0.1}
            cong_score = cong_map.get(mempool["congestion"], 0.0)
            scores["mempool"] = cong_score
            breakdown["mempool"] = {
                "congestion": mempool["congestion"],
                "fee_fastest": mempool.get("fee_fastest"),
                "score":      round(cong_score, 4),
                "signal":     "ativo" if cong_score > 0 else "inativo",
            }

        # Volume on-chain — alto = mais transações = bullish
        if isinstance(btc_stats, dict) and "estimated_btc_sent" in btc_stats:
            vol  = btc_stats["estimated_btc_sent"]
            # Volume típico ~300k BTC/dia
            vol_score = float(np.tanh((vol - 300000) / 100000))
            scores["onchain_volume"] = vol_score
            breakdown["onchain_volume"] = {
                "value": vol,
                "unit":  "BTC/dia",
                "score": round(vol_score, 4),
                "signal": "alto" if vol_score > 0.2 else "baixo" if vol_score < -0.2 else "normal",
            }

        # Miners revenue — alta = mineradores lucrando = bullish
        if isinstance(btc_stats, dict) and "miners_revenue_btc" in btc_stats:
            rev = btc_stats["miners_revenue_btc"]
            rev_score = float(np.tanh((rev - 30) / 20))
            scores["miners_revenue"] = rev_score
            breakdown["miners_revenue"] = {
                "value": rev,
                "unit":  "BTC",
                "score": round(rev_score, 4),
                "signal": "bullish" if rev_score > 0.2 else "bearish" if rev_score < -0.2 else "neutro",
            }

    elif symbol in ["ETH", "ETH/USDT"]:
        eth_stats = await get_eth_stats()
        if "gas_fast" in eth_stats:
            gas_fast  = int(eth_stats.get("gas_fast", 0))
            # Gas alto = rede ativa = bullish para ETH
            gas_score = float(np.tanh((gas_fast - 20) / 30))
            scores["gas_price"] = gas_score
            breakdown["gas_price"] = {
                "value":  gas_fast,
                "unit":   "Gwei",
                "score":  round(gas_score, 4),
                "signal": eth_stats.get("gas_urgency", "moderado"),
            }

    # Score final ponderado
    if scores:
        weights = {
            "hash_rate":      0.30,
            "mempool":        0.20,
            "onchain_volume": 0.30,
            "miners_revenue": 0.20,
            "gas_price":      1.00,  # ETH: só gas
        }
        total_w = sum(weights.get(k, 0.25) for k in scores)
        final   = sum(v * weights.get(k, 0.25) for k, v in scores.items()) / total_w
        final   = float(np.clip(final, -1.0, 1.0))
    else:
        final = 0.0

    confidence = min(abs(final) * 2, 1.0)

    return {
        "symbol":     symbol,
        "score":      round(final, 4),
        "confidence": round(confidence, 4),
        "direction":  "BUY" if final > 0.1 else "SELL" if final < -0.1 else "HOLD",
        "breakdown":  breakdown,
        "timestamp":  int(time.time()),
    }
