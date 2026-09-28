import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RawProfile } from '../data/rawProfile'
import type { ProfileEntry } from './useProfileStore'
import { fromDay, fullDaysAbsent, isIsoDate, toDay, DEFAULT_RULES, type Absence, type Rules } from '../lib/naturalisation'

const RULE_KEYS = Object.keys(DEFAULT_RULES) as (keyof Rules)[]

interface Props {
  entry: ProfileEntry
  draft: RawProfile
  errors: string[]
  today: number
  onChange: (next: RawProfile) => void
  onReset: () => void
  onRemove: () => void
  onDuplicate: () => void
}

export function ProfileEditor({ entry, draft, errors, today, onChange, onReset, onRemove, onDuplicate }: Props) {
  const { t } = useTranslation()
  const { id, source, isEdited } = entry
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)
  const [showJson, setShowJson] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const json = JSON.stringify(draft, null, 2)

  const set = (patch: Partial<RawProfile>) => onChange({ ...draft, ...patch })
  const setOptional = (key: 'ilrDate' | 'applicationDate', value: string) => {
    const { [key]: _drop, ...rest } = draft
    onChange(value ? { ...rest, [key]: value } : rest)
  }
  const setRule = (k: keyof Rules, v: string) => set({ rules: { ...draft.rules, [k]: v === '' ? DEFAULT_RULES[k] : +v } })
  const setTrip = (i: number, next: Absence) => set({ absences: draft.absences.map((a, j) => (j === i ? next : a)) })
  const removeTrip = (i: number) => set({ absences: draft.absences.filter((_, j) => j !== i) })
  const addTrip = () => {
    // Start the new trip after the latest known return so two clicks never overlap.
    const lastIn = Math.max(today, ...draft.absences.map((a) => (isIsoDate(a.in) ? toDay(a.in) : isIsoDate(a.out) ? toDay(a.out) + 1 : 0)))
    set({ absences: [...draft.absences, { out: fromDay(lastIn), in: fromDay(lastIn + 7) }] })
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json)
      setCopied('ok')
    } catch {
      setCopied('fail')
      setShowJson(true)
    }
    setTimeout(() => setCopied(null), 2000)
  }

  const isOpen = (a: Absence) => !a.in
  const daysCell = (a: Absence) => {
    if (!isIsoDate(a.out)) return '–'
    if (isOpen(a)) return t('editor.soFar', { count: Math.max(0, today - toDay(a.out)) })
    return isIsoDate(a.in) ? fullDaysAbsent(a.out, a.in) : '–'
  }

  return (
    <div className="editor">
      <div className="editor-head">
        <h2>
          {t('editor.title')}
          {isEdited && <span className="badge edited">{t('editor.edited')}</span>}
          {source === 'local' && <span className="badge edited">{t('editor.local')}</span>}
        </h2>
        <div className="editor-actions">
          <button type="button" className="btn" onClick={copy}>
            {copied === 'ok' ? t('editor.copied') : copied === 'fail' ? t('editor.copyFailed') : t('editor.copy')}
          </button>
          <button type="button" className="btn" onClick={() => setShowJson((v) => !v)}>{showJson ? t('editor.hideJson') : t('editor.showJson')}</button>
          <button type="button" className="btn" onClick={onDuplicate}>{t('editor.duplicate')}</button>
          {source === 'file' && isEdited && (
            <button type="button" className="btn danger" onClick={onReset}>{t('editor.reset', { id })}</button>
          )}
          {source === 'local' && (
            <button type="button" className="btn danger" onClick={() => (confirmDelete ? onRemove() : setConfirmDelete(true))} onBlur={() => setConfirmDelete(false)}>
              {confirmDelete ? t('editor.confirmDelete') : t('editor.delete')}
            </button>
          )}
        </div>
      </div>
      <p className="hint">{source === 'file' ? t('editor.hint', { id }) : t('editor.localHint')}</p>

      <div className="fields">
        <label>{t('editor.name')}<input type="text" value={draft.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label>{t('editor.arrived')}<input type="date" value={draft.arrivedUK} onChange={(e) => set({ arrivedUK: e.target.value })} /></label>
        <label>{t('editor.ilr')}<input type="date" value={draft.ilrDate ?? ''} onChange={(e) => setOptional('ilrDate', e.target.value)} /></label>
        <label>{t('editor.applicationDate')}<input type="date" value={draft.applicationDate ?? ''} onChange={(e) => setOptional('applicationDate', e.target.value)} /></label>
        {RULE_KEYS.map((k) => (
          <label key={k}>
            {t(`editor.rules.${k}`)}
            <input type="number" min={0} value={draft.rules[k]} onChange={(e) => setRule(k, e.target.value)} />
          </label>
        ))}
      </div>

      {errors.length > 0 && (
        <div className="card banner" role="alert">
          {t('editor.notApplied')}
          <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      <h2 style={{ marginTop: 16 }}>{t('editor.trips')}</h2>
      <div className="table-scroll">
      <table className="trips">
        <thead>
          <tr>
            <th>{t('editor.left')}</th>
            <th>{t('editor.returned')}</th>
            <th className="num">{t('editor.fullDays')}</th>
            <th>{t('editor.note')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {draft.absences.map((a, i) => (
            <tr key={i}>
              <td><input type="date" value={a.out} onChange={(e) => setTrip(i, { ...a, out: e.target.value })} /></td>
              <td>
                <input type="date" value={a.in ?? ''} onChange={(e) => {
                  const { in: _drop, ...rest } = a
                  setTrip(i, e.target.value ? { ...rest, in: e.target.value } : rest)
                }} />
              </td>
              <td className="num">{daysCell(a)}</td>
              <td>
                <input type="text" value={a.note ?? ''} placeholder={t('editor.notePlaceholder')} onChange={(e) => {
                  const { note: _drop, ...rest } = a
                  setTrip(i, e.target.value ? { ...rest, note: e.target.value } : rest)
                }} />
                {isOpen(a) && <span className="badge">{t('editor.stillAbroad')}</span>}
                {!isOpen(a) && isIsoDate(a.in) && a.in > fromDay(today) && <span className="badge">{t('editor.planned')}</span>}
              </td>
              <td><button type="button" className="btn small" aria-label={t('editor.remove')} onClick={() => removeTrip(i)}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="hint">{t('editor.openTripHint')}</p>
      <button type="button" className="btn" onClick={addTrip}>{t('editor.add')}</button>

      {showJson && <textarea className="json" readOnly value={json} rows={Math.min(30, json.split('\n').length)} />}
    </div>
  )
}
