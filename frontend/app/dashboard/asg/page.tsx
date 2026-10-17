"use client"
import { useEffect, useRef, useState, useCallback } from "react"
import { createChart, ColorType, CrosshairMode, LineStyle, CandlestickSeries, LineSeries } from "lightweight-charts"
import { create } from "zustand"

const GA = process.env.NEXT_PUBLIC_GA_URL || "http://localhost:8110"
const WS = (process.env.NEXT_PUBLIC_GA_URL || "http://localhost:8110").replace("https://","wss://").replace("http://","ws://")

// ─── Zustand Store ─────────────────────────────────────────────────────────
interface MonitorData {
  symbol:        string
  timestamp:     number
  current_price: number
  asg:   { linha_azul: number; bias: string; distance_pct: number }
  rvp:   { vwap: number; rvp1_plus: number; rvp1_minus: number; rvp2_plus: number; rvp2_minus: number; rvp3_plus: number; rvp3_minus: number }
  micro: { cvd_score: number; buy_pressure: number; sell_pressure: number; divergence: string }
  quant: { z_score: number; exhaustion: boolean }
  bot_status: any
}

interface MonitorStore {
  data:      MonitorData | null
  symbol:    string
  connected: boolean
  setData:   (d: MonitorData) => void
  setSymbol: (s: string) => void
  setConnected: (c: boolean) => void
}

const useMonitor = create<MonitorStore>((set) => ({
  data:      null,
  symbol:    "ZEC/USDT",
  connected: false,
  setData:      (data)      => set({ data }),
  setSymbol:    (symbol)    => set({ symbol }),
  setConnected: (connected) => set({ connected }),
}))

// ─── Símbolos disponíveis ──────────────────────────────────────────────────
const SYMBOLS = ["ZEC/USDT","NEAR/USDT","EDEN/USDT","LUMIA/USDT","GTC/USDT","FIDA/USDT","KITE/USDT","ZBT/USDT","STRK/USDT","AXS/USDT","BTC/USDT","ETH/USDT"]

// ─── Componente principal ──────────────────────────────────────────────────
export default function ASGMonitorPage() {
  const { data, symbol, connected, setData, setSymbol, setConnected } = useMonitor()
  const chartRef     = useRef<HTMLDivElement>(null)
  const chartObj     = useRef<any>(null)
  const candleSeries = useRef<any>(null)
  const asgLine      = useRef<any>(null)
  const rvpLines     = useRef<any[]>([])
  const wsRef        = useRef<WebSocket | null>(null)
  const [candles, setCandles]   = useState<any[]>([])
  const [killPending, setKillPending] = useState(false)
  const [loading, setLoading]   = useState(false)

  const handleSymbolChange = (s: string) => {
    if (s === symbol || loading) return
    setLoading(true)
    if (chartObj.current) {
      chartObj.current.remove()
      chartObj.current     = null
      candleSeries.current = null
      asgLine.current      = null
      rvpLines.current     = []
    }
    setCandles([])
    setSymbol(s)
    setTimeout(() => setLoading(false), 500)
  }

  // ─── WebSocket ────────────────────────────────────────────────────────
  const connectWS = useCallback((sym: string) => {
    if (wsRef.current) wsRef.current.close()
    const ws = new WebSocket(`${WS}/ws/monitor/${sym.replace("/", "-")}`)
    ws.onopen    = () => setConnected(true)
    ws.onclose   = () => { setConnected(false); setTimeout(() => connectWS(sym), 3000) }
    ws.onerror   = () => setConnected(false)
    ws.onmessage = (e) => {
      try { setData(JSON.parse(e.data)) } catch {}
    }
    wsRef.current = ws
  }, [setData, setConnected])

  useEffect(() => { connectWS(symbol) }, [symbol, connectWS])

  // ─── Fetch candles iniciais ───────────────────────────────────────────
  useEffect(() => {
    setCandles([])  // limpa candles ao trocar símbolo
    const sym = encodeURIComponent(symbol)
    fetch(`${GA}/market/ohlcv?symbol=${sym}&timeframe=15m&limit=50`)
      .then(r => r.json())
      .then(d => {
        if (d.timestamps && Array.isArray(d.timestamps)) {
          const formatted = d.timestamps.map((ts: number, i: number) => ({
            timestamp: ts,
            open:  d.opens[i],
            high:  d.highs[i],
            low:   d.lows[i],
            close: d.closes[i],
          })).filter((c: any) => c.timestamp && !isNaN(c.timestamp))
          setCandles(formatted)
        }
      }).catch(() => {})
  }, [symbol])

  // ─── Inicializa o gráfico ─────────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current) return
    const chart = createChart(chartRef.current, {
      layout: {
        background:  { type: ColorType.Solid, color: "#0a0e17" },
        textColor:   "#8892a4",
      },
      grid: {
        vertLines:   { color: "#1a2035" },
        horzLines:   { color: "#1a2035" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#1a2035" },
      timeScale:       { borderColor: "#1a2035", timeVisible: true },
      width:  chartRef.current.clientWidth,
      height: 420,
    })

    const cs = chart.addSeries(CandlestickSeries, {
      upColor:         "#00ff88",
      downColor:       "#ff4444",
      borderUpColor:   "#00ff88",
      borderDownColor: "#ff4444",
      wickUpColor:     "#00ff88",
      wickDownColor:   "#ff4444",
    })

    // Linha Azul ASG
    const asg = chart.addSeries(LineSeries, {
      color:     "#00d4ff",
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      title:     "ASG",
    })

    // Linhas RVP
    const rvpColors = ["#888","#888","#f59e0b","#f59e0b","#ef4444","#ef4444"]
    const rvpStyles = [LineStyle.Dashed, LineStyle.Dashed, LineStyle.Dashed, LineStyle.Dashed, LineStyle.Dotted, LineStyle.Dotted]
    const rvpTitles = ["RVP+1","RVP-1","RVP+2","RVP-2","RVP+3","RVP-3"]
    const lines = rvpTitles.map((title, i) =>
      chart.addSeries(LineSeries, { color: rvpColors[i], lineWidth: 1, lineStyle: rvpStyles[i], title, lastValueVisible: false })
    )

    chartObj.current     = chart
    candleSeries.current = cs
    asgLine.current      = asg
    rvpLines.current     = lines

    const ro = new ResizeObserver(() => {
      if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth })
    })
    ro.observe(chartRef.current)

    return () => { ro.disconnect(); chart.remove() }
  }, [])

  // ─── Atualiza candles ─────────────────────────────────────────────────
  useEffect(() => {
    if (!candleSeries.current || candles.length === 0) return
    candleSeries.current.setData(candles.map((c: any) => ({
      time:  Math.floor(c.timestamp / 1000),
      open:  c.open, high: c.high, low: c.low, close: c.close,
    })))
  }, [candles])

  // ─── Atualiza linhas com dados do WebSocket ───────────────────────────
  useEffect(() => {
    if (!data || !asgLine.current || candles.length === 0) return
    const t = data.timestamp
    asgLine.current.update({ time: t, value: data.asg.linha_azul })
    const rvpVals = [data.rvp.rvp1_plus, data.rvp.rvp1_minus, data.rvp.rvp2_plus, data.rvp.rvp2_minus, data.rvp.rvp3_plus, data.rvp.rvp3_minus]
    rvpLines.current.forEach((line, i) => line.update({ time: t, value: rvpVals[i] }))
    // Atualiza último candle
    if (candleSeries.current) {
      const last = candles[candles.length - 1]
      if (last) candleSeries.current.update({
        time:  Math.floor(last.timestamp / 1000),
        open:  last.open, high: Math.max(last.high, data.current_price),
        low:   Math.min(last.low, data.current_price), close: data.current_price,
      })
    }
  }, [data, candles])

  // ─── Kill Switch ──────────────────────────────────────────────────────
  const handleKillSwitch = async () => {
    if (!confirm(`⚠️ PARAR todos os bots de ${symbol}?`)) return
    setKillPending(true)
    try {
      const bots = await fetch(`${GA}/bot/list`).then(r => r.json())
      for (const bot of bots.bots || []) {
        if (bot.symbol === symbol && bot.is_running) {
          await fetch(`${GA}/bot/stop/${bot.bot_id}`, { method: "POST" })
        }
      }
    } catch {}
    setKillPending(false)
  }

  const bias = data?.asg.bias || "—"
  const bullish = bias === "BULLISH"
  const buy  = data ? Math.round(data.micro.buy_pressure * 100) : 0
  const sell = data ? Math.round(data.micro.sell_pressure * 100) : 0
  const z    = data?.quant.z_score ?? 0
  const exhaustion = data?.quant.exhaustion ?? false

  return (
    <div style={{ background: "#0a0e17", minHeight: "100vh", color: "#e2e8f0", fontFamily: "'Space Mono', monospace", padding: "1rem" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span style={{ fontSize: "10px", letterSpacing: "4px", color: "#00d4ff" }}>⬡ ASG MONITOR</span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {SYMBOLS.map(s => (
              <button key={s} onClick={() => handleSymbolChange(s)}
                style={{ padding: "0.2rem 0.6rem", fontSize: "9px", letterSpacing: "2px",
                  background: symbol === s ? "rgba(0,212,255,0.2)" : "rgba(255,255,255,0.05)",
                  border: `0.5px solid ${symbol === s ? "#00d4ff" : "rgba(255,255,255,0.1)"}`,
                  color: symbol === s ? "#00d4ff" : "#8892a4", cursor: "pointer", borderRadius: "2px" }}>
                {s.replace("/USDT", "")}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: connected ? "#00ff88" : "#ff4444", display: "inline-block" }} />
          <span style={{ fontSize: "9px", color: connected ? "#00ff88" : "#ff4444", letterSpacing: "2px" }}>
            {connected ? "LIVE" : "OFFLINE"}
          </span>
        </div>
      </div>

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "1rem" }}>

        {/* Chart */}
        <div style={{ background: "#0d1320", border: "0.5px solid #1a2035", borderRadius: "8px", overflow: "hidden" }}>
          <div style={{ padding: "0.8rem 1rem", borderBottom: "0.5px solid #1a2035", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", letterSpacing: "3px", color: "#e2e8f0" }}>{symbol}</span>
            <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
              {data && <span style={{ fontSize: "14px", fontWeight: "bold", color: bullish ? "#00ff88" : "#ff4444" }}>
                ${data.current_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
              </span>}
              <span style={{ fontSize: "9px", letterSpacing: "3px", padding: "0.2rem 0.6rem", borderRadius: "3px",
                background: bullish ? "rgba(0,255,136,0.1)" : "rgba(255,68,68,0.1)",
                border: `0.5px solid ${bullish ? "#00ff88" : "#ff4444"}`,
                color: bullish ? "#00ff88" : "#ff4444" }}>
                {bias}
              </span>
            </div>
          </div>
          <div ref={chartRef} style={{ width: "100%", height: "420px" }} />
          {/* Legend */}
          <div style={{ padding: "0.6rem 1rem", borderTop: "0.5px solid #1a2035", display: "flex", gap: "1.5rem" }}>
            {[["#00d4ff","─","Linha Azul ASG"],["#f59e0b","- -","RVP ±2"],["#ef4444","···","RVP ±3"],["#888","- -","RVP ±1"]].map(([c,s,l]) => (
              <span key={l} style={{ fontSize: "9px", color: "#8892a4", display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ color: c as string, fontSize: "12px" }}>{s}</span>{l}
              </span>
            ))}
          </div>
        </div>

        {/* Side panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>

          {/* ASG Status */}
          <div style={{ background: "#0d1320", border: `0.5px solid ${bullish ? "rgba(0,255,136,0.3)" : "rgba(255,68,68,0.3)"}`, borderRadius: "8px", padding: "1rem" }}>
            <div style={{ fontSize: "9px", letterSpacing: "3px", color: "#8892a4", marginBottom: "0.8rem" }}>LINHA AZUL ASG</div>
            <div style={{ fontSize: "20px", fontWeight: "bold", color: bullish ? "#00ff88" : "#ff4444", marginBottom: "0.3rem" }}>
              {data ? `$${data.asg.linha_azul.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : "—"}
            </div>
            <div style={{ fontSize: "9px", color: "#8892a4" }}>
              Distância: <span style={{ color: bullish ? "#00ff88" : "#ff4444" }}>
                {data ? `${data.asg.distance_pct > 0 ? "+" : ""}${data.asg.distance_pct.toFixed(2)}%` : "—"}
              </span>
            </div>
            <div style={{ marginTop: "0.8rem", padding: "0.5rem", borderRadius: "4px", textAlign: "center", fontSize: "10px", letterSpacing: "3px",
              background: bullish ? "rgba(0,255,136,0.08)" : "rgba(255,68,68,0.08)",
              border: `0.5px solid ${bullish ? "rgba(0,255,136,0.3)" : "rgba(255,68,68,0.3)"}`,
              color: bullish ? "#00ff88" : "#ff4444" }}>
              {bullish ? "✅ APENAS COMPRAS" : "🚫 APENAS VENDAS"}
            </div>
          </div>

          {/* Placar CVD */}
          <div style={{ background: "#0d1320", border: "0.5px solid #1a2035", borderRadius: "8px", padding: "1rem" }}>
            <div style={{ fontSize: "9px", letterSpacing: "3px", color: "#8892a4", marginBottom: "0.8rem" }}>PLACAR ESTATÍSTICO</div>
            {/* Aggression bar */}
            <div style={{ marginBottom: "0.8rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "#8892a4", marginBottom: "4px" }}>
                <span style={{ color: "#00ff88" }}>BUY {buy}%</span>
                <span style={{ color: "#ff4444" }}>SELL {sell}%</span>
              </div>
              <div style={{ height: "8px", borderRadius: "4px", background: "#1a2035", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${buy}%`, background: "linear-gradient(90deg, #00ff88, #00d4ff)", borderRadius: "4px", transition: "width 0.5s" }} />
              </div>
            </div>
            {/* CVD */}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "9px", color: "#8892a4" }}>CVD Score</span>
              <span style={{ fontSize: "11px", fontWeight: "bold", color: (data?.micro.cvd_score ?? 0) > 0 ? "#00ff88" : "#ff4444" }}>
                {data ? `${data.micro.cvd_score > 0 ? "+" : ""}${data.micro.cvd_score.toFixed(3)}` : "—"}
              </span>
            </div>
            {/* Z-Score */}
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "9px", color: "#8892a4" }}>Z-Score</span>
              <span style={{ fontSize: "11px", fontWeight: "bold", color: exhaustion ? "#f59e0b" : "#e2e8f0" }}>
                {data ? `${z > 0 ? "+" : ""}${z.toFixed(2)}${exhaustion ? " ⚡" : ""}` : "—"}
              </span>
            </div>
            {exhaustion && (
              <div style={{ marginTop: "0.6rem", padding: "0.4rem", borderRadius: "4px", textAlign: "center", fontSize: "9px", letterSpacing: "2px", background: "rgba(245,158,11,0.1)", border: "0.5px solid rgba(245,158,11,0.4)", color: "#f59e0b" }}>
                ⚡ EXAUSTÃO ESTATÍSTICA
              </div>
            )}
          </div>

          {/* RVP Zones */}
          <div style={{ background: "#0d1320", border: "0.5px solid #1a2035", borderRadius: "8px", padding: "1rem" }}>
            <div style={{ fontSize: "9px", letterSpacing: "3px", color: "#8892a4", marginBottom: "0.8rem" }}>ZONAS RVP</div>
            {data && [
              ["RVP+3", data.rvp.rvp3_plus, "#ef4444"],
              ["RVP+2", data.rvp.rvp2_plus, "#f59e0b"],
              ["RVP+1", data.rvp.rvp1_plus, "#888"],
              ["VWAP",  data.rvp.vwap,      "#00d4ff"],
              ["RVP-1", data.rvp.rvp1_minus,"#888"],
              ["RVP-2", data.rvp.rvp2_minus,"#f59e0b"],
              ["RVP-3", data.rvp.rvp3_minus,"#ef4444"],
            ].map(([label, val, color]) => (
              <div key={label as string} style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", alignItems: "center" }}>
                <span style={{ fontSize: "9px", color: color as string, letterSpacing: "1px" }}>{label as string}</span>
                <span style={{ fontSize: "10px", color: (data.current_price >= (val as number) * 0.999 && data.current_price <= (val as number) * 1.001) ? "#fff" : "#8892a4" }}>
                  ${(val as number).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                </span>
              </div>
            ))}
          </div>

          {/* Bot Status + Kill Switch */}
          <div style={{ background: "#0d1320", border: "0.5px solid #1a2035", borderRadius: "8px", padding: "1rem" }}>
            <div style={{ fontSize: "9px", letterSpacing: "3px", color: "#8892a4", marginBottom: "0.8rem" }}>CONTROLE DO BOT</div>
            {data?.bot_status && (
              <div style={{ marginBottom: "0.8rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "9px", color: "#8892a4" }}>Posição</span>
                  <span style={{ fontSize: "10px", color: data.bot_status.position === "long" ? "#00ff88" : "#8892a4" }}>
                    {data.bot_status.position?.toUpperCase() || "NONE"}
                  </span>
                </div>
                {data.bot_status.position === "long" && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "9px", color: "#8892a4" }}>PnL</span>
                    <span style={{ fontSize: "10px", color: (data.bot_status.unrealized_pnl ?? 0) >= 0 ? "#00ff88" : "#ff4444" }}>
                      {data.bot_status.unrealized_pnl?.toFixed(2)}%
                    </span>
                  </div>
                )}
              </div>
            )}
            <button onClick={handleKillSwitch} disabled={killPending}
              style={{ width: "100%", padding: "0.6rem", fontSize: "9px", letterSpacing: "3px",
                background: "rgba(255,68,68,0.1)", border: "0.5px solid rgba(255,68,68,0.4)",
                color: "#ff4444", cursor: "pointer", borderRadius: "4px",
                opacity: killPending ? 0.5 : 1 }}>
              {killPending ? "⟳ PARANDO..." : "⏹ KILL SWITCH"}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
