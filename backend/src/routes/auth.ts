import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { hashPassword, comparePassword, generateToken } from '../services/authService';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, nome, senha } = req.body;
    if (!email || !nome || !senha) return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    if (senha.length < 8) return res.status(400).json({ error: 'Senha deve ter mínimo 8 caracteres' });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ error: 'Email inválido' });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email já cadastrado' });

    const senhaHash = await hashPassword(senha);
    const user = await prisma.user.create({ data: { email, nome, senhaHash } });
    const token = generateToken(user.id, user.email);

    res.status(201).json({ token, user: { id: user.id, email: user.email, nome: user.nome } });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar conta' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, senha } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });

    const valid = await comparePassword(senha, user.senhaHash);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });

    const token = generateToken(user.id, user.email);
    res.json({ token, user: { id: user.id, email: user.email, nome: user.nome } });
  } catch {
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, email: true, nome: true, perfilRisco: true, saldoTotal: true, criadoEm: true }
  });
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json(user);
});

export default router;
