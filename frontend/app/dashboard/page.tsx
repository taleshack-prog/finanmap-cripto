'use client'
import { useEffect, useState } from 'react'

const API = 'http://localhost:3020'
const GA  = 'http://localhost:8110'

const CHART = [42,38,55,48,62,58,71,65,78,82,75,90]
const MONTHS = ['J','F','M','A','M','J','J','A','S','O','N','D']

interface ServiceStatus { backend: string; ga: string }
interface Trade { par: string; tipo: string; lucro: number; status: string; timestamp: string }

const glass = (accent = 'rgba(124,58,255,0.2)') => ({
  background: 'rgba(255,255,255,0.02)',
  border: `0.5px solid ${accent}`,
  backdropFilter: 'blur(20px)',
  borderRadius: '8px',
  padding: '1.25rem',
  boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
} as React.CSSProperties)

export default function DashboardPage() {
  const [services, setServices] = useState<ServiceStatus>({ backend: 'checking', ga: 'checking' })
  const [activeBar, setActiveBar] = useState<number | null>(null)
  const [trades] = useState<Trade[]>([
    { par: 'BTC/USDT', tipo: 'compra', lucro: 124, status: 'fechado', timestamp: '12/04 08:32' },
    { par: 'ETH/USDT', tipo: 'venda',  lucro: 67,  status: 'fechado', timestamp: '12/04 07:15' },
    { par: 'SOL/USDT', tipo: 'compra', lucro: -23, status: 'aberto',  timestamp: '12/04 06:48' },
    { par: 'BTC/USDT', tipo: 'venda',  lucro: 88,  status: 'fechado', timestamp: '11/04 23:10' },
    { par: 'ETH/USDT', tipo: 'compra', lucro: 45,  status: 'fechado', timestamp: '11/04 21:05' },
  ])

  useEffect(() => {
    const check = async () => {
      const [b, g] = await Promise.all([
        fetch(`${API}/api/status`).then(() => 'online').catch(() => 'offline'),
        fetch(`${GA}/status`).then(() => 'online').catch(() => 'offline'),
      ])
      setServices({ backend: b, ga: g })
    }
    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [])

  const maxVal = Math.max(...CHART)

  const METRICS = [
    { label: 'SALDO TOTAL',    value: '$47.382', change: '↑ +3,4% 24h',  color: '#00d4ff' },
    { label: 'LUCRO MENSAL',   value: '$1.840',  change: '↑ +4,0% vs mês', color: '#7c3aff' },
    { label: 'WIN RATE',       value: '67%',     change: '142 trades',    color: '#00ff88' },
    { label: 'ESTRATÉGIAS',    value: '3 ativas', change: 'GA gen. #47', color: '#ff0080' },
    { label: 'SHARPE RATIO',   value: '1.82',    change: 'Sortino 2.1',  color: '#f59e0b' },
    { label: 'MAX DRAWDOWN',   value: '-8.3%',   change: 'últ. 30 dias', color: '#ff6b35' },
  ]

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '10px', letterSpacing: '6px', color: 'rgba(124,58,255,0.5)', marginBottom: '4px' }}>VISÃO GERAL</div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, background: 'linear-gradient(135deg, #00d4ff, #7c3aff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Dashboard</h1>
      </div>

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {METRICS.map(({ label, value, change, color }) => (
          <div key={label} style={{ ...glass(`${color}25`), borderTop: `2px solid ${color}`, padding: '1rem' }}>
            <div style={{ fontSize: '8px', letterSpacing: '3px', color: 'rgba(255,255,255,0.3)', marginBottom: '0.5rem' }}>{label}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color, textShadow: `0 0 20px ${color}50`, marginBottom: '0.25rem', lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', letterSpacing: '1px' }}>{change}</div>
          </div>
        ))}
      </div>

      {/* Chart + Services row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: '1rem', marginBottom: '1rem' }}>

        {/* Patrimônio chart */}
        <div style={glass('rgba(124,58,255,0.2)')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
            <span style={{ fontSize: '10px', letterSpacing: '4px', color: 'rgba(124,58,255,0.7)' }}>PATRIMÔNIO 12 MESES</span>
            <span style={{ fontSize: '10px', color: '#00ff88', letterSpacing: '2px' }}>▲ +113%</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '140px', marginBottom: '8px' }}>
            {CHART.map((val, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', cursor: 'pointer', gap: '4px' }}
                onMouseEnter={() => setActiveBar(i)} onMouseLeave={() => setActiveBar(null)}>
                {activeBar === i && <div style={{ fontSize: '8px', color: '#00d4ff', whiteSpace: 'nowrap' }}>${val}k</div>}
                <div style={{
                  width: '100%',
                  height: `${(val / maxVal) * 100}%`,
                  background: activeBar === i ? 'linear-gradient(180deg, #00d4ff, rgba(124,58,255,0.9))' : 'linear-gradient(180deg, rgba(124,58,255,0.7), rgba(0,212,255,0.2))',
                  borderRadius: '3px 3px 0 0',
                  boxShadow: activeBar === i ? '0 0 15px rgba(0,212,255,0.6)' : 'none',
                  transition: 'all 0.2s',
                  border: '0.5px solid rgba(124,58,255,0.3)',
                }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {MONTHS.map((m, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '8px', color: activeBar === i ? '#00d4ff' : 'rgba(255,255,255,0.2)' }}>{m}</div>
            ))}
          </div>
        </div>

        {/* Services + Allocation */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Services */}
          <div style={glass('rgba(0,212,255,0.15)')}>
            <div style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(0,212,255,0.5)', marginBottom: '1rem' }}>SERVIÇOS</div>
            {[
              { name: 'GA ENGINE', port: '8110', status: services.ga },
              { name: 'BACKEND',   port: '3020', status: services.backend },
              { name: 'FRONTEND',  port: '3010', status: 'online' },
            ].map(({ name, port, status }) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: '9px', letterSpacing: '2px', color: 'rgba(255,255,255,0.4)' }}>{name}</span>
                <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)' }}>:{port}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: status === 'online' ? '#00ff88' : status === 'offline' ? '#ff3333' : '#666', boxShadow: status === 'online' ? '0 0 6px #00ff88' : 'none' }} />
                  <span style={{ fontSize: '9px', letterSpacing: '1px', color: status === 'online' ? '#00ff88' : status === 'offline' ? '#ff3333' : '#666' }}>
                    {status === 'checking' ? 'SYNC' : status.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Allocation */}
          <div style={{ ...glass('rgba(255,0,128,0.15)'), flex: 1 }}>
            <div style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(255,0,128,0.5)', marginBottom: '1rem' }}>ALOCAÇÃO</div>
            {[
              { name: 'BTC',  pct: 45, color: '#f7931a', val: '$21.3k' },
              { name: 'ETH',  pct: 28, color: '#627eea', val: '$13.3k' },
              { name: 'SOL',  pct: 15, color: '#9945ff', val: '$7.1k'  },
              { name: 'USDT', pct: 12, color: '#00d4ff', val: '$5.7k'  },
            ].map(({ name, pct, color, val }) => (
              <div key={name} style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span style={{ fontSize: '9px', letterSpacing: '2px', color: 'rgba(255,255,255,0.5)' }}>{name}</span>
                  <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}>{val}</span>
                  <span style={{ fontSize: '9px', color }}>{pct}%</span>
                </div>
                <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}60)`, boxShadow: `0 0 6px ${color}`, borderRadius: '2px' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Strategies + Trades row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '1rem' }}>

        {/* Strategies */}
        <div style={glass('rgba(124,58,255,0.2)')}>
          <div style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(124,58,255,0.6)', marginBottom: '1rem' }}>ESTRATÉGIAS GA ATIVAS</div>
          {[
            { name: 'TREND FOLLOW BTC', tipo: 'TRADING', fitness: 1.82, gen: 47, color: '#00d4ff', ret: '+4.2%' },
            { name: 'GRID ETH/USDT',    tipo: 'GRID',    fitness: 1.51, gen: 31, color: '#7c3aff', ret: '+2.1%' },
            { name: 'DCA SEMANAL',      tipo: 'DCA',     fitness: 1.23, gen: 12, color: '#ff0080', ret: '+1.8%' },
          ].map(({ name, tipo, fitness, gen, color, ret }) => (
            <div key={name} style={{ padding: '0.75rem', marginBottom: '0.5rem', background: 'rgba(255,255,255,0.02)', borderLeft: `2px solid ${color}`, borderRadius: '0 4px 4px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '9px', color, letterSpacing: '2px', background: `${color}15`, padding: '1px 6px', borderRadius: '2px' }}>{tipo}</span>
                <span style={{ fontSize: '9px', color: '#00ff88' }}>{ret}/mês</span>
              </div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '1px', marginBottom: '4px' }}>{name}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}>
                <span>FIT: <span style={{ color }}>{fitness}</span></span>
                <span>GEN #{gen}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Trades */}
        <div style={glass('rgba(0,212,255,0.15)')}>
          <div style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(0,212,255,0.5)', marginBottom: '1rem' }}>ÚLTIMOS TRADES</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
                {['PAR','TIPO','LUCRO','STATUS','DATA'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '0 0 8px', fontSize: '8px', letterSpacing: '2px', color: 'rgba(255,255,255,0.25)', fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trades.map((t, i) => (
                <tr key={i} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '8px 0', fontWeight: 700, color: 'rgba(255,255,255,0.8)', letterSpacing: '1px' }}>{t.par}</td>
                  <td style={{ padding: '8px 0' }}>
                    <span style={{ fontSize: '8px', padding: '2px 6px', borderRadius: '2px', background: t.tipo === 'compra' ? 'rgba(0,255,136,0.1)' : 'rgba(255,0,128,0.1)', color: t.tipo === 'compra' ? '#00ff88' : '#ff0080', letterSpacing: '1px' }}>
                      {t.tipo.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '8px 0', color: t.lucro >= 0 ? '#00ff88' : '#ff3333', fontWeight: 700 }}>
                    {t.lucro >= 0 ? '+' : ''}${t.lucro}
                  </td>
                  <td style={{ padding: '8px 0' }}>
                    <span style={{ fontSize: '8px', color: t.status === 'aberto' ? '#f59e0b' : 'rgba(255,255,255,0.3)', letterSpacing: '1px' }}>
                      {t.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '8px 0', fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}>{t.timestamp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
