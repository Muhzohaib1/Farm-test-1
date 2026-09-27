import { useEffect, useRef, useState, type ReactNode } from 'react'

/* Lightweight SVG charts (no chart library, to keep the app small for slow connections). */

export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'] // validated categorical order
export const LOSS = '#e34948'

const INK_MUTED = '#6f6d66'
const GRID = '#e1e0d9'
const AXIS = '#c3c2b7'
const SURFACE = '#fffdf8'

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(320)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.floor(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (max === min) max = min + 1
  const raw = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.001; v += step) out.push(Math.round(v * 1e6) / 1e6)
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step)
  return out
}

export function Legend({ items }: { items: Array<{ label: ReactNode; color: string }> }) {
  return (
    <div className="legend">
      {items.map((it, i) => (
        <span key={i} className="legend-item">
          <span className="legend-swatch" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  )
}

export interface LineSeries {
  label: string
  color: string
  lines: Array<{ label: string; points: Array<{ x: number; y: number }> }>
}

/**
 * Line chart with a hover/tap crosshair. Each series can hold several lines
 * (e.g. one line per newborn, coloured by sex).
 */
export function LineChart({
  series, fmtX, fmtY, height = 200, legend = true, endLabels = false, yZero = true,
}: {
  series: LineSeries[]
  fmtX: (x: number) => string
  fmtY: (y: number) => string
  height?: number
  legend?: boolean
  endLabels?: boolean
  yZero?: boolean
}) {
  const [ref, w] = useWidth()
  const [hover, setHover] = useState<{ sx: number; sy: number; text: string; color: string } | null>(null)
  const pts = series.flatMap((s) => s.lines.flatMap((l) => l.points))
  if (!pts.length) return <div ref={ref} />

  const padL = 44
  const padR = endLabels ? 56 : 12
  const padT = 10
  const padB = 26
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  let x0 = Math.min(...xs)
  let x1 = Math.max(...xs)
  if (x0 === x1) {
    x0 -= 1
    x1 += 1
  }
  const yt = niceTicks(yZero ? Math.min(0, ...ys) : Math.min(...ys), Math.max(...ys))
  const y0 = yt[0]
  const y1 = yt[yt.length - 1]
  const sx = (x: number) => padL + ((x - x0) / (x1 - x0)) * (w - padL - padR)
  const sy = (y: number) => padT + (1 - (y - y0) / (y1 - y0)) * (height - padT - padB)
  const xt = niceTicks(x0, x1, Math.max(2, Math.floor(w / 90))).filter((v) => v >= x0 && v <= x1)

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - r.left
    const my = e.clientY - r.top
    let best: { d: number; sx: number; sy: number; text: string; color: string } | null = null
    for (const s of series)
      for (const l of s.lines)
        for (const p of l.points) {
          const d = Math.abs(sx(p.x) - mx) * 2 + Math.abs(sy(p.y) - my)
          if (!best || d < best.d) best = { d, sx: sx(p.x), sy: sy(p.y), text: `${l.label ? l.label + ' · ' : ''}${fmtX(p.x)}: ${fmtY(p.y)}`, color: s.color }
        }
    setHover(best)
  }

  return (
    <div ref={ref} className="chart" dir="ltr">
      {legend && series.length > 1 && <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />}
      <svg width={w} height={height} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} role="img">
        {yt.map((v) => (
          <g key={v}>
            <line x1={padL} x2={w - padR} y1={sy(v)} y2={sy(v)} stroke={v === 0 ? AXIS : GRID} strokeWidth={1} />
            <text x={padL - 6} y={sy(v) + 4} textAnchor="end" className="tick">{fmtY(v)}</text>
          </g>
        ))}
        {xt.map((v) => (
          <text key={v} x={sx(v)} y={height - 6} textAnchor="middle" className="tick">{fmtX(v)}</text>
        ))}
        {series.map((s) =>
          s.lines.map((l, i) => {
            const p = [...l.points].sort((a, b) => a.x - b.x)
            const d = p.map((q, j) => `${j ? 'L' : 'M'}${sx(q.x)},${sy(q.y)}`).join(' ')
            const last = p[p.length - 1]
            return (
              <g key={`${s.label}-${i}`}>
                {p.length > 1 && <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
                {p.length <= 12 &&
                  p.map((q, j) => <circle key={j} cx={sx(q.x)} cy={sy(q.y)} r={4} fill={s.color} stroke={SURFACE} strokeWidth={2} />)}
                {endLabels && last && (
                  <text x={sx(last.x) + 8} y={sy(last.y) + 4} className="end-label">{fmtY(last.y)}</text>
                )}
              </g>
            )
          }),
        )}
        {hover && (
          <g pointerEvents="none">
            <line x1={hover.sx} x2={hover.sx} y1={padT} y2={height - padB} stroke={INK_MUTED} strokeWidth={1} />
            <circle cx={hover.sx} cy={hover.sy} r={6} fill={hover.color} stroke={SURFACE} strokeWidth={2} />
          </g>
        )}
      </svg>
      {hover && <div className="chart-tip">{hover.text}</div>}
    </div>
  )
}

/** Column chart for values that can be negative (e.g. monthly profit). */
export function ColumnChart({
  data, fmtY, height = 180, colorFor,
}: {
  data: Array<{ label: string; value: number; tip: string }>
  fmtY: (y: number) => string
  height?: number
  colorFor: (v: number) => string
}) {
  const [ref, w] = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  const padL = 52
  const padR = 8
  const padT = 10
  const padB = 24
  const vals = data.map((d) => d.value)
  const yt = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals))
  const y0 = yt[0]
  const y1 = yt[yt.length - 1]
  const sy = (y: number) => padT + (1 - (y - y0) / (y1 - y0)) * (height - padT - padB)
  const band = (w - padL - padR) / Math.max(1, data.length)
  const bw = Math.min(24, band - 4)
  const r = 4
  return (
    <div ref={ref} className="chart" dir="ltr">
      <svg width={w} height={height} onPointerLeave={() => setHover(null)} role="img">
        {yt.map((v) => (
          <g key={v}>
            <line x1={padL} x2={w - padR} y1={sy(v)} y2={sy(v)} stroke={v === 0 ? AXIS : GRID} strokeWidth={1} />
            <text x={padL - 6} y={sy(v) + 4} textAnchor="end" className="tick">{fmtY(v)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = padL + i * band + (band - bw) / 2
          const top = sy(Math.max(0, d.value))
          const bottom = sy(Math.min(0, d.value))
          const h = Math.max(0, bottom - top)
          const rr = Math.min(r, h)
          // rounded at the data end, square at the baseline
          const path =
            d.value >= 0
              ? `M${x},${bottom} V${top + rr} Q${x},${top} ${x + rr},${top} H${x + bw - rr} Q${x + bw},${top} ${x + bw},${top + rr} V${bottom} Z`
              : `M${x},${top} V${bottom - rr} Q${x},${bottom} ${x + rr},${bottom} H${x + bw - rr} Q${x + bw},${bottom} ${x + bw},${bottom - rr} V${top} Z`
          return (
            <g key={i} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
              <rect x={padL + i * band} y={padT} width={band} height={height - padT - padB} fill="transparent" />
              {h > 0 && <path d={path} fill={colorFor(d.value)} opacity={hover === null || hover === i ? 1 : 0.55} />}
              <text x={x + bw / 2} y={height - 6} textAnchor="middle" className="tick">{d.label}</text>
            </g>
          )
        })}
      </svg>
      {hover !== null && <div className="chart-tip">{data[hover].tip}</div>}
    </div>
  )
}

/** Simple horizontal proportion bar used for headcounts. */
export function SplitBar({ parts }: { parts: Array<{ value: number; color: string; label: string }> }) {
  const total = parts.reduce((s, p) => s + p.value, 0)
  if (!total) return null
  return (
    <div className="splitbar" dir="ltr" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>
      {parts.filter((p) => p.value).map((p, i) => (
        <span key={i} style={{ flexGrow: p.value, background: p.color }} />
      ))}
    </div>
  )
}
