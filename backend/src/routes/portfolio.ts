import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// GET /api/portfolio — retorna portfólio do usuário
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const ativos = await prisma.portfolio.findMany({
      where:   { userId: req.user!.userId },
      orderBy: { atualizadoEm: 'desc' },
    });

    const totalUsd = ativos.reduce((s, a) => s + Number(a.quantidade) * Number(a.precoUnitario), 0);

    res.json({
      ativos,
      totalUsd: totalUsd.toFixed(2),
      count:    ativos.length,
    });
  } catch {
    res.status(500).json({ error: 'Erro ao buscar portfólio' });
  }
});

// POST /api/portfolio/add-asset — adiciona ativo
router.post('/add-asset', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { ativo, quantidade, precoUnitario, exchangeName } = req.body;

    if (!ativo || !quantidade || !precoUnitario)
      return res.status(400).json({ error: 'ativo, quantidade e precoUnitario são obrigatórios' });
    if (quantidade <= 0 || precoUnitario <= 0)
      return res.status(400).json({ error: 'quantidade e precoUnitario devem ser positivos' });

    // Upsert — atualiza se já existir, cria se não existir
    const asset = await prisma.portfolio.upsert({
      where: {
        userId_exchangeName_ativo: {
          userId:       req.user!.userId,
          exchangeName: exchangeName || 'manual',
          ativo:        ativo.toUpperCase(),
        },
      },
      update: { quantidade, precoUnitario },
      create: {
        userId:       req.user!.userId,
        exchangeName: exchangeName || 'manual',
        ativo:        ativo.toUpperCase(),
        quantidade,
        precoUnitario,
      },
    });

    res.status(201).json(asset);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao adicionar ativo' });
  }
});

// PUT /api/portfolio/update-asset/:id — atualiza ativo
router.put('/update-asset/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { quantidade, precoUnitario } = req.body;
    const asset = await prisma.portfolio.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!asset) return res.status(404).json({ error: 'Ativo não encontrado' });

    const updated = await prisma.portfolio.update({
      where: { id: req.params.id },
      data:  { quantidade, precoUnitario },
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Erro ao atualizar ativo' });
  }
});

// DELETE /api/portfolio/remove-asset/:id — remove ativo
router.delete('/remove-asset/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const asset = await prisma.portfolio.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!asset) return res.status(404).json({ error: 'Ativo não encontrado' });

    await prisma.portfolio.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Erro ao remover ativo' });
  }
});

// GET /api/portfolio/summary — resumo do portfólio
router.get('/summary', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const ativos = await prisma.portfolio.findMany({
      where: { userId: req.user!.userId },
    });

    const total = ativos.reduce((s, a) => s + Number(a.quantidade) * Number(a.precoUnitario), 0);
    const sorted = [...ativos].sort((a, b) =>
      Number(b.quantidade) * Number(b.precoUnitario) - Number(a.quantidade) * Number(a.precoUnitario)
    );

    res.json({
      totalUsd:          total.toFixed(2),
      count:             ativos.length,
      maiorPosicao:      sorted[0]?.ativo || null,
      alocacao:          ativos.map(a => ({
        ativo:    a.ativo,
        pct:      total > 0 ? (Number(a.quantidade) * Number(a.precoUnitario) / total * 100).toFixed(1) : '0',
        valorUsd: (Number(a.quantidade) * Number(a.precoUnitario)).toFixed(2),
      })),
    });
  } catch {
    res.status(500).json({ error: 'Erro ao gerar summary' });
  }
});

export default router;
