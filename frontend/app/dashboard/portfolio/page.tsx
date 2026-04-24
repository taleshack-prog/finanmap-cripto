'use client'
import { useEffect, useState } from 'react'

const API = 'http://localhost:3020'
const GA  = 'http://localhost:8110'

function getToken() {
  if (typeof window !== 'undefined') return localStorage.getItem('finanmap_token') || ''
  return ''
}

const STABLECOINS_SET = new Set(['USDT','USDC','BUSD','DAI','TUSD','FDUSD'])
const MEMECOINS_SET   = new Set(['DOGE','SHIB','PEPE','FLOKI','BONK','WIF','BOME'])
function guessCategory(symbol: string): string {
  if (symbol === 'BTC') return 'bitcoin'
  if (STABLECOINS_SET.has(symbol)) return 'stablecoin'
  if (MEMECOINS_SET.has(symbol)) return 'memecoin'
  return 'altcoin'
}

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  bitcoin:    { label: 'Bitcoin',     color: '#f7931a' },
  altcoin:    { label: 'Altcoins',    color: '#7c3aff' },
  stablecoin: { label: 'Stablecoins', color: '#00d4ff' },
  memecoin:   { label: 'Memecoins',   color: '#ff0080' },
  other:      { label: 'Outros',      color: '#888' },
}

interface Asset {
  symbol:         string
  quantity:       number
  price_usdt:     number
  value_usdt:     number
  change_24h:     number
  category:       string
  allocation_pct: number
  source:         string
}

interface Portfolio {
  total_usdt:  number
  assets:      Asset[]
  by_category: Record<string, { total_usdt: number; count: number }>
  count:       number
  source:      string
}

interface ManualAsset { symbol: string; quantity: string }

const glass = (accent = 'rgba(124,58,255,0.2)') => ({
  background:    'rgba(255,255,255,0.02)',
  border:        `0.5px solid ${accent}`,
  backdropFilter: 'blur(20px)',
  borderRadius:  '8px',
  padding:       '1.25rem',
} as React.CSSProperties)

export default function PortfolioPage() {
  const [portfolio, setPortfolio]   = useState<Portfolio | null>(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [mode, setMode]             = useState<'binance' | 'manual'>('binance')
  const [filter, setFilter]         = useState('all')
  const [search, setSearch]         = useState('')
  const [manualAssets, setManualAssets] = useState<ManualAsset[]>([
    { symbol: 'BTC',  quantity: '0.5'  },
    { symbol: 'ETH',  quantity: '2.0'  },
    { symbol: 'SOL',  quantity: '10.0' },
    { symbol: 'USDT', quantity: '500'  },
  ])

  useEffect(() => { fetchBinance() }, [])

  const fetchBinance = async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch(`${API}/api/portfolio`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      })
      if (!r.ok) throw new Error(await r.text())
      const data = await r.json()

      // Normaliza formato do banco (ativos/quantidade/precoUnitario) → interface Portfolio
      const raw: any[] = data.ativos || []
      const total = parseFloat(data.totalUsd || '0')
      const assets: Asset[] = raw.map(a => {
        const qty   = Number(a.quantidade)
        const price = Number(a.precoUnitario)
        const value = qty * price
        const cat   = guessCategory(a.ativo)
        return {
          symbol:         a.ativo,
          quantity:       qty,
          price_usdt:     price,
          value_usdt:     value,
          change_24h:     0,
          category:       cat,
          allocation_pct: total > 0 ? Math.round(value / total * 1000) / 10 : 0,
          source:         a.exchangeName || 'database',
        }
      }).sort((a, b) => b.value_usdt - a.value_usdt)

      // Reconstrói by_category
      const by_category: Record<string, { total_usdt: number; count: number }> = {}
      for (const a of assets) {
        if (!by_category[a.category]) by_category[a.category] = { total_usdt: 0, count: 0 }
        by_category[a.category].total_usdt += a.value_usdt
        by_category[a.category].count++
      }

      setPortfolio({ total_usdt: total, assets, by_category, count: assets.length, source: 'database' })
    } catch (e: any) {
      setError(e.message || 'Erro ao buscar portfólio')
    } finally { setLoading(false) }
  }

  const fetchManual = async () => {
    setLoading(true); setError('')
    try {
      const assets = manualAssets
        .filter(a => a.symbol && parseFloat(a.quantity) > 0)
        .map(a => ({ symbol: a.symbol.toUpperCase(), quantity: parseFloat(a.quantity) }))

      const r = await fetch(`${GA}/portfolio/manual`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ assets }),
      })
      if (!r.ok) throw new Error(await r.text())
      setPortfolio(await r.json())
    } catch (e: any) {
      setError(e.message || 'Erro ao calcular portfólio manual')
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchManual() }, [])

  const addManualRow = () =>
    setManualAssets(prev => [...prev, { symbol: '', quantity: '' }])

  const updateManualRow = (i: number, field: keyof ManualAsset, val: string) =>
    setManualAssets(prev => prev.map((a, idx) => idx === i ? { ...a, [field]: val } : a))

  const removeManualRow = (i: number) =>
    setManualAssets(prev => prev.filter((_, idx) => idx !== i))

  const filteredAssets = portfolio?.assets.filter(a => {
    const matchCat    = filter === 'all' || a.category === filter
    const matchSearch = a.symbol.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  }) ?? []

  const total = portfolio?.total_usdt ?? 0

  return (
    <div style={{ fontFamily: '"Courier New", monospace', color: '#fff' }}>

      {/* Background */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 60% 50% at 10% 50%, rgba(99,0,255,0.06) 0%, transparent 60%)', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '10px', letterSpacing: '6px', color: 'rgba(124,58,255,0.5)', marginBottom: '4px' }}>PORTFÓLIO</div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, background: 'linear-gradient(135deg, #00d4ff, #7c3aff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Meus Ativos
          </h1>
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          {(['binance', 'manual'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: '0.5rem 1.5rem', fontSize: '10px', letterSpacing: '3px',
              cursor: 'pointer', borderRadius: '4px', transition: 'all 0.2s',
              background: mode === m ? 'rgba(124,58,255,0.4)' : 'transparent',
              border: `0.5px solid ${mode === m ? '#7c3aff' : 'rgba(255,255,255,0.1)'}`,
              color: mode === m ? '#fff' : 'rgba(255,255,255,0.4)',
            }}>
              {m === 'binance' ? '⟁ BINANCE API' : '+ MANUAL'}
            </button>
          ))}
        </div>

        {/* Binance mode */}
        {mode === 'binance' && (
          <div style={{ ...glass('rgba(124,58,255,0.2)'), marginBottom: '1rem' }}>
            <div style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(124,58,255,0.6)', marginBottom: '1rem' }}>CONEXÃO BINANCE</div>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: '1rem', lineHeight: 1.6 }}>
              Usando as API Keys configuradas no <code style={{ color: '#00d4ff' }}>.env</code> do projeto.<br/>
              Os saldos são buscados em tempo real da sua conta Binance.
            </p>
            <button onClick={fetchBinance} disabled={loading} style={{
              padding: '0.7rem 2rem', fontSize: '11px', letterSpacing: '3px',
              background: 'linear-gradient(135deg, rgba(124,58,255,0.8), rgba(0,212,255,0.6))',
              border: '1px solid rgba(124,58,255,0.5)', color: '#fff',
              cursor: loading ? 'wait' : 'pointer', borderRadius: '2px',
            }}>
              {loading ? '⟳ SINCRONIZANDO...' : '⟁ BUSCAR SALDO REAL'}
            </button>
          </div>
        )}

        {/* Manual mode */}
        {mode === 'manual' && (
          <div style={{ ...glass('rgba(0,212,255,0.15)'), marginBottom: '1rem' }}>
            <div style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(0,212,255,0.5)', marginBottom: '1rem' }}>INSERIR ATIVOS MANUALMENTE</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              {manualAssets.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    placeholder="SÍMBOLO (ex: BTC)"
                    value={a.symbol}
                    onChange={e => updateManualRow(i, 'symbol', e.target.value.toUpperCase())}
                    style={{
                      width: '120px', padding: '0.4rem 0.6rem', fontSize: '11px',
                      background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.15)',
                      color: '#fff', borderRadius: '4px', fontFamily: 'inherit', letterSpacing: '2px',
                    }}
                  />
                  <input
                    placeholder="Quantidade"
                    value={a.quantity}
                    type="number"
                    step="any"
                    onChange={e => updateManualRow(i, 'quantity', e.target.value)}
                    style={{
                      width: '140px', padding: '0.4rem 0.6rem', fontSize: '11px',
                      background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.15)',
                      color: '#fff', borderRadius: '4px', fontFamily: 'inherit',
                    }}
                  />
                  <button onClick={() => removeManualRow(i)} style={{
                    padding: '0.4rem 0.7rem', fontSize: '11px',
                    background: 'rgba(255,0,0,0.1)', border: '0.5px solid rgba(255,0,0,0.3)',
                    color: '#ff4444', cursor: 'pointer', borderRadius: '4px',
                  }}>✕</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={addManualRow} style={{
                padding: '0.5rem 1rem', fontSize: '10px', letterSpacing: '2px',
                background: 'transparent', border: '0.5px solid rgba(0,212,255,0.3)',
                color: 'rgba(0,212,255,0.7)', cursor: 'pointer', borderRadius: '4px',
              }}>+ ADICIONAR ATIVO</button>
              <button onClick={fetchManual} disabled={loading} style={{
                padding: '0.5rem 1.5rem', fontSize: '10px', letterSpacing: '3px',
                background: 'linear-gradient(135deg, rgba(0,212,255,0.5), rgba(124,58,255,0.5))',
                border: '0.5px solid rgba(0,212,255,0.4)', color: '#fff',
                cursor: loading ? 'wait' : 'pointer', borderRadius: '4px',
              }}>{loading ? '⟳ CALCULANDO...' : '▸ CALCULAR'}</button>
            </div>
          </div>
        )}

        {error && (
          <div style={{ ...glass('rgba(255,50,50,0.3)'), marginBottom: '1rem', color: '#ff6666', fontSize: '11px' }}>
            ✕ {error}
          </div>
        )}

        {portfolio && (
          <>
            {/* Total + categoria summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ ...glass('rgba(0,212,255,0.2)'), borderTop: '2px solid #00d4ff', gridColumn: 'span 2' }}>
                <div style={{ fontSize: '9px', letterSpacing: '4px', color: 'rgba(0,212,255,0.5)', marginBottom: '0.5rem' }}>TOTAL PORTFÓLIO</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#00d4ff', textShadow: '0 0 20px #00d4ff50' }}>
                  ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', marginTop: '4px' }}>{portfolio.count} ativos • {portfolio.source}</div>
              </div>

              {Object.entries(CATEGORY_CONFIG).filter(([k]) => portfolio.by_category?.[k]).map(([cat, cfg]) => {
                const data = portfolio.by_category?.[cat]
                if (!data) return null
                return (
                  <div key={cat} style={{ ...glass(`${cfg.color}25`), borderTop: `2px solid ${cfg.color}`, cursor: 'pointer' }}
                    onClick={() => setFilter(filter === cat ? 'all' : cat)}>
                    <div style={{ fontSize: '8px', letterSpacing: '3px', color: `${cfg.color}`, marginBottom: '4px' }}>{cfg.label.toUpperCase()}</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: cfg.color }}>${data.total_usdt.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</div>
                    <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', marginTop: '2px' }}>{data.count} ativos</div>
                  </div>
                )
              })}
            </div>

            {/* Search + filter */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
              <input
                placeholder="Buscar ativo..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  padding: '0.4rem 0.8rem', fontSize: '11px', letterSpacing: '2px',
                  background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)',
                  color: '#fff', borderRadius: '4px', fontFamily: 'inherit', width: '200px',
                }}
              />
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {['all', 'bitcoin', 'altcoin', 'stablecoin', 'memecoin'].map(f => (
                  <button key={f} onClick={() => setFilter(f)} style={{
                    padding: '0.3rem 0.8rem', fontSize: '9px', letterSpacing: '2px', cursor: 'pointer',
                    borderRadius: '20px', transition: 'all 0.2s',
                    background: filter === f ? (CATEGORY_CONFIG[f]?.color || '#7c3aff') + '30' : 'transparent',
                    border: `0.5px solid ${filter === f ? (CATEGORY_CONFIG[f]?.color || '#7c3aff') : 'rgba(255,255,255,0.1)'}`,
                    color: filter === f ? (CATEGORY_CONFIG[f]?.color || '#7c3aff') : 'rgba(255,255,255,0.35)',
                  }}>
                    {f === 'all' ? 'TODOS' : CATEGORY_CONFIG[f]?.label.toUpperCase()}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginLeft: 'auto' }}>
                {filteredAssets.length} ativos
              </span>
            </div>

            {/* Assets table */}
            <div style={glass('rgba(124,58,255,0.15)')}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
                    {['ATIVO', 'CATEGORIA', 'QTDE', 'PREÇO', 'VALOR', '24H', 'ALOCAÇÃO'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '0 0 10px', fontSize: '8px', letterSpacing: '2px', color: 'rgba(255,255,255,0.25)', fontWeight: 400 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredAssets.map((asset) => {
                    const cfg = CATEGORY_CONFIG[asset.category] || CATEGORY_CONFIG.other
                    return (
                      <tr key={asset.symbol} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '10px 0', fontWeight: 700, color: '#fff', letterSpacing: '1px' }}>{asset.symbol}</td>
                        <td style={{ padding: '10px 0' }}>
                          <span style={{ fontSize: '8px', padding: '2px 6px', borderRadius: '10px', background: cfg.color + '15', color: cfg.color, letterSpacing: '1px' }}>
                            {cfg.label}
                          </span>
                        </td>
                        <td style={{ padding: '10px 0', color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' }}>
                          {asset.quantity < 0.001 ? asset.quantity.toFixed(8) : asset.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}
                        </td>
                        <td style={{ padding: '10px 0', color: 'rgba(255,255,255,0.7)' }}>
                          ${asset.price_usdt.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: asset.price_usdt < 1 ? 6 : 2 })}
                        </td>
                        <td style={{ padding: '10px 0', fontWeight: 700, color: '#00d4ff' }}>
                          ${asset.value_usdt.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '10px 0', color: asset.change_24h >= 0 ? '#00ff88' : '#ff4444', fontWeight: 700 }}>
                          {asset.change_24h >= 0 ? '+' : ''}{asset.change_24h.toFixed(2)}%
                        </td>
                        <td style={{ padding: '10px 0', minWidth: '120px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: 1, height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${asset.allocation_pct}%`, background: cfg.color, borderRadius: '2px', boxShadow: `0 0 4px ${cfg.color}` }} />
                            </div>
                            <span style={{ fontSize: '9px', color: cfg.color, minWidth: '32px' }}>{asset.allocation_pct.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
