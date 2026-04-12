import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// POST /api/fire/calculate
router.post('/calculate', authenticate, (req: AuthRequest, res: Response) => {
  const { saldoInicial, aportesMensal, taxaRetornoAnual, idadeAtual, idadeAlvoFire } = req.body;

  const r = taxaRetornoAnual / 100 / 12; // taxa mensal
  const n = (idadeAlvoFire - idadeAtual) * 12; // períodos em meses
  const metaFire = saldoInicial * 300; // regra dos 4% (25x despesas anuais = ~300x despesa mensal)

  // FV = PV * (1 + r)^n + PMT * [((1 + r)^n - 1) / r]
  let months = 0;
  let saldo = saldoInicial;
  const curva: { mes: number; saldo: number }[] = [{ mes: 0, saldo }];

  while (saldo < metaFire && months < 600) {
    saldo = saldo * (1 + r) + aportesMensal;
    months++;
    if (months % 12 === 0) curva.push({ mes: months, saldo: Math.round(saldo) });
  }

  const anos = Math.ceil(months / 12);
  const dataFire = new Date();
  dataFire.setFullYear(dataFire.getFullYear() + anos);

  const milestones = [1_000_000, 5_000_000, 10_000_000, 50_000_000].map(meta => {
    let m = 0; let s = saldoInicial;
    while (s < meta && m < 600) { s = s * (1 + r) + aportesMensal; m++; }
    const d = new Date(); d.setFullYear(d.getFullYear() + Math.ceil(m / 12));
    return { meta, anos: Math.ceil(m / 12), data: d.getFullYear(), alcancado: s >= meta };
  });

  res.json({
    tempoFireAnos: anos,
    dataFireEstimada: dataFire.toISOString().split('T')[0],
    saldoFinalProjetado: Math.round(saldo),
    metaFire: Math.round(metaFire),
    curvaPatrimonio: curva,
    milestones,
  });
});

export default router;
