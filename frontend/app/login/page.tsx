'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const API = 'http://localhost:3020'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode]       = useState<'login' | 'register'>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [form, setForm]       = useState({ email: '', nome: '', senha: '' })

  const handleSubmit = async () => {
    setError(''); setLoading(true)
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const body     = mode === 'login'
        ? { email: form.email, senha: form.senha }
        : { email: form.email, nome: form.nome, senha: form.senha }

      const r = await fetch(`${API}${endpoint}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })

      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Erro desconhecido')

      localStorage.setItem('finanmap_token', data.token)
      localStorage.setItem('finanmap_user',  JSON.stringify(data.user))
      window.location.href = '/dashboard'
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#020010',
      fontFamily: '"Courier New", monospace',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Background */}
      <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(124,58,255,0.08) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(99,0,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(99,0,255,0.03) 1px, transparent 1px)', backgroundSize: '60px 60px', pointerEvents: 'none' }} />

      {/* Card */}
      <div style={{
        position: 'relative', zIndex: 10,
        width: '100%', maxWidth: '400px',
        background: 'rgba(255,255,255,0.02)',
        border: '0.5px solid rgba(124,58,255,0.3)',
        backdropFilter: 'blur(20px)',
        borderRadius: '12px',
        padding: '2.5rem',
        boxShadow: '0 0 60px rgba(124,58,255,0.1)',
        margin: '1rem',
      }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '2px', background: 'linear-gradient(135deg, #00d4ff, #7c3aff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '4px' }}>
            FINANMAP
          </div>
          <div style={{ fontSize: '10px', letterSpacing: '6px', color: 'rgba(255,255,255,0.25)' }}>CRIPTO v1.0</div>
        </div>

        {/* Toggle login/register */}
        <div style={{ display: 'flex', marginBottom: '1.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', padding: '3px', border: '0.5px solid rgba(255,255,255,0.08)' }}>
          {(['login', 'register'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setError('') }} style={{
              flex: 1, padding: '0.5rem', fontSize: '10px', letterSpacing: '3px',
              cursor: 'pointer', borderRadius: '4px', transition: 'all 0.2s', border: 'none',
              background: mode === m ? 'rgba(124,58,255,0.4)' : 'transparent',
              color: mode === m ? '#fff' : 'rgba(255,255,255,0.3)',
            }}>
              {m === 'login' ? 'ENTRAR' : 'CADASTRAR'}
            </button>
          ))}
        </div>

        {/* Campos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {mode === 'register' && (
            <div>
              <div style={{ fontSize: '8px', letterSpacing: '3px', color: 'rgba(255,255,255,0.3)', marginBottom: '5px' }}>NOME</div>
              <input
                placeholder="Seu nome"
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                style={{ width: '100%', padding: '0.65rem 0.75rem', fontSize: '12px', background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: '6px', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
          )}
          <div>
            <div style={{ fontSize: '8px', letterSpacing: '3px', color: 'rgba(255,255,255,0.3)', marginBottom: '5px' }}>EMAIL</div>
            <input
              type="email" placeholder="seu@email.com"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              style={{ width: '100%', padding: '0.65rem 0.75rem', fontSize: '12px', background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: '6px', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }}
            />
          </div>
          <div>
            <div style={{ fontSize: '8px', letterSpacing: '3px', color: 'rgba(255,255,255,0.3)', marginBottom: '5px' }}>SENHA</div>
            <input
              type="password" placeholder="Mínimo 8 caracteres"
              value={form.senha}
              onChange={e => setForm(f => ({ ...f, senha: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              style={{ width: '100%', padding: '0.65rem 0.75rem', fontSize: '12px', background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: '6px', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }}
            />
          </div>
        </div>

        {/* Erro */}
        {error && (
          <div style={{ padding: '0.6rem 0.75rem', background: 'rgba(255,50,50,0.1)', border: '0.5px solid rgba(255,50,50,0.3)', borderRadius: '6px', marginBottom: '1rem', fontSize: '11px', color: '#ff6666' }}>
            ✕ {error}
          </div>
        )}

        {/* Botão submit */}
        <button onClick={handleSubmit} disabled={loading} style={{
          width: '100%', padding: '0.8rem', fontSize: '11px', letterSpacing: '4px',
          background: loading ? 'rgba(124,58,255,0.3)' : 'linear-gradient(135deg, rgba(124,58,255,0.9), rgba(0,212,255,0.7))',
          border: '1px solid rgba(124,58,255,0.5)',
          color: '#fff', cursor: loading ? 'wait' : 'pointer',
          borderRadius: '6px', fontFamily: 'inherit', fontWeight: 700,
          boxShadow: '0 0 30px rgba(124,58,255,0.2)',
          transition: 'all 0.2s',
        }}>
          {loading ? '⟳ AGUARDE...' : mode === 'login' ? '▸ ENTRAR' : '▸ CRIAR CONTA'}
        </button>

        {/* Demo hint */}
        <div style={{ marginTop: '1.5rem', padding: '0.75rem', background: 'rgba(0,212,255,0.05)', border: '0.5px solid rgba(0,212,255,0.15)', borderRadius: '6px' }}>
          <div style={{ fontSize: '8px', letterSpacing: '3px', color: 'rgba(0,212,255,0.5)', marginBottom: '4px' }}>DEMO</div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', lineHeight: 1.6 }}>
            Crie uma conta para salvar suas estratégias e trades no banco de dados.
          </div>
        </div>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '9px', color: 'rgba(255,255,255,0.1)', letterSpacing: '2px' }}>
          FINANMAP CRIPTO • DADOS CRIPTOGRAFADOS
        </div>
      </div>
    </div>
  )
}
