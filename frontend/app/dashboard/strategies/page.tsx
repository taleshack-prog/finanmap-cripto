'use client'
import { useEffect, useState } from 'react'

const GA = 'http://localhost:8110'

const TIPOS = ['trading', 'arbitragem', 'grid', 'dca']
const PARES = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT']

const TIPO_CONFIG: Record<string, { color: string; desc: string; retorno: string }> = {
  trading:    { color: '#00d4ff', desc: 'Trend Following com MA + RSI', retorno: '4-5%/mês' },
  arbitragem: { color: '#7c3aff', desc: 'CEX vs DEX spread',           retorno: '0.5%/trade' },
  grid:       { color: '#ff0080', desc: 'Ordens em grade de preços',   retorno: '1-3%/mês' },
  dca:        { color: '#00ff88', desc: 'Aportes periódicos + on-chain', retorno: 'Longo prazo' },
}

interface Estrategia {
  id:              string
  nome:            string
  tipo:            string
  par:             string
  capital:         number
  ativa:           boolean
  fitness:         number
  geracao:         number
  retorno_mensal:  number
  sharpe:          number
  win_rate:        number
  trades:          number
  criada_em:       string
}

const glass = (accent = 'rgba(124,58,255,0.2)') => ({
  background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${accent}`,
  backdropFilter: 'blur(20px)', borderRadius: '8px', padding: '1.25rem',
} as React.CSSProperties)

const MOCK: Estrategia[] = [
  { id: '1', nome: 'Trend Follow BTC', tipo: 'trading',    par: 'BTC/USDT', capital: 5000,  ativa: true,  fitness: 1.82, geracao: 47, retorno_mensal: 4.2,  sharpe: 1.65, win_rate: 67, trades: 142, criada_em: '2024-01-15' },
  { id: '2', nome: 'Grid ETH/USDT',    tipo: 'grid',       par: 'ETH/USDT', capital: 3000,  ativa: true,  fitness: 1.51, geracao: 31, retorno_mensal: 2.1,  sharpe: 1.32, win_rate: 71, trades: 89,  criada_em: '2024-02-03' },
  { id: '3', nome: 'DCA Semanal',      tipo: 'dca',        par: 'BTC/USDT', capital: 10000, ativa: true,  fitness: 1.23, geracao: 12, retorno_mensal: 1.8,  sharpe: 1.10, win_rate: 58, trades: 24,  criada_em: '2024-01-01' },
  { id: '4', nome: 'Arb BNB CEX-DEX', tipo: 'arbitragem', par: 'BNB/USDT', capital: 2000,  ativa: false, fitness: 0.94, geracao: 8,  retorno_mensal: 0.8,  sharpe: 0.88, win_rate: 82, trades: 310, criada_em: '2024-03-10' },
]

export default function EstrategiasPage() {
  const [estrategias, setEstrategias] = useState<Estrategia[]>(MOCK)
  const [showForm, setShowForm]       = useState(false)
  const [otimizando, setOtimizando]   = useState<string | null>(null)
  const [form, setForm]               = useState({ nome: '', tipo: 'trading', par: 'BTC/USDT', capital: '1000', geracoes: '20' })

  const toggleAtiva = (id: string) =>
    setEstrategias(prev => prev.map(e => e.id === id ? { ...e, ativa: !e.ativa } : e))

  const deletar = (id: string) =>
    setEstrategias(prev => prev.filter(e => e.id !== id))

  const otimizar = async (id: string, par: string) => {
    setOtimizando(id)
    try {
      const r = await fetch(`${GA}/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: [par], generations: parseInt(form.geracoes), population_size: 50 }),
      })
      const data = await r.json()
      setEstrategias(prev => prev.map(e => e.id === id ? {
        ...e,
        fitness:  data.best_strategy?.fitness || e.fitness,
        geracao:  e.geracao + (data.evolution_history?.length || 0),
        sharpe:   data.metrics?.sharpe_ratio || e.sharpe,
        win_rate: data.metrics?.win_rate || e.win_rate,
      } : e))
    } catch { }
    setOtimizando(null)
  }

  const criarEstrategia = async () => {
    if (!form.nome || !form.capital) return
    const nova: Estrategia = {
      id:             Date.now().toString(),
      nome:           form.nome,
      tipo:           form.tipo,
      par:            form.par,
      capital:        parseFloat(form.capital),
      ativa:          false,
      fitness:        0,
      geracao:        0,
      retorno_mensal: 0,
      sharpe:         0,
      win_rate:       0,
      trades:         0,
      criada_em:      new Date().toISOString().split('T')[0],
    }
    setEstrategias(prev => [nova, ...prev])
    setShowForm(false)
    setForm({ nome: '', tipo: 'trading', par: 'BTC/USDT', capital: '1000', geracoes: '20' })
    // Otimiza automaticamente ao criar
    await otimizar(nova.id, nova.par)
  }

  const ativas   = estrategias.filter(e => e.ativa)
  const totalCap = estrategias.filter(e => e.ativa).reduce((s, e) => s + e.capital, 0)
  const melhor   = estrategias.reduce((b, e) => e.fitness > b.fitness ? e : b, estrategias[0])

  return (
    <div style={{ fontFamily: '"Courier New", monospace', color: '#fff' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 60% 50% at 90% 30%, rgba(124,58,255,0.06) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '6px', color: 'rgba(124,58,255,0.5)', marginBottom: '4px' }}>ROBÔS DE TRADING</div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, background: 'linear-gradient(135deg, #00d4ff, #7c3aff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Estratégias GA</h1>
          </div>
          <button onClick={() => setShowForm(!showForm)} style={{
            padding: '0.7rem 1.5rem', fontSize: '10px', letterSpacing: '3px',
            background: showForm ? 'rgba(255,50,50,0.2)' : 'linear-gradient(135deg, rgba(124,58,255,0.8), rgba(0,212,255,0.6))',
            border: `1px solid ${showForm ? 'rgba(255,50,50,0.4)' : 'rgba(124,58,255,0.5)'}`,
            color: '#fff', cursor: 'pointer', borderRadius: '4px',
          }}>
            {showForm ? '✕ CANCELAR' : '+ NOVA ESTRATÉGIA'}
          </button>
        </div>

        {/* Métricas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {[
            { label: 'ATIVAS',        value: `${ativas.length}/${estrategias.length}`, color: '#00ff88' },
            { label: 'CAPITAL ATIVO', value: `$${totalCap.toLocaleString()}`, color: '#00d4ff' },
            { label: 'MELHOR FITNESS', value: melhor?.fitness.toFixed(2) || '—', color: '#7c3aff' },
            { label: 'GERAÇÃO ATUAL', value: `#${Math.max(...estrategias.map(e => e.geracao))}`, color: '#ff0080' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ ...glass(`${color}25`), borderTop: `2px solid ${color}`, padding: '1rem' }}>
              <div style={{ fontSize: '8px', letterSpacing: '3px', color: 'rgba(255,255,255,0.3)', marginBottom: '0.5rem' }}>{label}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color, textShadow: `0 0 20px ${color}50` }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Formulário nova estratégia */}
        {showForm && (
          <div style={{ ...glass('rgba(0,212,255,0.2)'), marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(0,212,255,0.6)', marginBottom: '1rem' }}>CONFIGURAR NOVA ESTRATÉGIA</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
              {[
                { label: 'NOME', key: 'nome', type: 'text', placeholder: 'Ex: Trend BTC v2' },
                { label: 'CAPITAL ($)', key: 'capital', type: 'number', placeholder: '1000' },
                { label: 'GERAÇÕES GA', key: 'geracoes', type: 'number', placeholder: '20' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <div style={{ fontSize: '8px', letterSpacing: '2px', color: 'rgba(255,255,255,0.3)', marginBottom: '4px' }}>{label}</div>
                  <input value={(form as any)[key]} type={type} placeholder={placeholder}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    style={{ width: '100%', padding: '0.5rem', fontSize: '11px', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: '4px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
              ))}
              <div>
                <div style={{ fontSize: '8px', letterSpacing: '2px', color: 'rgba(255,255,255,0.3)', marginBottom: '4px' }}>TIPO</div>
                <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                  style={{ width: '100%', padding: '0.5rem', fontSize: '11px', background: '#0a0020', border: '0.5px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: '4px', fontFamily: 'inherit' }}>
                  {TIPOS.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: '8px', letterSpacing: '2px', color: 'rgba(255,255,255,0.3)', marginBottom: '4px' }}>PAR</div>
                <select value={form.par} onChange={e => setForm(f => ({ ...f, par: e.target.value }))}
                  style={{ width: '100%', padding: '0.5rem', fontSize: '11px', background: '#0a0020', border: '0.5px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: '4px', fontFamily: 'inherit' }}>
                  {PARES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            {/* Preview tipo */}
            <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', marginBottom: '1rem', display: 'flex', gap: '2rem' }}>
              <div>
                <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.3)', marginBottom: '2px' }}>ESTRATÉGIA</div>
                <div style={{ fontSize: '11px', color: TIPO_CONFIG[form.tipo]?.color }}>{TIPO_CONFIG[form.tipo]?.desc}</div>
              </div>
              <div>
                <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.3)', marginBottom: '2px' }}>RETORNO ESPERADO</div>
                <div style={{ fontSize: '11px', color: '#00ff88' }}>{TIPO_CONFIG[form.tipo]?.retorno}</div>
              </div>
            </div>
            <button onClick={criarEstrategia} style={{
              padding: '0.7rem 2rem', fontSize: '11px', letterSpacing: '3px',
              background: 'linear-gradient(135deg, rgba(0,212,255,0.7), rgba(124,58,255,0.7))',
              border: '1px solid rgba(0,212,255,0.4)', color: '#fff', cursor: 'pointer', borderRadius: '4px',
            }}>▸ CRIAR E OTIMIZAR COM GA</button>
          </div>
        )}

        {/* Lista de estratégias */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {estrategias.map(e => {
            const cfg = TIPO_CONFIG[e.tipo]
            const isOtimizando = otimizando === e.id
            return (
              <div key={e.id} style={{ ...glass(e.ativa ? `${cfg.color}30` : 'rgba(255,255,255,0.08)'), borderLeft: `3px solid ${e.ativa ? cfg.color : 'rgba(255,255,255,0.1)'}`, transition: 'all 0.3s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>

                  {/* Status indicator */}
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: e.ativa ? '#00ff88' : 'rgba(255,255,255,0.2)', boxShadow: e.ativa ? '0 0 10px #00ff88' : 'none' }} />

                  {/* Info principal */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff', letterSpacing: '1px' }}>{e.nome}</span>
                      <span style={{ fontSize: '8px', padding: '2px 8px', borderRadius: '10px', background: cfg.color + '15', color: cfg.color, letterSpacing: '2px' }}>{e.tipo.toUpperCase()}</span>
                      <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>{e.par}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '1.5rem', fontSize: '9px', color: 'rgba(255,255,255,0.35)' }}>
                      <span>Capital: <span style={{ color: '#00d4ff' }}>${e.capital.toLocaleString()}</span></span>
                      <span>Retorno: <span style={{ color: '#00ff88' }}>+{e.retorno_mensal}%/mês</span></span>
                      <span>Trades: <span style={{ color: 'rgba(255,255,255,0.6)' }}>{e.trades}</span></span>
                      <span>Win Rate: <span style={{ color: e.win_rate >= 60 ? '#00ff88' : '#f59e0b' }}>{e.win_rate}%</span></span>
                      <span>Criada: <span style={{ color: 'rgba(255,255,255,0.4)' }}>{e.criada_em}</span></span>
                    </div>
                  </div>

                  {/* Métricas GA */}
                  <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.25)', marginBottom: '2px' }}>FITNESS</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: cfg.color }}>{e.fitness.toFixed(2)}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.25)', marginBottom: '2px' }}>SHARPE</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>{e.sharpe.toFixed(2)}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.25)', marginBottom: '2px' }}>GEN</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#7c3aff' }}>#{e.geracao}</div>
                    </div>
                  </div>

                  {/* Ações */}
                  <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                    <button onClick={() => otimizar(e.id, e.par)} disabled={!!isOtimizando} style={{
                      padding: '0.4rem 0.8rem', fontSize: '9px', letterSpacing: '2px', cursor: 'pointer',
                      background: isOtimizando ? 'rgba(124,58,255,0.3)' : 'rgba(124,58,255,0.15)',
                      border: '0.5px solid rgba(124,58,255,0.4)', color: '#7c3aff', borderRadius: '4px',
                    }}>{isOtimizando ? '⟳ GA...' : '⟁ OTIMIZAR'}</button>

                    <button onClick={() => toggleAtiva(e.id)} style={{
                      padding: '0.4rem 0.8rem', fontSize: '9px', letterSpacing: '2px', cursor: 'pointer',
                      background: e.ativa ? 'rgba(255,0,0,0.1)' : 'rgba(0,255,136,0.1)',
                      border: `0.5px solid ${e.ativa ? 'rgba(255,0,0,0.3)' : 'rgba(0,255,136,0.3)'}`,
                      color: e.ativa ? '#ff4444' : '#00ff88', borderRadius: '4px',
                    }}>{e.ativa ? '◼ PARAR' : '▸ ATIVAR'}</button>

                    <button onClick={() => deletar(e.id)} style={{
                      padding: '0.4rem 0.6rem', fontSize: '9px', cursor: 'pointer',
                      background: 'transparent', border: '0.5px solid rgba(255,255,255,0.1)',
                      color: 'rgba(255,255,255,0.3)', borderRadius: '4px',
                    }}>✕</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
