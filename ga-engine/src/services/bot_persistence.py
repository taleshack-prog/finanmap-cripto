"""
FinanMap Cripto - Bot Persistence Service
Salva estado dos bots ativos e restaura automaticamente ao subir o GA Engine.
"""

import httpx
import logging
import time
import os

logger = logging.getLogger(__name__)

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:3020")


async def restore_active_bots():
    """
    Chamado na inicialização do GA Engine.
    Busca estratégias ativas no banco e reinicia os bots automaticamente.
    """
    logger.info("🔄 Verificando bots para restaurar...")

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # Busca estratégias ativas no backend
            r = await client.get(f"{BACKEND_URL}/api/ga/strategies/active")
            if r.status_code != 200:
                logger.warning(f"Não foi possível buscar estratégias ativas: {r.status_code}")
                return

            data = r.json()
            estrategias = data.get("estrategias", [])

            if not estrategias:
                logger.info("Nenhum bot para restaurar")
                return

            logger.info(f"Restaurando {len(estrategias)} bots...")
            restored = 0

            for e in estrategias:
                try:
                    c = e.get("cromossomo", {})
                    bot_config = c.get("bot_config", {})

                    if not bot_config:
                        logger.warning(f"Estratégia {e['id']} sem bot_config — pulando")
                        continue

                    # Reinicia o bot com a configuração salva
                    bot_id = f"bot_{e['id'][:8]}_{int(time.time())}"
                    payload = {
                        "bot_id":          bot_id,
                        "user_id":         e.get("userId", ""),
                        "strategy_id":     e["id"],
                        "symbol":          bot_config.get("symbol", "BTC/USDT"),
                        "timeframe":       bot_config.get("timeframe", "1h"),
                        "capital":         bot_config.get("capital", 109),
                        "max_position":    bot_config.get("max_position", 0.25),
                        "stop_loss_pct":   c.get("stop_loss_pct", 2.0),
                        "take_profit_pct": c.get("take_profit_pct", 4.0),
                        "dry_run":         bot_config.get("dry_run", True),
                        "w_rsi":           c.get("w_rsi", 0.25),
                        "w_macd":          c.get("w_macd", 0.25),
                        "w_bollinger":     c.get("w_bollinger", 0.25),
                        "w_ema":           c.get("w_ema", 0.25),
                        "use_flow_filter": bot_config.get("use_flow_filter", True),
                        "min_buy_pressure": bot_config.get("min_buy_pressure", 0.52),
                        "max_spread_pct":  bot_config.get("max_spread_pct", 0.05),
                        "min_signal":      bot_config.get("min_signal", 0.05),
                        "exchange":        bot_config.get("exchange", "binance"),
                    }

                    start_r = await client.post(
                        "http://localhost:8110/bot/start",
                        json=payload,
                        timeout=15,
                    )

                    if start_r.status_code == 200:
                        restored += 1
                        logger.info(f"✅ Bot restaurado: {e.get('nome')} ({bot_config.get('symbol')}) bot_id={bot_id}")

                        # Atualiza bot_id no banco
                        await client.patch(
                            f"{BACKEND_URL}/api/ga/strategies/{e['id']}/bot-id",
                            json={"bot_id": bot_id},
                            timeout=5,
                        )
                    else:
                        logger.warning(f"Falha ao restaurar {e.get('nome')}: {start_r.text[:100]}")

                except Exception as ex:
                    logger.warning(f"Erro ao restaurar bot {e.get('id', '')[:8]}: {ex}")

            logger.info(f"✅ {restored}/{len(estrategias)} bots restaurados")

    except Exception as e:
        logger.warning(f"Erro ao restaurar bots: {e}")
