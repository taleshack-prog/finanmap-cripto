'use client'
import { useEffect, useState } from 'react'

export default function Home() {
  const [tick, setTick] = useState(0)
  const [gaStatus, setGaStatus] = useState('verificando...')
  const [backendStatus, setBackendStatus] = useState('verificando...')

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 50)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    fetch('http://localhost:8110/status')
      .then(r => r.json())
      .then(() => setGaStatus('ONLINE'))
      .catch(() => setGaStatus('OFFLINE'))

    fetch('http://localhost:3020/api/status')
      .then(r => r.json())
      .then(() => setBackendStatus('ONLINE'))
      .catch(() => setBackendStatus('OFFLINE'))
  }, [])

  const chars = '01アイウエオカキクケコ∑∆∏∫≈≠'
  const rain = Array.from({length: 20}, (_, i) =>
    chars[Math.floor((tick * (i + 1) * 0.3) % chars.length)]
  )

  return (
    <div style={{
      minHeight: '100vh',
      background: '#000',
      color: '#00ff41',
      fontFamily: '"Courier New", monospace',
      overflow: 'hidden',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    }}>

      {/* Grid background */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: 'linear-gradient(rgba(0,255,65,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,65,0.03) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      {/* Matrix rain */}
      <div style={{position:'fixed', top:0, left:0, right:0, zIndex:1, display:'flex', justifyContent:'space-around', opacity:0.15, fontSize:'12px', letterSpacing:'2px'}}>
        {rain.map((c, i) => (
          <span key={i} style={{animation: `fall${i%3} 3s linear infinite`, animationDelay:`${i*0.2}s`}}>{c}</span>
        ))}
      </div>

      {/* Main content */}
      <div style={{position:'relative', zIndex:10, textAlign:'center', padding:'2rem'}}>

        {/* Glitch title */}
        <div style={{marginBottom:'0.5rem', fontSize:'11px', letterSpacing:'8px', color:'#00ff41', opacity:0.6}}>
          ▸ SISTEMA INICIADO ◂
        </div>

        <h1 style={{
          fontSize: 'clamp(2rem, 6vw, 4.5rem)',
          fontWeight: 900,
          letterSpacing: '-0.02em',
          margin: '0 0 0.25rem',
          textShadow: '0 0 30px #00ff41, 0 0 60px #00ff4180',
          lineHeight: 1,
        }}>
          FINANMAP
        </h1>
        <h1 style={{
          fontSize: 'clamp(2rem, 6vw, 4.5rem)',
          fontWeight: 900,
          letterSpacing: '0.3em',
          margin: '0 0 2rem',
          color: '#ff6b35',
          textShadow: '0 0 30px #ff6b35, 0 0 60px #ff6b3580',
          lineHeight: 1,
        }}>
          CRIPTO
        </h1>

        <div style={{fontSize:'12px', letterSpacing:'4px', color:'#00ff41', opacity:0.5, marginBottom:'3rem'}}>
          ALGORITMO GENÉTICO • OTIMIZAÇÃO DE PORTFÓLIOS
        </div>

        {/* Status panel */}
        <div style={{
          border: '1px solid #00ff4140',
          padding: '1.5rem 2.5rem',
          marginBottom: '3rem',
          background: 'rgba(0,255,65,0.03)',
          backdropFilter: 'blur(4px)',
          minWidth: '320px',
        }}>
          <div style={{fontSize:'10px', letterSpacing:'6px', marginBottom:'1rem', opacity:0.5}}>
            STATUS DOS SERVIÇOS
          </div>

          {[
            { label: 'GA ENGINE', port: '8110', status: gaStatus, href: 'http://localhost:8110/docs' },
            { label: 'BACKEND API', port: '3020', status: backendStatus, href: 'http://localhost:3020/api/status' },
            { label: 'FRONTEND', port: '3010', status: 'ONLINE', href: '#' },
          ].map(({ label, port, status, href }) => (
            <div key={label} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.5rem 0', borderBottom:'1px solid #00ff4115'}}>
              <span style={{fontSize:'11px', letterSpacing:'2px', opacity:0.7}}>{label}</span>
              <span style={{fontSize:'11px', opacity:0.4}}>:{port}</span>
              <a href={href} style={{
                fontSize:'11px', letterSpacing:'2px', textDecoration:'none', padding:'2px 10px',
                border: `1px solid ${status === 'ONLINE' ? '#00ff41' : status === 'OFFLINE' ? '#ff3333' : '#666'}`,
                color: status === 'ONLINE' ? '#00ff41' : status === 'OFFLINE' ? '#ff3333' : '#666',
                background: status === 'ONLINE' ? 'rgba(0,255,65,0.1)' : 'transparent',
              }}>
                {status === 'ONLINE' ? '● ' : status === 'OFFLINE' ? '✕ ' : '○ '}{status}
              </a>
            </div>
          ))}
        </div>

        {/* CTA buttons */}
        <div style={{display:'flex', gap:'1rem', justifyContent:'center', flexWrap:'wrap'}}>
          <a href="/dashboard" style={{
            padding:'0.75rem 2rem', border:'1px solid #00ff41',
            color:'#000', background:'#00ff41', textDecoration:'none',
            fontSize:'12px', letterSpacing:'4px', fontWeight:700,
            transition:'all 0.2s',
          }}>
            ▸ DASHBOARD
          </a>
          <a href="http://localhost:8110/docs" style={{
            padding:'0.75rem 2rem', border:'1px solid #00ff4160',
            color:'#00ff41', background:'transparent', textDecoration:'none',
            fontSize:'12px', letterSpacing:'4px',
          }}>
            ▸ GA DOCS
          </a>
        </div>

        <div style={{marginTop:'3rem', fontSize:'10px', letterSpacing:'3px', opacity:0.3}}>
          {new Date().toISOString()} • v1.0.0
        </div>
      </div>

      <style>{`
        @keyframes fall0 { 0%{transform:translateY(-20px);opacity:0} 50%{opacity:1} 100%{transform:translateY(100vh);opacity:0} }
        @keyframes fall1 { 0%{transform:translateY(-40px);opacity:0} 50%{opacity:1} 100%{transform:translateY(100vh);opacity:0} }
        @keyframes fall2 { 0%{transform:translateY(-60px);opacity:0} 50%{opacity:1} 100%{transform:translateY(100vh);opacity:0} }
      `}</style>
    </div>
  )
}
