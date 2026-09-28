import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { parseProfile } from '../data/parseProfile'
import { profileToRaw, type RawProfile } from '../data/rawProfile'
import { clearOverride, loadLocalProfiles, loadOverride, saveLocalProfiles, saveOverride } from '../data/storage'
import { exportProfiles, importProfiles, mergeImport } from '../data/transfer'
import type { Profile } from '../lib/naturalisation'

export type ProfileSource = 'file' | 'local'

export interface ProfileEntry {
  id: string
  source: ProfileSource
  /** Last valid profile; what the dashboard renders. */
  profile: Profile
  raw: RawProfile
  /** File profile with a browser override on top. */
  isEdited: boolean
}

/** A stored profile that no longer validates; kept visible so the user can recover it. */
export interface DroppedProfile {
  id: string
  errors: string[]
  json: string
}

export interface ProfileStore {
  entries: ProfileEntry[]
  /** Validates and persists; returns validation errors (empty = applied). */
  update: (id: string, raw: RawProfile) => string[]
  /** Drop the browser override of a file profile. */
  reset: (id: string) => void
  /** Delete a browser-created profile. */
  remove: (id: string) => void
  /** Add a browser profile; returns its id, or null when invalid. */
  add: (raw: RawProfile) => string | null
  duplicate: (id: string) => string | null
  importAll: (text: string) => { added: number; replaced: number; errors: string[] }
  exportAll: () => string
  /** Browser data set aside at load because it no longer validates. */
  dropped: DroppedProfile[]
  /** True once the browser refused a write (quota, private mode): edits live only in memory. */
  storageFailed: boolean
}

type Local = { id: string; raw: RawProfile }

function pathFor(id: string) {
  return `../../profiles/${id}.json`
}

function newId() {
  return `local-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

function loadAll(files: Profile[], today: string): { overrides: Record<string, RawProfile>; locals: Local[]; dropped: DroppedProfile[] } {
  const overrides: Record<string, RawProfile> = {}
  const locals: Local[] = []
  const dropped: DroppedProfile[] = []
  for (const f of files) {
    const raw = loadOverride(f.id)
    if (raw === null) continue
    const { profile, errors } = parseProfile(pathFor(f.id), raw, today)
    if (profile) overrides[f.id] = profileToRaw(profile)
    else {
      dropped.push({ id: f.id, errors, json: JSON.stringify(raw, null, 2) })
      clearOverride(f.id)
    }
  }
  for (const s of loadLocalProfiles()) {
    const { profile, errors } = parseProfile(`${s.id}.json`, s.raw, today)
    if (profile) locals.push({ id: s.id, raw: profileToRaw(profile) })
    else dropped.push({ id: s.id, errors, json: JSON.stringify(s.raw, null, 2) })
  }
  return { overrides, locals, dropped }
}

/**
 * File profiles (with browser overrides) plus profiles created in the browser.
 * @param today ISO date used to validate open-ended trips.
 */
export function useProfileStore(files: Profile[], today: string): ProfileStore {
  const [loaded] = useState(() => loadAll(files, today))
  const [overrides, setOverrides] = useState(loaded.overrides)
  const [locals, setLocals] = useState(loaded.locals)
  const [storageFailed, setStorageFailed] = useState(false)
  // Latest state for callbacks that run after an await (import) so they never merge into a stale snapshot.
  const localsRef = useRef(locals)
  const overridesRef = useRef(overrides)
  useEffect(() => {
    localsRef.current = locals
    overridesRef.current = overrides
  }, [locals, overrides])

  const note = useCallback((ok: boolean) => { if (!ok) setStorageFailed(true) }, [])

  const persistLocals = useCallback((next: Local[]) => {
    localsRef.current = next
    setLocals(next)
    note(saveLocalProfiles(next))
  }, [note])

  const persistOverride = useCallback((id: string, raw: RawProfile) => {
    overridesRef.current = { ...overridesRef.current, [id]: raw }
    setOverrides(overridesRef.current)
    note(saveOverride(id, raw))
  }, [note])

  const entries = useMemo<ProfileEntry[]>(() => {
    const fromFiles = files.map((file): ProfileEntry => {
      const raw = overrides[file.id]
      if (!raw) return { id: file.id, source: 'file', profile: file, raw: profileToRaw(file), isEdited: false }
      const { profile } = parseProfile(pathFor(file.id), raw, today)
      return { id: file.id, source: 'file', profile: profile ?? file, raw, isEdited: true }
    })
    const fromLocals = locals.flatMap((l): ProfileEntry[] => {
      const { profile } = parseProfile(`${l.id}.json`, l.raw, today)
      return profile ? [{ id: l.id, source: 'local', profile, raw: l.raw, isEdited: false }] : []
    })
    return [...fromFiles, ...fromLocals]
  }, [files, overrides, locals, today])

  const update = useCallback(
    (id: string, raw: RawProfile) => {
      const { profile, errors } = parseProfile(pathFor(id), raw, today)
      if (!profile) return errors
      if (files.some((f) => f.id === id)) persistOverride(id, raw)
      else persistLocals(localsRef.current.map((l) => (l.id === id ? { id, raw } : l)))
      return []
    },
    [files, today, persistLocals, persistOverride],
  )

  const reset = useCallback((id: string) => {
    note(clearOverride(id))
    const { [id]: _drop, ...rest } = overridesRef.current
    overridesRef.current = rest
    setOverrides(rest)
  }, [note])

  const remove = useCallback((id: string) => persistLocals(localsRef.current.filter((l) => l.id !== id)), [persistLocals])

  const add = useCallback(
    (raw: RawProfile) => {
      const { profile } = parseProfile('new.json', raw, today)
      if (!profile) return null
      const id = newId()
      persistLocals([...localsRef.current, { id, raw }])
      return id
    },
    [today, persistLocals],
  )

  const duplicate = useCallback(
    (id: string) => {
      const src = entries.find((e) => e.id === id)
      if (!src) return null
      const raw = structuredClone(src.raw)
      raw.name = `${raw.name} (copy)`
      return add(raw)
    },
    [entries, add],
  )

  const importAll = useCallback(
    (text: string) => {
      const { profiles, errors } = importProfiles(text)
      const normalised: { id: string | null; raw: RawProfile }[] = []
      for (const p of profiles) {
        const { profile, errors: errs } = parseProfile(`${p.id ?? 'profile'}.json`, p.raw, today)
        if (profile) normalised.push({ id: p.id, raw: profileToRaw(profile) })
        else errors.push(`${p.id ?? 'profile'}: ${errs.join('; ')}`)
      }
      const merged = mergeImport(normalised, files.map((f) => f.id), localsRef.current, newId)
      for (const [id, raw] of Object.entries(merged.overrides)) persistOverride(id, raw as RawProfile)
      persistLocals(merged.locals as Local[])
      return { added: merged.added, replaced: merged.replaced, errors }
    },
    [files, today, persistLocals, persistOverride],
  )

  const exportAll = useCallback(() => exportProfiles(entries.map((e) => ({ id: e.id, raw: e.raw }))), [entries])

  return { entries, update, reset, remove, add, duplicate, importAll, exportAll, dropped: loaded.dropped, storageFailed }
}
