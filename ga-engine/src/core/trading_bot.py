"""
FinanMap Cripto - Trading Bot Core
Robô autônomo que combina análise técnica + GA para executar trades
"""

import asyncio
import logging
import time
from typing import Optional
from dataclasses import dataclass, field

from src.services.data_service import get_ohlcv, get_ticker, get_order_book
from src.services.technical_analysis import generate_technical_signals
from src.services.order_executor import OrderExecutor, OrderResult

logger = logging.getLogger(__name__)


@dataclass
class BotConfig:
    """Configuração de um robô de trading"""
    bot_id:          str
    user_id:         str
    strategy_id:     str
    symbol:          str          = "BTC/USDT"
    timeframe:       str          = "1h"
    capital:         float        = 1000.0
    max_position:    float        = 0.1          # % máximo do capital por trade
    stop_loss_pct:   float        = 2.0          # % de stop loss
    take_profit_pct: float        = 4.0          # % de take profit
    min_confidence:  float        = 0.5          # confiança mínima para entrar
    dry_run:         bool         = True          # True = simulado, False = real
    api_key:         str          = ""
    api_secret:      str          = ""
    exchange:        str          = "binance"

    # Pesos dos sinais técnicos (evoluídos pelo GA)
    w_rsi:       float = 0.30
    w_macd:      float = 0.30
    w_bollinger: float = 0.20
    w_ema:       float = 0.20


@dataclass
class BotState:
    """Estado atual do robô"""
    is_running:       bool  = False
    position:         str   = "none"   # none | long | short
    entry_price:      float = 0.0
    position_size:    float = 0.0
    unrealized_pnl:   float = 0.0
    total_trades:     int   = 0
    winning_trades:   int   = 0
    total_pnl:        float = 0.0
    last_signal:      str   = "HOLD"
    last_confidence:  float = 0.0
    last_check:       float = 0.0
    errors:           int   = 0
    log:              list  = field(default_factory=list)


class TradingBot:
    """
    Robô de trading autônomo.
    Ciclo: Coleta dados → Análise técnica → Gera sinal → Valida risco → Executa ordem
    """

    def __init__(self, config: BotConfig):
        self.config   = config
        self.state    = BotState()
        self.executor = OrderExecutor(
            api_key    = config.api_key,
            api_secret = config.api_secret,
            exchange   = config.exchange,
            dry_run    = config.dry_run,
        )
        self._task: Optional[asyncio.Task] = None

    def _log(self, msg: str, level: str = "INFO"):
        entry = {"ts": int(time.time()), "level": level, "msg": msg}
        self.state.log.append(entry)
        if len(self.state.log) > 100:
            self.state.log = self.state.log[-100:]
        getattr(logger, level.lower(), logger.info)(f"[BOT {self.config.bot_id[:8]}] {msg}")

    async def start(self):
        """Inicia o loop principal do robô"""
        if self.state.is_running:
            self._log("Robô já está rodando", "WARNING")
            return
        self.state.is_running = True
        self._log(f"Robô iniciado — {self.config.symbol} {self.config.timeframe} | dry_run={self.config.dry_run}")
        self._task = asyncio.create_task(self._loop())

    async def stop(self):
        """Para o robô e fecha posições abertas"""
        self.state.is_running = False
        if self._task:
            self._task.cancel()
        if self.state.position != "none":
            self._log("Fechando posição antes de parar...", "WARNING")
            await self._close_position("BOT_STOPPED")
        self._log("Robô parado")

    async def _loop(self):
        """Loop principal — roda a cada candle fechado"""
        timeframe_seconds = {
            "1m": 60, "5m": 300, "15m": 900,
            "1h": 3600, "4h": 14400, "1d": 86400,
        }
        interval = timeframe_seconds.get(self.config.timeframe, 3600)

        while self.state.is_running:
            try:
                await self._tick()
                self.state.last_check = time.time()
                self.state.errors = 0
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.state.errors += 1
                self._log(f"Erro no tick: {e}", "ERROR")
                if self.state.errors >= 5:
                    self._log("Muitos erros consecutivos — parando robô", "ERROR")
                    self.state.is_running = False
                    break

            await asyncio.sleep(min(interval, 60))  # checa no máximo a cada 60s em dev

    async def _tick(self):
        """Um ciclo completo do robô"""
        # 1. Coleta dados
        ohlcv = get_ohlcv(
            symbol        = self.config.symbol,
            timeframe     = self.config.timeframe,
            limit         = 100,
            exchange_name = self.config.exchange,
            api_key       = self.config.api_key,
            secret        = self.config.api_secret,
        )

        ticker   = get_ticker(self.config.symbol, self.config.exchange)
        ob       = get_order_book(self.config.symbol, 20, self.config.exchange)
        price    = ticker["price"]

        # 2. Análise técnica
        signals = generate_technical_signals(
            closes  = ohlcv["closes"],
            highs   = ohlcv["highs"],
            lows    = ohlcv["lows"],
            volumes = ohlcv["volumes"],
        )

        signal     = signals["direction"]    # BUY | SELL | HOLD
        confidence = signals["confidence"]   # 0-1
        score      = signals["signal"]       # -1 a +1

        # 3. Ajuste pelo order book (fluxo)
        buy_pressure = ob.get("buy_pressure", 0.5)
        if buy_pressure > 0.6 and score > 0:
            confidence = min(confidence * 1.1, 1.0)
        elif buy_pressure < 0.4 and score < 0:
            confidence = min(confidence * 1.1, 1.0)

        self.state.last_signal     = signal
        self.state.last_confidence = confidence

        self._log(
            f"Tick | Preço: ${price:,.2f} | Sinal: {signal} | "
            f"Confiança: {confidence:.1%} | Score: {score:.4f} | "
            f"Buy pressure: {buy_pressure:.1%}"
        )

        # 4. Atualiza PnL não realizado
        if self.state.position == "long" and self.state.entry_price > 0:
            self.state.unrealized_pnl = (
                (price - self.state.entry_price) / self.state.entry_price * 100
            )

        # 5. Verifica stop loss e take profit
        if self.state.position == "long":
            if self.state.unrealized_pnl <= -self.config.stop_loss_pct:
                self._log(f"STOP LOSS atingido: {self.state.unrealized_pnl:.2f}%", "WARNING")
                await self._close_position("STOP_LOSS", price)
                return

            if self.state.unrealized_pnl >= self.config.take_profit_pct:
                self._log(f"TAKE PROFIT atingido: {self.state.unrealized_pnl:.2f}%")
                await self._close_position("TAKE_PROFIT", price)
                return

        # 6. Executa sinal
        if confidence >= self.config.min_confidence:
            if signal == "BUY" and self.state.position == "none":
                await self._open_position("long", price, signals)

            elif signal == "SELL" and self.state.position == "long":
                await self._close_position("SIGNAL_SELL", price)

    async def _open_position(self, side: str, price: float, signals: dict):
        """Abre uma posição"""
        size_usd = self.config.capital * self.config.max_position
        quantity = round(size_usd / price, 6)

        self._log(
            f"ABRINDO {side.upper()} | "
            f"Preço: ${price:,.2f} | Qtd: {quantity} | "
            f"Valor: ${size_usd:.2f}"
        )

        result = await self.executor.place_order(
            symbol   = self.config.symbol,
            side     = "buy" if side == "long" else "sell",
            quantity = quantity,
            price    = price,
        )

        if result.success:
            self.state.position      = side
            self.state.entry_price   = result.executed_price or price
            self.state.position_size = quantity
            self.state.total_trades += 1
            self._log(
                f"Posição aberta! Preço exec: ${self.state.entry_price:,.2f} | "
                f"ID: {result.order_id}"
            )
        else:
            self._log(f"Falha ao abrir posição: {result.error}", "ERROR")

    async def _close_position(self, reason: str, price: Optional[float] = None):
        """Fecha a posição atual"""
        if self.state.position == "none":
            return

        self._log(f"FECHANDO posição | Motivo: {reason} | Preço: ${price or 0:,.2f}")

        result = await self.executor.place_order(
            symbol   = self.config.symbol,
            side     = "sell" if self.state.position == "long" else "buy",
            quantity = self.state.position_size,
            price    = price,
        )

        if result.success:
            exit_price = result.executed_price or price or self.state.entry_price
            pnl_pct    = (exit_price - self.state.entry_price) / self.state.entry_price * 100
            pnl_usd    = self.state.position_size * (exit_price - self.state.entry_price)

            self.state.total_pnl += pnl_usd
            if pnl_usd > 0:
                self.state.winning_trades += 1

            self._log(
                f"Posição fechada | PnL: {pnl_pct:+.2f}% (${pnl_usd:+.2f}) | "
                f"Motivo: {reason}"
            )

            self.state.position       = "none"
            self.state.entry_price    = 0.0
            self.state.position_size  = 0.0
            self.state.unrealized_pnl = 0.0
        else:
            self._log(f"Falha ao fechar posição: {result.error}", "ERROR")

    def get_status(self) -> dict:
        """Retorna status completo do robô"""
        win_rate = (
            self.state.winning_trades / self.state.total_trades * 100
            if self.state.total_trades > 0 else 0
        )
        return {
            "bot_id":          self.config.bot_id,
            "strategy_id":     self.config.strategy_id,
            "symbol":          self.config.symbol,
            "timeframe":       self.config.timeframe,
            "is_running":      self.state.is_running,
            "dry_run":         self.config.dry_run,
            "position":        self.state.position,
            "entry_price":     self.state.entry_price,
            "position_size":   self.state.position_size,
            "unrealized_pnl":  round(self.state.unrealized_pnl, 4),
            "total_trades":    self.state.total_trades,
            "winning_trades":  self.state.winning_trades,
            "win_rate":        round(win_rate, 2),
            "total_pnl":       round(self.state.total_pnl, 4),
            "last_signal":     self.state.last_signal,
            "last_confidence": round(self.state.last_confidence, 4),
            "last_check":      self.state.last_check,
            "errors":          self.state.errors,
            "log":             self.state.log[-20:],
        }
