import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// GET /api/trades — lista trades do usuário com paginação
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const page   = parseInt(req.query.page as string)   || 1;
    const limit  = parseInt(req.query.limit as string)  || 20;
    const status = req.query.status as string;
    const par    = req.query.par    as string;

    const where: any = { userId: req.user!.userId };
    if (status && status !== 'todos') where.status = status;
    if (par    && par    !== 'todos') where.parTrading = par;

    const [trades, total] = await Promise.all([
      prisma.trade.findMany({
        where,
        orderBy: { timestampEntrada: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
      }),
      prisma.trade.count({ where }),
    ]);

    res.json({ trades, total, page, pages: Math.ceil(total / limit) });
  } catch {
    res.status(500).json({ error: 'Erro ao buscar trades' });
  }
});

// GET /api/trades/summary — estatísticas
router.get('/summary', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const trades = await prisma.trade.findMany({
      where: { userId: req.user!.userId, status: 'fechado' },
    });

    const wins        = trades.filter(t => Number(t.lucro) > 0);
    const losses      = trades.filter(t => Number(t.lucro) < 0);
    const lucroTotal  = trades.reduce((s, t) => s + Number(t.lucro || 0), 0);
    const lucroWins   = wins.reduce((s, t) => s + Number(t.lucro || 0), 0);
    const lucroLosses = losses.reduce((s, t) => s + Math.abs(Number(t.lucro || 0)), 0);

    res.json({
      totalTrades:   await prisma.trade.count({ where: { userId: req.user!.userId } }),
      fechados:      trades.length,
      abertos:       await prisma.trade.count({ where: { userId: req.user!.userId, status: 'aberto' } }),
      winRate:       trades.length > 0 ? (wins.length / trades.length * 100).toFixed(1) : '0',
      lucroTotal:    lucroTotal.toFixed(2),
      lucroMedio:    trades.length > 0 ? (lucroTotal / trades.length).toFixed(2) : '0',
      profitFactor:  lucroLosses > 0 ? (lucroWins / lucroLosses).toFixed(2) : '∞',
      maiorGanho:    wins.length   > 0 ? Math.max(...wins.map(t => Number(t.lucro))).toFixed(2)   : '0',
      maiorPerda:    losses.length > 0 ? Math.min(...losses.map(t => Number(t.lucro))).toFixed(2) : '0',
    });
  } catch {
    res.status(500).json({ error: 'Erro ao calcular summary' });
  }
});

// POST /api/trades/create — abre novo trade
router.post('/create', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { estrategiaId, exchangeName, parTrading, tipo, quantidade, precoEntrada } = req.body;

    if (!parTrading || !tipo || !quantidade || !precoEntrada)
      return res.status(400).json({ error: 'Campos obrigatórios: parTrading, tipo, quantidade, precoEntrada' });

    const trade = await prisma.trade.create({
      data: {
        userId:        req.user!.userId,
        estrategiaId:  estrategiaId || null,
        exchangeName:  exchangeName || 'binance',
        parTrading,
        tipo,
        quantidade,
        precoEntrada,
        status:        'aberto',
      },
    });

    res.status(201).json(trade);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao criar trade' });
  }
});

// PUT /api/trades/:id/close — fecha trade e calcula lucro
router.put('/:id/close', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { precoSaida } = req.body;
    if (!precoSaida) return res.status(400).json({ error: 'precoSaida obrigatório' });

    const trade = await prisma.trade.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!trade) return res.status(404).json({ error: 'Trade não encontrado' });
    if (trade.status !== 'aberto') return res.status(400).json({ error: 'Trade já está fechado' });

    const entrada        = Number(trade.precoEntrada);
    const saida          = Number(precoSaida);
    const qtd            = Number(trade.quantidade);
    const lucro          = trade.tipo === 'compra'
      ? (saida - entrada) * qtd
      : (entrada - saida) * qtd;
    const lucroPercentual = ((saida - entrada) / entrada) * 100;

    const updated = await prisma.trade.update({
      where: { id: req.params.id },
      data:  {
        precoSaida,
        lucro,
        lucroPercentual,
        status:         'fechado',
        timestampSaida: new Date(),
      },
    });

    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Erro ao fechar trade' });
  }
});

// DELETE /api/trades/:id — cancela trade aberto
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const trade = await prisma.trade.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!trade) return res.status(404).json({ error: 'Não encontrado' });

    await prisma.trade.update({
      where: { id: req.params.id },
      data:  { status: 'cancelado' },
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Erro ao cancelar trade' });
  }
});

export default router;
