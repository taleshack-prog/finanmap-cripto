'use client'
import { useEffect, useState, useCallback } from 'react'

const API = 'http://localhost:3020'

const glass = (accent = 'rgba(124,58,255,0.2)') => ({
  background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${accent}`,
  backdropFilter: 'blur(20px)', borderRadius: '8px', padding: '1.25rem',
} as React.CSSProperties)

interface FullAnalysis {
  symbol: string; price: number; combined_score: number; combined_direction: string
  technical: { direction: string; confidence: number; signal: number; breakdown: any }
  quantitative: { score: number; direction: string; breakdown: any }
  flow: { buy_pressure: number; sell_pressure: number; flow_score: number }
  onchain: { score: number; direction: string; breakdown: any }
  weights: Record<string, number>
}

interface Estrategia {
  id: string; nome: string; tipo: string; geracao: number
  fitnessScore: number; retornoEsperado: number; volatilidade: number
  ativa: boolean; symbol: string; status: string; win_rate: number
  pesos: Record<string, number>; risk: Record<string, number>
}

interface TradeSummary {
  totalTrades: number; fechados: number; winRate: string
  lucroTotal: string; abertos: number
}

const CHART_DATA = [42,38,55,48,62,58,71,65,78,82,75,90]
const MONTHS     = ['J','F','M','A','M','J','J','A','S','O','N','D']

function getToken() {
  if (typeof window !== 'undefined') return localStorage.getItem('finanmap_token') || ''
  return ''
}

export default function DashboardPage() {
  const [analysis,    setAnalysis]    = useState<FullAnalysis | null>(null)
  const [estrategias, setEstrategias] = useState<Estrategia[]>([])
  const [summary,     setSummary]     = useState<TradeSummary | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [activeBar,   setActiveBar]   = useState<number | null>(null)
  const [lastUpdate,  setLastUpdate]  = useState('')
  const [symbol,      setSymbol]      = useState('BTC/USDT')

  const fetchWithTimeout = (url: string, options: any = {}, ms = 8000) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ms)
    return fetch(url, { ...options, signal: controller.signal })
      .finally(() => clearTimeout(timer))
  }

  const fetchAll = useCallback(async () => {
    const token = getToken()
    const headers = { Authorization: `Bearer ${token}` }

    try {
      const botsRes = await fetchWithTimeout(`${API}/api/portfolio`, { headers }, 5000)
        .catch(() => ({ ok: false }))

      const [stratRes, tradeRes] = await Promise.allSettled([
        fetchWithTimeout(`${API}/api/ga/strategies`, { headers }),
        fetchWithTimeout(`${API}/api/trades/summary`, { headers }),
      ])

      const bots = (botsRes as any).ok ? await (botsRes as any).json() : { ativos: [] }
      const activeBots = bots.ativos || []
      const bestBot = activeBots[0]
      const signal = bestBot?.ativo || 'HOLD'
      const score = bestBot ? Number(bestBot.precoUnitario) : 0
      setAnalysis({ combined_direction: signal, combined_score: score } as any)

      if (stratRes.status === 'fulfilled' && stratRes.value.ok) setEstrategias((await stratRes.value.json()).estrategias || [])
      if (tradeRes.status === 'fulfilled' && tradeRes.value.ok) setSummary(await tradeRes.value.json())

      setLastUpdate(new Date().toLocaleTimeString('pt-BR'))
    } catch (e) {
      console.error('fetchAll error:', e)
    } finally {
      setLoading(false)
    }
  }, [symbol])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 60000) // atualiza a cada 1 min
    return () => clearInterval(interval)
  }, [fetchAll])

  const dir        = analysis?.combined_direction || 'HOLD'
  const dirColor   = dir === 'BUY' ? '#00ff88' : dir === 'SELL' ? '#ff4444' : '#f59e0b'
  const ativasCount = estrategias.filter(e => e.ativa).length
  const maxChart   = Math.max(...CHART_DATA)

  // Score das 4 camadas
  const layers = analysis ? [
    { label: 'TÉCNICA',      score: (analysis.technical?.confidence || 0) * (analysis.technical?.direction === 'BUY' ? 1 : analysis.technical?.direction === 'SELL' ? -1 : 0), color: '#00d4ff' },
    { label: 'QUANTITATIVA', score: analysis.quantitative?.score || 0,   color: '#7c3aff' },
    { label: 'FLUXO',        score: analysis.flow?.flow_score || 0,       color: '#ff0080' },
    { label: 'ON-CHAIN',     score: analysis.onchain?.score || 0,         color: '#f59e0b' },
  ] : []

  return (
    <div style={{ fontFamily: '"Courier New", monospace', color: '#fff' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 60% 50% at 10% 50%, rgba(99,0,255,0.06) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '6px', color: 'rgba(124,58,255,0.5)', marginBottom: '4px' }}>VISÃO GERAL</div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, background: 'linear-gradient(135deg, #00d4ff, #7c3aff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Dashboard</h1>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <select value={symbol} onChange={e => setSymbol(e.target.value)} style={{ padding: '0.4rem 0.8rem', fontSize: '10px', background: '#0a0020', border: '0.5px solid rgba(124,58,255,0.3)', color: '#fff', borderRadius: '4px', fontFamily: 'inherit', letterSpacing: '2px' }}>
              {['BTC/USDT','ETH/USDT','SOL/USDT','BNB/USDT'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={fetchAll} style={{ padding: '0.4rem 1rem', fontSize: '9px', letterSpacing: '3px', background: 'rgba(124,58,255,0.2)', border: '0.5px solid rgba(124,58,255,0.4)', color: '#7c3aff', cursor: 'pointer', borderRadius: '4px' }}>
              ↻ ATUALIZAR
            </button>
            {lastUpdate && <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)' }}>atualizado {lastUpdate}</span>}
          </div>
        </div>

        {/* Métricas principais */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0,1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {[
            { label: 'LUCRO TOTAL',     value: summary?.lucroTotal ? `$${summary.lucroTotal}` : '—', color: '#00d4ff' },
            { label: 'SINAL ATUAL',    value: loading ? '...' : dir, color: dirColor },
            { label: 'SCORE COMBINADO',value: loading ? '...' : (analysis?.combined_score?.toFixed(3) || '—'), color: '#7c3aff' },
            { label: 'ESTRATÉGIAS GA', value: `${ativasCount}/${estrategias.length}`, color: '#00ff88' },
            { label: 'WIN RATE',       value: summary?.winRate ? `${summary.winRate}%` : '—', color: '#f59e0b' },
            { label: 'TRADES ABERTOS', value: summary?.abertos?.toString() || '0', color: '#ff0080' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ ...glass(`${color}25`), borderTop: `2px solid ${color}`, padding: '1rem' }}>
              <div style={{ fontSize: '8px', letterSpacing: '3px', color: 'rgba(255,255,255,0.3)', marginBottom: '0.5rem' }}>{label}</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color, textShadow: `0 0 20px ${color}50`, lineHeight: 1 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Chart + Análise 4 camadas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '1rem', marginBottom: '1rem' }}>

          {/* Patrimônio chart */}
          <div style={glass('rgba(124,58,255,0.2)')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
              <span style={{ fontSize: '10px', letterSpacing: '4px', color: 'rgba(124,58,255,0.7)' }}>PATRIMÔNIO 12 MESES</span>
              <span style={{ fontSize: '10px', color: '#00ff88', letterSpacing: '2px' }}>▲ +113%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '140px', marginBottom: '8px' }}>
              {CHART_DATA.map((val, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', cursor: 'pointer', gap: '4px' }}
                  onMouseEnter={() => setActiveBar(i)} onMouseLeave={() => setActiveBar(null)}>
                  {activeBar === i && <div style={{ fontSize: '8px', color: '#00d4ff', whiteSpace: 'nowrap' }}>${val}k</div>}
                  <div style={{ width: '100%', height: `${(val / maxChart) * 100}%`, background: activeBar === i ? 'linear-gradient(180deg, #00d4ff, rgba(124,58,255,0.9))' : 'linear-gradient(180deg, rgba(124,58,255,0.7), rgba(0,212,255,0.2))', borderRadius: '3px 3px 0 0', transition: 'all 0.2s' }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {MONTHS.map((m, i) => <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '8px', color: activeBar === i ? '#00d4ff' : 'rgba(255,255,255,0.2)' }}>{m}</div>)}
            </div>
          </div>

          {/* 4 Camadas de análise */}
          <div style={glass('rgba(0,212,255,0.15)')}>
            <div style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(0,212,255,0.5)', marginBottom: '1rem' }}>
              ANÁLISE {symbol} — 4 CAMADAS
            </div>

            {loading ? (
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '2rem 0' }}>⟳ Carregando dados reais...</div>
            ) : (
              <>
                {/* Score combinado grande */}
                <div style={{ textAlign: 'center', marginBottom: '1.25rem', padding: '0.75rem', background: `${dirColor}10`, border: `0.5px solid ${dirColor}30`, borderRadius: '6px' }}>
                  <div style={{ fontSize: '8px', letterSpacing: '3px', color: 'rgba(255,255,255,0.3)', marginBottom: '4px' }}>SINAL COMBINADO</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 900, color: dirColor, textShadow: `0 0 20px ${dirColor}60` }}>{dir}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>score {analysis?.combined_score?.toFixed(3)}</div>
                </div>

                {/* Barras das 4 camadas */}
                {layers.map(({ label, score, color }) => {
                  const pct    = Math.abs(score) * 100
                  const isBuy  = score > 0
                  return (
                    <div key={label} style={{ marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', fontSize: '9px' }}>
                        <span style={{ color: 'rgba(255,255,255,0.4)', letterSpacing: '2px' }}>{label}</span>
                        <span style={{ color: isBuy ? '#00ff88' : score < 0 ? '#ff4444' : '#666' }}>
                          {score > 0.1 ? '▲ BUY' : score < -0.1 ? '▼ SELL' : '● HOLD'}
                          <span style={{ color: 'rgba(255,255,255,0.25)', marginLeft: '4px' }}>{score.toFixed(3)}</span>
                        </span>
                      </div>
                      <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden', position: 'relative' }}>
                        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', width: '1px', height: '100%', background: 'rgba(255,255,255,0.15)' }} />
                        <div style={{ position: 'absolute', [isBuy ? 'left' : 'right']: '50%', width: `${pct / 2}%`, height: '100%', background: isBuy ? '#00ff88' : '#ff4444', borderRadius: '2px', boxShadow: `0 0 6px ${isBuy ? '#00ff88' : '#ff4444'}` }} />
                      </div>
                    </div>
                  )
                })}

                {analysis && (
                  <div style={{ marginTop: '0.75rem', padding: '0.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}>
                    Preço: <span style={{ color: '#fff' }}>${analysis.price?.toLocaleString('pt-BR')}</span> •
                    Fluxo: <span style={{ color: analysis.flow?.buy_pressure > 0.5 ? '#00ff88' : '#ff4444' }}>{(analysis.flow?.buy_pressure * 100).toFixed(0)}% buy</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Estratégias GA + Trades */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '1rem' }}>

          {/* Estratégias reais do banco */}
          <div style={glass('rgba(124,58,255,0.2)')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(124,58,255,0.6)' }}>ESTRATÉGIAS GA</span>
              <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)' }}>{estrategias.length} no banco</span>
            </div>
            {estrategias.length === 0 ? (
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: '1.5rem 0' }}>
                Nenhuma estratégia criada ainda.<br/>
                <span style={{ color: '#7c3aff' }}>Use /dashboard/strategies para evoluir.</span>
              </div>
            ) : (
              estrategias.slice(0, 4).map(e => {
                const colors: Record<string, string> = { trading: '#00d4ff', grid: '#7c3aff', dca: '#00ff88', arbitragem: '#ff0080' }
                const color = colors[e.tipo] || '#888'
                return (
                  <div key={e.id} style={{ padding: '0.75rem', marginBottom: '0.5rem', background: 'rgba(255,255,255,0.02)', borderLeft: `2px solid ${color}`, borderRadius: '0 4px 4px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#fff' }}>{e.nome}</span>
                      <span style={{ fontSize: '9px', color: e.status === 'concluido' ? '#00ff88' : '#f59e0b', letterSpacing: '1px' }}>
                        {e.status === 'concluido' ? '✓' : '⟳'} {e.status}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', fontSize: '9px', color: 'rgba(255,255,255,0.35)' }}>
                      <span>{e.symbol}</span>
                      <span>Fit: <span style={{ color }}>{e.fitnessScore.toFixed(2)}</span></span>
                      <span>Ret: <span style={{ color: '#00ff88' }}>+{e.retornoEsperado.toFixed(1)}%</span></span>
                      <span>Gen: #{e.geracao}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Resumo de trades */}
          <div style={glass('rgba(0,212,255,0.15)')}>
            <div style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(0,212,255,0.5)', marginBottom: '1rem' }}>RESUMO DE TRADES</div>
            {summary ? (
              <>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#00d4ff', marginBottom: '1rem' }}>
                  ${summary.lucroTotal}
                </div>
                {[
                  { label: 'TOTAL DE TRADES', value: summary.totalTrades.toString(), color: '#fff' },
                  { label: 'FECHADOS',         value: summary.fechados.toString(),    color: '#00ff88' },
                  { label: 'ABERTOS',          value: summary.abertos.toString(),     color: '#f59e0b' },
                  { label: 'WIN RATE',         value: `${summary.winRate}%`,          color: summary.winRate >= '50' ? '#00ff88' : '#ff4444' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '0.5px solid rgba(255,255,255,0.05)', fontSize: '10px' }}>
                    <span style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '2px' }}>{label}</span>
                    <span style={{ color, fontWeight: 700 }}>{value}</span>
                  </div>
                ))}
              </>
            ) : (
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: '1.5rem 0' }}>⟳ Carregando trades...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
