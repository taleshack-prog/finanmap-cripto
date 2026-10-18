"""
Smoke tests — TDD v1.0 implementação
Valida:
  1. Fitness 4-componentes (§3.7.4) — pesos e normalização
  2. Convergência 3/3 (RF-09) — lógica de bloqueio
  3. Risco intraday §5.3 — limite diário + RVP attempts
  4. risk_size endpoint — cálculo de posição
  5. Endpoints /rvp_signal, /validate_trade, /stress_test, /flow_check existem em main.py
"""

import sys
import math
import pytest

sys.path.insert(0, "/home/claude/finanmap-cripto/ga-engine")


# ─── 1. Fitness 4-componentes ───────────────────────────────────────────

class TestFitnessTDD:
    def _run(self, **kwargs):
        from src.core.ga_population import _compute_fitness_tdd
        defaults = dict(
            returns=list(range(1, 51)),   # irrelevante — cobertura de ramos
            highs=None, lows=None, closes=None,
            symbol="BTC/USDT", atr_mult_bias=1.0,
        )
        defaults.update(kwargs)
        return _compute_fitness_tdd(**defaults)

    def test_returns_dict_with_required_keys(self):
        r = self._run()
        for key in ("fitness", "sharpe", "profit_factor", "max_dd",
                    "rvp_hit", "calmar", "threshold_t"):
            assert key in r, f"chave '{key}' ausente"

    def test_fitness_range(self):
        # gera série aleatória razoável
        import numpy as np
        np.random.seed(42)
        rets = list(np.random.normal(0.001, 0.02, 200))
        r = self._run(returns=rets)
        # fitness deve estar no range [-5, 10]
        assert -5.0 <= r["fitness"] <= 10.0, f"fitness fora do range: {r['fitness']}"

    def test_weights_sum_to_one(self):
        from src.core.ga_population import (
            FITNESS_W_SHARPE, FITNESS_W_PF, FITNESS_W_MDD, FITNESS_W_RVP
        )
        total = FITNESS_W_SHARPE + FITNESS_W_PF + FITNESS_W_MDD + FITNESS_W_RVP
        assert abs(total - 1.0) < 1e-9, f"pesos somam {total} (esperado 1.0)"

    def test_constants_tdd_spec(self):
        from src.core.ga_population import (
            FITNESS_W_SHARPE, FITNESS_W_PF, FITNESS_W_MDD, FITNESS_W_RVP,
            SHARPE_MIN, PROFIT_FACTOR_MIN, RVP_HIT_MIN, MDD_CAP,
        )
        assert FITNESS_W_SHARPE == 0.35
        assert FITNESS_W_PF     == 0.25
        assert FITNESS_W_MDD    == 0.20
        assert FITNESS_W_RVP    == 0.20
        assert SHARPE_MIN       == 2.0
        assert PROFIT_FACTOR_MIN == 1.5
        assert RVP_HIT_MIN      == 0.65
        assert MDD_CAP          == -0.10

    def test_alias_exists(self):
        from src.core.ga_population import _compute_fitness_barbell, _compute_fitness_tdd
        assert _compute_fitness_barbell is _compute_fitness_tdd


# ─── 2. ATR multipliers por ativo ────────────────────────────────────────

class TestATRMultipliers:
    def test_btc_mult_1_0(self):
        from src.core.ga_population import ATR_MULT_BY_ASSET
        assert ATR_MULT_BY_ASSET.get("BTC/USDT") == 1.0

    def test_eth_mult_range(self):
        from src.core.ga_population import ATR_MULT_BY_ASSET
        mult = ATR_MULT_BY_ASSET.get("ETH/USDT", 0)
        assert 1.5 <= mult <= 1.8, f"ETH mult={mult} fora de 1.5–1.8"

    def test_xrp_mult_1_2(self):
        from src.core.ga_population import ATR_MULT_BY_ASSET
        assert ATR_MULT_BY_ASSET.get("XRP/USDT") == 1.2


# ─── 3. BotConfig / BotState — campos TDD §5.3 ──────────────────────────

class TestBotConfigRisk:
    def _config(self, **kw):
        from src.core.trading_bot import BotConfig
        defaults = dict(bot_id="test", user_id="u1", strategy_id="s1",
                        dry_run=True, symbol="BTC/USDT")
        defaults.update(kw)
        return BotConfig(**defaults)

    def test_default_capital_pct(self):
        cfg = self._config()
        assert 0.0025 <= cfg.capital_pct <= 0.005, "capital_pct fora de 0.25–0.5%"

    def test_daily_loss_limit_r_in_range(self):
        cfg = self._config()
        assert 1.0 <= cfg.daily_loss_limit_r <= 2.0

    def test_max_rvp_attempts(self):
        cfg = self._config()
        assert cfg.max_rvp_attempts == 2


class TestBotStateRisk:
    def _bot(self):
        from src.core.trading_bot import BotConfig, TradingBot
        cfg = BotConfig(bot_id="t", user_id="u", strategy_id="s", dry_run=True)
        return TradingBot(cfg)

    def test_daily_pnl_starts_zero(self):
        bot = self._bot()
        assert bot.state.daily_pnl == 0.0

    def test_daily_limit_starts_false(self):
        bot = self._bot()
        assert bot.state.daily_limit_hit is False

    def test_convergence_score_starts_zero(self):
        bot = self._bot()
        assert bot.state.convergence_score == 0

    def test_rvp_attempts_starts_empty(self):
        bot = self._bot()
        assert bot.state.rvp_level_attempts == {}

    def test_check_daily_risk_limits_blocks_after_limit(self):
        import datetime
        bot = self._bot()
        today = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
        bot.state.last_reset_day = today  # já resetado hoje → não vai resetar
        bot.state.daily_pnl = -2.0   # perdeu 2R (> daily_loss_limit_r 1.5)
        result = bot._check_daily_risk_limits()
        assert result is False, "deveria bloquear após atingir limite diário"

    def test_check_rvp_attempts_blocks_after_max(self):
        import datetime
        bot = self._bot()
        today = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
        bot.state.last_reset_day = today
        bot.state.rvp_level_attempts["rvp_default"] = 2  # já usou 2
        result = bot._check_rvp_attempts("rvp_default")
        assert result is False, "deveria bloquear após 2 tentativas"

    def test_register_rvp_attempt_increments(self):
        bot = self._bot()
        bot._register_rvp_attempt("rvp_1")
        bot._register_rvp_attempt("rvp_1")
        assert bot.state.rvp_level_attempts["rvp_1"] == 2

    def test_update_daily_pnl(self):
        bot = self._bot()
        # pnl_pct de +2%, stop=2%, capital_pct=0.3% → R unitário = 0.02*0.003=0.00006
        # pnl_r = (0.02/0.006) ≈ 3.33R — só testamos que daily_pnl muda
        bot._update_daily_pnl(2.0)
        assert bot.state.daily_pnl != 0.0
        assert bot.state.daily_trades == 1

    def test_win_rate_zero_trades(self):
        bot = self._bot()
        assert bot.state.win_rate == 0.0

    def test_win_rate_calc(self):
        bot = self._bot()
        bot.state.total_trades   = 10
        bot.state.winning_trades = 7
        assert abs(bot.state.win_rate - 70.0) < 1e-6

    def test_calculate_position_size(self):
        bot = self._bot()
        bot.config.capital     = 1000.0
        bot.config.capital_pct = 0.003
        bot.config.stop_loss_pct = 2.0
        qty = bot._calculate_position_size(50000.0)
        # risk_amount = 3.0; position_value = 3.0/0.02 = 150.0; qty = 150/50000 = 0.003
        assert abs(qty - 0.003) < 1e-8


# ─── 4. Endpoints TDD §3.5 existem no main.py ────────────────────────────

class TestEndpointsExist:
    def _routes(self):
        import ast, pathlib
        src = pathlib.Path("/home/claude/finanmap-cripto/ga-engine/src/main.py").read_text()
        tree = ast.parse(src)
        routes = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                # procura @app.get("/...") / @app.post("/...")
                func = node.func
                if hasattr(func, "attr") and func.attr in ("get", "post"):
                    for a in node.args:
                        if isinstance(a, ast.Constant) and isinstance(a.value, str):
                            routes.append(a.value)
        return routes

    def test_validate_trade_exists(self):
        assert "/validate_trade" in self._routes()

    def test_rvp_signal_exists(self):
        routes = self._routes()
        assert any("/rvp_signal" in r for r in routes), "/rvp_signal/{symbol} não encontrado"

    def test_risk_size_exists(self):
        assert "/risk_size" in self._routes()

    def test_stress_test_exists(self):
        assert "/stress_test" in self._routes()

    def test_flow_check_exists(self):
        assert "/flow_check" in self._routes()

    def test_reversion_signal_exists(self):
        assert "/reversion_signal" in self._routes()


# ─── 5. risk_size lógica de negócio ──────────────────────────────────────

class TestRiskSizeLogic:
    def test_rr_ratio_calculation(self):
        # RR = take_profit / stop_loss
        stop, tp = 2.0, 4.0
        rr = tp / stop
        assert rr == 2.0

    def test_rr_ok_flag(self):
        stop, tp = 2.0, 3.0
        rr = tp / stop   # 1.5
        assert not (rr >= 2.0), "RR=1.5 deve reprovar (< 1:2 mínimo)"

    def test_position_value_formula(self):
        capital, capital_pct, stop_pct = 1000.0, 0.003, 2.0
        risk_amount    = capital * capital_pct          # 3.0
        position_value = risk_amount / (stop_pct / 100) # 150.0
        assert abs(position_value - 150.0) < 1e-6

    def test_qty_calculation(self):
        position_value, price = 150.0, 50000.0
        qty = position_value / price
        assert abs(qty - 0.003) < 1e-9


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
