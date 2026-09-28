import { parseProfile } from './parseProfile'

export interface TransferEntry {
  /** Profile id; null when a bare profile file was imported and no id is known. */
  id: string | null
  raw: unknown
}

interface ExportFile {
  app: 'uk-days'
  version: 1
  profiles: { id: string; raw: unknown }[]
}

export function exportProfiles(profiles: { id: string; raw: unknown }[]): string {
  const file: ExportFile = { app: 'uk-days', version: 1, profiles }
  return JSON.stringify(file, null, 2)
}

export interface ImportResult {
  profiles: TransferEntry[]
  errors: string[]
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Accepts either an export file or a single profiles/<id>.json object. */
export function importProfiles(text: string): ImportResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { profiles: [], errors: ['file is not valid JSON'] }
  }
  if (!isRecord(data)) return { profiles: [], errors: ['file is not a uk-days export or a profile'] }

  const entries: TransferEntry[] = []
  if (data.app === 'uk-days' && Array.isArray(data.profiles)) {
    for (const p of data.profiles) {
      if (isRecord(p) && typeof p.id === 'string') entries.push({ id: p.id, raw: p.raw })
    }
  } else if ('absences' in data) {
    entries.push({ id: null, raw: data })
  } else {
    return { profiles: [], errors: ['file is not a uk-days export or a profile'] }
  }

  const profiles: TransferEntry[] = []
  const errors: string[] = []
  for (const e of entries) {
    const { errors: errs } = parseProfile(`${e.id ?? 'profile'}.json`, e.raw)
    if (errs.length) errors.push(`${e.id ?? 'profile'}: ${errs.join('; ')}`)
    else profiles.push(e)
  }
  return { profiles, errors }
}

export interface MergeResult {
  /** Browser overrides for file profiles, keyed by id. */
  overrides: Record<string, unknown>
  locals: { id: string; raw: unknown }[]
  added: number
  replaced: number
}

/**
 * Folds imported profiles into the current state: an id matching a file profile becomes its
 * browser override, an id matching a browser profile replaces it, anything else is added with a
 * fresh id when it has none. Pure; the caller persists.
 */
export function mergeImport(
  imported: TransferEntry[],
  fileIds: string[],
  locals: { id: string; raw: unknown }[],
  newId: () => string,
): MergeResult {
  const overrides: Record<string, unknown> = {}
  let next = [...locals]
  let added = 0
  let replaced = 0
  for (const p of imported) {
    if (p.id !== null && fileIds.includes(p.id)) {
      overrides[p.id] = p.raw
      replaced++
    } else if (p.id !== null && next.some((l) => l.id === p.id)) {
      next = next.map((l) => (l.id === p.id ? { id: l.id, raw: p.raw } : l))
      replaced++
    } else {
      next.push({ id: p.id ?? newId(), raw: p.raw })
      added++
    }
  }
  return { overrides, locals: next, added, replaced }
}
