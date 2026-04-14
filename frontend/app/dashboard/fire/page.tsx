'use client'
import { useState, useEffect } from 'react'

const glass = (accent = 'rgba(124,58,255,0.2)') => ({
  background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${accent}`,
  backdropFilter: 'blur(20px)', borderRadius: '8px', padding: '1.25rem',
} as React.CSSProperties)

interface Projecao {
  anos:         number
  dataFire:     string
  saldoFinal:   number
  metaFire:     number
  curva:        { mes: number; saldo: number }[]
  milestones:   { meta: number; anos: number; data: number; alcancado: boolean }[]
}

interface Cenario { nome: string; taxa: number; color: string }

const CENARIOS: Cenario[] = [
  { nome: 'Pessimista', taxa: 6,  color: '#ff4444' },
  { nome: 'Realista',   taxa: 12, color: '#f59e0b' },
  { nome: 'Otimista',   taxa: 20, color: '#00ff88' },
]

function calcFire(saldoInicial: number, aporteMensal: number, taxaAnual: number, metaManual?: number): Projecao {
  const r    = taxaAnual / 100 / 12
  const meta = metaManual || saldoInicial * 300
  let saldo  = saldoInicial
  let months = 0
  const curva: { mes: number; saldo: number }[] = [{ mes: 0, saldo: Math.round(saldo) }]

  while (saldo < meta && months < 600) {
    saldo = saldo * (1 + r) + aporteMensal
    months++
    if (months % 12 === 0) curva.push({ mes: months, saldo: Math.round(saldo) })
  }

  const anos     = Math.ceil(months / 12)
  const dataFire = new Date()
  dataFire.setFullYear(dataFire.getFullYear() + anos)

  const milestones = [100_000, 500_000, 1_000_000, 5_000_000].map(m => {
    let s = saldoInicial, mo = 0
    while (s < m && mo < 600) { s = s * (1 + r) + aporteMensal; mo++ }
    const d = new Date(); d.setFullYear(d.getFullYear() + Math.ceil(mo / 12))
    return { meta: m, anos: Math.ceil(mo / 12), data: d.getFullYear(), alcancado: s >= m }
  })

  return { anos, dataFire: dataFire.toISOString().split('T')[0], saldoFinal: Math.round(saldo), metaFire: Math.round(meta), curva, milestones }
}

export default function FirePage() {
  const [saldoAtual,   setSaldoAtual]   = useState(47382)
  const [aporte,       setAporte]       = useState(2000)
  const [taxa,         setTaxa]         = useState(12)
  const [metaManual,   setMetaManual]   = useState(0)
  const [proj,         setProj]         = useState<Projecao | null>(null)
  const [activeBar,    setActiveBar]    = useState<number | null>(null)
  const [showCenarios, setShowCenarios] = useState(false)

  useEffect(() => {
    const p = calcFire(saldoAtual, aporte, taxa, metaManual || undefined)
    setProj(p)
  }, [saldoAtual, aporte, taxa, metaManual])

  const progresso = proj ? Math.min((saldoAtual / proj.metaFire) * 100, 100) : 0
  const maxCurva  = proj ? Math.max(...proj.curva.map(c => c.saldo)) : 1
  const cenarioProjs = CENARIOS.map(c => ({ ...c, proj: calcFire(saldoAtual, aporte, c.taxa, metaManual || undefined) }))

  const fmt = (n: number) => n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}k` : `$${n}`

  return (
    <div style={{ fontFamily: '"Courier New", monospace', color: '#fff' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 50% 60% at 50% 0%, rgba(0,255,136,0.04) 0%, transparent 50%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '10px', letterSpacing: '6px', color: 'rgba(0,255,136,0.5)', marginBottom: '4px' }}>INDEPENDÊNCIA FINANCEIRA</div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, background: 'linear-gradient(135deg, #00ff88, #00d4ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>FIRE Calculator</h1>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '1rem', marginBottom: '1rem' }}>

          {/* Inputs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={glass('rgba(0,255,136,0.2)')}>
              <div style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(0,255,136,0.5)', marginBottom: '1rem' }}>PARÂMETROS</div>
              {[
                { label: 'SALDO ATUAL ($)',   value: saldoAtual, set: setSaldoAtual, min: 0,    max: 10000000, step: 1000 },
                { label: 'APORTE MENSAL ($)', value: aporte,     set: setAporte,     min: 0,    max: 50000,    step: 100  },
                { label: 'TAXA RETORNO (%a)', value: taxa,       set: setTaxa,       min: 1,    max: 50,       step: 0.5  },
                { label: 'META FIRE ($) — 0=auto', value: metaManual, set: setMetaManual, min: 0, max: 50000000, step: 10000 },
              ].map(({ label, value, set, min, max, step }) => (
                <div key={label} style={{ marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '8px', letterSpacing: '2px', color: 'rgba(255,255,255,0.3)' }}>{label}</span>
                    <span style={{ fontSize: '10px', color: '#00ff88', fontWeight: 700 }}>
                      {label.includes('%') ? `${value}%` : fmt(value as number)}
                    </span>
                  </div>
                  <input type="range" min={min} max={max} step={step} value={value}
                    onChange={e => set(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: '#00ff88' }} />
                </div>
              ))}
            </div>

            {/* Resultado principal */}
            {proj && (
              <div style={{ ...glass('rgba(0,255,136,0.25)'), borderTop: '2px solid #00ff88', textAlign: 'center' }}>
                <div style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(0,255,136,0.5)', marginBottom: '0.75rem' }}>TEMPO ATÉ FIRE</div>
                <div style={{ fontSize: '3.5rem', fontWeight: 900, color: '#00ff88', lineHeight: 1, textShadow: '0 0 40px #00ff8860' }}>
                  {proj.anos}
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '0.75rem' }}>anos · {proj.dataFire}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '0.75rem' }}>
                  <div><div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '8px', marginBottom: '2px' }}>META</div><div style={{ color: '#00d4ff' }}>{fmt(proj.metaFire)}</div></div>
                  <div><div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '8px', marginBottom: '2px' }}>SALDO FINAL</div><div style={{ color: '#00ff88' }}>{fmt(proj.saldoFinal)}</div></div>
                </div>
                {/* Barra de progresso */}
                <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.3)', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Progresso</span><span>{progresso.toFixed(1)}%</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progresso}%`, background: 'linear-gradient(90deg, #00ff88, #00d4ff)', borderRadius: '3px', boxShadow: '0 0 10px #00ff8860' }} />
                </div>
              </div>
            )}
          </div>

          {/* Gráfico de projeção */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {proj && (
              <div style={glass('rgba(0,212,255,0.15)')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(0,212,255,0.5)' }}>CURVA DE PATRIMÔNIO</span>
                  <span style={{ fontSize: '9px', color: '#00ff88' }}>Taxa {taxa}%a.a.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '160px', marginBottom: '8px' }}>
                  {proj.curva.map((p, i) => {
                    const h = (p.saldo / maxCurva) * 100
                    const isActive = activeBar === i
                    const isFire = p.saldo >= proj.metaFire
                    return (
                      <div key={i} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', cursor: 'pointer', gap: '2px' }}
                        onMouseEnter={() => setActiveBar(i)} onMouseLeave={() => setActiveBar(null)}>
                        {isActive && <div style={{ fontSize: '7px', color: isFire ? '#00ff88' : '#00d4ff', whiteSpace: 'nowrap' }}>{fmt(p.saldo)}</div>}
                        <div style={{
                          width: '100%', height: `${h}%`,
                          background: isFire ? 'linear-gradient(180deg, #00ff88, rgba(0,255,136,0.3))' : 'linear-gradient(180deg, #00d4ff, rgba(0,212,255,0.2))',
                          borderRadius: '2px 2px 0 0',
                          boxShadow: isActive ? `0 0 10px ${isFire ? '#00ff88' : '#00d4ff'}60` : 'none',
                          transition: 'all 0.15s',
                        }} />
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: 'rgba(255,255,255,0.2)' }}>
                  <span>Hoje</span>
                  <span style={{ color: '#00ff88' }}>◈ FIRE em {proj.anos} anos</span>
                  <span>{new Date().getFullYear() + proj.anos}</span>
                </div>
              </div>
            )}

            {/* Milestones */}
            {proj && (
              <div style={glass('rgba(124,58,255,0.15)')}>
                <div style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(124,58,255,0.5)', marginBottom: '1rem' }}>MILESTONES</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                  {proj.milestones.map(m => (
                    <div key={m.meta} style={{ textAlign: 'center', padding: '0.75rem', background: m.alcancado ? 'rgba(0,255,136,0.06)' : 'rgba(255,255,255,0.02)', borderRadius: '6px', border: `0.5px solid ${m.alcancado ? 'rgba(0,255,136,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
                      <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.3)', marginBottom: '4px' }}>{fmt(m.meta)}</div>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: m.alcancado ? '#00ff88' : 'rgba(255,255,255,0.4)' }}>{m.anos}a</div>
                      <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.2)' }}>{m.data}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Comparativo de cenários */}
        <div style={glass('rgba(255,255,255,0.08)')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <span style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(255,255,255,0.3)' }}>COMPARATIVO DE CENÁRIOS</span>
            <button onClick={() => setShowCenarios(!showCenarios)} style={{ fontSize: '9px', padding: '0.3rem 0.8rem', background: 'transparent', border: '0.5px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', borderRadius: '4px' }}>
              {showCenarios ? '▲ FECHAR' : '▼ EXPANDIR'}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
            {cenarioProjs.map(({ nome, taxa: t, color, proj: p }) => (
              <div key={nome} style={{ padding: '1rem', background: `${color}08`, border: `0.5px solid ${color}25`, borderRadius: '6px', borderTop: `2px solid ${color}` }}>
                <div style={{ fontSize: '9px', letterSpacing: '3px', color, marginBottom: '0.5rem' }}>{nome.toUpperCase()}</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color }}>{p.anos} anos</div>
                <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.3)', marginTop: '4px' }}>Taxa {t}%a.a. · {p.dataFire}</div>
                <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>Patrimônio final: {fmt(p.saldoFinal)}</div>
              </div>
            ))}
          </div>
          {showCenarios && (
            <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'flex-end', gap: '3px', height: '80px' }}>
              {cenarioProjs.map(({ nome, color, proj: p }) => {
                const maxA = Math.max(...cenarioProjs.map(c => c.proj.anos))
                return (
                  <div key={nome} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end' }}>
                    <div style={{ fontSize: '8px', color }}>{p.anos}a</div>
                    <div style={{ width: '100%', height: `${(p.anos / maxA) * 80}%`, background: `${color}50`, borderRadius: '4px 4px 0 0', border: `0.5px solid ${color}` }} />
                    <div style={{ fontSize: '7px', color: 'rgba(255,255,255,0.3)' }}>{nome}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
