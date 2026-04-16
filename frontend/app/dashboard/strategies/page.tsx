'use client'
import { useEffect, useState } from 'react'

const API = 'http://localhost:3020'
const GA  = 'http://localhost:8110'

const glass = (accent = 'rgba(124,58,255,0.2)') => ({
  background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${accent}`,
  backdropFilter: 'blur(20px)', borderRadius: '8px', padding: '1.25rem',
} as React.CSSProperties)

function getToken() {
  if (typeof window !== 'undefined') return localStorage.getItem('finanmap_token') || ''
  return ''
}

interface Estrategia {
  id: string; nome: string; tipo: string; geracao: number
  fitnessScore: number; retornoEsperado: number; volatilidade: number
  ativa: boolean; symbol: string; timeframe: string; status: string
  win_rate: number; max_dd: number
  pesos: { w_rsi: number; w_macd: number; w_bollinger: number; w_ema: number }
  risk: { stop_loss_pct: number; take_profit_pct: number; capital_pct: number }
  dataCriacao: string
}

const TIPO_COLORS: Record<string, string> = {
  trading: '#00d4ff', grid: '#7c3aff', dca: '#00ff88', arbitragem: '#ff0080'
}
const PARES = ['BTC/USDT','ETH/USDT','SOL/USDT','BNB/USDT','XRP/USDT']

export default function EstrategiasPage() {
  const [estrategias,  setEstrategias]  = useState<Estrategia[]>([])
  const [loading,      setLoading]      = useState(true)
  const [evoluindo,    setEvoluindo]    = useState(false)
  const [ativando,     setAtivando]     = useState<string | null>(null)
  const [showForm,     setShowForm]     = useState(false)
  const [error,        setError]        = useState('')
  const [success,      setSuccess]      = useState('')
  const [selected,     setSelected]     = useState<string | null>(null)
  const [form, setForm] = useState({
    nome: '', symbol: 'BTC/USDT', timeframe: '1h',
    data_limit: '500', population_size: '10', generations: '20',
  })

  const fetchEstrategias = async () => {
    const token = getToken()
    try {
      const r = await fetch(`${API}/api/ga/strategies`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await r.json()
      setEstrategias(data.estrategias || [])
    } catch { } finally { setLoading(false) }
  }

  useEffect(() => { fetchEstrategias() }, [])

  const evoluirGA = async () => {
    setEvoluindo(true); setError(''); setSuccess('')
    const token = getToken()
    try {
      const r = await fetch(`${API}/api/ga/evolve/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          nome:            form.nome || `GA ${form.symbol} ${new Date().toLocaleDateString('pt-BR')}`,
          symbol:          form.symbol,
          timeframe:       form.timeframe,
          data_limit:      parseInt(form.data_limit),
          population_size: parseInt(form.population_size),
          generations:     parseInt(form.generations),
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Erro ao evoluir GA')
      setSuccess(`✓ Estratégia criada! Fitness: ${data.ga_result?.best_fitness?.toFixed(2)} | Retorno: +${data.ga_result?.best_return?.toFixed(1)}%`)
      setShowForm(false)
      await fetchEstrategias()
    } catch (e: any) {
      setError(e.message)
    } finally { setEvoluindo(false) }
  }

  const ativarEstrategia = async (id: string, dry_run = true) => {
    setAtivando(id); setError('')
    const token = getToken()
    try {
      const r = await fetch(`${API}/api/ga/strategies/${id}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ capital: 109, dry_run: false, max_position: 0.25 }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Erro ao ativar')
      setSuccess(`✓ Bot iniciado! ID: ${data.bot_id}`)
      await fetchEstrategias()
    } catch (e: any) {
      setError(e.message)
    } finally { setAtivando(null) }
  }

  const deletarEstrategia = async (id: string) => {
    const token = getToken()
    try {
      await fetch(`${API}/api/ga/strategies/${id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
      })
      setEstrategias(prev => prev.filter(e => e.id !== id))
      if (selected === id) setSelected(null)
    } catch { }
  }

  const selectedE = estrategias.find(e => e.id === selected)
  const ativas    = estrategias.filter(e => e.ativa).length
  const melhor    = estrategias.reduce((b, e) => e.fitnessScore > (b?.fitnessScore || 0) ? e : b, estrategias[0])

  return (
    <div style={{ fontFamily: '"Courier New", monospace', color: '#fff' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 60% 50% at 90% 30%, rgba(124,58,255,0.06) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '6px', color: 'rgba(124,58,255,0.5)', marginBottom: '4px' }}>ALGORITMO GENÉTICO</div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, background: 'linear-gradient(135deg, #00d4ff, #7c3aff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Estratégias GA</h1>
          </div>
          <button onClick={() => setShowForm(!showForm)} style={{
            padding: '0.7rem 1.5rem', fontSize: '10px', letterSpacing: '3px', cursor: 'pointer',
            background: showForm ? 'rgba(255,50,50,0.2)' : 'linear-gradient(135deg, rgba(124,58,255,0.8), rgba(0,212,255,0.6))',
            border: `1px solid ${showForm ? 'rgba(255,50,50,0.4)' : 'rgba(124,58,255,0.5)'}`,
            color: '#fff', borderRadius: '4px',
          }}>{showForm ? '✕ CANCELAR' : '⟁ EVOLUIR COM GA'}</button>
        </div>

        {/* Métricas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {[
            { label: 'TOTAL',         value: `${estrategias.length}`,                           color: '#00d4ff' },
            { label: 'ATIVAS',         value: `${ativas}`,                                       color: '#00ff88' },
            { label: 'MELHOR FITNESS', value: melhor ? melhor.fitnessScore.toFixed(2) : '—',    color: '#7c3aff' },
            { label: 'MELHOR RETORNO', value: melhor ? `+${melhor.retornoEsperado.toFixed(1)}%` : '—', color: '#ff0080' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ ...glass(`${color}25`), borderTop: `2px solid ${color}`, padding: '1rem' }}>
              <div style={{ fontSize: '8px', letterSpacing: '3px', color: 'rgba(255,255,255,0.3)', marginBottom: '0.5rem' }}>{label}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Alerts */}
        {error   && <div style={{ ...glass('rgba(255,50,50,0.3)'), marginBottom: '1rem', color: '#ff6666', fontSize: '11px' }}>✕ {error}</div>}
        {success && <div style={{ ...glass('rgba(0,255,136,0.2)'), marginBottom: '1rem', color: '#00ff88', fontSize: '11px' }}>{success}</div>}

        {/* Formulário GA */}
        {showForm && (
          <div style={{ ...glass('rgba(0,212,255,0.2)'), marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(0,212,255,0.6)', marginBottom: '1rem' }}>
              CONFIGURAR EVOLUÇÃO GA
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0,1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
              {[
                { label: 'NOME',        key: 'nome',            type: 'text',   placeholder: 'GA BTC Auto' },
                { label: 'CANDLES',     key: 'data_limit',      type: 'number', placeholder: '500' },
                { label: 'ROBÔS',       key: 'population_size', type: 'number', placeholder: '10' },
                { label: 'GERAÇÕES',    key: 'generations',     type: 'number', placeholder: '20' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <div style={{ fontSize: '8px', letterSpacing: '2px', color: 'rgba(255,255,255,0.3)', marginBottom: '4px' }}>{label}</div>
                  <input value={(form as any)[key]} type={type} placeholder={placeholder}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    style={{ width: '100%', padding: '0.5rem', fontSize: '11px', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: '4px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
              ))}
              {[
                { label: 'PAR',       key: 'symbol',    opts: PARES },
                { label: 'TIMEFRAME', key: 'timeframe', opts: ['1h','4h','1d','15m'] },
              ].map(({ label, key, opts }) => (
                <div key={key}>
                  <div style={{ fontSize: '8px', letterSpacing: '2px', color: 'rgba(255,255,255,0.3)', marginBottom: '4px' }}>{label}</div>
                  <select value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    style={{ width: '100%', padding: '0.5rem', fontSize: '11px', background: '#0a0020', border: '0.5px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: '4px', fontFamily: 'inherit' }}>
                    {opts.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {/* Info */}
            <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', marginBottom: '1rem', fontSize: '10px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.8 }}>
              O GA vai criar <strong style={{ color: '#00d4ff' }}>{form.population_size} robôs</strong> com cromossomos aleatórios,
              rodar backtest com dados reais Binance (<strong style={{ color: '#00d4ff' }}>{form.data_limit} candles</strong>),
              selecionar os top 3, cruzar e mutar por <strong style={{ color: '#00d4ff' }}>{form.generations} gerações</strong>.
              O melhor cromossomo é salvo automaticamente no banco.
            </div>

            <button onClick={evoluirGA} disabled={evoluindo} style={{
              padding: '0.7rem 2rem', fontSize: '11px', letterSpacing: '3px',
              background: evoluindo ? 'rgba(124,58,255,0.3)' : 'linear-gradient(135deg, rgba(0,212,255,0.7), rgba(124,58,255,0.7))',
              border: '1px solid rgba(0,212,255,0.4)', color: '#fff',
              cursor: evoluindo ? 'wait' : 'pointer', borderRadius: '4px',
            }}>{evoluindo ? '⟳ GA EVOLUINDO... (pode levar ~30s)' : '▸ INICIAR EVOLUÇÃO'}</button>
          </div>
        )}

        {/* Lista + detalhes */}
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1.2fr' : '1fr', gap: '1rem' }}>

          {/* Lista */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {loading ? (
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '2rem' }}>⟳ Carregando...</div>
            ) : estrategias.length === 0 ? (
              <div style={{ ...glass(), textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.3)', fontSize: '11px' }}>
                Nenhuma estratégia ainda.<br/>Clique em <span style={{ color: '#7c3aff' }}>EVOLUIR COM GA</span> para criar a primeira.
              </div>
            ) : (
              estrategias.map(e => {
                const color = TIPO_COLORS[e.tipo] || '#888'
                const isSelected = selected === e.id
                return (
                  <div key={e.id} onClick={() => setSelected(isSelected ? null : e.id)} style={{
                    ...glass(isSelected ? `${color}40` : 'rgba(255,255,255,0.08)'),
                    borderLeft: `3px solid ${e.ativa ? '#00ff88' : color}`,
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0, background: e.ativa ? '#00ff88' : 'rgba(255,255,255,0.2)', boxShadow: e.ativa ? '0 0 8px #00ff88' : 'none' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '4px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>{e.nome}</span>
                          <span style={{ fontSize: '8px', padding: '2px 6px', borderRadius: '10px', background: color + '15', color, letterSpacing: '2px' }}>{e.tipo.toUpperCase()}</span>
                          <span style={{ fontSize: '8px', color: e.status === 'concluido' ? '#00ff88' : e.status === 'evoluindo' ? '#f59e0b' : 'rgba(255,255,255,0.3)' }}>
                            {e.status === 'concluido' ? '✓' : e.status === 'evoluindo' ? '⟳' : '○'} {e.status}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', fontSize: '9px', color: 'rgba(255,255,255,0.35)' }}>
                          <span>{e.symbol} · {e.timeframe}</span>
                          <span>Fitness: <span style={{ color }}>{e.fitnessScore.toFixed(2)}</span></span>
                          <span>Retorno: <span style={{ color: '#00ff88' }}>+{e.retornoEsperado.toFixed(1)}%</span></span>
                          <span>Gen #{e.geracao}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                        {!e.ativa && e.status === 'concluido' && (
                          <button onClick={ev => { ev.stopPropagation(); ativarEstrategia(e.id, true) }}
                            disabled={ativando === e.id} style={{ padding: '0.35rem 0.75rem', fontSize: '9px', letterSpacing: '2px', cursor: 'pointer', background: 'rgba(0,255,136,0.1)', border: '0.5px solid rgba(0,255,136,0.3)', color: '#00ff88', borderRadius: '4px' }}>
                            {ativando === e.id ? '⟳' : '▸ ATIVAR'}
                          </button>
                        )}
                        <button onClick={ev => { ev.stopPropagation(); deletarEstrategia(e.id) }} style={{ padding: '0.35rem 0.6rem', fontSize: '9px', cursor: 'pointer', background: 'transparent', border: '0.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)', borderRadius: '4px' }}>✕</button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Detalhes da estratégia selecionada */}
          {selectedE && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={glass(`${TIPO_COLORS[selectedE.tipo] || '#888'}30`)}>
                <div style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(255,255,255,0.3)', marginBottom: '1rem' }}>CROMOSSOMO</div>

                {/* Pesos dos indicadores */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '8px', letterSpacing: '2px', color: 'rgba(255,255,255,0.25)', marginBottom: '8px' }}>PESOS DOS INDICADORES (evoluídos pelo GA)</div>
                  {Object.entries(selectedE.pesos).map(([key, val]) => {
                    const labels: Record<string, string> = { w_rsi: 'RSI', w_macd: 'MACD', w_bollinger: 'Bollinger', w_ema: 'EMA Trend' }
                    const colors: Record<string, string> = { w_rsi: '#00d4ff', w_macd: '#7c3aff', w_bollinger: '#ff0080', w_ema: '#00ff88' }
                    const color = colors[key] || '#888'
                    return (
                      <div key={key} style={{ marginBottom: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', fontSize: '9px' }}>
                          <span style={{ color: 'rgba(255,255,255,0.4)' }}>{labels[key] || key}</span>
                          <span style={{ color }}>{(val * 100).toFixed(1)}%</span>
                        </div>
                        <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${val * 100}%`, background: color, boxShadow: `0 0 6px ${color}` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Parâmetros de risco */}
                <div>
                  <div style={{ fontSize: '8px', letterSpacing: '2px', color: 'rgba(255,255,255,0.25)', marginBottom: '8px' }}>PARÂMETROS DE RISCO</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                    {[
                      { label: 'Stop Loss',   value: `${selectedE.risk.stop_loss_pct.toFixed(2)}%`,   color: '#ff4444' },
                      { label: 'Take Profit', value: `${selectedE.risk.take_profit_pct.toFixed(2)}%`, color: '#00ff88' },
                      { label: 'Capital/Trade', value: `${(selectedE.risk.capital_pct * 100).toFixed(1)}%`, color: '#f59e0b' },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ textAlign: 'center', padding: '0.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '4px' }}>
                        <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.25)', marginBottom: '2px' }}>{label}</div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Métricas de performance */}
              <div style={glass('rgba(0,212,255,0.15)')}>
                <div style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(0,212,255,0.5)', marginBottom: '1rem' }}>PERFORMANCE NO BACKTEST</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                  {[
                    { label: 'Fitness Score',   value: selectedE.fitnessScore.toFixed(4),   color: '#7c3aff' },
                    { label: 'Retorno',         value: `+${selectedE.retornoEsperado.toFixed(2)}%`, color: '#00ff88' },
                    { label: 'Max Drawdown',    value: `-${selectedE.volatilidade.toFixed(2)}%`,    color: '#ff4444' },
                    { label: 'Geração',         value: `#${selectedE.geracao}`,             color: '#f59e0b' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '4px' }}>
                      <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.25)', marginBottom: '4px' }}>{label}</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
