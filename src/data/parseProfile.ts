import { normalizeAbsences, isIsoDate, DEFAULT_RULES, type Absence, type Profile, type Rules } from '../lib/naturalisation'

export interface ParseResult {
  profile: Profile | null
  errors: string[]
}

const RULE_KEYS = Object.keys(DEFAULT_RULES) as (keyof Rules)[]

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Validates a raw JSON object from profiles/<id>.json into a Profile. */
export function parseProfile(path: string, raw: unknown): ParseResult {
  const errors: string[] = []
  const id = path.split('/').pop()!.replace(/\.json$/, '')
  if (!isRecord(raw)) return { profile: null, errors: ['file must contain a JSON object'] }

  if (typeof raw.name !== 'string' || !raw.name.trim()) errors.push('"name" must be a non-empty string')
  if (!isIsoDate(raw.arrivedUK)) errors.push('"arrivedUK" must be a date YYYY-MM-DD')
  if (raw.ilrDate !== undefined && !isIsoDate(raw.ilrDate)) errors.push('"ilrDate" must be a date YYYY-MM-DD')
  if (raw.applicationDate !== undefined && !isIsoDate(raw.applicationDate)) errors.push('"applicationDate" must be a date YYYY-MM-DD')
  if (!Array.isArray(raw.absences)) errors.push('"absences" must be an array')

  const rules: Rules = { ...DEFAULT_RULES }
  if (raw.rules !== undefined) {
    if (!isRecord(raw.rules)) errors.push('"rules" must be an object')
    else {
      for (const k of RULE_KEYS) {
        const v = raw.rules[k]
        if (v === undefined) continue
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) errors.push(`"rules.${k}" must be a non-negative number`)
        else rules[k] = v
      }
    }
  }
  if (errors.length) return { profile: null, errors }

  const absences = (raw.absences as unknown[]).map((a, i): Absence => {
    if (!isRecord(a)) {
      errors.push(`absence #${i + 1} must be an object {out, in, note?}`)
      return { out: '', in: '' }
    }
    return {
      out: String(a.out ?? ''),
      ...(a.in !== undefined && a.in !== null && a.in !== '' ? { in: String(a.in) } : {}),
      ...(typeof a.note === 'string' ? { note: a.note } : {}),
    }
  })
  if (errors.length) return { profile: null, errors }

  const arrivedUK = raw.arrivedUK as string
  const norm = normalizeAbsences(absences, arrivedUK)
  if (norm.errors.length) return { profile: null, errors: norm.errors }

  return {
    profile: {
      id,
      name: raw.name as string,
      arrivedUK,
      ...(raw.ilrDate !== undefined ? { ilrDate: raw.ilrDate as string } : {}),
      ...(raw.applicationDate !== undefined ? { applicationDate: raw.applicationDate as string } : {}),
      rules,
      absences,
    },
    errors,
  }
}
