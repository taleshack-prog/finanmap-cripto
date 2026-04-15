import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes      from './routes/auth';
import portfolioRoutes from './routes/portfolio';
import strategyRoutes  from './routes/strategies';
import tradeRoutes     from './routes/trades';
import fireRoutes      from './routes/fire';
import gaRoutes        from './routes/ga';

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 3020;

// Middleware
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3010',
    'http://localhost:3000',
    'http://localhost:3020',
  ]
}));
app.use(express.json());

// Rotas
app.use('/api/auth',      authRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/strategies', strategyRoutes);
app.use('/api/trades',    tradeRoutes);
app.use('/api/fire',      fireRoutes);
app.use('/api/ga',        gaRoutes);

// Status
app.get('/api/status', (_req, res) => {
  res.json({
    status:    'OK',
    version:   '2.0.0',
    timestamp: Date.now(),
    services: {
      database: 'postgresql',
      ga_engine: process.env.GA_ENGINE_URL || 'http://localhost:8110',
    }
  });
});

// Error handler global
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Backend v2 rodando em http://localhost:${PORT}`);
  console.log(`📡 Status: http://localhost:${PORT}/api/status`);
  console.log(`🧬 GA Engine: ${process.env.GA_ENGINE_URL || 'http://localhost:8110'}`);
});

export default app;
