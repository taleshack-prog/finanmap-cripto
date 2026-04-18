import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import axios from 'axios';

const router  = Router();
const prisma  = new PrismaClient();
const GA_URL  = process.env.GA_ENGINE_URL || 'http://localhost:8110';

// ─── POST /api/ga/evolve ────────────────────────────────────
// Dispara evolução GA e salva melhor cromossomo no banco
router.post('/evolve', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const {
      symbol          = 'BTC/USDT',
      timeframe       = '1h',
      data_limit      = 500,
      population_size = 10,
      generations     = 20,
      nome,
    } = req.body;

    // Cria registro de estratégia com status "evoluindo"
    const estrategia = await prisma.estrategia.create({
      data: {
        userId:    req.user!.userId,
        nome:      nome || `GA ${symbol} ${new Date().toLocaleDateString('pt-BR')}`,
        tipo:      'trading',
        geracao:   0,
        cromossomo: { status: 'evoluindo', symbol, timeframe },
        fitnessScore:    0,
        retornoEsperado: 0,
        volatilidade:    0,
        ativa:           false,
      },
    });

    res.status(202).json({
      message:       'Evolução GA iniciada',
      estrategia_id: estrategia.id,
      status:        'evoluindo',
      symbol,
      timeframe,
      generations,
    });

    // Roda GA em background (não bloqueia a resposta)
    _runGAAndSave({
      estrategiaId:   estrategia.id,
      userId:         req.user!.userId,
      symbol,
      timeframe,
      data_limit,
      population_size,
      generations,
    }).catch(err => console.error('Erro GA background:', err));

  } catch (e) {
    res.status(500).json({ error: 'Erro ao iniciar evolução GA' });
  }
});

// ─── GET /api/ga/status/:estrategiaId ──────────────────────
// Verifica status de uma evolução GA em andamento
router.get('/status/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const e = await prisma.estrategia.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!e) return res.status(404).json({ error: 'Estratégia não encontrada' });

    const cromossomo = e.cromossomo as any;
    res.json({
      id:             e.id,
      nome:           e.nome,
      status:         cromossomo?.status || 'desconhecido',
      geracao:        e.geracao,
      fitnessScore:   e.fitnessScore,
      retornoEsperado: e.retornoEsperado,
      ativa:          e.ativa,
      cromossomo:     e.cromossomo,
    });
  } catch {
    res.status(500).json({ error: 'Erro ao buscar status' });
  }
});

// ─── POST /api/ga/evolve/sync ───────────────────────────────
// Evolução GA síncrona (aguarda resultado — use para testes)
router.post('/evolve/sync', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const {
      symbol          = 'BTC/USDT',
      timeframe       = '1h',
      data_limit      = 500,
      population_size = 10,
      generations     = 10,
      nome,
    } = req.body;

    // Chama GA Engine diretamente
    const gaRes = await axios.post(`${GA_URL}/ga/evolve/sync`, {
      symbol, timeframe, data_limit, population_size, generations,
    }, { timeout: 120000 });

    const gaResult = gaRes.data;

    // Salva no banco
    const estrategia = await prisma.estrategia.create({
      data: {
        userId:    req.user!.userId,
        nome:      nome || `GA ${symbol} ${new Date().toLocaleDateString('pt-BR')}`,
        tipo:      'trading',
        geracao:   gaResult.generations_run || 0,
        cromossomo: {
          ...gaResult.best_chromosome,
          symbol,
          timeframe,
          status:        'concluido',
          generations_run: gaResult.generations_run,
          data_candles:  gaResult.data_candles,
          history:       gaResult.history?.slice(-5),   // últimas 5 gerações
        },
        fitnessScore:    gaResult.best_fitness    || 0,
        retornoEsperado: gaResult.best_return     || 0,
        volatilidade:    Math.abs(gaResult.best_max_dd || 0),
        ativa:           false,
      },
    });

    res.status(201).json({
      message:    'Estratégia GA criada com sucesso',
      estrategia: {
        id:              estrategia.id,
        nome:            estrategia.nome,
        tipo:            estrategia.tipo,
        geracao:         estrategia.geracao,
        fitnessScore:    estrategia.fitnessScore,
        retornoEsperado: estrategia.retornoEsperado,
        ativa:           estrategia.ativa,
        cromossomo:      estrategia.cromossomo,
      },
      ga_result: {
        best_fitness:  gaResult.best_fitness,
        best_sortino:  gaResult.best_sortino,
        best_win_rate: gaResult.best_win_rate,
        best_max_dd:   gaResult.best_max_dd,
        best_trades:   gaResult.best_trades,
        best_return:   gaResult.best_return,
        generations:   gaResult.generations_run,
        elapsed_s:     gaResult.elapsed_seconds,
      },
    });

  } catch (e: any) {
    const msg = e?.response?.data?.detail || e?.message || 'Erro desconhecido';
    res.status(500).json({ error: `Erro na evolução GA: ${msg}` });
  }
});

// ─── GET /api/ga/strategies ────────────────────────────────
// Lista estratégias criadas pelo GA para o usuário
router.get('/strategies', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const estrategias = await prisma.estrategia.findMany({
      where:   { userId: req.user!.userId },
      orderBy: { dataCriacao: 'desc' },
    });

    const enriched = estrategias.map(e => {
      const c = e.cromossomo as any;
      return {
        id:              e.id,
        nome:            e.nome,
        tipo:            e.tipo,
        geracao:         e.geracao,
        fitnessScore:    e.fitnessScore,
        retornoEsperado: e.retornoEsperado,
        volatilidade:    e.volatilidade,
        ativa:           e.ativa,
        dataCriacao:     e.dataCriacao,
        symbol:          c?.symbol     || 'BTC/USDT',
        timeframe:       c?.timeframe  || '1h',
        status:          c?.status     || 'manual',
        win_rate:        c?.best_win_rate || 0,
        max_dd:          c?.best_max_dd   || 0,
        pesos: {
          w_rsi:       c?.w_rsi       || 0.25,
          w_macd:      c?.w_macd      || 0.25,
          w_bollinger: c?.w_bollinger || 0.25,
          w_ema:       c?.w_ema       || 0.25,
        },
        risk: {
          stop_loss_pct:   c?.stop_loss_pct   || 2.0,
          take_profit_pct: c?.take_profit_pct || 4.0,
          capital_pct:     c?.capital_pct     || 0.1,
        },
      };
    });

    res.json({ estrategias: enriched, total: enriched.length });
  } catch {
    res.status(500).json({ error: 'Erro ao listar estratégias GA' });
  }
});

// ─── POST /api/ga/strategies/:id/activate ──────────────────
// Ativa uma estratégia GA e inicia o bot no GA Engine
router.post('/strategies/:id/activate', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const e = await prisma.estrategia.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!e) return res.status(404).json({ error: 'Estratégia não encontrada' });

    const c = e.cromossomo as any;

    // Inicia bot no GA Engine com o cromossomo evoluído
    const botId = `bot_${e.id.slice(0, 8)}_${Date.now()}`;
    try {
      await axios.post(`${GA_URL}/bot/start`, {
        bot_id:          botId,
        user_id:         req.user!.userId,
        strategy_id:     e.id,
        symbol:          c?.symbol          || 'BTC/USDT',
        timeframe:       c?.timeframe       || '1h',
        capital:         req.body.capital   || 1000,
        max_position:    c?.capital_pct     || 0.1,
        stop_loss_pct:   c?.stop_loss_pct   || 2.0,
        take_profit_pct: c?.take_profit_pct || 4.0,
        dry_run:         req.body.dry_run   ?? true,
        w_rsi:           c?.w_rsi           || 0.25,
        w_macd:          c?.w_macd          || 0.25,
        w_bollinger:     c?.w_bollinger     || 0.25,
        w_ema:           c?.w_ema           || 0.25,
        use_flow_filter: true,
      }, { timeout: 15000 });
    } catch (botErr: any) {
      console.warn('Bot não iniciado (GA Engine offline?):', botErr?.message);
    }

    // Atualiza no banco
    const updated = await prisma.estrategia.update({
      where: { id: e.id },
      data:  {
        ativa:     true,
        cromossomo: { ...c, bot_id: botId, ativada_em: new Date().toISOString(),
          bot_config: {
            symbol:           c?.symbol || 'BTC/USDT',
            timeframe:        c?.timeframe || '1h',
            capital:          req.body.capital || 109,
            max_position:     req.body.max_position || 0.25,
            dry_run:          req.body.dry_run ?? false,
            use_flow_filter:  true,
            min_buy_pressure: req.body.min_buy_pressure || 0.52,
            max_spread_pct:   0.05,
            min_signal:       0.05,
            exchange:         'binance',
          }
        },
      },
    });

    res.json({ message: 'Estratégia ativada', bot_id: botId, estrategia: updated });
  } catch {
    res.status(500).json({ error: 'Erro ao ativar estratégia' });
  }
});

// ─── DELETE /api/ga/strategies/:id ─────────────────────────
router.delete('/strategies/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const e = await prisma.estrategia.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!e) return res.status(404).json({ error: 'Não encontrada' });

    // Para o bot se estiver rodando
    const c = e.cromossomo as any;
    if (c?.bot_id) {
      try {
        await axios.post(`${GA_URL}/bot/stop/${c.bot_id}`, {}, { timeout: 5000 });
      } catch { /* bot pode já estar parado */ }
    }

    await prisma.estrategia.delete({ where: { id: e.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Erro ao deletar estratégia' });
  }
});


// ─── BACKGROUND GA RUNNER ───────────────────────────────────

async function _runGAAndSave(params: {
  estrategiaId:   string;
  userId:         string;
  symbol:         string;
  timeframe:      string;
  data_limit:     number;
  population_size: number;
  generations:    number;
}) {
  const { estrategiaId, symbol, timeframe, data_limit, population_size, generations } = params;

  try {
    // Atualiza status
    await prisma.estrategia.update({
      where: { id: estrategiaId },
      data:  { cromossomo: { status: 'evoluindo', symbol, timeframe, started_at: new Date().toISOString() } },
    });

    // Chama GA Engine
    const gaRes = await axios.post(`${GA_URL}/ga/evolve/sync`, {
      symbol, timeframe, data_limit, population_size, generations,
    }, { timeout: 300000 });  // 5 minutos timeout

    const gaResult = gaRes.data;

    // Salva resultado no banco
    await prisma.estrategia.update({
      where: { id: estrategiaId },
      data:  {
        geracao:  gaResult.generations_run || 0,
        cromossomo: {
          ...gaResult.best_chromosome,
          symbol,
          timeframe,
          status:          'concluido',
          generations_run: gaResult.generations_run,
          best_win_rate:   gaResult.best_win_rate,
          best_max_dd:     gaResult.best_max_dd,
          best_trades:     gaResult.best_trades,
          history:         gaResult.history?.slice(-5),
          completed_at:    new Date().toISOString(),
        },
        fitnessScore:    gaResult.best_fitness    || 0,
        retornoEsperado: gaResult.best_return     || 0,
        volatilidade:    Math.abs(gaResult.best_max_dd || 0),
      },
    });

    console.log(`✅ GA concluído para estratégia ${estrategiaId} | fitness=${gaResult.best_fitness}`);

  } catch (err: any) {
    // Marca como erro no banco
    await prisma.estrategia.update({
      where: { id: estrategiaId },
      data:  {
        cromossomo: {
          status: 'erro',
          error:  err?.message || 'Erro desconhecido',
          symbol,
          timeframe,
        },
      },
    }).catch(() => {});
    throw err;
  }
}

// Proxy para portfolio Binance
router.get('/portfolio/binance', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const r = await axios.get(`${GA_URL}/portfolio/binance`, { timeout: 15000 })
    res.json(r.data)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Erro ao buscar portfólio' })
  }
})

// Proxy analyze/full
router.get('/analyze/full', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { symbol = 'BTC/USDT', timeframe = '1h', limit = '200' } = req.query as any
    const r = await axios.get(`${GA_URL}/analyze/full?symbol=${symbol}&timeframe=${timeframe}&limit=${limit}`, { timeout: 60000 })
    res.json(r.data)
  } catch (e: any) {
    res.status(500).json({ error: e?.message })
  }
})

// Proxy analyze/fast — sem on-chain (rápido para o dashboard)
router.get('/analyze/fast', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { symbol = 'BTC/USDT', timeframe = '1h', limit = '100' } = req.query as any
    const [techRes, quantRes, obRes] = await Promise.all([
      axios.get(`${GA_URL}/analyze/live?symbol=${symbol}&timeframe=${timeframe}&limit=${limit}`, { timeout: 15000 }),
      axios.get(`${GA_URL}/analyze/quantitative?symbol=${symbol}&timeframe=${timeframe}&limit=${limit}`, { timeout: 15000 }),
      axios.get(`${GA_URL}/market/orderbook?symbol=${symbol}&limit=20`, { timeout: 8000 }).catch(() => ({ data: {} })),
    ])

    const ob = obRes.data || {}
    const buy_pressure = ob.buy_pressure ?? 0.5
    const flow_score = parseFloat(((buy_pressure - 0.5) * 4).toFixed(4))

    res.json({
      symbol,
      price:         techRes.data.latest_price,
      technical:     techRes.data.analysis,
      quantitative:  quantRes.data.quantitative,
      flow: {
        buy_pressure,
        sell_pressure: ob.sell_pressure ?? 0.5,
        spread_pct:    ob.spread_pct    ?? 0,
        flow_score:    Math.max(-1, Math.min(1, flow_score)),
      },
      combined_score:     (techRes.data.analysis?.signal || 0) * 0.6 + (quantRes.data.quantitative?.score || 0) * 0.4,
      combined_direction: techRes.data.analysis?.direction || 'HOLD',
      timestamp: Date.now(),
    })
  } catch (e: any) {
    res.status(500).json({ error: e?.message })
  }
})

// ─── GET /api/ga/strategies/active ─────────────────────────
// Busca estratégias ativas para restaurar bots ao reiniciar GA Engine
router.get('/strategies/active', async (_req, res: Response) => {
  try {
    const estrategias = await prisma.estrategia.findMany({
      where: { ativa: true },
    })
    const enriched = estrategias.map(e => {
      const c = e.cromossomo as any
      return {
        id:        e.id,
        userId:    e.userId,
        nome:      e.nome,
        cromossomo: e.cromossomo,
        ativa:     e.ativa,
      }
    })
    res.json({ estrategias: enriched, total: enriched.length })
  } catch {
    res.status(500).json({ error: 'Erro ao buscar estratégias ativas' })
  }
})

// ─── PATCH /api/ga/strategies/:id/bot-id ───────────────────
// Atualiza bot_id após restauração automática
router.patch('/strategies/:id/bot-id', async (req, res: Response) => {
  try {
    const { bot_id } = req.body
    const e = await prisma.estrategia.findFirst({ where: { id: req.params.id } })
    if (!e) return res.status(404).json({ error: 'Não encontrada' })
    const c = e.cromossomo as any
    await prisma.estrategia.update({
      where: { id: e.id },
      data:  { cromossomo: { ...c, bot_id, restaurado_em: new Date().toISOString() } },
    })
    res.json({ success: true, bot_id })
  } catch {
    res.status(500).json({ error: 'Erro ao atualizar bot_id' })
  }
})

export default router;
