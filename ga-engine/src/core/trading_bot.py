"""
FinanMap Cripto - Trading Bot Core v2
Robô autônomo com análise técnica (GA) + filtro de fluxo em tempo real
Fluxo: order book pressure, volume spike, spread analysis
"""

import asyncio
import logging
import time
from typing import Optional
from dataclasses import dataclass, field

from src.services.data_service import get_ohlcv, get_ticker, get_order_book
from src.services.technical_analysis import generate_technical_signals
from src.services.technical_analysis import volume_delta, atr_normalized, rvp_score, zscore_vwap
from src.services.cvd_service import get_cvd_real
from src.services.order_executor import OrderExecutor, OrderResult
from src.services.trade_persistence import save_trade_open, save_trade_close

logger = logging.getLogger(__name__)


@dataclass
class BotConfig:
    bot_id:           str
    user_id:          str
    strategy_id:      str
    symbol:           str   = "BTC/USDT"
    timeframe:        str   = "1h"
    capital:          float = 1000.0
    max_position:     float = 0.1
    stop_loss_pct:    float = 2.0
    take_profit_pct:  float = 4.0
    min_signal:       float = 0.05     # limiar técnico mínimo
    dry_run:          bool  = True
    api_key:          str   = ""
    api_secret:       str   = ""
    exchange:         str   = "binance"

    # Pesos técnicos (evoluídos pelo GA)
    w_rsi:        float = 0.30
    w_macd:       float = 0.30
    w_bollinger:  float = 0.20
    w_ema:        float = 0.20

    # Filtros de fluxo em tempo real
    use_flow_filter:      bool  = True
    min_buy_pressure:     float = 0.52   # mínimo de pressão compradora para comprar
    max_spread_pct:       float = 0.05   # spread máximo tolerado (%)
    min_volume_ratio:     float = 0.8    # volume mínimo vs média (evita mercado morto)
    flow_confirmation:    bool  = True   # exige confirmação do fluxo para abrir


@dataclass
class FlowData:
    """Dados de fluxo em tempo real"""
    buy_pressure:  float = 0.5
    sell_pressure: float = 0.5
    spread_pct:    float = 0.01
    bid_volume:    float = 0.0
    ask_volume:    float = 0.0
    price:         float = 0.0
    volume_24h:    float = 0.0
    change_24h:    float = 0.0
    flow_score:    float = 0.0    # score consolidado de fluxo (-1 a +1)
    flow_ok:       bool  = True   # fluxo aprovado para trade


@dataclass
class BotState:
    is_running:      bool  = False
    position:        str   = "none"
    entry_price:     float = 0.0
    position_size:   float = 0.0
    unrealized_pnl:  float = 0.0
    total_trades:    int   = 0
    winning_trades:  int   = 0
    total_pnl:       float = 0.0
    last_signal:     str   = "HOLD"
    last_score:      float = 0.0
    last_flow:       Optional[FlowData] = None
    last_check:      float = 0.0
    errors:          int   = 0
    log:             list  = field(default_factory=list)


class TradingBot:
    """
    Robô de trading com duas camadas de análise:
    1. Análise técnica (pesos evoluídos pelo GA) — gera o sinal
    2. Análise de fluxo em tempo real — confirma ou bloqueia o sinal
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
        self.open_trade_id: Optional[str] = None

    def _log(self, msg: str, level: str = "INFO"):
        entry = {"ts": int(time.time()), "level": level, "msg": msg}
        self.state.log.append(entry)
        if len(self.state.log) > 200:
            self.state.log = self.state.log[-200:]
        getattr(logger, level.lower(), logger.info)(f"[BOT {self.config.bot_id[:8]}] {msg}")

    async def start(self):
        if self.state.is_running:
            self._log("Robô já está rodando", "WARNING")
            return
        self.state.is_running = True
        # Recupera estado de posições abertas ao reiniciar
        await self._recover_state()
        self._log(
            f"Robô v2 iniciado | {self.config.symbol} {self.config.timeframe} | "
            f"dry_run={self.config.dry_run} | flow_filter={self.config.use_flow_filter}"
        )
        self._task = asyncio.create_task(self._loop())

    async def _recover_state(self):
        """
        State recovery via fetch_balance + fetch_orders.
        Quando o bot reinicia, verifica se já tem posição aberta na Binance.
        Usa saldo real do ativo para detectar posição órfã.
        """
        if self.config.dry_run:
            return
        try:
            base = self.config.symbol.split("/")[0]  # ex: ZEC de ZEC/USDT
            balance = self.executor.exchange.fetch_balance()
            free    = float(balance.get("free",  {}).get(base, 0) or 0)
            total   = float(balance.get("total", {}).get(base, 0) or 0)

            # Busca preço atual
            ticker = self.executor.exchange.fetch_ticker(self.config.symbol)
            price  = float(ticker.get("last") or ticker.get("close") or 0)
            if price <= 0:
                return

            # Valor do saldo em USDT
            value_usdt = total * price

            # Só considera posição se valor > $3 (evita pó)
            min_value = 3.0
            if value_usdt < min_value:
                return

            # Calcula quantidade mínima esperada para uma posição real
            # (pelo menos 1% do capital configurado)
            min_qty = (self.config.capital * 0.01) / price

            if total > min_qty:
                # Tem saldo real — recupera estado
                self.state.position      = "long"
                self.state.entry_price   = price  # usa preço atual como referência
                self.state.position_size = total
                self.state.unrealized_pnl = 0.0
                self._log(
                    f"State recovery | {base}: {total:.6f} "
                    f"≈ ${value_usdt:.2f} | Assumindo LONG @ ${price:,.2f}",
                    "WARNING"
                )
        except Exception as e:
            self._log(f"State recovery erro (ignorado): {e}", "WARNING")

    async def stop(self):
        self.state.is_running = False
        if self._task:
            self._task.cancel()
        if self.state.position != "none":
            self._log("Fechando posição antes de parar...", "WARNING")
            await self._close_position("BOT_STOPPED")
        self._log("Robô parado")

    async def _loop(self):
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
                    self._log("Muitos erros — parando robô", "ERROR")
                    self.state.is_running = False
                    break
            await asyncio.sleep(min(interval, 60))

    # ─── ANÁLISE DE FLUXO ───────────────────────────────────

    def _analyze_flow(self, price: float) -> FlowData:
        """
        Analisa o fluxo em tempo real via order book e ticker.
        Retorna FlowData com score e aprovação para trade.
        """
        flow = FlowData(price=price)

        try:
            # Order book — pressão compradora vs vendedora
            ob = get_order_book(self.config.symbol, 20, self.config.exchange)
            flow.buy_pressure  = ob.get("buy_pressure", 0.5)
            flow.sell_pressure = ob.get("sell_pressure", 0.5)
            flow.spread_pct    = ob.get("spread_pct", 0.01)
            flow.bid_volume    = ob.get("bid_volume", 0)
            flow.ask_volume    = ob.get("ask_volume", 0)

            # Ticker — volume e variação 24h
            ticker = get_ticker(self.config.symbol, self.config.exchange)
            flow.volume_24h = ticker.get("volume_24h", 0)
            flow.change_24h = ticker.get("change_24h", 0)

            # Score de fluxo (-1 a +1)
            # Pressão: >0.5 = compradores dominam = bullish
            pressure_score = (flow.buy_pressure - 0.5) * 4   # normaliza para -2 a +2, clamp -1 a +1
            pressure_score = max(-1.0, min(1.0, pressure_score))

            # Momentum de preço: variação 24h normalizada
            momentum_score = max(-1.0, min(1.0, flow.change_24h / 10))

            # Score final ponderado
            flow.flow_score = round(pressure_score * 0.7 + momentum_score * 0.3, 4)

            # Aprovação — verifica cada filtro
            spread_ok  = flow.spread_pct <= self.config.max_spread_pct
            pressure_ok = flow.buy_pressure >= self.config.min_buy_pressure

            flow.flow_ok = spread_ok and pressure_ok

            self._log(
                f"Fluxo | Pressure: {flow.buy_pressure:.1%} buy / {flow.sell_pressure:.1%} sell | "
                f"Spread: {flow.spread_pct:.4f}% | Score: {flow.flow_score:+.3f} | "
                f"OK: {flow.flow_ok}"
            )

        except Exception as e:
            self._log(f"Erro análise de fluxo: {e} — usando neutro", "WARNING")
            flow.flow_ok    = True   # fallback: não bloqueia por erro de fluxo
            flow.flow_score = 0.0

        self.state.last_flow = flow
        return flow

    # ─── TICK PRINCIPAL ─────────────────────────────────────

    async def _tick(self):
        """
        Ciclo principal:
        1. Análise técnica (GA) → score técnico
        2. Análise de fluxo → confirmação em tempo real
        3. Decisão: só opera se AMBOS aprovarem
        """

        # 1. Dados OHLCV para análise técnica
        ohlcv = get_ohlcv(
            symbol        = self.config.symbol,
            timeframe     = self.config.timeframe,
            limit         = 100,
            exchange_name = self.config.exchange,
            api_key       = self.config.api_key,
            secret        = self.config.api_secret,
        )

        ticker = get_ticker(self.config.symbol, self.config.exchange)
        price  = ticker["price"]

        # 2. Análise técnica com pesos do GA
        signals   = generate_technical_signals(
            closes  = ohlcv["closes"],
            highs   = ohlcv["highs"],
            lows    = ohlcv["lows"],
            volumes = ohlcv["volumes"],
        )
        breakdown  = signals.get("breakdown", {})
        rsi_s  = breakdown.get("rsi",       {}).get("score", 0) or 0
        macd_s = breakdown.get("macd",      {}).get("score", 0) or 0
        bb_s   = breakdown.get("bollinger", {}).get("score", 0) or 0
        ema_s  = breakdown.get("ema_trend", {}).get("score", 0) or 0

        tech_score = (
            self.config.w_rsi       * rsi_s  +
            self.config.w_macd      * macd_s +
            self.config.w_bollinger * bb_s   +
            self.config.w_ema       * ema_s
        )

        tech_direction = "BUY" if tech_score > self.config.min_signal else \
                         "SELL" if tech_score < -self.config.min_signal else "HOLD"

        self.state.last_signal = tech_direction
        self.state.last_score  = round(tech_score, 4)

        self._log(
            f"Tick | Preço: ${price:,.2f} | "
            f"Técnico: {tech_direction} ({tech_score:+.4f}) | "
            f"RSI={rsi_s:+.3f} MACD={macd_s:+.3f} BB={bb_s:+.3f} EMA={ema_s:+.3f}"
        )

        # 3. Análise de fluxo em tempo real (só se configurado)
        flow = None
        if self.config.use_flow_filter:
            flow = self._analyze_flow(price)

        # 4. Atualiza PnL não realizado
        if self.state.position == "long" and self.state.entry_price > 0:
            self.state.unrealized_pnl = (
                (price - self.state.entry_price) / self.state.entry_price * 100
            )

        # 5. Stop loss e take profit (independente do fluxo)
        if self.state.position == "long":
            if self.state.unrealized_pnl <= -self.config.stop_loss_pct:
                self._log(f"STOP LOSS | PnL: {self.state.unrealized_pnl:.2f}%", "WARNING")
                await self._close_position("STOP_LOSS", price)
                return
            if self.state.unrealized_pnl >= self.config.take_profit_pct:
                self._log(f"TAKE PROFIT | PnL: {self.state.unrealized_pnl:.2f}%")
                await self._close_position("TAKE_PROFIT", price)
                return

        # Limite global de posições simultâneas
        max_positions = 3
        # Conta posições via USDT livre (proxy simples)
        try:
            balance = self.executor.exchange.fetch_balance()
            usdt_free = float(balance.get('free', {}).get('USDT', 0) or 0)
            usdt_total = float(balance.get('total', {}).get('USDT', 0) or 0)
            if usdt_free < 5.0:
                self._log(f"USDT livre insuficiente: ${usdt_free:.2f} — aguardando", "WARNING")
                return
        except Exception:
            pass

        # ── RVP — Risco/Valor/Probabilidade ──────────────────
        # Só calcula se há sinal técnico de BUY e posição neutra
        if tech_direction == "BUY" and self.state.position == "none":
            try:
                ohlcv    = get_ohlcv(
                    symbol=self.config.symbol, timeframe=self.config.timeframe,
                    limit=50, exchange_name=self.config.exchange,
                    api_key=self.config.api_key, secret=self.config.api_secret,
                )
                highs_  = ohlcv.get("highs",  ohlcv["closes"])
                lows_   = ohlcv.get("lows",   ohlcv["closes"])
                vols_   = ohlcv.get("volumes", [1.0] * len(ohlcv["closes"]))
                closes_ = ohlcv["closes"]

                # Volume delta — pressão real
                vd      = volume_delta(vols_, closes_, highs_, lows_, period=5)
                vd_score = vd["score"][-1] if vd["score"] else 0.0

                # ATR normalizado — regime de volatilidade
                atr_n   = atr_normalized(highs_, lows_, closes_, period=14)
                atr_r   = atr_n["atr_ratio"][-1] if atr_n["atr_ratio"] else 1.0
                regime  = atr_n["regime"][-1] if atr_n["regime"] else "normal"

                # Z-Score VWAP — preço esticado?
                highs_  = ohlcv.get("highs",   closes_)
                lows_   = ohlcv.get("lows",    closes_)
                vols_   = ohlcv.get("volumes", [1.0] * len(closes_))

                zs      = zscore_vwap(highs_, lows_, closes_, vols_, period=20)
                z_score = zs["zscore"][-1] if zs["zscore"] else 0.0
                z_signal = zs["signal"][-1] if zs["signal"] else "neutro"
                z_score_val = zs["score"][-1] if zs["score"] else 0.0

                # Bloqueia compra se preço muito esticado para cima
                if z_score > 2.0:
                    self._log(
                        f"Z-Score BLOQUEADO | z={z_score:.2f} ({z_signal}) | "
                        f"Preço esticado {z_score:.1f}σ acima do VWAP",
                        "WARNING"
                    )
                    return

                self._log(
                    f"Z-Score VWAP | z={z_score:.2f} | signal={z_signal} | "
                    f"VWAP=${zs['vwap'][-1]:,.2f if zs['vwap'][-1] else 0:.2f}"
                )

                # CVD Real — fluxo real de compra/venda
                # Especialmente importante para ETH e SOL
                try:
                    cvd = get_cvd_real(
                        symbol        = self.config.symbol,
                        exchange_name = self.config.exchange,
                        api_key       = self.config.api_key,
                        secret        = self.config.api_secret,
                        limit         = 200,
                        window_min    = 5,
                    )
                    cvd_score  = cvd["score"]
                    cvd_signal = cvd["signal"]

                    self._log(
                        f"CVD Real | score={cvd_score:+.3f} | signal={cvd_signal} | "
                        f"buy={cvd['buy_volume']:.2f} sell={cvd['sell_volume']:.2f} | "
                        f"trades={cvd['trades_count']}"
                    )

                    # Bloqueia se CVD bearish E Z-Score neutro/alto
                    # (dupla confirmação de venda agressiva)
                    if cvd_signal == "bearish" and z_score > 0.5:
                        self._log(
                            f"CVD BLOQUEADO | CVD bearish ({cvd_score:+.3f}) + "
                            f"Z-Score={z_score:.2f} — venda agressiva confirmada",
                            "WARNING"
                        )
                        return

                except Exception as e:
                    self._log(f"CVD erro (não bloqueia): {e}", "WARNING")
                    cvd_score  = 0.0
                    cvd_signal = "neutro"

                # RVP
                win_rate_est = self.state.win_rate / 100 if self.state.total_trades > 3 else 0.55
                rvp = rvp_score(
                    win_rate       = win_rate_est,
                    take_profit_pct = self.config.take_profit_pct,
                    stop_loss_pct  = self.config.stop_loss_pct,
                    vol_delta_score = vd_score,
                    atr_ratio      = atr_r,
                )

                self._log(
                    f"RVP | score={rvp['rvp']:.3f} | EV={rvp['ev']:.3f} | "
                    f"VolDelta={vd_score:+.3f} | ATR={atr_r:.2f} | "
                    f"Z={z_score:.2f} | CVD={cvd_score:+.3f} | regime={regime}"
                )

                if not rvp["approved"] and self.state.total_trades > 3:
                    self._log(
                        f"RVP REPROVADO ({rvp['reason']}) — entrada bloqueada",
                        "WARNING"
                    )
                    return

            except Exception as e:
                self._log(f"RVP erro (não bloqueia): {e}", "WARNING")

        # 6. Decisão de entrada — técnica + fluxo (fluxo SÓ na entrada)
        if tech_direction == "BUY" and self.state.position == "none":
            flow_approved = True
            if self.config.use_flow_filter and flow:
                flow_approved = flow.flow_ok
                if not flow_approved:
                    self._log(
                        f"Sinal BUY bloqueado pelo fluxo | "
                        f"Pressure: {flow.buy_pressure:.1%} < {self.config.min_buy_pressure:.1%}",
                        "WARNING"
                    )
            if flow_approved:
                flow_score_str = f"{flow.flow_score:+.3f}" if flow else "0.000"
                self._log(f"Sinal BUY confirmado! Técnico={tech_score:+.4f} Fluxo={flow_score_str}")
                # Stress test pré-execute — valida MDD projetado
                stress_ok = self._stress_test(ohlcv["closes"][-30:] if len(ohlcv["closes"]) >= 30 else ohlcv["closes"])
                if not stress_ok:
                    self._log(
                        f"Stress test REPROVADO — MDD projetado >12% | "
                        f"Aguardando próximo tick",
                        "WARNING"
                    )
                    return
                await self._open_position("long", price)

        # 7. Manutenção de posição aberta — técnica + quantitativa (SEM fluxo)
        elif self.state.position == "long":
            # 7a. Saída por sinal técnico forte de venda
            if tech_direction == "SELL" and tech_score < -0.15:
                self._log(
                    f"Saída técnica forte | Score: {tech_score:+.4f} | "
                    f"PnL atual: {self.state.unrealized_pnl:+.2f}%"
                )
                await self._close_position("SIGNAL_SELL", price)
                return

            # 7b. Monitoramento quantitativo da posição
            # Calcula momentum do preço desde a entrada
            if self.state.entry_price > 0:
                momentum = (price - self.state.entry_price) / self.state.entry_price
                # Saída se momentum muito negativo E técnica confirmando SELL
                if momentum < -0.008 and tech_score < -0.05:
                    self._log(
                        f"Saída quantitativa | Momentum: {momentum:+.3f} | "
                        f"Score: {tech_score:+.4f} | PnL: {self.state.unrealized_pnl:+.2f}%",
                        "WARNING"
                    )
                    await self._close_position("QUANT_EXIT", price)
                    return

            self._log(
                f"Posição mantida | PnL: {self.state.unrealized_pnl:+.2f}% | "
                f"Score: {tech_score:+.4f} | "
                f"Fluxo ignorado em manutenção"
            )

    # ─── STRESS TEST ────────────────────────────────────────

    def _stress_test(self, closes: list) -> bool:
        """Mini stress test — verifica MDD dos últimos 30 candles."""
        try:
            import numpy as np
            arr = np.array(closes, dtype=float)
            returns = np.diff(arr) / arr[:-1]
            cumret  = np.cumprod(1 + returns)
            peak    = np.maximum.accumulate(cumret)
            mdd     = float(np.min((cumret - peak) / peak) * 100)
            self._log(f"Stress test | MDD 30c: {mdd:.1f}%")
            return mdd > -12.0  # passa se MDD < 12%
        except Exception as e:
            self._log(f"Stress test erro: {e}", "WARNING")
            return True  # em caso de erro, permite trade

    # ─── EXECUÇÃO DE ORDENS ─────────────────────────────────

    async def _open_position(self, side: str, price: float):
        # Kelly Sizing Antifrágil (half-Kelly para proteção contra ruína)
        win_rate  = self.state.win_rate / 100 if self.state.total_trades > 3 else 0.55
        rr_ratio  = self.config.take_profit_pct / max(self.config.stop_loss_pct, 0.1)
        kelly_f   = (win_rate * (rr_ratio + 1) - 1) / rr_ratio
        half_kelly = max(0.03, min(kelly_f * 0.5, 0.20))  # entre 3% e 20%

        # Stress on-chain: reduz tamanho se advise RED
        onchain_stress = getattr(self, '_onchain_stress', 0.0)
        kelly_adjusted = half_kelly * (1 - 0.3 * onchain_stress)

        # Verifica saldo USDT real antes de abrir
        try:
            balance = self.executor.exchange.fetch_balance()
            usdt_free = float(balance.get('free', {}).get('USDT', 0) or 0)
            max_size  = usdt_free * 0.90  # usa no máximo 90% do USDT livre
            size_usd  = min(self.config.capital * kelly_adjusted, max_size)
            if size_usd < 5.0:
                self._log(f"USDT insuficiente: ${usdt_free:.2f} livre — mínimo $5", "WARNING")
                return
            self._log(f"USDT livre: ${usdt_free:.2f} | Usando: ${size_usd:.2f}")
        except Exception as e:
            size_usd = self.config.capital * kelly_adjusted
            self._log(f"Erro ao verificar USDT: {e} — usando capital configurado", "WARNING")
        quantity  = round(size_usd / price, 6)
        self._log(
            f"Kelly sizing | WR={win_rate:.0%} R:R={rr_ratio:.1f} "
            f"f*={kelly_f:.3f} half={half_kelly:.3f} "
            f"stress={onchain_stress:.2f} → {kelly_adjusted:.3f} "
            f"= ${size_usd:.2f}"
        )

        self._log(f"ABRINDO {side.upper()} | ${price:,.2f} | Qtd: {quantity} | ${size_usd:.2f}")

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
            self.open_trade_id = await save_trade_open(
                user_id=self.config.user_id,
                strategy_id=self.config.strategy_id,
                symbol=self.config.symbol,
                quantity=quantity,
                entry_price=self.state.entry_price,
                bot_id=self.config.bot_id,
            )
            self._log(f"Posição aberta | Exec: ${self.state.entry_price:,.2f} | ID: {result.order_id}")
        else:
            self._log(f"Falha ao abrir: {result.error}", "ERROR")

    async def _close_position(self, reason: str, price: Optional[float] = None):
        if self.state.position == "none":
            return

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
                f"Posição fechada | Motivo: {reason} | "
                f"PnL: {pnl_pct:+.2f}% (${pnl_usd:+.2f})"
            )

            await save_trade_close(
                trade_id=self.open_trade_id,
                user_id=self.config.user_id,
                exit_price=exit_price,
                pnl_usd=pnl_usd,
                pnl_pct=pnl_pct,
                reason=reason,
            )
            self.open_trade_id = None

            self.state.position       = "none"
            self.state.entry_price    = 0.0
            self.state.position_size  = 0.0
            self.state.unrealized_pnl = 0.0
        else:
            self._log(f"Falha ao fechar: {result.error}", "ERROR")

    # ─── STATUS ─────────────────────────────────────────────

    def get_status(self) -> dict:
        win_rate = (
            self.state.winning_trades / self.state.total_trades * 100
            if self.state.total_trades > 0 else 0
        )
        flow = self.state.last_flow
        return {
            "bot_id":          self.config.bot_id,
            "strategy_id":     self.config.strategy_id,
            "symbol":          self.config.symbol,
            "timeframe":       self.config.timeframe,
            "is_running":      self.state.is_running,
            "dry_run":         self.config.dry_run,
            "use_flow_filter": self.config.use_flow_filter,
            "position":        self.state.position,
            "entry_price":     self.state.entry_price,
            "position_size":   self.state.position_size,
            "unrealized_pnl":  round(self.state.unrealized_pnl, 4),
            "total_trades":    self.state.total_trades,
            "winning_trades":  self.state.winning_trades,
            "win_rate":        round(win_rate, 2),
            "total_pnl":       round(self.state.total_pnl, 4),
            "last_signal":     self.state.last_signal,
            "last_score":      self.state.last_score,
            "last_flow": {
                "buy_pressure":  round(flow.buy_pressure, 4),
                "sell_pressure": round(flow.sell_pressure, 4),
                "spread_pct":    round(flow.spread_pct, 4),
                "flow_score":    round(flow.flow_score, 4),
                "flow_ok":       flow.flow_ok,
                "change_24h":    round(flow.change_24h, 2),
            } if flow else None,
            "last_check":      self.state.last_check,
            "errors":          self.state.errors,
            "log":             self.state.log[-20:],
            "config": {
                "w_rsi":             self.config.w_rsi,
                "w_macd":            self.config.w_macd,
                "w_bollinger":       self.config.w_bollinger,
                "w_ema":             self.config.w_ema,
                "min_buy_pressure":  self.config.min_buy_pressure,
                "max_spread_pct":    self.config.max_spread_pct,
                "stop_loss_pct":     self.config.stop_loss_pct,
                "take_profit_pct":   self.config.take_profit_pct,
            }
        }
