'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/dashboard', label: 'OVERVIEW', icon: '◈' },
  { href: '/dashboard/portfolio', label: 'PORTFÓLIO', icon: '◎' },
  { href: '/dashboard/strategies', label: 'ESTRATÉGIAS', icon: '⟁' },
  { href: '/dashboard/trades', label: 'TRADES', icon: '⇅' },
  { href: '/dashboard/fire', label: 'FIRE', icon: '◐' },
  { href: '/dashboard/backtests', label: 'BACKTESTS', icon: '↻' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#020010', fontFamily: '"Courier New", monospace', color: '#fff' }}>

      {/* Background */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 60% 50% at 10% 50%, rgba(99,0,255,0.08) 0%, transparent 60%), radial-gradient(ellipse 40% 40% at 90% 20%, rgba(0,200,255,0.05) 0%, transparent 50%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, backgroundImage: 'linear-gradient(rgba(99,0,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(99,0,255,0.03) 1px, transparent 1px)', backgroundSize: '60px 60px', pointerEvents: 'none' }} />

      {/* Sidebar */}
      <aside style={{
        width: '200px', flexShrink: 0,
        background: 'rgba(255,255,255,0.02)',
        borderRight: '0.5px solid rgba(124,58,255,0.2)',
        backdropFilter: 'blur(20px)',
        padding: '1.5rem 0',
        position: 'fixed', top: 0, left: 0, bottom: 0,
        zIndex: 100, display: 'flex', flexDirection: 'column',
      }}>
        {/* Logo */}
        <div style={{ padding: '0 1.2rem 1.5rem', borderBottom: '0.5px solid rgba(124,58,255,0.15)' }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <div style={{ fontSize: '14px', fontWeight: 900, letterSpacing: '2px', background: 'linear-gradient(135deg, #00d4ff, #7c3aff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>FINANMAP</div>
            <div style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(255,255,255,0.25)', marginTop: '2px' }}>CRIPTO v1.0</div>
          </Link>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '1rem 0' }}>
          {NAV.map(({ href, label, icon }) => {
            const active = pathname === href
            return (
              <Link key={href} href={href} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '0.65rem 1.2rem',
                textDecoration: 'none',
                fontSize: '10px', letterSpacing: '2px',
                color: active ? '#00d4ff' : 'rgba(255,255,255,0.3)',
                background: active ? 'rgba(0,212,255,0.06)' : 'transparent',
                borderLeft: active ? '2px solid #00d4ff' : '2px solid transparent',
                transition: 'all 0.2s',
              }}>
                <span style={{ fontSize: '14px', opacity: active ? 1 : 0.5 }}>{icon}</span>
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Bottom status */}
        <div style={{ padding: '1rem 1.2rem', borderTop: '0.5px solid rgba(124,58,255,0.15)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 6px #00ff88', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: '9px', letterSpacing: '2px', color: 'rgba(255,255,255,0.3)' }}>GA ATIVO</span>
          </div>
          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.15)', letterSpacing: '1px' }}>GEN #47 • FIT 1.82</div>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, marginLeft: '200px', position: 'relative', zIndex: 10, minHeight: '100vh' }}>
        {/* Top bar */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 50,
          background: 'rgba(2,0,16,0.8)',
          backdropFilter: 'blur(20px)',
          borderBottom: '0.5px solid rgba(124,58,255,0.15)',
          padding: '0.75rem 1.5rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: '10px', letterSpacing: '4px', color: 'rgba(124,58,255,0.6)' }}>
            {NAV.find(n => n.pathname === pathname)?.label || 'DASHBOARD'}
          </span>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span style={{ fontSize: '9px', letterSpacing: '2px', color: 'rgba(255,255,255,0.2)' }}>
              {new Date().toLocaleDateString('pt-BR')}
            </span>
            <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.1)' }} />
            <span style={{ fontSize: '9px', letterSpacing: '2px', color: '#00ff88' }}>● ONLINE</span>
          </div>
        </div>

        <div style={{ padding: '1.5rem' }}>
          {children}
        </div>
      </main>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; } 50% { opacity: 0.4; }
        }
        a:hover { opacity: 0.8 !important; }
      `}</style>
    </div>
  )
}
