'use client'
import { useState } from 'react'

const GA = 'http://localhost:8110'

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

const MOCK: BacktestResult[] = [
  { id:'1', nome:'Trend Follow BTC 2024', par:'BTC/USDT', tipo:'trading',    periodo:'2024-01-01 → 2024-12-31', capital:10000, total_return:68.4,  sharpe_ratio:1.65, sortino_ratio:2.1,  max_drawdown:-18.3, num_trades:142, win_rate:67.6, profit_factor:2.4,  final_capital:16840, equity_curve:[10000,10800,9900,11200,10800,12400,11800,13200,12900,14500,15200,16100,15800,16840], status:'concluido', criado_em:'2024-01-15' },
  { id:'2', nome:'Grid ETH Baixa Vol',    par:'ETH/USDT', tipo:'grid',       periodo:'2024-03-01 → 2024-09-30', capital:5000,  total_return:22.1,  sharpe_ratio:1.32, sortino_ratio:1.8,  max_drawdown:-8.5,  num_trades:89,  win_rate:71.9, profit_factor:2.1,  final_capital:6105,  equity_curve:[5000,5200,5100,5400,5300,5600,5500,5800,5700,6000,5900,6105],                       status:'concluido', criado_em:'2024-03-01' },
  { id:'3', nome:'DCA Acumulação BTC',    par:'BTC/USDT', tipo:'dca',        periodo:'2023-01-01 → 2024-12-31', capital:24000, total_return:156.2, sharpe_ratio:1.10, sortino_ratio:1.4,  max_drawdown:-31.2, num_trades:24,  win_rate:58.3, profit_factor:1.8,  final_capital:61488, equity_curve:[24000,22000,20000,25000,28000,32000,29000,35000,40000,38000,45000,50000,55000,61488], status:'concluido', criado_em:'2023-01-01' },
  { id:'4', nome:'Arb BNB Multi-Exchange',par:'BNB/USDT', tipo:'arbitragem', periodo:'2024-06-01 → 2024-12-31', capital:8000,  total_return:14.8,  sharpe_ratio:0.88, sortino_ratio:1.2,  max_drawdown:-5.2,  num_trades:310, win_rate:82.3, profit_factor:1.6,  final_capital:9184,  equity_curve:[8000,8200,8400,8300,8600,8800,8700,9000,9100,9000,9200,9184],                       status:'concluido', criado_em:'2024-06-01' },
]

export default function BacktestsPage() {
  const [backtests, setBacktests] = useState<BacktestResult[]>(MOCK)
  const [selected,  setSelected]  = useState<BacktestResult | null>(MOCK[0])
  const [rodando,   setRodando]   = useState(false)
  const [showForm,  setShowForm]  = useState(false)
  const [form,      setForm]      = useState({ nome: '', par: 'BTC/USDT', tipo: 'trading', capital: '10000', inicio: '2024-01-01', fim: '2024-12-31' })

  const rodarBacktest = async () => {
    if (!form.nome) return
    setRodando(true)
    setShowForm(false)
    const tempId = Date.now().toString()
    const novo: BacktestResult = {
      id: tempId, nome: form.nome, par: form.par, tipo: form.tipo,
      periodo: `${form.inicio} → ${form.fim}`,
      capital: parseFloat(form.capital),
      total_return: 0, sharpe_ratio: 0, sortino_ratio: 0, max_drawdown: 0,
      num_trades: 0, win_rate: 0, profit_factor: 0, final_capital: 0,
      equity_curve: [], status: 'rodando', criado_em: new Date().toISOString().split('T')[0],
    }
    setBacktests(prev => [novo, ...prev])

    try {
      const r = await fetch(`${GA}/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy_config: { tipo: form.tipo, par: form.par }, start_date: form.inicio, end_date: form.fim, initial_capital: parseFloat(form.capital) }),
      })
      const data = await r.json()
      const resultado: BacktestResult = {
        ...novo,
        total_return:  data.total_return,
        sharpe_ratio:  data.sharpe_ratio,
        sortino_ratio: data.sortino_ratio,
        max_drawdown:  data.max_drawdown,
        num_trades:    data.num_trades,
        win_rate:      data.win_rate,
        profit_factor: data.profit_factor,
        final_capital: data.final_capital,
        equity_curve:  data.equity_curve || [],
        status:        'concluido',
      }
      setBacktests(prev => prev.map(b => b.id === tempId ? resultado : b))
      setSelected(resultado)
    } catch {
      setBacktests(prev => prev.map(b => b.id === tempId ? { ...b, status: 'erro' as const } : b))
    }
    setRodando(false)
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
            <div style={{ fontSize: '10px', letterSpacing: '6px', color: 'rgba(255,0,128,0.5)', marginBottom: '4px' }}>SIMULAÇÃO HISTÓRICA</div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, background: 'linear-gradient(135deg, #ff0080, #7c3aff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Backtests</h1>
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
            {backtests.map(b => (
              <div key={b.id} onClick={() => setSelected(b)} style={{
                ...glass(selected?.id === b.id ? 'rgba(255,0,128,0.3)' : 'rgba(255,255,255,0.06)'),
                cursor: 'pointer', borderLeft: `3px solid ${selected?.id === b.id ? '#ff0080' : 'transparent'}`,
                padding: '0.85rem', transition: 'all 0.2s',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>{b.nome}</div>
                <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', marginBottom: '6px' }}>{b.par} · {b.tipo}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: b.total_return >= 0 ? '#00ff88' : '#ff4444' }}>
                    {b.status === 'rodando' ? '⟳' : b.status === 'erro' ? '✕' : `${b.total_return >= 0 ? '+' : ''}${b.total_return.toFixed(1)}%`}
                  </span>
                  <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}>{b.criado_em}</span>
                </div>
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
