import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { v4 as uuidv4 } from 'uuid'

const router = Router()
const prisma = new PrismaClient()

// POST /api/market/scan — recebe dados do MarketScan e salva no banco
router.post('/scan', async (req: Request, res: Response) => {
  try {
    const { results } = req.body
    if (!results || !Array.isArray(results)) {
      return res.status(400).json({ error: 'results obrigatório' })
    }

    const saved = await Promise.all(
      results.map((r: any) =>
        prisma.$executeRaw`
          INSERT INTO "MarketScan" (
            id, symbol, exchange, volume_24h, price_usdt, change_24h,
            sharpe_7d, volatility_7d, momentum_score, liquidity_score,
            overall_score, recomendado, scanned_at
          ) VALUES (
            ${uuidv4()}, ${r.symbol}, ${r.exchange || 'binance'},
            ${r.volume_24h}, ${r.price_usdt}, ${r.change_24h},
            ${r.sharpe_7d}, ${r.volatility_7d}, ${r.momentum_score},
            ${r.liquidity_score}, ${r.overall_score}, ${r.recomendado},
            NOW()
          )
          ON CONFLICT (symbol, exchange) DO UPDATE SET
            volume_24h     = EXCLUDED.volume_24h,
            price_usdt     = EXCLUDED.price_usdt,
            change_24h     = EXCLUDED.change_24h,
            sharpe_7d      = EXCLUDED.sharpe_7d,
            volatility_7d  = EXCLUDED.volatility_7d,
            momentum_score = EXCLUDED.momentum_score,
            liquidity_score = EXCLUDED.liquidity_score,
            overall_score  = EXCLUDED.overall_score,
            recomendado    = EXCLUDED.recomendado,
            scanned_at     = NOW()
        `
      )
    )

    return res.json({ saved: saved.length, timestamp: new Date() })
  } catch (e: any) {
    return res.status(500).json({ error: e?.message })
  }
})

// GET /api/market/recommendations — retorna top pares recomendados
router.get('/recommendations', async (_req: Request, res: Response) => {
  try {
    const results = await prisma.$queryRaw`
      SELECT symbol, overall_score, sharpe_7d, volatility_7d,
             momentum_score, volume_24h, recomendado, scanned_at
      FROM "MarketScan"
      ORDER BY overall_score DESC
      LIMIT 20
    `
    return res.json({ results, count: (results as any[]).length })
  } catch (e: any) {
    return res.status(500).json({ error: e?.message })
  }
})

export default router
