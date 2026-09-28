import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { loadProfiles } from '../data/loadProfiles'
import { BudgetBars, Patterns } from './BudgetBar'
import { ErrorBanner } from './ErrorBanner'
import { ErrorBoundary } from './ErrorBoundary'
import { useFormat } from './format'
import { useTodayDay } from './useTodayDay'
import { LanguageSwitcher } from './LanguageSwitcher'
import { NewProfileForm } from './NewProfileForm'
import { ProfileEditor } from './ProfileEditor'
import { useProfileStore, type ProfileEntry, type ProfileStore } from './useProfileStore'
import type { RawProfile } from '../data/rawProfile'
import { ShiftChart } from './ShiftChart'
import { StatCards } from './StatCards'
import { useModel, type WhatIf } from './useModel'
import { YearStrip } from './YearStrip'
import { fromDay, isIsoDate, lastYearStartFor, windowStartFor, countAbsent } from '../lib/naturalisation'

const IMPORT_LIMIT_MB = 2

interface DashboardProps {
  entry: ProfileEntry
  store: ProfileStore
  today: number
  onRemoved: () => void
  onDuplicated: (id: string) => void
}

function Dashboard({ entry, store, today, onRemoved, onDuplicated }: DashboardProps) {
  const { t } = useTranslation()
  const f = useFormat()
  const profile = entry.profile
  // While the form holds an invalid state we keep it locally; otherwise the store is the source of truth.
  // An invalid draft is only shown while the stored profile it was based on is unchanged;
  // an external change (import, reset) supersedes it.
  const [invalid, setInvalid] = useState<{ base: RawProfile; draft: RawProfile; errors: string[] } | null>(null)
  const current = invalid && invalid.base === entry.raw ? invalid : null
  const draft = current?.draft ?? entry.raw
  const onChange = (next: RawProfile) => {
    const errors = store.update(entry.id, next)
    setInvalid(errors.length ? { base: entry.raw, draft: next, errors } : null)
  }
  const [whatIf, setWhatIf] = useState<WhatIf>({ extraDays: 0, extraStart: fromDay(today + 1) })
  const m = useModel(profile, today, whatIf)
  const { rules } = profile

  const split = (from: number, to: number) => {
    const actual = countAbsent(m.base.tl, from, Math.min(to, today))
    const planned = countAbsent(m.base.tl, Math.max(from, today + 1), to)
    const extra = countAbsent(m.all.tl, from, to) - actual - planned
    return { actual, planned, extra }
  }
  const total = split(windowStartFor(m.base, m.target), m.target)
  const lastYear = split(lastYearStartFor(m.target), m.target)

  return (
    <>
      <StatCards m={m} />

      <section className="card">
        <h2>{t('whatIf.title')}</h2>
        <div className="controls">
          <label>
            {t('whatIf.extraDays')}
            <input type="range" min={0} max={365} value={whatIf.extraDays} onChange={(e) => setWhatIf({ ...whatIf, extraDays: +e.target.value })} />
            <input type="number" min={0} max={365} aria-label={t('whatIf.extraDays')} value={whatIf.extraDays} onChange={(e) => setWhatIf({ ...whatIf, extraDays: Math.max(0, Math.min(365, +e.target.value || 0)) })} />
          </label>
          <label>
            {t('whatIf.startingOn')}
            <input type="date" min="1900-01-01" max="2200-12-31" value={whatIf.extraStart} onChange={(e) => isIsoDate(e.target.value) && setWhatIf({ ...whatIf, extraStart: e.target.value })} />
          </label>
        </div>
        <div className="chart-scroll"><ShiftChart curve={m.curve} target={m.target} selected={whatIf.extraDays} onSelect={(d) => setWhatIf({ ...whatIf, extraDays: d })} /></div>
        <p className="hint">{t('whatIf.hint', { years: rules.windowYears + 3 })}</p>
      </section>

      <section className="card">
        <div className="chart-scroll"><BudgetBars rules={rules} total={total} lastYear={lastYear} /></div>
        <div className="legend">
          <span><span className="sw" style={{ background: 'var(--actual)' }} />{t('budget.actual')}</span>
          <span><span className="sw" style={{ background: 'var(--planned)', opacity: 0.7 }} />{t('budget.planned')}</span>
          <span><span className="sw" style={{ background: 'var(--extra)', opacity: 0.7 }} />{t('budget.extra')}</span>
        </div>
      </section>

      <section className="card">
        <h2>{t('strip.title', { date: f.day(m.base.arrivedDay) })}</h2>
        <div className="chart-scroll"><YearStrip m={m} /></div>
        <p className="hint">{t('strip.hint', { years: rules.windowYears })}</p>
      </section>

      <section className="card">
        <ProfileEditor
          entry={entry}
          draft={draft}
          errors={current?.errors ?? []}
          today={today}
          onChange={onChange}
          onReset={() => { setInvalid(null); store.reset(entry.id) }}
          onRemove={() => { store.remove(entry.id); onRemoved() }}
          onDuplicate={() => { const id = store.duplicate(entry.id); if (id) onDuplicated(id) }}
        />
      </section>
    </>
  )
}

export default function App() {
  const { t } = useTranslation()
  const f = useFormat()
  const { profiles, errors } = useMemo(() => loadProfiles(), [])
  const today = useTodayDay()
  const store = useProfileStore(profiles, fromDay(today))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const entry = store.entries.find((e) => e.id === selectedId) ?? store.entries[0]

  const exportAll = () => {
    const blob = new Blob([store.exportAll()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `uk-days-profiles-${fromDay(today)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const importFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > IMPORT_LIMIT_MB * 1024 * 1024) {
      setImportMsg(t('late.importTooLarge', { limit: IMPORT_LIMIT_MB }))
      return
    }
    const { added, replaced, errors: errs } = store.importAll(await file.text())
    setImportMsg([t('late.importResult', { added, replaced }), ...errs].join(' · '))
    setTimeout(() => setImportMsg(null), 8000)
  }

  return (
    <div className="app">
      <Patterns />
      <header className="header">
        <h1>{t('app.title')}</h1>
        <div className="tabs" role="tablist">
          {store.entries.map((e) => (
            <button key={e.id} role="tab" aria-selected={e.id === entry?.id} className="tab" onClick={() => { setSelectedId(e.id); setCreating(false) }}>
              {e.profile.name}
            </button>
          ))}
        </div>
        <button type="button" className="tab" aria-label={t('app.newProfile')} title={t('app.newProfile')} onClick={() => setCreating(true)}>+</button>
        <div className="editor-actions">
          <button type="button" className="btn" onClick={exportAll}>{t('app.export')}</button>
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>{t('app.import')}</button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = '' }} />
        </div>
        <span className="today">{t('app.today', { date: f.day(today) })}</span>
        <LanguageSwitcher />
      </header>
      {importMsg && <div className="card" role="status">{importMsg}</div>}
      {store.storageFailed && <div className="card banner" role="alert">{t('late.storageFailed')}</div>}
      <ErrorBanner errors={errors} />
      {store.dropped.map((d) => (
        <div key={d.id} className="card banner" role="alert">
          {t('late.droppedTitle', { id: d.id })}
          <ul>{d.errors.map((e) => <li key={e}>{e}</li>)}</ul>
          <p className="hint">{t('late.droppedHint')}</p>
          <textarea className="json" readOnly value={d.json} rows={Math.min(12, d.json.split('\n').length)} />
        </div>
      ))}
      {creating && (
        <NewProfileForm
          defaultArrived={fromDay(today)}
          onCancel={() => setCreating(false)}
          onCreate={(raw) => { const id = store.add(raw); if (id) { setSelectedId(id); setCreating(false) } }}
        />
      )}
      {entry ? (
        <ErrorBoundary
          resetKey={entry.id}
          message={t('late.crashed')}
          retryLabel={t('late.tryAgain')}
          actionLabel={entry.source === 'file' ? t('late.resetProfile') : t('editor.delete')}
          onAction={() => (entry.source === 'file' ? store.reset(entry.id) : store.remove(entry.id))}
        >
          <Dashboard
            key={entry.id}
            entry={entry}
            store={store}
            today={today}
            onRemoved={() => setSelectedId(null)}
            onDuplicated={(id) => setSelectedId(id)}
          />
        </ErrorBoundary>
      ) : (
        !creating && <div className="card">{t('app.noProfiles')}</div>
      )}
      <footer className="footer">
        {t('app.disclaimer')} · <a href="https://www.gov.uk/apply-citizenship-indefinite-leave-to-remain" target="_blank" rel="noopener">GOV.UK</a> · <a href="https://github.com/limpbrains/uk-days" target="_blank" rel="noopener">GitHub</a>
      </footer>
    </div>
  )
}
