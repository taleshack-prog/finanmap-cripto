'use client'
import { useEffect, useState, useCallback } from 'react'

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

interface BotStatus {
  bot_id: string; strategy_id: string; symbol: string; timeframe: string
  is_running: boolean; dry_run: boolean; use_flow_filter: boolean
  position: string; entry_price: number; position_size: number
  unrealized_pnl: number; total_trades: number; winning_trades: number
  win_rate: number; total_pnl: number; last_signal: string; last_score: number
  last_flow: { buy_pressure: number; sell_pressure: number; flow_score: number; flow_ok: boolean; change_24h: number } | null
  last_check: number; errors: number; log: Array<{ ts: number; level: string; msg: string }>
  config: { w_rsi: number; w_macd: number; w_bollinger: number; w_ema: number; stop_loss_pct: number; take_profit_pct: number; min_buy_pressure: number }
}

interface Advise {
  symbol: string; score: number; color: string; label: string; action: string
  scores: Record<string, number>
  breakdown: { network?: any; mempool?: any; funding?: any }
  note: string; timestamp: number
}

const SIGNAL_COLOR: Record<string, string> = {
  BUY: '#00ff88', SELL: '#ff4444', HOLD: '#f59e0b'
}
const ADVISE_COLOR: Record<string, string> = {
  green: '#00ff88', yellow: '#f59e0b', red: '#ff4444'
}
const ADVISE_BG: Record<string, string> = {
  green: 'rgba(0,255,136,0.08)', yellow: 'rgba(245,158,11,0.08)', red: 'rgba(255,68,68,0.08)'
}

export default function MonitorPage() {
  const [bots,       setBots]       = useState<BotStatus[]>([])
  const [advise,     setAdvise]     = useState<Record<string, Advise>>({})
  const [loading,    setLoading]    = useState(true)
  const [lastUpdate, setLastUpdate] = useState('')
  const [stopping,   setStopping]   = useState<string | null>(null)
  const [ticking,    setTicking]    = useState<string | null>(null)
  const [selectedBot, setSelectedBot] = useState<string | null>(null)

  const fetchBots = useCallback(async () => {
    try {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 8000)
      const r = await fetch(`${GA}/bot/list`, { signal: controller.signal })
      const d = await r.json()
      const botList: BotStatus[] = d.bots || []
      setBots(botList)

      // Busca advise para cada símbolo único
      const symbols = Array.from(new Set(botList.map(b => b.symbol.replace('/USDT','').replace('/BTC',''))))
      const adviseMap: Record<string, Advise> = {}
      await Promise.allSettled(
        symbols.map(async sym => {
          try {
            const r = await fetch(`${GA}/advise/${sym}`)
            if (r.ok) adviseMap[sym] = await r.json()
          } catch { }
        })
      )
      setAdvise(adviseMap)
      setLastUpdate(new Date().toLocaleTimeString('pt-BR'))
    } catch { }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchBots()
    const interval = setInterval(fetchBots, 30000)
    return () => clearInterval(interval)
  }, [fetchBots])

  const stopBot = async (botId: string) => {
    setStopping(botId)
    try {
      await fetch(`${GA}/bot/stop/${botId}`, { method: 'POST' })
      await fetchBots()
    } catch { } finally { setStopping(null) }
  }

  const tickBot = async (botId: string) => {
    setTicking(botId)
    try {
      await fetch(`${GA}/bot/tick/${botId}`, { method: 'POST' })
      await fetchBots()
    } catch { } finally { setTicking(null) }
  }

  const selectedBotData = bots.find(b => b.bot_id === selectedBot) || bots[0]
  const totalPnl        = bots.reduce((s, b) => s + b.total_pnl, 0)
  const totalTrades     = bots.reduce((s, b) => s + b.total_trades, 0)
  const runningBots     = bots.filter(b => b.is_running).length

  return (
    <div style={{ fontFamily: '"Courier New", monospace', color: '#fff' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(0,212,255,0.04) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '6px', color: 'rgba(0,212,255,0.5)', marginBottom: '4px' }}>SISTEMA</div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, background: 'linear-gradient(135deg, #00d4ff, #00ff88)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Monitor de Robôs</h1>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            {lastUpdate && <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)' }}>atualizado {lastUpdate}</span>}
            <button onClick={fetchBots} style={{ padding: '0.4rem 1rem', fontSize: '9px', letterSpacing: '3px', background: 'rgba(0,212,255,0.15)', border: '0.5px solid rgba(0,212,255,0.3)', color: '#00d4ff', cursor: 'pointer', borderRadius: '4px' }}>
              ↻ ATUALIZAR
            </button>
          </div>
        </div>

        {/* Métricas globais */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {[
            { label: 'BOTS ATIVOS',   value: `${runningBots}/${bots.length}`, color: '#00ff88' },
            { label: 'TOTAL TRADES',  value: totalTrades.toString(),           color: '#00d4ff' },
            { label: 'PnL SIMULADO',  value: `${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`, color: totalPnl >= 0 ? '#00ff88' : '#ff4444' },
            { label: 'MODO',          value: bots.some(b => !b.dry_run) ? 'REAL' : 'DRY RUN', color: bots.some(b => !b.dry_run) ? '#ff4444' : '#f59e0b' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ ...glass(`${color}25`), borderTop: `2px solid ${color}`, padding: '1rem' }}>
              <div style={{ fontSize: '8px', letterSpacing: '3px', color: 'rgba(255,255,255,0.3)', marginBottom: '0.5rem' }}>{label}</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color }}>{value}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.3)', fontSize: '11px' }}>⟳ Carregando bots...</div>
        ) : bots.length === 0 ? (
          <div style={{ ...glass(), textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.3)', fontSize: '11px' }}>
            Nenhum bot ativo.<br/>
            <span style={{ color: '#7c3aff' }}>Ative uma estratégia em /dashboard/strategies</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: selectedBotData ? '1fr 1.4fr' : '1fr', gap: '1rem' }}>

            {/* Lista de bots */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {bots.map(bot => {
                const sym      = bot.symbol.replace('/USDT','').replace('/BTC','')
                const adv      = advise[sym]
                const advColor = adv ? ADVISE_COLOR[adv.color] : '#888'
                const sigColor = SIGNAL_COLOR[bot.last_signal] || '#888'
                const isSelected = selectedBot === bot.bot_id || (!selectedBot && bot === bots[0])

                return (
                  <div key={bot.bot_id} onClick={() => setSelectedBot(bot.bot_id)}
                    style={{ ...glass(isSelected ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.08)'), cursor: 'pointer', borderLeft: `3px solid ${bot.is_running ? '#00ff88' : '#ff4444'}`, transition: 'all 0.2s' }}>

                    {/* Header do bot */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: bot.is_running ? '#00ff88' : '#ff4444', boxShadow: bot.is_running ? '0 0 8px #00ff88' : 'none', flexShrink: 0 }} />
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>{bot.symbol} · {bot.timeframe}</div>
                          <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.3)', letterSpacing: '1px' }}>{bot.bot_id.slice(0, 16)}...</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                        <button onClick={e => { e.stopPropagation(); tickBot(bot.bot_id) }}
                          disabled={ticking === bot.bot_id}
                          style={{ padding: '0.3rem 0.6rem', fontSize: '8px', letterSpacing: '1px', cursor: 'pointer', background: 'rgba(0,212,255,0.1)', border: '0.5px solid rgba(0,212,255,0.3)', color: '#00d4ff', borderRadius: '4px' }}>
                          {ticking === bot.bot_id ? '⟳' : '▷ TICK'}
                        </button>
                        <button onClick={e => { e.stopPropagation(); stopBot(bot.bot_id) }}
                          disabled={stopping === bot.bot_id}
                          style={{ padding: '0.3rem 0.6rem', fontSize: '8px', cursor: 'pointer', background: 'rgba(255,68,68,0.1)', border: '0.5px solid rgba(255,68,68,0.3)', color: '#ff4444', borderRadius: '4px' }}>
                          {stopping === bot.bot_id ? '⟳' : '■ STOP'}
                        </button>
                      </div>
                    </div>

                    {/* Métricas do bot */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      {[
                        { label: 'SINAL',    value: bot.last_signal, color: sigColor },
                        { label: 'SCORE',    value: bot.last_score?.toFixed(3) || '0', color: sigColor },
                        { label: 'TRADES',   value: bot.total_trades.toString(), color: '#00d4ff' },
                        { label: 'WIN RATE', value: `${bot.win_rate.toFixed(0)}%`, color: bot.win_rate >= 50 ? '#00ff88' : '#ff4444' },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ textAlign: 'center', padding: '0.4rem', background: 'rgba(255,255,255,0.02)', borderRadius: '4px' }}>
                          <div style={{ fontSize: '7px', color: 'rgba(255,255,255,0.25)', marginBottom: '2px', letterSpacing: '1px' }}>{label}</div>
                          <div style={{ fontSize: '12px', fontWeight: 700, color }}>{value}</div>
                        </div>
                      ))}
                    </div>

                    {/* PnL e posição */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>
                      <span>PnL: <span style={{ color: bot.total_pnl >= 0 ? '#00ff88' : '#ff4444' }}>{bot.total_pnl >= 0 ? '+' : ''}${bot.total_pnl.toFixed(2)}</span></span>
                      <span>Pos: <span style={{ color: bot.position !== 'none' ? '#f59e0b' : 'rgba(255,255,255,0.3)' }}>{bot.position === 'none' ? 'NEUTRO' : bot.position.toUpperCase()}</span></span>
                      {bot.position !== 'none' && <span>PnL não real: <span style={{ color: bot.unrealized_pnl >= 0 ? '#00ff88' : '#ff4444' }}>{bot.unrealized_pnl.toFixed(2)}%</span></span>}
                      <span style={{ color: adv ? advColor : '#888' }}>
                        {adv ? `● ${adv.color.toUpperCase()}` : '○ advise...'}
                      </span>
                    </div>

                    {/* Fluxo */}
                    {bot.last_flow && (
                      <div style={{ marginTop: '0.5rem', padding: '0.4rem', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', fontSize: '8px', color: 'rgba(255,255,255,0.3)', display: 'flex', gap: '1rem' }}>
                        <span>Buy: <span style={{ color: bot.last_flow.buy_pressure > 0.5 ? '#00ff88' : '#ff4444' }}>{(bot.last_flow.buy_pressure * 100).toFixed(0)}%</span></span>
                        <span>Sell: <span style={{ color: '#ff4444' }}>{(bot.last_flow.sell_pressure * 100).toFixed(0)}%</span></span>
                        <span>Flow: <span style={{ color: bot.last_flow.flow_score > 0 ? '#00ff88' : '#ff4444' }}>{bot.last_flow.flow_score.toFixed(3)}</span></span>
                        <span>Filter: <span style={{ color: bot.last_flow.flow_ok ? '#00ff88' : '#ff4444' }}>{bot.last_flow.flow_ok ? 'OK' : 'BLOQUEADO'}</span></span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Painel detalhado do bot selecionado */}
            {selectedBotData && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

                {/* Advise on-chain */}
                {(() => {
                  const sym = selectedBotData.symbol.replace('/USDT','').replace('/BTC','')
                  const adv = advise[sym]
                  const color = adv ? ADVISE_COLOR[adv.color] : '#888'
                  const bg    = adv ? ADVISE_BG[adv.color]    : 'transparent'
                  return (
                    <div style={{ ...glass(`${color}30`), background: bg }}>
                      <div style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(255,255,255,0.3)', marginBottom: '0.75rem' }}>ADVISE ON-CHAIN — CONSELHEIRO EXTERNO</div>
                      {adv ? (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                            {/* Semáforo */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                              {(['green','yellow','red'] as const).map(c => (
                                <div key={c} style={{ width: '16px', height: '16px', borderRadius: '50%', background: adv.color === c ? ADVISE_COLOR[c] : 'rgba(255,255,255,0.05)', boxShadow: adv.color === c ? `0 0 12px ${ADVISE_COLOR[c]}` : 'none', transition: 'all 0.3s' }} />
                              ))}
                            </div>
                            <div>
                              <div style={{ fontSize: '1.1rem', fontWeight: 700, color, marginBottom: '4px' }}>{adv.color.toUpperCase()}</div>
                              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>{adv.label}</div>
                            </div>
                            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                              <div style={{ fontSize: '1.4rem', fontWeight: 900, color }}>{(adv.score * 100).toFixed(0)}</div>
                              <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.3)' }}>score/100</div>
                            </div>
                          </div>

                          {/* Breakdown scores */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {Object.entries(adv.scores).map(([key, val]) => {
                              const norm = (val + 1) / 2
                              const c    = norm > 0.6 ? '#00ff88' : norm < 0.4 ? '#ff4444' : '#f59e0b'
                              return (
                                <div key={key}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', marginBottom: '2px' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '1px' }}>{key.toUpperCase()}</span>
                                    <span style={{ color: c }}>{val > 0 ? '+' : ''}{val.toFixed(3)}</span>
                                  </div>
                                  <div style={{ height: '2px', background: 'rgba(255,255,255,0.06)', borderRadius: '1px', overflow: 'hidden', position: 'relative' }}>
                                    <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', width: '1px', height: '100%', background: 'rgba(255,255,255,0.15)' }} />
                                    <div style={{ position: 'absolute', [val >= 0 ? 'left' : 'right']: '50%', width: `${Math.abs(val) * 50}%`, height: '100%', background: c }} />
                                  </div>
                                </div>
                              )
                            })}
                          </div>

                          <div style={{ marginTop: '0.75rem', padding: '0.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', fontSize: '8px', color: 'rgba(255,255,255,0.2)', lineHeight: 1.6 }}>
                            ℹ {adv.note}<br/>
                            Atualizado: {new Date(adv.timestamp * 1000).toLocaleTimeString('pt-BR')}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: '1rem' }}>⟳ Carregando advise...</div>
                      )}
                    </div>
                  )
                })()}

                {/* Pesos do cromossomo */}
                <div style={glass('rgba(124,58,255,0.2)')}>
                  <div style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(124,58,255,0.5)', marginBottom: '0.75rem' }}>CROMOSSOMO ATIVO</div>
                  {[
                    { label: 'RSI',       val: selectedBotData.config.w_rsi,       color: '#00d4ff' },
                    { label: 'MACD',      val: selectedBotData.config.w_macd,      color: '#7c3aff' },
                    { label: 'BOLLINGER', val: selectedBotData.config.w_bollinger, color: '#ff0080' },
                    { label: 'EMA',       val: selectedBotData.config.w_ema,       color: '#00ff88' },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={{ marginBottom: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', marginBottom: '2px' }}>
                        <span style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '1px' }}>{label}</span>
                        <span style={{ color }}>{(val * 100).toFixed(1)}%</span>
                      </div>
                      <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${val * 100}%`, background: color, boxShadow: `0 0 6px ${color}` }} />
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>
                    <span>Stop: <span style={{ color: '#ff4444' }}>{selectedBotData.config.stop_loss_pct}%</span></span>
                    <span>Take: <span style={{ color: '#00ff88' }}>{selectedBotData.config.take_profit_pct}%</span></span>
                    <span>Buy pressure mín: <span style={{ color: '#00d4ff' }}>{(selectedBotData.config.min_buy_pressure * 100).toFixed(0)}%</span></span>
                  </div>
                </div>

                {/* Log de decisões */}
                <div style={glass('rgba(0,212,255,0.1)')}>
                  <div style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(0,212,255,0.4)', marginBottom: '0.75rem' }}>LOG DE DECISÕES</div>
                  <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                    {selectedBotData.log.length === 0 ? (
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: '1rem' }}>Nenhuma decisão ainda — force um tick</div>
                    ) : (
                      [...selectedBotData.log].reverse().map((entry, i) => {
                        const levelColor = entry.level === 'ERROR' ? '#ff4444' : entry.level === 'WARNING' ? '#f59e0b' : 'rgba(255,255,255,0.4)'
                        const ts = new Date(entry.ts * 1000).toLocaleTimeString('pt-BR')
                        return (
                          <div key={i} style={{ padding: '4px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)', fontSize: '9px', lineHeight: 1.5 }}>
                            <span style={{ color: 'rgba(255,255,255,0.2)', marginRight: '8px' }}>{ts}</span>
                            <span style={{ color: levelColor }}>{entry.msg}</span>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
