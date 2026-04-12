'use client'
import { useEffect, useState } from 'react'

const PARTICLES = Array.from({ length: 30 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: Math.random() * 3 + 1,
  speed: Math.random() * 20 + 10,
  delay: Math.random() * 5,
}))

const CHART_DATA = [42, 38, 55, 48, 62, 58, 71, 65, 78, 82, 75, 90]
const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export default function Home() {
  const [gaStatus, setGaStatus] = useState<'checking'|'online'|'offline'>('checking')
  const [backendStatus, setBackendStatus] = useState<'checking'|'online'|'offline'>('checking')
  const [activeBar, setActiveBar] = useState<number|null>(null)
  const [time, setTime] = useState('')
  const [glitch, setGlitch] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toLocaleTimeString('pt-BR')), 1000)
    const g = setInterval(() => { setGlitch(true); setTimeout(() => setGlitch(false), 150) }, 4000)
    return () => { clearInterval(t); clearInterval(g) }
  }, [])

  useEffect(() => {
    fetch('http://localhost:8110/status').then(() => setGaStatus('online')).catch(() => setGaStatus('offline'))
    fetch('http://localhost:3020/api/status').then(() => setBackendStatus('online')).catch(() => setBackendStatus('offline'))
  }, [])

  const maxVal = Math.max(...CHART_DATA)

  return (
    <div style={{ minHeight: '100vh', background: '#020010', fontFamily: '"Courier New", monospace', overflow: 'hidden', position: 'relative' }}>

      {/* Animated background gradient */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 80% 50% at 20% 50%, rgba(99,0,255,0.12) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 80% 20%, rgba(0,200,255,0.08) 0%, transparent 50%), radial-gradient(ellipse 50% 60% at 60% 80%, rgba(255,0,128,0.06) 0%, transparent 50%)' }} />

      {/* Grid */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, backgroundImage: 'linear-gradient(rgba(99,0,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(99,0,255,0.04) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

      {/* Floating particles */}
      {PARTICLES.map(p => (
        <div key={p.id} style={{
          position: 'fixed', zIndex: 1,
          left: `${p.x}%`, top: `${p.y}%`,
          width: `${p.size}px`, height: `${p.size}px`,
          borderRadius: '50%',
          background: p.id % 3 === 0 ? '#7c3aff' : p.id % 3 === 1 ? '#00d4ff' : '#ff0080',
          opacity: 0.4,
          animation: `float ${p.speed}s ease-in-out infinite`,
          animationDelay: `${p.delay}s`,
          boxShadow: `0 0 ${p.size * 4}px currentColor`,
        }} />
      ))}

      {/* Horizontal scan line */}
      <div style={{ position: 'fixed', left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.4), transparent)', zIndex: 2, animation: 'scan 8s linear infinite' }} />

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 10, maxWidth: '1100px', margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem', padding: '0.6rem 1.2rem', background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(124,58,255,0.3)', backdropFilter: 'blur(10px)', borderRadius: '4px' }}>
          <span style={{ fontSize: '10px', letterSpacing: '4px', color: 'rgba(0,212,255,0.7)' }}>◈ FINANMAP CRIPTO v1.0.0</span>
          <span style={{ fontSize: '10px', letterSpacing: '2px', color: 'rgba(124,58,255,0.8)' }}>{time} • BRT</span>
          <span style={{ fontSize: '10px', letterSpacing: '3px', color: 'rgba(0,212,255,0.5)' }}>GA ENGINE ATIVO ◈</span>
        </div>

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={{ fontSize: '10px', letterSpacing: '8px', color: 'rgba(124,58,255,0.6)', marginBottom: '1rem' }}>▸ OTIMIZAÇÃO POR ALGORITMO GENÉTICO ◂</div>

          <h1 style={{
            fontSize: 'clamp(3rem, 8vw, 6rem)',
            fontWeight: 900, margin: 0, lineHeight: 1,
            letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #00d4ff 0%, #7c3aff 50%, #ff0080 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            filter: glitch ? 'blur(2px)' : 'none',
            textShadow: 'none',
            transition: 'filter 0.1s',
          }}>
            FINANMAP
          </h1>
          <h2 style={{
            fontSize: 'clamp(1.5rem, 4vw, 3rem)',
            fontWeight: 300, margin: '0 0 1.5rem',
            letterSpacing: '0.5em',
            color: 'rgba(255,255,255,0.15)',
            textTransform: 'uppercase',
          }}>
            CRIPTO
          </h2>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.35)', letterSpacing: '3px', marginBottom: '2rem' }}>
            PORTFÓLIOS INTELIGENTES • TRADING AUTÔNOMO • BACKTESTING
          </p>

          {/* CTA */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/dashboard" style={{
              padding: '0.8rem 2.5rem',
              background: 'linear-gradient(135deg, rgba(124,58,255,0.8), rgba(0,212,255,0.6))',
              border: '1px solid rgba(124,58,255,0.5)',
              color: '#fff', textDecoration: 'none',
              fontSize: '11px', letterSpacing: '4px', fontWeight: 700,
              backdropFilter: 'blur(10px)', borderRadius: '2px',
              boxShadow: '0 0 30px rgba(124,58,255,0.3)',
            }}>▸ ACESSAR DASHBOARD</a>
            <a href="http://localhost:8110/docs" style={{
              padding: '0.8rem 2rem',
              background: 'rgba(0,212,255,0.05)',
              border: '1px solid rgba(0,212,255,0.25)',
              color: 'rgba(0,212,255,0.8)', textDecoration: 'none',
              fontSize: '11px', letterSpacing: '4px',
              backdropFilter: 'blur(10px)', borderRadius: '2px',
            }}>▸ GA DOCS</a>
          </div>
        </div>

        {/* Cards row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          {[
            { label: 'SALDO TOTAL', value: '$47.382', change: '+3.4%', color: '#00d4ff' },
            { label: 'LUCRO MENSAL', value: '$1.840', change: '+4.0%', color: '#7c3aff' },
            { label: 'WIN RATE', value: '67%', change: '142 trades', color: '#00ff88' },
            { label: 'ESTRATÉGIAS', value: '3 ativas', change: 'GA gen. 47', color: '#ff0080' },
          ].map(({ label, value, change, color }) => (
            <div key={label} style={{
              background: 'rgba(255,255,255,0.03)',
              border: `0.5px solid ${color}30`,
              borderTop: `2px solid ${color}`,
              backdropFilter: 'blur(20px)',
              borderRadius: '4px',
              padding: '1.2rem',
              boxShadow: `0 0 40px ${color}10, inset 0 0 40px rgba(0,0,0,0.2)`,
            }}>
              <div style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(255,255,255,0.3)', marginBottom: '0.5rem' }}>{label}</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color, marginBottom: '0.25rem', textShadow: `0 0 20px ${color}60` }}>{value}</div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', letterSpacing: '2px' }}>{change}</div>
            </div>
          ))}
        </div>

        {/* Chart + Status glass panels */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>

          {/* Chart panel */}
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '0.5px solid rgba(124,58,255,0.2)',
            backdropFilter: 'blur(20px)',
            borderRadius: '8px',
            padding: '1.5rem',
            boxShadow: '0 8px 60px rgba(124,58,255,0.08), inset 0 0 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.2rem' }}>
              <span style={{ fontSize: '10px', letterSpacing: '4px', color: 'rgba(124,58,255,0.7)' }}>PATRIMÔNIO 12M</span>
              <span style={{ fontSize: '10px', color: '#00ff88', letterSpacing: '2px' }}>▲ +113%</span>
            </div>

            {/* Bar chart */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '120px', marginBottom: '0.5rem' }}>
              {CHART_DATA.map((val, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end', cursor: 'pointer' }}
                  onMouseEnter={() => setActiveBar(i)} onMouseLeave={() => setActiveBar(null)}>
                  {activeBar === i && (
                    <div style={{ fontSize: '9px', color: '#00d4ff', letterSpacing: '1px', whiteSpace: 'nowrap' }}>${val}k</div>
                  )}
                  <div style={{
                    width: '100%',
                    height: `${(val / maxVal) * 100}%`,
                    background: activeBar === i
                      ? 'linear-gradient(180deg, #00d4ff, rgba(124,58,255,0.8))'
                      : 'linear-gradient(180deg, rgba(124,58,255,0.6), rgba(0,212,255,0.2))',
                    borderRadius: '2px 2px 0 0',
                    boxShadow: activeBar === i ? '0 0 15px rgba(0,212,255,0.5)' : 'none',
                    transition: 'all 0.2s',
                    border: '0.5px solid rgba(124,58,255,0.3)',
                  }} />
                </div>
              ))}
            </div>

            {/* X axis */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {MONTHS.map((m, i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '8px', color: activeBar === i ? 'rgba(0,212,255,0.8)' : 'rgba(255,255,255,0.2)', letterSpacing: '0px' }}>{m}</div>
              ))}
            </div>
          </div>

          {/* Status + allocation panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Services status */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '0.5px solid rgba(0,212,255,0.15)',
              backdropFilter: 'blur(20px)',
              borderRadius: '8px',
              padding: '1.2rem',
              boxShadow: '0 8px 40px rgba(0,212,255,0.05)',
            }}>
              <div style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(0,212,255,0.5)', marginBottom: '1rem' }}>STATUS DOS SERVIÇOS</div>
              {[
                { name: 'GA ENGINE', port: '8110', status: gaStatus },
                { name: 'BACKEND', port: '3020', status: backendStatus },
                { name: 'FRONTEND', port: '3010', status: 'online' as const },
              ].map(({ name, port, status }) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: '10px', letterSpacing: '2px', color: 'rgba(255,255,255,0.4)' }}>{name}</span>
                  <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)' }}>:{port}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <div style={{
                      width: '6px', height: '6px', borderRadius: '50%',
                      background: status === 'online' ? '#00ff88' : status === 'offline' ? '#ff3333' : '#666',
                      boxShadow: status === 'online' ? '0 0 8px #00ff88' : 'none',
                      animation: status === 'online' ? 'pulse 2s infinite' : 'none',
                    }} />
                    <span style={{ fontSize: '9px', letterSpacing: '2px', color: status === 'online' ? '#00ff88' : status === 'offline' ? '#ff3333' : '#666' }}>
                      {status === 'checking' ? 'SYNC...' : status.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Allocation donut-style */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '0.5px solid rgba(255,0,128,0.15)',
              backdropFilter: 'blur(20px)',
              borderRadius: '8px',
              padding: '1.2rem',
              flex: 1,
              boxShadow: '0 8px 40px rgba(255,0,128,0.05)',
            }}>
              <div style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(255,0,128,0.5)', marginBottom: '1rem' }}>ALOCAÇÃO</div>
              {[
                { name: 'BTC', pct: 45, color: '#f7931a' },
                { name: 'ETH', pct: 28, color: '#627eea' },
                { name: 'SOL', pct: 15, color: '#9945ff' },
                { name: 'USDT', pct: 12, color: '#00d4ff' },
              ].map(({ name, pct, color }) => (
                <div key={name} style={{ marginBottom: '0.6rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span style={{ fontSize: '9px', letterSpacing: '2px', color: 'rgba(255,255,255,0.4)' }}>{name}</span>
                    <span style={{ fontSize: '9px', color }}>{pct}%</span>
                  </div>
                  <div style={{ height: '3px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}80)`, boxShadow: `0 0 8px ${color}`, borderRadius: '2px', transition: 'width 1s ease' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom strategies row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          {[
            { name: 'TREND FOLLOW BTC', tipo: 'TRADING', fitness: 1.82, gen: 47, color: '#00d4ff', retorno: '+4.2%' },
            { name: 'GRID ETH/USDT', tipo: 'GRID', fitness: 1.51, gen: 31, color: '#7c3aff', retorno: '+2.1%' },
            { name: 'DCA SEMANAL', tipo: 'DCA', fitness: 1.23, gen: 12, color: '#ff0080', retorno: '+1.8%' },
          ].map(({ name, tipo, fitness, gen, color, retorno }) => (
            <div key={name} style={{
              background: 'rgba(255,255,255,0.02)',
              border: `0.5px solid ${color}20`,
              borderLeft: `2px solid ${color}`,
              backdropFilter: 'blur(20px)',
              borderRadius: '4px',
              padding: '1rem',
              boxShadow: `0 0 30px ${color}08`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '9px', letterSpacing: '2px', color, background: `${color}15`, padding: '2px 6px', borderRadius: '2px' }}>{tipo}</span>
                <span style={{ fontSize: '9px', color: '#00ff88' }}>{retorno}/mês</span>
              </div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '2px', marginBottom: '0.5rem' }}>{name}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}>
                <span>FITNESS: <span style={{ color }}>{fitness}</span></span>
                <span>GEN #{gen}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: '2rem', fontSize: '9px', letterSpacing: '3px', color: 'rgba(255,255,255,0.1)' }}>
          FINANMAP CRIPTO • POWERED BY GENETIC ALGORITHM • {new Date().getFullYear()}
        </div>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) translateX(0px); opacity: 0.3; }
          33% { transform: translateY(-20px) translateX(10px); opacity: 0.6; }
          66% { transform: translateY(10px) translateX(-10px); opacity: 0.2; }
        }
        @keyframes scan {
          0% { top: -1px; }
          100% { top: 100vh; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px #00ff88; }
          50% { opacity: 0.5; box-shadow: 0 0 20px #00ff88; }
        }
      `}</style>
    </div>
  )
}
