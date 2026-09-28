import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFormat } from './format'
import { addMonths, type CurvePoint } from '../lib/naturalisation'

interface Props {
  curve: CurvePoint[]
  target: number
  selected: number
  onSelect: (days: number) => void
}

const W = 1000
const H = 260
const PAD = { l: 78, r: 16, t: 12, b: 28 }

export function ShiftChart({ curve, target, selected, onSelect }: Props) {
  const { t } = useTranslation()
  const f = useFormat()
  const [hover, setHover] = useState<number | null>(null)
  const maxDays = curve.length - 1
  const known = curve.filter((p) => p.eligibleDay !== null).map((p) => p.eligibleDay as number)
  const yMin = Math.min(target, ...known) - 15
  const yMax = Math.max(target, ...known) + 15
  const x = (d: number) => PAD.l + (d / maxDays) * (W - PAD.l - PAD.r)
  const y = (day: number) => PAD.t + ((yMax - day) / (yMax - yMin)) * (H - PAD.t - PAD.b)

  // Month ticks on the y axis, thinned so labels don't collide.
  const months: number[] = []
  for (let m = addMonths(yMin, 0); m <= yMax; m = addMonths(m, 1)) {
    const first = m - (new Date(m * 86_400_000).getUTCDate() - 1)
    if (first >= yMin && !months.includes(first)) months.push(first)
  }
  const every = Math.max(1, Math.ceil(months.length / 8))
  const monthTicks = months.filter((_, i) => i % every === 0)

  // Step path: horizontal segments per N, broken where the date is beyond horizon.
  let path = ''
  let open = false
  curve.forEach((p, i) => {
    if (p.eligibleDay === null) { open = false; return }
    const px = x(p.days)
    const py = y(p.eligibleDay)
    const prev = i > 0 ? curve[i - 1].eligibleDay : null
    if (!open || prev === null) { path += `M${px},${py}`; open = true }
    else path += `V${py}H${px}`
  })
  const lastKnown = curve.findLast((p) => p.eligibleDay !== null)
  if (lastKnown && lastKnown.days < maxDays) path += `H${x(lastKnown.days + 1)}`
  const firstNull = curve.find((p) => p.eligibleDay === null)

  const pointAt = (days: number) => curve[Math.max(0, Math.min(maxDays, days))]
  const cursor = hover ?? selected
  const cp = pointAt(cursor)

  const daysFromEvent = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    return Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * maxDays)
  }

  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={t('whatIf.aria')}
        onMouseMove={(e) => setHover(Math.max(0, Math.min(maxDays, daysFromEvent(e))))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => onSelect(Math.max(0, Math.min(maxDays, daysFromEvent(e))))}
        style={{ cursor: 'crosshair' }}
      >
        {firstNull && (
          <rect x={x(firstNull.days)} y={PAD.t} width={x(maxDays) - x(firstNull.days)} height={H - PAD.t - PAD.b} fill="var(--serious-wash)" />
        )}
        {monthTicks.map((m) => (
          <g key={m}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(m)} y2={y(m)} stroke="var(--grid)" />
            <text x={PAD.l - 8} y={y(m) + 4} textAnchor="end" className="tick">{f.monthYear(m)}</text>
          </g>
        ))}
        {[0, 30, 60, 90, 120, 180, 240, 300, 365].filter((d) => d <= maxDays).map((d) => (
          <text key={d} x={x(d)} y={H - 8} textAnchor="middle" className="tick">{d}</text>
        ))}
        <text x={W - PAD.r} y={PAD.t + 10} textAnchor="end" className="muted">{t('whatIf.xAxis')}</text>
        <line x1={PAD.l} x2={W - PAD.r} y1={y(target)} y2={y(target)} stroke="var(--good)" strokeDasharray="4 4" />
        <text x={W - PAD.r} y={y(target) - 5} textAnchor="end" style={{ fill: 'var(--good)' }}>{t('whatIf.targetLine', { date: f.day(target) })}</text>
        <path d={path} fill="none" stroke="var(--extra)" strokeWidth={2.5} strokeLinejoin="round" />
        {selected !== cursor && (
          <line x1={x(selected)} x2={x(selected)} y1={PAD.t} y2={H - PAD.b} stroke="var(--extra)" strokeOpacity={0.4} strokeWidth={2} />
        )}
        <line x1={x(cursor)} x2={x(cursor)} y1={PAD.t} y2={H - PAD.b} stroke="var(--ink)" strokeWidth={1.5} />
        {cp.eligibleDay !== null && (
          <circle cx={x(cursor)} cy={y(cp.eligibleDay)} r={5} fill="var(--extra)" stroke="var(--surface)" strokeWidth={2} />
        )}
      </svg>
      <div className="tooltip" style={{ left: `${Math.max(14, Math.min(86, (x(cursor) / W) * 100))}%`, top: `${(cp.eligibleDay === null ? PAD.t + 20 : y(cp.eligibleDay)) / H * 100}%` }}>
        {t('whatIf.tooltip', { days: cursor, date: f.day(cp.eligibleDay) })}
        {cp.eligibleDay !== null && ` (${f.delta(cp.eligibleDay - target)})`}
      </div>
    </div>
  )
}
