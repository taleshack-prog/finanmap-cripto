"""
FinanMap Cripto - Trade Persistence Service
Salva trades reais da Binance no PostgreSQL após execução.
"""

import httpx
import logging
import os
import time

logger = logging.getLogger(__name__)

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:3020")

# Cache de tokens por user_id para não fazer login a cada trade
_token_cache: dict = {}


async def _get_token(user_id: str) -> str:
    """Busca token do cache ou autentica via backend."""
    cached = _token_cache.get(user_id)
    if cached and time.time() - cached["ts"] < 3600 * 6:
        return cached["token"]

    # Token não encontrado — usa token de sistema
    # O backend tem rota interna /api/trades/internal que não precisa de JWT
    return ""


async def save_trade_open(
    user_id:      str,
    strategy_id:  str,
    symbol:       str,
    quantity:     float,
    entry_price:  float,
    bot_id:       str,
) -> str | None:
    """
    Salva abertura de trade no banco.
    Retorna o trade_id criado.
    """
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.post(
                f"{BACKEND_URL}/api/trades/internal/create",
                json={
                    "user_id":     user_id,
                    "strategy_id": strategy_id,
                    "symbol":      symbol,
                    "par_trading": symbol,
                    "tipo":        "compra",
                    "quantidade":  quantity,
                    "preco_entrada": entry_price,
                    "bot_id":      bot_id,
                    "status":      "aberto",
                }
            )
            if r.status_code == 201:
                data = r.json()
                trade_id = data.get("id")
                logger.info(f"Trade aberto salvo no banco: {trade_id} | {symbol} @ ${entry_price:,.2f}")
                return trade_id
            else:
                logger.warning(f"Falha ao salvar trade aberto: {r.status_code} {r.text[:100]}")
                return None
    except Exception as e:
        logger.warning(f"Erro ao salvar trade aberto: {e}")
        return None


async def save_trade_close(
    trade_id:    str,
    user_id:     str,
    exit_price:  float,
    pnl_usd:     float,
    pnl_pct:     float,
    reason:      str,
) -> bool:
    """
    Atualiza trade no banco com preço de saída e PnL.
    """
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.patch(
                f"{BACKEND_URL}/api/trades/internal/{trade_id}/close",
                json={
                    "user_id":      user_id,
                    "preco_saida":  exit_price,
                    "lucro":        round(pnl_usd, 6),
                    "lucro_percentual": round(pnl_pct, 4),
                    "status":       "fechado",
                    "motivo":       reason,
                }
            )
            if r.status_code == 200:
                logger.info(f"Trade {trade_id} fechado no banco | PnL: ${pnl_usd:+.2f} ({pnl_pct:+.2f}%) | {reason}")
                return True
            else:
                logger.warning(f"Falha ao fechar trade {trade_id}: {r.status_code}")
                return False
    except Exception as e:
        logger.warning(f"Erro ao fechar trade {trade_id}: {e}")
        return False
