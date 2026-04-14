"""
FinanMap Cripto - Order Executor
Executa ordens reais ou simuladas na exchange via CCXT
"""

import ccxt
import time
import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class OrderResult:
    success:        bool
    order_id:       Optional[str]  = None
    executed_price: Optional[float] = None
    executed_qty:   Optional[float] = None
    fee:            Optional[float] = None
    error:          Optional[str]  = None
    dry_run:        bool           = False
    timestamp:      int            = 0

    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = int(time.time())


class OrderExecutor:
    """
    Executa ordens na exchange.
    dry_run=True → simula sem executar ordens reais
    dry_run=False → executa ordens reais (cuidado!)
    """

    def __init__(
        self,
        api_key:    str  = "",
        api_secret: str  = "",
        exchange:   str  = "binance",
        dry_run:    bool = True,
    ):
        self.dry_run = dry_run
        self.exchange_name = exchange

        if not dry_run and api_key and api_secret:
            try:
                exchange_class = getattr(ccxt, exchange)
                self.exchange = exchange_class({
                    "apiKey":          api_key,
                    "secret":          api_secret,
                    "enableRateLimit": True,
                    "options":         { "defaultType": "spot" },
                })
                logger.info(f"OrderExecutor conectado à {exchange} (MODO REAL)")
            except Exception as e:
                logger.error(f"Erro ao conectar exchange: {e}")
                self.exchange  = None
                self.dry_run   = True
        else:
            self.exchange = None
            if not dry_run:
                logger.warning("dry_run=False mas sem API keys — usando simulação")
                self.dry_run = True

    async def place_order(
        self,
        symbol:   str,
        side:     str,           # "buy" | "sell"
        quantity: float,
        price:    Optional[float] = None,
        order_type: str = "market",
    ) -> OrderResult:
        """
        Coloca uma ordem na exchange.
        Em dry_run, simula a execução com o preço atual.
        """

        if self.dry_run:
            return self._simulate_order(symbol, side, quantity, price)

        return await self._real_order(symbol, side, quantity, price, order_type)

    def _simulate_order(
        self,
        symbol:   str,
        side:     str,
        quantity: float,
        price:    Optional[float],
    ) -> OrderResult:
        """Simula execução de ordem sem tocar na exchange"""
        # Slippage simulado de 0.05%
        slippage = 0.0005
        exec_price = price * (1 + slippage) if side == "buy" else price * (1 - slippage)

        # Taxa simulada de 0.1% (Binance spot)
        fee = exec_price * quantity * 0.001

        logger.info(
            f"[DRY RUN] {side.upper()} {quantity} {symbol} @ ${exec_price:,.2f} | "
            f"Taxa: ${fee:.4f}"
        )

        return OrderResult(
            success        = True,
            order_id       = f"DRY_{int(time.time())}",
            executed_price = exec_price,
            executed_qty   = quantity,
            fee            = fee,
            dry_run        = True,
        )

    async def _real_order(
        self,
        symbol:     str,
        side:       str,
        quantity:   float,
        price:      Optional[float],
        order_type: str,
    ) -> OrderResult:
        """Executa ordem real na exchange via CCXT"""
        if not self.exchange:
            return OrderResult(success=False, error="Exchange não conectada")

        try:
            if order_type == "market":
                order = self.exchange.create_order(
                    symbol   = symbol,
                    type     = "market",
                    side     = side,
                    amount   = quantity,
                )
            else:
                if not price:
                    return OrderResult(success=False, error="Preço necessário para limit order")
                order = self.exchange.create_order(
                    symbol   = symbol,
                    type     = "limit",
                    side     = side,
                    amount   = quantity,
                    price    = price,
                )

            exec_price = order.get("average") or order.get("price") or price
            exec_qty   = order.get("filled")  or quantity
            fee_info   = order.get("fee", {})
            fee        = fee_info.get("cost", 0) if fee_info else 0

            logger.info(
                f"[REAL] {side.upper()} {exec_qty} {symbol} @ ${exec_price:,.2f} | "
                f"ID: {order['id']} | Taxa: ${fee:.4f}"
            )

            return OrderResult(
                success        = True,
                order_id       = order["id"],
                executed_price = exec_price,
                executed_qty   = exec_qty,
                fee            = fee,
                dry_run        = False,
            )

        except ccxt.InsufficientFunds as e:
            return OrderResult(success=False, error=f"Saldo insuficiente: {e}")
        except ccxt.InvalidOrder as e:
            return OrderResult(success=False, error=f"Ordem inválida: {e}")
        except ccxt.NetworkError as e:
            return OrderResult(success=False, error=f"Erro de rede: {e}")
        except Exception as e:
            return OrderResult(success=False, error=str(e))

    def get_balance(self, currency: str = "USDT") -> float:
        """Retorna saldo disponível"""
        if self.dry_run or not self.exchange:
            return 10000.0  # saldo simulado
        try:
            balance = self.exchange.fetch_balance()
            return balance["free"].get(currency, 0.0)
        except Exception as e:
            logger.error(f"Erro ao buscar saldo: {e}")
            return 0.0
