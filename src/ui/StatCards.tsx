import { useTranslation } from 'react-i18next'
import { useFormat } from './format'
import type { Model } from './useModel'
import { addMonths, arrivalTargetDay, lastYearStartFor, toDay } from '../lib/naturalisation'

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'critical' | 'warning' }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className={'value' + (tone ? ' ' + tone : '')}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}

export function StatCards({ m }: { m: Model }) {
  const { t } = useTranslation()
  const f = useFormat()
  const { rules } = m.profile
  const shift = m.earliestAll === null ? null : m.earliestAll - m.target
  const usedAll = m.budgetAll.usedActual + m.budgetAll.usedPlanned
  const remaining = rules.totalLimit - usedAll
  const lastYear = m.budgetAll.lastYearUsed
  const lastYearLeft = rules.lastYearLimit - lastYear
  const lastYearWindow = `${f.day(lastYearStartFor(m.target))} – ${f.day(m.target)}`
  const ilr = m.profile.ilrDate ? addMonths(toDay(m.profile.ilrDate), rules.ilrMonths) : null

  return (
    <div className="stats">
      <Stat
        label={t('stats.earliest')}
        value={f.day(m.earliestAll)}
        sub={
          (shift === null ? t('stats.earliestUnreachable') : t('stats.vsTarget', { delta: f.delta(m.target, m.earliestAll!) })) +
          ' · ' + t('late.earliestNote') +
          (ilr === null ? ' · ' + t('late.ilrAssumed') : '')
        }
        tone={shift === null || shift > 0 ? 'critical' : ilr === null ? 'warning' : shift === 0 ? 'good' : undefined}
      />
      <Stat
        label={t('stats.target')}
        value={f.day(m.target)}
        sub={
          (m.profile.applicationDate
            ? t('stats.targetSubPlanned')
            : m.target !== arrivalTargetDay(m.base)
              ? t('late.targetClamped')
              : t('stats.targetSub', { count: rules.windowYears })) +
          ' · ' + t('stats.inDays', { count: Math.max(0, m.target - m.today) })
        }
      />
      <Stat
        label={t('stats.absentInWindow', { count: rules.windowYears })}
        value={`${usedAll} / ${rules.totalLimit}`}
        sub={
          t('stats.soFar', { count: m.budgetBase.usedActual }) +
          (m.budgetBase.usedPlanned ? t('stats.planned', { count: m.budgetBase.usedPlanned }) : '') +
          (m.extraAtTarget ? t('stats.whatIf', { count: m.extraAtTarget }) : '')
        }
        tone={usedAll > rules.totalLimit ? 'critical' : undefined}
      />
      <Stat
        label={t('late.totalRemaining')}
        value={remaining >= 0 ? t('delta.days', { sign: '', count: remaining }) : t('late.overBy', { count: -remaining })}
        sub={
          remaining < 0
            ? t('late.overStandard')
            : lastYearLeft > 0
              ? t('late.totalRemainingSub', { count: lastYearLeft })
              : lastYearLeft === 0
                ? t('late.lastYearExhausted')
                : t('late.lastYearOverNote', { count: -lastYearLeft })
        }
        tone={remaining < 0 ? 'critical' : undefined}
      />
      <Stat
        label={t('stats.lastYear')}
        value={`${lastYear} / ${rules.lastYearLimit}`}
        sub={(lastYear > rules.lastYearLimit ? t('late.overBy', { count: lastYear - rules.lastYearLimit }) : t('stats.lastYearLeft', { count: lastYearLeft })) + ' · ' + lastYearWindow}
        tone={lastYear > rules.lastYearLimit ? 'critical' : undefined}
      />
      <Stat
        label={rules.ilrMonths === 0 ? t('stats.ilrNoWait') : t('stats.ilr', { count: rules.ilrMonths })}
        value={ilr === null ? t('late.statusUnchecked') : f.day(ilr)}
        sub={ilr === null ? t('stats.ilrNone') : ilr <= m.target ? t('stats.ilrOk') : t('stats.ilrLate')}
        tone={ilr === null ? 'warning' : ilr > m.target ? 'critical' : undefined}
      />
    </div>
  )
}
