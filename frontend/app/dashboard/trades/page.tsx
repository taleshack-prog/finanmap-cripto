'use client'
import { useState } from 'react'

const MOCK_TRADES = [
  { id: '1', par: 'BTC/USDT', tipo: 'compra',  qtd: 0.05,  entrada: 71200,  saida: 74100,  lucro: 145,   pct: 4.07,  status: 'fechado',  estrategia: 'Trend Follow BTC', data: '13/04 08:32', taxa: 2.1  },
  { id: '2', par: 'ETH/USDT', tipo: 'venda',   qtd: 0.8,   entrada: 2420,   saida: 2374,   lucro: -36.8, pct: -1.90, status: 'fechado',  estrategia: 'Grid ETH/USDT',    data: '13/04 07:15', taxa: 1.8  },
  { id: '3', par: 'SOL/USDT', tipo: 'compra',  qtd: 5.0,   entrada: 82.5,   saida: null,   lucro: 17.85, pct: 4.33,  status: 'aberto',   estrategia: 'Trend Follow BTC', data: '13/04 06:48', taxa: 0.4  },
  { id: '4', par: 'BTC/USDT', tipo: 'venda',   qtd: 0.02,  entrada: 74200,  saida: 73800,  lucro: -8,    pct: -0.54, status: 'fechado',  estrategia: 'Grid ETH/USDT',    data: '12/04 23:10', taxa: 1.5  },
  { id: '5', par: 'BNB/USDT', tipo: 'compra',  qtd: 2.0,   entrada: 580,    saida: 601,    lucro: 42,    pct: 3.62,  status: 'fechado',  estrategia: 'DCA Semanal',      data: '12/04 21:05', taxa: 1.2  },
  { id: '6', par: 'ETH/USDT', tipo: 'compra',  qtd: 1.5,   entrada: 2310,   saida: 2374,   lucro: 96,    pct: 2.77,  status: 'fechado',  estrategia: 'Trend Follow BTC', data: '12/04 18:30', taxa: 3.5  },
  { id: '7', par: 'SOL/USDT', tipo: 'venda',   qtd: 10.0,  entrada: 88,     saida: 86.2,   lucro: -18,   pct: -2.05, status: 'fechado',  estrategia: 'Grid ETH/USDT',    data: '12/04 15:22', taxa: 0.9  },
  { id: '8', par: 'BTC/USDT', tipo: 'compra',  qtd: 0.03,  entrada: 70800,  saida: 74100,  lucro: 99,    pct: 4.66,  status: 'fechado',  estrategia: 'DCA Semanal',      data: '11/04 09:00', taxa: 2.2  },
  { id: '9', par: 'XRP/USDT', tipo: 'compra',  qtd: 500,   entrada: 2.12,   saida: null,   lucro: 14.5,  pct: 1.37,  status: 'aberto',   estrategia: 'Trend Follow BTC', data: '11/04 08:15', taxa: 1.1  },
  { id:'10', par: 'ADA/USDT', tipo: 'venda',   qtd: 1000,  entrada: 0.75,   saida: 0.72,   lucro: -30,   pct: -4.00, status: 'cancelado',estrategia: 'Grid ETH/USDT',    data: '10/04 20:00', taxa: 0.0  },
]

const glass = (accent = 'rgba(124,58,255,0.2)') => ({
  background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${accent}`,
  backdropFilter: 'blur(20px)', borderRadius: '8px', padding: '1.25rem',
} as React.CSSProperties)

export default function TradesPage() {
  const [filtroStatus, setFiltroStatus]     = useState('todos')
  const [filtroPar, setFiltroPar]           = useState('todos')
  const [filtroTipo, setFiltroTipo]         = useState('todos')

  const trades = MOCK_TRADES.filter(t => {
    if (filtroStatus !== 'todos' && t.status !== filtroStatus) return false
    if (filtroPar !== 'todos' && t.par !== filtroPar)           return false
    if (filtroTipo !== 'todos' && t.tipo !== filtroTipo)        return false
    return true
  })

  const fechados   = MOCK_TRADES.filter(t => t.status === 'fechado')
  const lucroTotal = fechados.reduce((s, t) => s + t.lucro, 0)
  const wins       = fechados.filter(t => t.lucro > 0).length
  const winRate    = fechados.length > 0 ? (wins / fechados.length * 100).toFixed(1) : '0'
  const pares      = [...new Set(MOCK_TRADES.map(t => t.par))]

  return (
    <div style={{ fontFamily: '"Courier New", monospace', color: '#fff' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 50% 40% at 80% 60%, rgba(0,212,255,0.05) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '10px', letterSpacing: '6px', color: 'rgba(0,212,255,0.5)', marginBottom: '4px' }}>HISTÓRICO</div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, background: 'linear-gradient(135deg, #00d4ff, #7c3aff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Trades</h1>
        </div>

        {/* Métricas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {[
            { label: 'TOTAL TRADES',  value: MOCK_TRADES.length.toString(),        color: '#00d4ff' },
            { label: 'FECHADOS',      value: fechados.length.toString(),            color: '#7c3aff' },
            { label: 'WIN RATE',      value: `${winRate}%`,                         color: '#00ff88' },
            { label: 'LUCRO TOTAL',   value: `${lucroTotal >= 0 ? '+' : ''}$${lucroTotal.toFixed(0)}`, color: lucroTotal >= 0 ? '#00ff88' : '#ff4444' },
            { label: 'ABERTOS',       value: MOCK_TRADES.filter(t => t.status === 'aberto').length.toString(), color: '#f59e0b' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ ...glass(`${color}25`), borderTop: `2px solid ${color}`, padding: '1rem' }}>
              <div style={{ fontSize: '8px', letterSpacing: '3px', color: 'rgba(255,255,255,0.3)', marginBottom: '0.5rem' }}>{label}</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Lucro acumulado mini chart */}
        <div style={{ ...glass('rgba(0,212,255,0.15)'), marginBottom: '1rem' }}>
          <div style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(0,212,255,0.5)', marginBottom: '1rem' }}>LUCRO ACUMULADO</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '60px' }}>
            {(() => {
              let acc = 0
              return fechados.map((t, i) => {
                acc += t.lucro
                const max = 400
                const h = Math.abs(acc) / max * 100
                return (
                  <div key={i} style={{
                    flex: 1, height: `${Math.min(h, 100)}%`,
                    background: acc >= 0 ? 'rgba(0,255,136,0.5)' : 'rgba(255,68,68,0.5)',
                    borderRadius: '2px 2px 0 0', minHeight: '2px',
                    boxShadow: acc >= 0 ? '0 0 4px rgba(0,255,136,0.3)' : '0 0 4px rgba(255,68,68,0.3)',
                  }} />
                )
              })
            })()}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '8px', color: 'rgba(255,255,255,0.2)' }}>
            <span>Trade #1</span><span>Acumulado: <span style={{ color: lucroTotal >= 0 ? '#00ff88' : '#ff4444' }}>${lucroTotal.toFixed(0)}</span></span><span>Trade #{fechados.length}</span>
          </div>
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {['todos', 'fechado', 'aberto', 'cancelado'].map(f => (
              <button key={f} onClick={() => setFiltroStatus(f)} style={{
                padding: '0.3rem 0.8rem', fontSize: '9px', letterSpacing: '2px', cursor: 'pointer', borderRadius: '20px',
                background: filtroStatus === f ? 'rgba(124,58,255,0.3)' : 'transparent',
                border: `0.5px solid ${filtroStatus === f ? '#7c3aff' : 'rgba(255,255,255,0.1)'}`,
                color: filtroStatus === f ? '#7c3aff' : 'rgba(255,255,255,0.35)',
              }}>{f.toUpperCase()}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {['todos', 'compra', 'venda'].map(f => (
              <button key={f} onClick={() => setFiltroTipo(f)} style={{
                padding: '0.3rem 0.8rem', fontSize: '9px', letterSpacing: '2px', cursor: 'pointer', borderRadius: '20px',
                background: filtroTipo === f ? (f === 'compra' ? 'rgba(0,255,136,0.2)' : f === 'venda' ? 'rgba(255,68,68,0.2)' : 'rgba(124,58,255,0.2)') : 'transparent',
                border: `0.5px solid ${filtroTipo === f ? (f === 'compra' ? '#00ff88' : f === 'venda' ? '#ff4444' : '#7c3aff') : 'rgba(255,255,255,0.1)'}`,
                color: filtroTipo === f ? (f === 'compra' ? '#00ff88' : f === 'venda' ? '#ff4444' : '#7c3aff') : 'rgba(255,255,255,0.35)',
              }}>{f.toUpperCase()}</button>
            ))}
          </div>
          <select value={filtroPar} onChange={e => setFiltroPar(e.target.value)} style={{
            padding: '0.3rem 0.8rem', fontSize: '9px', background: '#0a0020',
            border: '0.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)',
            borderRadius: '4px', fontFamily: 'inherit', letterSpacing: '2px',
          }}>
            <option value="todos">TODOS OS PARES</option>
            {pares.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginLeft: 'auto' }}>{trades.length} trades</span>
        </div>

        {/* Tabela */}
        <div style={glass('rgba(124,58,255,0.15)')}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
                {['PAR', 'TIPO', 'QTD', 'ENTRADA', 'SAÍDA', 'LUCRO', '%', 'STATUS', 'ESTRATÉGIA', 'DATA'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '0 0 10px', fontSize: '8px', letterSpacing: '2px', color: 'rgba(255,255,255,0.25)', fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trades.map(t => (
                <tr key={t.id} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '9px 0', fontWeight: 700, color: '#fff', letterSpacing: '1px' }}>{t.par}</td>
                  <td style={{ padding: '9px 0' }}>
                    <span style={{ fontSize: '8px', padding: '2px 6px', borderRadius: '10px', background: t.tipo === 'compra' ? 'rgba(0,255,136,0.1)' : 'rgba(255,68,68,0.1)', color: t.tipo === 'compra' ? '#00ff88' : '#ff4444', letterSpacing: '1px' }}>
                      {t.tipo.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '9px 0', color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' }}>{t.qtd}</td>
                  <td style={{ padding: '9px 0', color: 'rgba(255,255,255,0.6)' }}>${t.entrada.toLocaleString()}</td>
                  <td style={{ padding: '9px 0', color: 'rgba(255,255,255,0.6)' }}>{t.saida ? `$${t.saida.toLocaleString()}` : '—'}</td>
                  <td style={{ padding: '9px 0', fontWeight: 700, color: t.lucro >= 0 ? '#00ff88' : '#ff4444' }}>
                    {t.lucro >= 0 ? '+' : ''}${t.lucro.toFixed(1)}
                  </td>
                  <td style={{ padding: '9px 0', color: t.pct >= 0 ? '#00ff88' : '#ff4444' }}>
                    {t.pct >= 0 ? '+' : ''}{t.pct.toFixed(2)}%
                  </td>
                  <td style={{ padding: '9px 0' }}>
                    <span style={{ fontSize: '8px', padding: '2px 6px', borderRadius: '10px', letterSpacing: '1px',
                      background: t.status === 'aberto' ? 'rgba(245,158,11,0.15)' : t.status === 'fechado' ? 'rgba(0,255,136,0.08)' : 'rgba(255,255,255,0.05)',
                      color: t.status === 'aberto' ? '#f59e0b' : t.status === 'fechado' ? 'rgba(0,255,136,0.6)' : 'rgba(255,255,255,0.25)',
                    }}>{t.status.toUpperCase()}</span>
                  </td>
                  <td style={{ padding: '9px 0', fontSize: '9px', color: 'rgba(255,255,255,0.35)' }}>{t.estrategia}</td>
                  <td style={{ padding: '9px 0', fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}>{t.data}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
