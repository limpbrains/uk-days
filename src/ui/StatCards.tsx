import { useTranslation } from 'react-i18next'
import { useFormat } from './format'
import type { Model } from './useModel'
import { addMonths, toDay } from '../lib/naturalisation'

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'critical' }) {
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
  const ilr = m.profile.ilrDate ? addMonths(toDay(m.profile.ilrDate), rules.ilrMonths) : null

  return (
    <div className="stats">
      <Stat
        label={t('stats.earliest')}
        value={f.day(m.earliestAll)}
        sub={shift === null ? t('stats.earliestUnreachable') : t('stats.vsTarget', { delta: f.delta(shift) })}
        tone={shift === 0 ? 'good' : shift === null || shift > 0 ? 'critical' : undefined}
      />
      <Stat
        label={t('stats.target')}
        value={f.day(m.target)}
        sub={
          (m.profile.applicationDate ? t('stats.targetSubPlanned') : t('stats.targetSub', { count: rules.windowYears })) +
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
        label={t('stats.allowed')}
        value={t('delta.days', { sign: '', count: remaining })}
        sub={remaining >= 0 ? t('stats.allowedSub', { count: rules.softLimit - usedAll }) : t('stats.overLimit')}
        tone={remaining < 0 ? 'critical' : undefined}
      />
      <Stat
        label={t('stats.lastYear')}
        value={`${lastYear} / ${rules.lastYearLimit}`}
        sub={lastYear > rules.lastYearLimit ? t('stats.lastYearOver', { count: lastYear - rules.lastYearLimit }) : t('stats.lastYearLeft', { count: rules.lastYearLimit - lastYear })}
        tone={lastYear > rules.lastYearLimit ? 'critical' : undefined}
      />
      <Stat
        label={rules.ilrMonths === 0 ? t('stats.ilrNoWait') : t('stats.ilr', { count: rules.ilrMonths })}
        value={ilr === null ? t('stats.na') : f.day(ilr)}
        sub={ilr === null ? t('stats.ilrNone') : ilr <= m.target ? t('stats.ilrOk') : t('stats.ilrLate')}
        tone={ilr !== null && ilr > m.target ? 'critical' : undefined}
      />
    </div>
  )
}
