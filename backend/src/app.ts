import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import portfolioRoutes from './routes/portfolio';
import strategyRoutes from './routes/strategies';
import tradeRoutes from './routes/trades';
import fireRoutes from './routes/fire';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({ origin: ['http://localhost:3000', 'http://localhost:3010', 'http://localhost:3020'] }));
app.use(express.json());

// Rotas
app.use('/api/auth', authRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/strategies', strategyRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/fire', fireRoutes);

// Status
app.get('/api/status', (_req, res) => {
  res.json({ status: 'OK', timestamp: Date.now(), version: '1.0.0' });
});

// Error handler global
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Backend rodando em http://localhost:${PORT}`);
  console.log(`📡 Status: http://localhost:${PORT}/api/status`);
});

export default app;
