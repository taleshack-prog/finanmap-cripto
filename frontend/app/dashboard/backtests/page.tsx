'use client'
import { useState, useEffect } from 'react'

const GA = process.env.NEXT_PUBLIC_GA_URL || 'http://localhost:8110'

const glass = (accent = 'rgba(124,58,255,0.2)') => ({
  background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${accent}`,
  backdropFilter: 'blur(20px)', borderRadius: '8px', padding: '1.25rem',
} as React.CSSProperties)

interface BacktestResult {
  id:              string
  nome:            string
  par:             string
  tipo:            string
  periodo:         string
  capital:         number
  total_return:    number
  sharpe_ratio:    number
  sortino_ratio:   number
  max_drawdown:    number
  num_trades:      number
  win_rate:        number
  profit_factor:   number
  final_capital:   number
  equity_curve:    number[]
  status:          'concluido' | 'rodando' | 'erro'
  criado_em:       string
}

// ── data persistida em localStorage (por sessão de browser) ──────────────────
const LS_KEY = 'finanmap_backtests_v1'

function loadSaved(): BacktestResult[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as BacktestResult[]
  } catch { /* localStorage bloqueado em alguns contextos */ }
  return []
}

function saveTo(list: BacktestResult[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)) } catch { /* ignore */ }
}

// data padrão: últimos 180 dias
function defaultDates() {
  const end   = new Date()
  const start = new Date(end.getTime() - 180 * 86_400_000)
  const fmt   = (d: Date) => d.toISOString().split('T')[0]
  return { inicio: fmt(start), fim: fmt(end) }
}

export default function BacktestsPage() {
  const [backtests, setBacktests] = useState<BacktestResult[]>([])
  const [selected,  setSelected]  = useState<BacktestResult | null>(null)
  const [rodando,   setRodando]   = useState(false)
  const [showForm,  setShowForm]  = useState(false)
  const [gaOnline,  setGaOnline]  = useState<boolean | null>(null)

  const { inicio: defInicio, fim: defFim } = defaultDates()
  const [form, setForm] = useState({ nome: '', par: 'BTC/USDT', tipo: 'trading', capital: '10000', inicio: defInicio, fim: defFim })

  // Carrega histórico salvo + verifica ga-engine
  useEffect(() => {
    const saved = loadSaved()
    if (saved.length > 0) {
      setBacktests(saved)
      setSelected(saved[0])
    }
    // Ping ga-engine
    fetch(`${GA}/status`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(() => setGaOnline(true))
      .catch(() => setGaOnline(false))
  }, [])

  const rodarBacktest = async () => {
    if (!form.nome.trim()) return
    if (!form.inicio || !form.fim) return
    setRodando(true)
    setShowForm(false)
    const tempId = Date.now().toString()
    const novo: BacktestResult = {
      id: tempId, nome: form.nome.trim(), par: form.par, tipo: form.tipo,
      periodo: `${form.inicio} → ${form.fim}`,
      capital: parseFloat(form.capital) || 10000,
      total_return: 0, sharpe_ratio: 0, sortino_ratio: 0, max_drawdown: 0,
      num_trades: 0, win_rate: 0, profit_factor: 0, final_capital: 0,
      equity_curve: [], status: 'rodando', criado_em: new Date().toISOString().split('T')[0],
    }
    setBacktests(prev => { const u = [novo, ...prev]; saveTo(u); return u })
    setSelected(novo)

    try {
      const r = await fetch(`${GA}/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy_config: { tipo: form.tipo, par: form.par },
          start_date: form.inicio,
          end_date:   form.fim,
          initial_capital: parseFloat(form.capital) || 10000,
        }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({ detail: `HTTP ${r.status}` }))
        throw new Error(err.detail || `HTTP ${r.status}`)
      }
      const data = await r.json()
      const resultado: BacktestResult = {
        ...novo,
        total_return:  data.total_return  ?? 0,
        sharpe_ratio:  data.sharpe_ratio  ?? 0,
        sortino_ratio: data.sortino_ratio ?? 0,
        max_drawdown:  data.max_drawdown  ?? 0,
        num_trades:    data.num_trades    ?? 0,
        win_rate:      data.win_rate      ?? 0,
        profit_factor: data.profit_factor ?? 0,
        final_capital: data.final_capital ?? novo.capital,
        equity_curve:  data.equity_curve  ?? [],
        status:        'concluido',
      }
      setBacktests(prev => { const u = prev.map(b => b.id === tempId ? resultado : b); saveTo(u); return u })
      setSelected(resultado)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setBacktests(prev => {
        const u = prev.map(b => b.id === tempId ? { ...b, status: 'erro' as const, nome: `${b.nome} — ${msg}` } : b)
        saveTo(u)
        return u
      })
    }
    setRodando(false)
  }

  const deletarBacktest = (id: string) => {
    setBacktests(prev => {
      const u = prev.filter(b => b.id !== id)
      saveTo(u)
      if (selected?.id === id) setSelected(u[0] ?? null)
      return u
    })
  }

  const bt = selected
  const maxEq = bt ? Math.max(...bt.equity_curve) : 1
  const minEq = bt ? Math.min(...bt.equity_curve) : 0

  return (
    <div style={{ fontFamily: '"Courier New", monospace', color: '#fff' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 50% 40% at 20% 80%, rgba(255,0,128,0.04) 0%, transparent 50%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '6px', color: 'rgba(255,0,128,0.5)', marginBottom: '4px' }}>SIMULAÇÃO HISTÓRICA REAL</div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, background: 'linear-gradient(135deg, #ff0080, #7c3aff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Backtests</h1>
            <div style={{ fontSize: '9px', marginTop: '4px', color: gaOnline === null ? 'rgba(255,255,255,0.3)' : gaOnline ? '#00ff88' : '#ff4444' }}>
              {gaOnline === null ? '● verificando ga-engine...' : gaOnline ? '● ga-engine online — dados reais Binance' : '● ga-engine offline — verifique Railway'}
            </div>
          </div>
          <button onClick={() => setShowForm(!showForm)} style={{
            padding: '0.7rem 1.5rem', fontSize: '10px', letterSpacing: '3px',
            background: showForm ? 'rgba(255,50,50,0.2)' : 'linear-gradient(135deg, rgba(255,0,128,0.7), rgba(124,58,255,0.7))',
            border: `1px solid ${showForm ? 'rgba(255,50,50,0.4)' : 'rgba(255,0,128,0.4)'}`,
            color: '#fff', cursor: 'pointer', borderRadius: '4px',
          }}>{showForm ? '✕ CANCELAR' : '▸ NOVO BACKTEST'}</button>
        </div>

        {/* Form */}
        {showForm && (
          <div style={{ ...glass('rgba(255,0,128,0.2)'), marginBottom: '1rem' }}>
            <div style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(255,0,128,0.6)', marginBottom: '1rem' }}>CONFIGURAR BACKTEST</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0,1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
              {[
                { label: 'NOME',        key: 'nome',    type: 'text',   placeholder: 'Meu Backtest' },
                { label: 'CAPITAL ($)', key: 'capital', type: 'number', placeholder: '10000' },
                { label: 'INÍCIO',      key: 'inicio',  type: 'date',   placeholder: '' },
                { label: 'FIM',         key: 'fim',     type: 'date',   placeholder: '' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <div style={{ fontSize: '8px', letterSpacing: '2px', color: 'rgba(255,255,255,0.3)', marginBottom: '4px' }}>{label}</div>
                  <input value={(form as any)[key]} type={type} placeholder={placeholder}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    style={{ width: '100%', padding: '0.5rem', fontSize: '11px', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: '4px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
              ))}
              {[
                { label: 'PAR',  key: 'par',  opts: ['BTC/USDT','ETH/USDT','SOL/USDT','BNB/USDT'] },
                { label: 'TIPO', key: 'tipo', opts: ['trading','grid','dca','arbitragem'] },
              ].map(({ label, key, opts }) => (
                <div key={key}>
                  <div style={{ fontSize: '8px', letterSpacing: '2px', color: 'rgba(255,255,255,0.3)', marginBottom: '4px' }}>{label}</div>
                  <select value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    style={{ width: '100%', padding: '0.5rem', fontSize: '11px', background: '#0a0020', border: '0.5px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: '4px', fontFamily: 'inherit' }}>
                    {opts.map(o => <option key={o} value={o}>{o.toUpperCase()}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <button onClick={rodarBacktest} disabled={rodando} style={{
              padding: '0.7rem 2rem', fontSize: '11px', letterSpacing: '3px',
              background: 'linear-gradient(135deg, rgba(255,0,128,0.7), rgba(124,58,255,0.7))',
              border: '1px solid rgba(255,0,128,0.4)', color: '#fff',
              cursor: rodando ? 'wait' : 'pointer', borderRadius: '4px',
            }}>{rodando ? '⟳ RODANDO GA...' : '▸ EXECUTAR BACKTEST'}</button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1rem' }}>

          {/* Lista */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {backtests.length === 0 && (
              <div style={{ ...glass('rgba(255,255,255,0.06)'), textAlign: 'center', padding: '2rem 1rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.3 }}>📊</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', lineHeight: 1.6 }}>
                  Nenhum backtest ainda.<br/>
                  Clique em <strong style={{ color: 'rgba(255,0,128,0.7)' }}>▸ NOVO BACKTEST</strong><br/>
                  para rodar dados reais da Binance.
                </div>
              </div>
            )}
            {backtests.map(b => (
              <div key={b.id} style={{ position: 'relative' }}>
                <div onClick={() => setSelected(b)} style={{
                  ...glass(selected?.id === b.id ? 'rgba(255,0,128,0.3)' : 'rgba(255,255,255,0.06)'),
                  cursor: 'pointer', borderLeft: `3px solid ${selected?.id === b.id ? '#ff0080' : 'transparent'}`,
                  padding: '0.85rem', paddingRight: '2.2rem', transition: 'all 0.2s',
                }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>{b.nome.replace(/ — .*/, '')}</div>
                  <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', marginBottom: '6px' }}>{b.par} · {b.tipo}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: b.status === 'erro' ? '#ff4444' : b.total_return >= 0 ? '#00ff88' : '#ff4444' }}>
                      {b.status === 'rodando' ? '⟳' : b.status === 'erro' ? '✕ erro' : `${b.total_return >= 0 ? '+' : ''}${b.total_return.toFixed(1)}%`}
                    </span>
                    <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}>{b.criado_em}</span>
                  </div>
                </div>
                {/* Botão deletar */}
                <button
                  onClick={e => { e.stopPropagation(); deletarBacktest(b.id) }}
                  title="Deletar backtest"
                  style={{
                    position: 'absolute', top: '0.5rem', right: '0.5rem',
                    background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)',
                    cursor: 'pointer', fontSize: '12px', lineHeight: 1, padding: '2px 4px',
                  }}
                >✕</button>
              </div>
            ))}
          </div>

          {/* Detalhe */}
          {bt && bt.status === 'concluido' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

              {/* Métricas */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: '0.5rem' }}>
                {[
                  { label: 'RETORNO TOTAL',  value: `${bt.total_return >= 0 ? '+' : ''}${bt.total_return.toFixed(1)}%`, color: bt.total_return >= 0 ? '#00ff88' : '#ff4444' },
                  { label: 'SHARPE RATIO',   value: bt.sharpe_ratio.toFixed(2),  color: '#00d4ff' },
                  { label: 'MAX DRAWDOWN',   value: `${bt.max_drawdown.toFixed(1)}%`, color: '#ff4444' },
                  { label: 'WIN RATE',       value: `${bt.win_rate.toFixed(1)}%`, color: '#7c3aff' },
                  { label: 'CAPITAL FINAL',  value: `$${bt.final_capital.toLocaleString()}`, color: '#00ff88' },
                  { label: 'SORTINO',        value: bt.sortino_ratio.toFixed(2),  color: '#00d4ff' },
                  { label: 'PROFIT FACTOR',  value: bt.profit_factor.toFixed(2),  color: '#f59e0b' },
                  { label: 'Nº TRADES',      value: bt.num_trades.toString(),     color: '#ff0080' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ ...glass(`${color}20`), padding: '0.75rem' }}>
                    <div style={{ fontSize: '7px', letterSpacing: '2px', color: 'rgba(255,255,255,0.25)', marginBottom: '4px' }}>{label}</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Equity curve */}
              {bt.equity_curve.length > 0 && (
                <div style={glass('rgba(0,212,255,0.15)')}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(0,212,255,0.5)' }}>EQUITY CURVE</span>
                    <span style={{ fontSize: '9px', color: bt.total_return >= 0 ? '#00ff88' : '#ff4444' }}>
                      ${bt.capital.toLocaleString()} → ${bt.final_capital.toLocaleString()}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '120px' }}>
                    {bt.equity_curve.map((v, i) => {
                      const range = maxEq - minEq || 1
                      const h = ((v - minEq) / range) * 100
                      const isProfit = v >= bt.capital
                      return (
                        <div key={i} style={{ flex: 1, height: `${Math.max(h, 2)}%`, background: isProfit ? 'rgba(0,255,136,0.5)' : 'rgba(255,68,68,0.5)', borderRadius: '2px 2px 0 0', minHeight: '3px', transition: 'all 0.2s' }} />
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '8px', color: 'rgba(255,255,255,0.2)' }}>
                    <span>{bt.periodo.split('→')[0]}</span>
                    <span>${bt.capital.toLocaleString()} inicial</span>
                    <span>{bt.periodo.split('→')[1]}</span>
                  </div>
                </div>
              )}

              {/* Info */}
              <div style={{ ...glass('rgba(255,255,255,0.06)'), fontSize: '10px' }}>
                <div style={{ display: 'flex', gap: '2rem', color: 'rgba(255,255,255,0.4)' }}>
                  <span>Par: <span style={{ color: '#fff' }}>{bt.par}</span></span>
                  <span>Tipo: <span style={{ color: '#fff' }}>{bt.tipo}</span></span>
                  <span>Período: <span style={{ color: '#fff' }}>{bt.periodo}</span></span>
                  <span>Capital: <span style={{ color: '#fff' }}>${bt.capital.toLocaleString()}</span></span>
                </div>
              </div>
            </div>
          )}

          {bt?.status === 'rodando' && (
            <div style={{ ...glass('rgba(124,58,255,0.2)'), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '200px', gap: '1rem' }}>
              <div style={{ fontSize: '2rem', animation: 'spin 1s linear infinite' }}>⟳</div>
              <div style={{ fontSize: '11px', letterSpacing: '4px', color: 'rgba(124,58,255,0.7)' }}>GA RODANDO BACKTEST...</div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
