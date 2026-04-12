import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, async (_req: AuthRequest, res: Response) => {
  // Integrar com Prisma - retorna portfólio do usuário
  res.json({ ativos: [], totalUsd: 0 });
});

router.post('/add-asset', authenticate, async (req: AuthRequest, res: Response) => {
  const { ativo, quantidade, precoUnitario, exchangeName } = req.body;
  if (!ativo || !quantidade || !precoUnitario) return res.status(400).json({ error: 'Dados inválidos' });
  res.status(201).json({ success: true, ativo, quantidade, precoUnitario, exchangeName });
});

export default router;
