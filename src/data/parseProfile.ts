import { normalizeAbsences, isIsoDate, toDay, fromDay, DEFAULT_RULES, type Absence, type Profile, type Rules } from '../lib/naturalisation'

export interface ParseResult {
  profile: Profile | null
  errors: string[]
}

const RULE_KEYS = Object.keys(DEFAULT_RULES) as (keyof Rules)[]

/** Inclusive integer bounds per rule; keeps the timeline small and the dates finite. */
export const RULE_BOUNDS: Record<keyof Rules, [number, number]> = {
  windowYears: [1, 50],
  totalLimit: [0, 20000],
  softLimit: [0, 20000],
  hardLimit: [0, 20000],
  lastYearLimit: [0, 366],
  lastYearSoftLimit: [0, 366],
  ilrMonths: [0, 120],
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export const MAX_ABSENCES = 2000
export const MAX_TEXT = 200
/** Dates outside this range are rejected so the day timeline stays small. */
export const MIN_DATE = '1900-01-01'
export const MAX_DATE = '2200-12-31'

function inRange(iso: string): boolean {
  return iso >= MIN_DATE && iso <= MAX_DATE
}

/**
 * Validates a raw JSON object from profiles/<id>.json into a Profile.
 * @param today when given (ISO), an open-ended trip may not start after it.
 */
export function parseProfile(path: string, raw: unknown, today?: string): ParseResult {
  const errors: string[] = []
  const id = path.split('/').pop()!.replace(/\.json$/, '')
  if (!isRecord(raw)) return { profile: null, errors: ['file must contain a JSON object'] }

  if (typeof raw.name !== 'string' || !raw.name.trim()) errors.push('"name" must be a non-empty string')
  else if (raw.name.length > MAX_TEXT) errors.push(`"name" must be at most ${MAX_TEXT} characters`)
  for (const key of ['arrivedUK', 'ilrDate', 'applicationDate'] as const) {
    const v = raw[key]
    if (v === undefined && key !== 'arrivedUK') continue
    if (!isIsoDate(v)) errors.push(`"${key}" must be a date YYYY-MM-DD`)
    else if (!inRange(v)) errors.push(`"${key}" must be between ${MIN_DATE} and ${MAX_DATE}`)
  }
  if (!Array.isArray(raw.absences)) errors.push('"absences" must be an array')

  const rules: Rules = { ...DEFAULT_RULES }
  if (raw.rules !== undefined) {
    if (!isRecord(raw.rules)) errors.push('"rules" must be an object')
    else {
      for (const k of RULE_KEYS) {
        const v = raw.rules[k]
        if (v === undefined) continue
        const [min, max] = RULE_BOUNDS[k]
        if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) errors.push(`"rules.${k}" must be an integer between ${min} and ${max}`)
        else rules[k] = v
      }
      if (!errors.length) {
        if (rules.softLimit < rules.totalLimit) errors.push('"rules.softLimit" must be at least "rules.totalLimit"')
        if (rules.hardLimit < rules.softLimit) errors.push('"rules.hardLimit" must be at least "rules.softLimit"')
        if (rules.lastYearSoftLimit < rules.lastYearLimit) errors.push('"rules.lastYearSoftLimit" must be at least "rules.lastYearLimit"')
      }
    }
  }
  if (!errors.length) {
    const arrived = toDay(raw.arrivedUK as string)
    if (raw.ilrDate !== undefined && toDay(raw.ilrDate as string) < arrived) errors.push('"ilrDate" must not be before "arrivedUK"')
    if (raw.applicationDate !== undefined && toDay(raw.applicationDate as string) < arrived) errors.push('"applicationDate" must not be before "arrivedUK"')
  }
  if (errors.length) return { profile: null, errors }

  const list = raw.absences as unknown[]
  if (list.length > MAX_ABSENCES) return { profile: null, errors: [`"absences" may hold at most ${MAX_ABSENCES} absences`] }
  const absences = list.map((a, i): Absence => {
    const n = i + 1
    if (!isRecord(a)) {
      errors.push(`absence #${n} must be an object {out, in, note?}`)
      return { out: '' }
    }
    if (typeof a.out !== 'string') errors.push(`absence #${n}: "out" must be a string YYYY-MM-DD`)
    else if (isIsoDate(a.out) && !inRange(a.out)) errors.push(`absence #${n}: "out" must be between ${MIN_DATE} and ${MAX_DATE}`)
    const hasIn = a.in !== undefined && a.in !== null && a.in !== ''
    if (hasIn && typeof a.in !== 'string') errors.push(`absence #${n}: "in" must be a string YYYY-MM-DD`)
    else if (hasIn && isIsoDate(a.in) && !inRange(a.in as string)) errors.push(`absence #${n}: "in" must be between ${MIN_DATE} and ${MAX_DATE}`)
    if (a.note !== undefined && (typeof a.note !== 'string' || a.note.length > MAX_TEXT)) errors.push(`absence #${n}: "note" must be a string of at most ${MAX_TEXT} characters`)
    return {
      out: typeof a.out === 'string' ? a.out : '',
      ...(hasIn && typeof a.in === 'string' ? { in: a.in } : {}),
      ...(typeof a.note === 'string' ? { note: a.note } : {}),
    }
  })
  if (errors.length) return { profile: null, errors }

  const arrivedUK = raw.arrivedUK as string
  const norm = normalizeAbsences(absences, arrivedUK)
  if (norm.errors.length) return { profile: null, errors: norm.errors }
  if (today !== undefined) {
    const open = norm.spans.find((s) => s.in === null)
    if (open && open.out > toDay(today)) {
      const n = absences.findIndex((a) => a.out === fromDay(open.out) && !a.in) + 1
      return { profile: null, errors: [`absence #${n} (${fromDay(open.out)} → …): an open-ended trip cannot start after today (${today}); add the return date for a planned trip`] }
    }
  }

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
