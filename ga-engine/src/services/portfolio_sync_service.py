"""
FinanMap Cripto - Portfolio Sync Service
Sincroniza saldo real da Binance com o banco de dados.
Dashboard e Portfólio leem do banco — sem chamar Binance diretamente.
"""
import httpx
import logging
import os
import time

logger = logging.getLogger(__name__)

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:3020")

# Cache para evitar sync muito frequente
_last_sync: dict = {}
SYNC_INTERVAL = 300  # 5 minutos entre syncs


async def sync_portfolio_to_db(
    user_id:    str,
    api_key:    str,
    secret:     str,
    exchange:   str = "binance",
) -> bool:
    """
    Sincroniza saldo real da Binance com a tabela Portfolio do banco.
    Roda em background — não bloqueia os bots.
    Retorna True se sincronizou, False se usou cache.
    """
    cache_key = f"{user_id}_{exchange}"
    last = _last_sync.get(cache_key, 0)
    if time.time() - last < SYNC_INTERVAL:
        return False  # Muito cedo para sincronizar

    try:
        from src.services.portfolio_service import get_binance_balances_fast
        assets = get_binance_balances_fast(api_key, secret)

        if not assets:
            return False

        # Envia para o backend salvar no banco
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{BACKEND_URL}/api/portfolio/sync",
                json={
                    "user_id":      user_id,
                    "exchange":     exchange,
                    "assets":       [
                        {
                            "ativo":          a["symbol"],
                            "quantidade":     a["quantity"],
                            "preco_unitario": a.get("price_usdt", 0),
                        }
                        for a in assets
                        if a.get("quantity", 0) > 0
                    ],
                }
            )
            if r.status_code == 200:
                _last_sync[cache_key] = time.time()
                logger.info(f"Portfolio sincronizado: {len(assets)} ativos → banco")
                return True
            else:
                logger.warning(f"Portfolio sync falhou: {r.status_code} {r.text}")
                return False

    except Exception as e:
        logger.warning(f"Portfolio sync erro: {e}")
        return False
