import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { monthName, useFormat } from './format'
import { dateLocale } from '../i18n'
import type { Model } from './useModel'
import { addYears, fromDay, isAbsent, type AbsenceSpan } from '../lib/naturalisation'

const ROW_H = 16
const GAP = 6
const LABEL_W = 110
const W = 1000
const COUNT_W = 40
const DAYS = 366
const TOP = 32

type Kind = 'actual' | 'planned' | 'extra'

function kindOf(m: Model, day: number): Kind | null {
  if (isAbsent(m.base.tl, day)) return day > m.today ? 'planned' : 'actual'
  if (isAbsent(m.all.tl, day)) return 'extra'
  return null
}

function spanAt(spans: AbsenceSpan[], day: number): AbsenceSpan | undefined {
  return spans.find((s) => day > s.out && (s.in === null || day < s.in))
}

export function YearStrip({ m }: { m: Model }) {
  const { t, i18n } = useTranslation()
  const f = useFormat()
  const locale = dateLocale(i18n.language)
  const [hover, setHover] = useState<{ day: number; xPct: number; yPct: number } | null>(null)
  const check = m.checkAtEarliest
  const lastDay = Math.max(m.target, m.earliestAll ?? 0, m.all.tl.endDay - 365 * 3)
  const rows: number[] = []
  for (let s = m.base.arrivedDay; s <= lastDay; s = addYears(s, 1)) rows.push(s)
  const H = rows.length * (ROW_H + GAP) + TOP
  const cw = (W - LABEL_W - COUNT_W) / DAYS
  const x = (i: number) => LABEL_W + i * cw

  const cells: { r: number; i: number; kind: Kind }[] = []
  rows.forEach((start, r) => {
    const end = addYears(start, 1) - 1
    for (let d = start; d <= end; d++) {
      const kind = kindOf(m, d)
      if (kind) cells.push({ r, i: d - start, kind })
    }
  })
  const fill: Record<Kind, string> = { actual: 'var(--actual)', planned: 'url(#hatch-planned)', extra: 'url(#hatch-extra)' }

  const rowY = (r: number) => TOP + r * (ROW_H + GAP)
  const marker = (day: number, color: string, label: string, dash?: string) => {
    const r = rows.findIndex((s) => day >= s && day < addYears(s, 1))
    if (r < 0) return null
    const px = x(day - rows[r])
    return (
      <g key={label}>
        <line x1={px} x2={px} y1={rowY(r) - 3} y2={rowY(r) + ROW_H + 3} stroke={color} strokeWidth={2} strokeDasharray={dash} />
        <text x={px} y={rowY(r) - 5} textAnchor="middle" style={{ fill: color, fontSize: 10 }}>{label}</text>
      </g>
    )
  }
  const band = (from: number, to: number, fillColor: string) =>
    rows.map((s, r) => {
      const a = Math.max(from, s)
      const b = Math.min(to, addYears(s, 1) - 1)
      if (b < a) return null
      return <rect key={r} x={x(a - s)} y={rowY(r)} width={x(b - s + 1) - x(a - s)} height={ROW_H} fill={fillColor} />
    })

  // Month labels from the first row (leap-year drift of one day is invisible at this scale).
  const monthLabels: { i: number; label: string }[] = []
  for (let d = rows[0], i = 0; i < DAYS; d++, i++) {
    if (new Date(d * 86_400_000).getUTCDate() === 1) monthLabels.push({ i, label: monthName(d, locale) })
  }

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const py = ((e.clientY - rect.top) / rect.height) * H
    const r = Math.floor((py - TOP) / (ROW_H + GAP))
    const i = Math.floor((px - LABEL_W) / cw)
    if (r < 0 || r >= rows.length || i < 0 || i >= DAYS) return setHover(null)
    const day = rows[r] + i
    if (day >= addYears(rows[r], 1)) return setHover(null)
    setHover({ day, xPct: (x(i + 0.5) / W) * 100, yPct: (rowY(r) / H) * 100 })
  }

  const hoverInfo = () => {
    if (!hover) return null
    const kind = kindOf(m, hover.day)
    const span = spanAt(m.base.spans, hover.day)
    const what = kind === null ? t('strip.inUk') : t(`strip.${kind}`) + (kind !== 'extra' && span?.note ? ` · ${span.note}` : '')
    return `${f.day(hover.day)} — ${what}`
  }

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={t('strip.aria')} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {monthLabels.map((ml) => (
          <text key={ml.i} x={x(ml.i)} y={10} className="muted" style={{ fontSize: 10 }}>{ml.label}</text>
        ))}
        {rows.map((s, r) => (
          <g key={s}>
            <text x={0} y={rowY(r) + ROW_H - 3} className="tick">{fromDay(s).slice(0, 7)} →</text>
            <rect x={LABEL_W} y={rowY(r)} width={W - LABEL_W - COUNT_W} height={ROW_H} fill="var(--in-uk)" rx={2} />
          </g>
        ))}
        {check && band(check.windowStart, check.day, 'var(--window-wash)')}
        {check && band(check.lastYearStart, check.day, 'var(--window-wash)')}
        {cells.map((c) => (
          <rect key={`${c.r}-${c.i}`} x={x(c.i)} y={rowY(c.r)} width={cw + 0.3} height={ROW_H} fill={fill[c.kind]} />
        ))}
        {rows.map((s, r) => {
          const end = Math.min(addYears(s, 1) - 1, m.all.tl.endDay)
          const n = m.all.tl.prefix[end - m.all.tl.startDay + 1] - m.all.tl.prefix[s - m.all.tl.startDay]
          return <text key={s} x={W} y={rowY(r) + ROW_H - 3} textAnchor="end" className="tick" style={{ fontWeight: 600 }}>{n}</text>
        })}
        {marker(m.today, 'var(--ink)', t('strip.today'))}
        {check && marker(check.windowStart, 'var(--actual)', t('strip.windowStart'), '3 3')}
        {m.earliestAll !== null && marker(m.earliestAll, 'var(--good)', t('strip.apply'))}
      </svg>
      {hover && (
        <div className="tooltip" style={{ left: `${hover.xPct}%`, top: `${hover.yPct}%` }}>{hoverInfo()}</div>
      )}
    </div>
  )
}
