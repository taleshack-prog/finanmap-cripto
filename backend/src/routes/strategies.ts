import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const TIPOS_VALIDOS = ['trading', 'arbitragem', 'grid', 'dca'];

router.get('/', authenticate, async (_req: AuthRequest, res: Response) => {
  res.json({ estrategias: [] });
});

router.post('/create', authenticate, async (req: AuthRequest, res: Response) => {
  const { nome, tipo, pares, capital } = req.body;
  if (!TIPOS_VALIDOS.includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });
  res.status(201).json({ id: crypto.randomUUID(), nome, tipo, pares, capital, fitnessScore: 0, ativa: false });
});

export default router;
