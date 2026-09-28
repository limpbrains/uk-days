import { useTranslation } from 'react-i18next'
import { type Rules } from '../lib/naturalisation'

interface Zone { from: number; to: number; fill: string }

interface Props {
  title: string
  actual: number
  planned: number
  extra: number
  max: number
  zones: Zone[]
  ticks: number[]
}

const W = 1000
const H = 26

function Bar({ title, actual, planned, extra, max, zones, ticks }: Props) {
  const { t } = useTranslation()
  const x = (v: number) => (Math.min(v, max) / max) * W
  const total = actual + planned + extra
  return (
    <div>
      <h2>{title}</h2>
      <svg viewBox={`0 -4 ${W} ${H + 24}`} width="100%" role="img" aria-label={t('budget.of', { title, value: total, max })}>
        {zones.map((z) => (
          <rect key={z.from} x={x(z.from)} y={0} width={x(z.to) - x(z.from)} height={H} fill={z.fill} />
        ))}
        {actual > 0 && <rect x={0} y={6} width={x(actual)} height={H - 12} fill="var(--actual)" rx={3} />}
        {planned > 0 && (
          <rect x={x(actual) + 2} y={6} width={Math.max(0, x(actual + planned) - x(actual) - 2)} height={H - 12} fill="url(#hatch-planned)" rx={3} />
        )}
        {extra > 0 && (
          <rect x={x(actual + planned) + 2} y={6} width={Math.max(0, x(total) - x(actual + planned) - 2)} height={H - 12} fill="url(#hatch-extra)" rx={3} />
        )}
        <line x1={x(total)} x2={x(total)} y1={-3} y2={H + 3} stroke="var(--ink)" strokeWidth={2} />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={H} y2={H + 4} stroke="var(--axis)" />
            <text x={x(t)} y={H + 16} textAnchor={t === max ? 'end' : t === 0 ? 'start' : 'middle'} className="tick">{t}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

/** SVG hatch patterns shared by all charts; render once near the top of the page. */
export function Patterns() {
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
      <defs>
        <pattern id="hatch-planned" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={6} height={6} fill="var(--planned)" opacity={0.35} />
          <line x1={0} y1={0} x2={0} y2={6} stroke="var(--planned)" strokeWidth={2.5} />
        </pattern>
        <pattern id="hatch-extra" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
          <rect width={6} height={6} fill="var(--extra)" opacity={0.35} />
          <line x1={0} y1={0} x2={0} y2={6} stroke="var(--extra)" strokeWidth={2.5} />
        </pattern>
      </defs>
    </svg>
  )
}

export interface Split { actual: number; planned: number; extra: number }

export function BudgetBars({ rules, total, lastYear }: { rules: Rules; total: Split; lastYear: Split }) {
  const { t } = useTranslation()
  const lastYearMax = Math.max(180, rules.lastYearLimit * 2)
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Bar
        title={t('budget.total', { count: rules.windowYears })}
        {...total}
        max={rules.hardLimit}
        zones={[
          { from: 0, to: rules.totalLimit, fill: 'var(--good-wash)' },
          { from: rules.totalLimit, to: rules.softLimit, fill: 'var(--warning-wash)' },
          { from: rules.softLimit, to: rules.hardLimit, fill: 'var(--serious-wash)' },
        ]}
        ticks={[0, rules.totalLimit, rules.softLimit, rules.hardLimit]}
      />
      <Bar
        title={t('budget.lastYear')}
        {...lastYear}
        max={lastYearMax}
        zones={[
          { from: 0, to: rules.lastYearLimit, fill: 'var(--good-wash)' },
          { from: rules.lastYearLimit, to: rules.lastYearSoftLimit, fill: 'var(--warning-wash)' },
          { from: rules.lastYearSoftLimit, to: lastYearMax, fill: 'var(--serious-wash)' },
        ]}
        ticks={[0, rules.lastYearLimit, rules.lastYearSoftLimit, lastYearMax]}
      />
      <div className="legend">
        <span><span className="sw" style={{ background: 'var(--good-wash)' }} />{t('budget.zoneOk')}</span>
        <span><span className="sw" style={{ background: 'var(--warning-wash)' }} />{t('budget.zoneSoft')}</span>
        <span><span className="sw" style={{ background: 'var(--serious-wash)' }} />{t('budget.zoneHard')}</span>
      </div>
    </div>
  )
}
