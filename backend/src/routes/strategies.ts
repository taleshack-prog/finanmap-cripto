import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

const TIPOS_VALIDOS = ['trading', 'arbitragem', 'grid', 'dca'];

// GET /api/strategies — lista todas do usuário
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const estrategias = await prisma.estrategia.findMany({
      where:   { userId: req.user!.userId },
      orderBy: { dataCriacao: 'desc' },
    });
    res.json({ estrategias, total: estrategias.length });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar estratégias' });
  }
});

// GET /api/strategies/:id — detalhes de uma estratégia
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const e = await prisma.estrategia.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!e) return res.status(404).json({ error: 'Estratégia não encontrada' });
    res.json(e);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar estratégia' });
  }
});

// POST /api/strategies/create — cria nova estratégia
router.post('/create', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { nome, tipo, par, capital, geracoes } = req.body;

    if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });
    if (!TIPOS_VALIDOS.includes(tipo))
      return res.status(400).json({ error: `Tipo inválido. Use: ${TIPOS_VALIDOS.join(', ')}` });

    const estrategia = await prisma.estrategia.create({
      data: {
        userId:    req.user!.userId,
        nome,
        tipo,
        geracao:   0,
        cromossomo: { par: par || 'BTC/USDT', capital: capital || 1000, geracoes: geracoes || 20 },
        fitnessScore:    0,
        retornoEsperado: 0,
        volatilidade:    0,
        ativa:           false,
      },
    });

    res.status(201).json(estrategia);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao criar estratégia' });
  }
});

// PUT /api/strategies/:id/activate — ativa estratégia
router.put('/:id/activate', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const e = await prisma.estrategia.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!e) return res.status(404).json({ error: 'Não encontrada' });

    const updated = await prisma.estrategia.update({
      where: { id: req.params.id },
      data:  { ativa: true },
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Erro ao ativar' });
  }
});

// PUT /api/strategies/:id/deactivate — desativa estratégia
router.put('/:id/deactivate', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const updated = await prisma.estrategia.update({
      where: { id: req.params.id },
      data:  { ativa: false },
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Erro ao desativar' });
  }
});

// PUT /api/strategies/:id/update-fitness — atualiza fitness após GA otimizar
router.put('/:id/update-fitness', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { fitnessScore, retornoEsperado, volatilidade, geracao, cromossomo } = req.body;
    const updated = await prisma.estrategia.update({
      where: { id: req.params.id },
      data:  {
        fitnessScore:    fitnessScore    ?? undefined,
        retornoEsperado: retornoEsperado ?? undefined,
        volatilidade:    volatilidade    ?? undefined,
        geracao:         geracao         ?? undefined,
        cromossomo:      cromossomo      ?? undefined,
      },
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Erro ao atualizar fitness' });
  }
});

// DELETE /api/strategies/:id — deleta estratégia
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const e = await prisma.estrategia.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!e) return res.status(404).json({ error: 'Não encontrada' });

    await prisma.estrategia.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Erro ao deletar' });
  }
});

export default router;
