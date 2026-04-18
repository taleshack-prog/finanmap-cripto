'use client'
import { useEffect, useState, useCallback } from 'react'

const API = 'http://localhost:3020'
const PARES = ['BTC/USDT','ETH/USDT','SOL/USDT','BNB/USDT','XRP/USDT','ADA/USDT','ZEC/USDT','SUI/USDT']

function getToken() {
  if (typeof window !== 'undefined') return localStorage.getItem('finanmap_token') || ''
  return ''
}

interface Estrategia {
  id: string; nome: string; tipo: string; symbol: string
  fitnessScore: number; retornoEsperado: number; volatilidade: number
  geracao: number; ativa: boolean; dataCriacao: string
  cromossomo: any
}

export default function StrategiesPage() {
  const [estrategias,  setEstrategias]  = useState<Estrategia[]>([])
  const [loading,      setLoading]      = useState(true)
  const [evolving,     setEvolving]     = useState(false)
  const [activating,   setActivating]   = useState<string | null>(null)
  const [msg,          setMsg]          = useState<{type:'ok'|'err', text:string} | null>(null)
  const [form, setForm] = useState({
    nome: '', par: 'BTC/USDT', candles: '500', robos: '10', geracoes: '20'
  })

  const headers = { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' }

  const fetchEstrategias = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/ga/strategies`, { headers })
      if (r.ok) {
        const d = await r.json()
        setEstrategias(d.estrategias || [])
      }
    } catch { }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchEstrategias() }, [fetchEstrategias])

  const evoluir = async () => {
    if (evolving) return
    setEvolving(true)
    setMsg(null)
    try {
      const nome = form.nome || `GA ${form.par} ${new Date().toLocaleDateString('pt-BR')}`
      const r = await fetch(`${API}/api/ga/evolve/sync`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          nome,
          symbol:          form.par,
          timeframe:       '1h',
          data_limit:      parseInt(form.candles),
          population_size: parseInt(form.robos),
          generations:     parseInt(form.geracoes),
        }),
      })
      const d = await r.json()
      if (r.ok) {
        setMsg({ type: 'ok', text: `✓ Estratégia criada! Fitness: ${d.fitness_score?.toFixed(2) || d.fitnessScore?.toFixed(2)} | Retorno: +${d.retorno_esperado?.toFixed(1) || d.retornoEsperado?.toFixed(1)}%` })
        setForm(f => ({ ...f, nome: '' }))
        await fetchEstrategias()
      } else {
        setMsg({ type: 'err', text: `✗ Erro: ${d.error || d.detail || 'Falha na evolução'}` })
      }
    } catch (e: any) {
      setMsg({ type: 'err', text: `✗ Erro: ${e.message}` })
    } finally { setEvolving(false) }
  }

  const ativar = async (id: string) => {
    setActivating(id)
    try {
      const r = await fetch(`${API}/api/ga/strategies/${id}/activate`, {
        method: 'POST', headers,
        body: JSON.stringify({ capital: 109, dry_run: false, min_buy_pressure: 0.52 }),
      })
      const d = await r.json()
      if (r.ok) {
        setMsg({ type: 'ok', text: `✓ Bot ativado! ID: ${d.bot_id?.slice(0,20)}...` })
        await fetchEstrategias()
      } else {
        setMsg({ type: 'err', text: `✗ Erro ao ativar: ${d.error}` })
      }
    } catch (e: any) {
      setMsg({ type: 'err', text: `✗ ${e.message}` })
    } finally { setActivating(null) }
  }

  const deletar = async (id: string) => {
    if (!confirm('Deletar esta estratégia?')) return
    try {
      await fetch(`${API}/api/ga/strategies/${id}`, { method: 'DELETE', headers })
      await fetchEstrategias()
    } catch { }
  }

  const ativas   = estrategias.filter(e => e.ativa)
  const inativas = estrategias.filter(e => !e.ativa)
  const melhorFit = estrategias.length ? Math.max(...estrategias.map(e => e.fitnessScore)) : 0
  const melhorRet = estrategias.length ? Math.max(...estrategias.map(e => e.retornoEsperado)) : 0

  const s: Record<string, React.CSSProperties> = {
    card:   { background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '1rem 1.25rem' },
    input:  { background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: '6px', padding: '0.5rem 0.75rem', color: '#fff', fontSize: '12px', width: '100%', fontFamily: 'monospace' },
    label:  { fontSize: '9px', letterSpacing: '3px', color: 'rgba(255,255,255,0.3)', marginBottom: '4px', display: 'block' },
    btn:    { padding: '0.5rem 1.25rem', fontSize: '10px', letterSpacing: '2px', cursor: 'pointer', borderRadius: '6px', fontFamily: 'monospace', fontWeight: 700 },
  }

  return (
    <div style={{ fontFamily: '"Courier New", monospace', color: '#fff' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ fontSize: '10px', letterSpacing: '6px', color: 'rgba(0,212,255,0.5)', marginBottom: '4px' }}>ALGORITMO GENÉTICO</div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, background: 'linear-gradient(135deg, #7c3aff, #00d4ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Estratégias GA</h1>
        </div>
        <button onClick={evoluir} disabled={evolving}
          style={{ ...s.btn, background: evolving ? 'rgba(124,58,255,0.2)' : 'rgba(124,58,255,0.8)', border: '0.5px solid #7c3aff', color: '#fff' }}>
          {evolving ? '⟳ EVOLUINDO...' : '⟁ EVOLUIR COM GA'}
        </button>
      </div>

      {/* Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {[
          { label: 'TOTAL',         value: estrategias.length.toString(), color: '#00d4ff' },
          { label: 'ATIVAS',        value: ativas.length.toString(),      color: '#00ff88' },
          { label: 'MELHOR FITNESS',value: melhorFit.toFixed(2),          color: '#7c3aff' },
          { label: 'MELHOR RETORNO',value: `+${melhorRet.toFixed(1)}%`,   color: '#ff0080' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ ...s.card, borderTop: `2px solid ${color}`, padding: '1rem' }}>
            <div style={{ fontSize: '8px', letterSpacing: '3px', color: 'rgba(255,255,255,0.3)', marginBottom: '0.5rem' }}>{label}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Mensagem */}
      {msg && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '11px', fontFamily: 'monospace',
          background: msg.type === 'ok' ? 'rgba(0,255,136,0.08)' : 'rgba(255,68,68,0.08)',
          border: `0.5px solid ${msg.type === 'ok' ? 'rgba(0,255,136,0.3)' : 'rgba(255,68,68,0.3)'}`,
          color: msg.type === 'ok' ? '#00ff88' : '#ff4444' }}>
          {msg.text}
        </div>
      )}

      {/* Formulário */}
      <div style={{ ...s.card, borderColor: 'rgba(124,58,255,0.3)', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(124,58,255,0.5)', marginBottom: '1rem' }}>CONFIGURAR EVOLUÇÃO GA</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div>
            <label style={s.label}>NOME</label>
            <input style={s.input} placeholder={`GA ${form.par} Auto`} value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
          </div>
          <div>
            <label style={s.label}>CANDLES</label>
            <input style={s.input} type="number" value={form.candles} onChange={e => setForm(f => ({ ...f, candles: e.target.value }))} />
          </div>
          <div>
            <label style={s.label}>ROBÔS</label>
            <input style={s.input} type="number" value={form.robos} onChange={e => setForm(f => ({ ...f, robos: e.target.value }))} />
          </div>
          <div>
            <label style={s.label}>GERAÇÕES</label>
            <input style={s.input} type="number" value={form.geracoes} onChange={e => setForm(f => ({ ...f, geracoes: e.target.value }))} />
          </div>
          <div>
            <label style={s.label}>PAR</label>
            <select style={{ ...s.input }} value={form.par} onChange={e => setForm(f => ({ ...f, par: e.target.value }))}>
              {PARES.map(p => <option key={p} value={p} style={{ background: '#111' }}>{p}</option>)}
            </select>
          </div>
          <div>
            <label style={s.label}>TIMEFRAME</label>
            <select style={{ ...s.input }}>
              <option style={{ background: '#111' }}>1h</option>
            </select>
          </div>
        </div>
        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginBottom: '0.75rem' }}>
          O GA vai criar <span style={{ color: '#00d4ff' }}>{form.robos} robôs</span> com cromossomos aleatórios, rodar backtest com dados reais Binance (<span style={{ color: '#00d4ff' }}>{form.candles} candles</span>), selecionar top 3, cruzar e mutar por <span style={{ color: '#00d4ff' }}>{form.geracoes} gerações</span>. O melhor cromossomo é salvo automaticamente no banco.
        </div>
        <button onClick={evoluir} disabled={evolving}
          style={{ ...s.btn, background: evolving ? 'rgba(0,212,255,0.1)' : 'rgba(0,212,255,0.8)', border: '0.5px solid #00d4ff', color: '#000' }}>
          {evolving ? '⟳ EVOLUINDO — AGUARDE...' : '▸ INICIAR EVOLUÇÃO'}
        </button>
      </div>

      {/* Lista de estratégias */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.3)', fontSize: '11px' }}>⟳ Carregando estratégias...</div>
      ) : estrategias.length === 0 ? (
        <div style={{ ...s.card, textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.3)', fontSize: '11px' }}>
          Nenhuma estratégia criada ainda.<br/>
          <span style={{ color: '#7c3aff' }}>Use o formulário acima para evoluir com GA.</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {estrategias.map(e => {
            const fit      = e.fitnessScore || 0
            const ret      = e.retornoEsperado || 0
            const fitColor = fit >= 50 ? '#00ff88' : fit >= 20 ? '#f59e0b' : '#ff4444'
            const genes    = e.cromossomo || {}
            return (
              <div key={e.id} style={{ ...s.card, borderLeft: `3px solid ${e.ativa ? '#00ff88' : 'rgba(255,255,255,0.1)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: e.ativa ? '#00ff88' : 'rgba(255,255,255,0.2)', flexShrink: 0, boxShadow: e.ativa ? '0 0 8px #00ff88' : 'none' }} />
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '2px' }}>
                        {e.nome || `GA ${e.symbol}`}
                        <span style={{ marginLeft: '8px', fontSize: '9px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(0,212,255,0.1)', color: '#00d4ff', border: '0.5px solid rgba(0,212,255,0.2)' }}>TRADING</span>
                        {e.ativa && <span style={{ marginLeft: '4px', fontSize: '9px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(0,255,136,0.1)', color: '#00ff88', border: '0.5px solid rgba(0,255,136,0.2)' }}>✓ ativo</span>}
                      </div>
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>
                        {e.symbol} · 1h &nbsp;·&nbsp; Fitness: <span style={{ color: fitColor }}>{fit.toFixed(2)}</span> &nbsp;·&nbsp; Retorno: <span style={{ color: '#00ff88' }}>+{ret.toFixed(1)}%</span> &nbsp;·&nbsp; Gen #{e.geracao}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                    {!e.ativa && (
                      <button onClick={() => ativar(e.id)} disabled={activating === e.id}
                        style={{ ...s.btn, background: 'rgba(0,255,136,0.15)', border: '0.5px solid rgba(0,255,136,0.4)', color: '#00ff88', fontSize: '9px', padding: '0.3rem 0.75rem' }}>
                        {activating === e.id ? '⟳' : '▸ ATIVAR'}
                      </button>
                    )}
                    <button onClick={() => deletar(e.id)}
                      style={{ ...s.btn, background: 'rgba(255,68,68,0.1)', border: '0.5px solid rgba(255,68,68,0.3)', color: '#ff4444', fontSize: '9px', padding: '0.3rem 0.5rem' }}>
                      ✕
                    </button>
                  </div>
                </div>

                {/* Pesos do cromossomo */}
                {(genes.w_rsi || genes.w_macd) && (
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                    {[
                      { label: 'RSI',  val: genes.w_rsi,       color: '#00d4ff' },
                      { label: 'MACD', val: genes.w_macd,      color: '#7c3aff' },
                      { label: 'BB',   val: genes.w_bollinger, color: '#ff0080' },
                      { label: 'EMA',  val: genes.w_ema,       color: '#00ff88' },
                    ].map(({ label, val, color }) => val ? (
                      <div key={label} style={{ minWidth: '60px' }}>
                        <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.3)', marginBottom: '2px' }}>{label} {(val*100).toFixed(0)}%</div>
                        <div style={{ height: '2px', background: 'rgba(255,255,255,0.06)', borderRadius: '1px' }}>
                          <div style={{ height: '100%', width: `${val*100}%`, background: color, borderRadius: '1px' }} />
                        </div>
                      </div>
                    ) : null)}
                    {genes.stop_loss_pct && (
                      <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', alignSelf: 'center' }}>
                        Stop <span style={{ color: '#ff4444' }}>{genes.stop_loss_pct?.toFixed(1)}%</span> · Take <span style={{ color: '#00ff88' }}>{genes.take_profit_pct?.toFixed(1)}%</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
