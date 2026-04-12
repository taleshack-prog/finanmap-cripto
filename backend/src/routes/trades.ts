import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, async (_req: AuthRequest, res: Response) => {
  res.json({ trades: [], total: 0 });
});

router.get('/summary', authenticate, async (_req: AuthRequest, res: Response) => {
  res.json({ totalTrades: 0, taxaVitoria: 0, lucroTotal: 0, lucroMedio: 0 });
});

export default router;
