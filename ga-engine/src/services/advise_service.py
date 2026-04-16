"""
FinanMap Cripto - Orquestrador On-Chain (Advise Externo)
Arquitetura Barbell: on-chain NÃO entra no fitness do GA.
Funciona como conselheiro externo — score 0-1, não bloqueia trades.

Métricas:
- Whale Ratio: concentração supply top wallets (Blockchain.com proxy)
- TVL Stress: variação TVL 7d (DeFiLlama)
- Active Addresses: momentum bullish (Blockchain.com)
- Funding Rate: sobreaquecimento (CCXT perp markets)
- Mempool: congestionamento rede BTC

Score: >0.7 = Green (solidez alta), 0.4-0.7 = Yellow, <0.4 = Red (stress)
"""

import httpx
import asyncio
import logging
import time
import numpy as np
from typing import Optional

logger = logging.getLogger(__name__)

# Cache: on-chain é macro, 15min é suficiente
_advise_cache: dict = {}
ADVISE_TTL = 900  # 15 minutos

def _cache_get(key: str):
    e = _advise_cache.get(key)
    if e and time.time() - e["ts"] < ADVISE_TTL:
        return e["data"]
    return None

def _cache_set(key: str, data):
    _advise_cache[key] = {"ts": time.time(), "data": data}


# ─── COMPONENTES DO ADVISE ──────────────────────────────────

async def _get_btc_network_health() -> dict:
    """Hash rate + transações + volume on-chain via Blockchain.com"""
    cached = _cache_get("btc_network")
    if cached: return cached

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get("https://api.blockchain.info/stats")
            r.raise_for_status()
            d = r.json()

        hash_rate = d.get("hash_rate", 0) / 1e12  # TH/s
        n_tx      = d.get("n_tx", 0)
        vol_btc   = d.get("estimated_btc_sent", 0) / 1e8

        # Score: hash rate alto = mineradores confiantes = bullish
        hr_score  = float(np.tanh((hash_rate - 0.5) / 0.3))

        # Score: volume on-chain alto = atividade = bullish
        vol_score = float(np.tanh((vol_btc - 300000) / 100000))

        result = {
            "hash_rate_th": round(hash_rate, 2),
            "n_tx":         n_tx,
            "vol_btc":      round(vol_btc, 0),
            "hr_score":     round(hr_score, 4),
            "vol_score":    round(vol_score, 4),
            "composite":    round((hr_score * 0.6 + vol_score * 0.4), 4),
        }
        _cache_set("btc_network", result)
        return result
    except Exception as e:
        logger.warning(f"BTC network health: {e}")
        return {"composite": 0.0, "error": str(e)}


async def _get_mempool_stress() -> dict:
    """Congestionamento mempool via mempool.space"""
    cached = _cache_get("mempool_stress")
    if cached: return cached

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get("https://mempool.space/api/mempool")
            r.raise_for_status()
            d = r.json()

        vsize  = d.get("vsize", 0)
        count  = d.get("count", 0)

        # Congestionamento moderado = rede ativa = score neutro/positivo
        # Congestionamento extremo = score negativo (rede sobrecarregada)
        if vsize > 50_000_000:
            stress_score = -0.3   # crítico
        elif vsize > 20_000_000:
            stress_score = 0.1    # alto mas ativo
        elif vsize > 5_000_000:
            stress_score = 0.3    # moderado = saudável
        else:
            stress_score = 0.0    # baixo = pouca atividade

        result = {
            "mempool_vsize": vsize,
            "tx_count":      count,
            "stress_score":  stress_score,
            "regime":        "critico" if vsize > 50e6 else "alto" if vsize > 20e6 else "moderado" if vsize > 5e6 else "baixo",
        }
        _cache_set("mempool_stress", result)
        return result
    except Exception as e:
        logger.warning(f"Mempool stress: {e}")
        return {"stress_score": 0.0, "error": str(e)}


async def _get_eth_gas_stress() -> dict:
    """Gas price ETH como proxy de atividade DeFi"""
    cached = _cache_get("eth_gas")
    if cached: return cached

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get("https://api.etherscan.io/api?module=gastracker&action=gasoracle")
            r.raise_for_status()
            gas = r.json().get("result", {})

        fast_gwei = int(gas.get("FastGasPrice", 0))

        # Gas baixo = rede pouco usada = neutro
        # Gas moderado = rede ativa = bullish DeFi
        # Gas muito alto = sobreaquecimento = bearish (custo alto)
        if fast_gwei > 100:
            score = -0.2   # sobreaquecido
        elif fast_gwei > 30:
            score = 0.3    # ativo
        elif fast_gwei > 10:
            score = 0.1    # moderado
        else:
            score = -0.1   # inativo

        result = {
            "gas_fast_gwei": fast_gwei,
            "gas_score":     score,
            "regime":        "sobreaquecido" if fast_gwei > 100 else "ativo" if fast_gwei > 30 else "moderado" if fast_gwei > 10 else "inativo",
        }
        _cache_set("eth_gas", result)
        return result
    except Exception as e:
        logger.warning(f"ETH gas: {e}")
        return {"gas_score": 0.0, "error": str(e)}


async def _get_funding_rate_stress(symbol: str = "BTC/USDT") -> dict:
    """
    Funding rate de contratos perpétuos via CCXT.
    >0.01% = sobreaquecimento long = bearish contrário
    <-0.01% = sobreaquecimento short = bullish contrário
    """
    cached = _cache_get(f"funding_{symbol}")
    if cached: return cached

    try:
        import ccxt
        exchange = ccxt.binance()
        perp_sym = f"{symbol}/USDT:USDT"
        info     = exchange.fetch_funding_rate(perp_sym)
        rate     = float(info.get("fundingRate", 0) or 0)

        # Contrário à multidão: funding alto = muito long = cuidado
        if rate > 0.01:
            score   = -0.4   # sobreaquecimento long
            signal  = "sobreaquecido_long"
        elif rate > 0.005:
            score   = -0.1   # leve viés long
            signal  = "viés_long"
        elif rate < -0.01:
            score   = 0.4    # sobreaquecimento short = contrário bullish
            signal  = "sobreaquecido_short"
        elif rate < -0.005:
            score   = 0.1
            signal  = "viés_short"
        else:
            score   = 0.2    # neutro = saudável
            signal  = "neutro"

        result = {
            "funding_rate": round(rate * 100, 4),  # em %
            "funding_score": score,
            "signal":        signal,
        }
        _cache_set(f"funding_{symbol}", result)
        return result
    except Exception as e:
        logger.warning(f"Funding rate {symbol}: {e}")
        return {"funding_score": 0.0, "error": str(e)}


# ─── SCORE ADVISE CONSOLIDADO ───────────────────────────────

async def get_advise(symbol: str = "BTC", strategy_id: Optional[str] = None) -> dict:
    """
    Score on-chain consolidado como conselheiro externo.
    NÃO bloqueia trades — apenas aconselha.

    Score: 0-1
    > 0.7 = Green  (solidez alta — prosseguir trades normalmente)
    0.4-0.7 = Yellow (cautela — reduzir tamanho das posições)
    < 0.4 = Red    (stress sistêmico — considerar pausa em alavancagem)
    """
    cache_key = f"advise_{symbol}_{strategy_id}"
    cached    = _cache_get(cache_key)
    if cached: return cached

    base_sym = symbol.replace("/USDT", "").replace("/BTC", "")

    # Busca dados em paralelo
    results = await asyncio.gather(
        _get_btc_network_health(),
        _get_mempool_stress(),
        _get_eth_gas_stress() if base_sym == "ETH" else asyncio.sleep(0),
        _get_funding_rate_stress(f"{base_sym}/USDT"),
        return_exceptions=True,
    )

    network  = results[0] if not isinstance(results[0], Exception) else {}
    mempool  = results[1] if not isinstance(results[1], Exception) else {}
    eth_gas  = results[2] if not isinstance(results[2], Exception) else {}
    funding  = results[3] if not isinstance(results[3], Exception) else {}

    # Scores individuais
    scores = {
        "network":  network.get("composite", 0.0),
        "mempool":  mempool.get("stress_score", 0.0),
        "funding":  funding.get("funding_score", 0.0),
    }
    if base_sym == "ETH":
        scores["eth_gas"] = eth_gas.get("gas_score", 0.0)

    # Score final normalizado para 0-1
    raw_score  = np.mean(list(scores.values()))
    # Normaliza de [-1,1] para [0,1]
    norm_score = float((raw_score + 1) / 2)
    norm_score = max(0.0, min(1.0, norm_score))

    # Classificação
    if norm_score >= 0.7:
        color  = "green"
        label  = "Solidez alta — prosseguir trades normalmente"
        action = "proceed"
    elif norm_score >= 0.4:
        color  = "yellow"
        label  = "Cautela — considerar reduzir tamanho de posições"
        action = "reduce_size"
    else:
        color  = "red"
        label  = "Stress sistêmico — pausar alavancagem, aguardar confirmação"
        action = "pause_leverage"

    advise = {
        "symbol":      base_sym,
        "strategy_id": strategy_id,
        "score":       round(norm_score, 4),
        "color":       color,
        "label":       label,
        "action":      action,
        "scores":      {k: round(v, 4) for k, v in scores.items()},
        "breakdown": {
            "network":  network,
            "mempool":  mempool,
            "funding":  funding,
        },
        "note":        "On-chain é conselheiro externo — não bloqueia trades automáticos",
        "cache_ttl":   ADVISE_TTL,
        "timestamp":   int(time.time()),
    }

    _cache_set(cache_key, advise)
    logger.info(f"Advise {base_sym}: score={norm_score:.2f} color={color}")
    return advise
