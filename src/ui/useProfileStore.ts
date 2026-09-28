import { useCallback, useMemo, useState } from 'react'
import { parseProfile } from '../data/parseProfile'
import { profileToRaw, type RawProfile } from '../data/rawProfile'
import { clearOverride, loadLocalProfiles, loadOverride, saveLocalProfiles, saveOverride, type StoredProfile } from '../data/storage'
import { exportProfiles, importProfiles } from '../data/transfer'
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
  importAll: (text: string) => { added: number; errors: string[] }
  exportAll: () => string
}

function pathFor(id: string) {
  return `../../profiles/${id}.json`
}

function newId() {
  return `local-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

function loadOverrides(files: Profile[]): Record<string, RawProfile> {
  const out: Record<string, RawProfile> = {}
  for (const f of files) {
    const raw = loadOverride(f.id)
    if (raw === null) continue
    const { profile } = parseProfile(pathFor(f.id), raw)
    if (profile) out[f.id] = profileToRaw(profile)
    else clearOverride(f.id)
  }
  return out
}

function loadLocals(): { id: string; raw: RawProfile }[] {
  const out: { id: string; raw: RawProfile }[] = []
  for (const s of loadLocalProfiles()) {
    const { profile } = parseProfile(`${s.id}.json`, s.raw)
    if (profile) out.push({ id: s.id, raw: profileToRaw(profile) })
  }
  return out
}

/** File profiles (with browser overrides) plus profiles created in the browser. */
export function useProfileStore(files: Profile[]): ProfileStore {
  const [overrides, setOverrides] = useState(() => loadOverrides(files))
  const [locals, setLocals] = useState(loadLocals)

  const persistLocals = useCallback((next: { id: string; raw: RawProfile }[]) => {
    setLocals(next)
    saveLocalProfiles(next as StoredProfile[])
  }, [])

  const entries = useMemo<ProfileEntry[]>(() => {
    const fromFiles = files.map((file): ProfileEntry => {
      const raw = overrides[file.id]
      if (!raw) return { id: file.id, source: 'file', profile: file, raw: profileToRaw(file), isEdited: false }
      const { profile } = parseProfile(pathFor(file.id), raw)
      return { id: file.id, source: 'file', profile: profile ?? file, raw, isEdited: true }
    })
    const fromLocals = locals.flatMap((l): ProfileEntry[] => {
      const { profile } = parseProfile(`${l.id}.json`, l.raw)
      return profile ? [{ id: l.id, source: 'local', profile, raw: l.raw, isEdited: false }] : []
    })
    return [...fromFiles, ...fromLocals]
  }, [files, overrides, locals])

  const update = useCallback(
    (id: string, raw: RawProfile) => {
      const { profile, errors } = parseProfile(pathFor(id), raw)
      if (!profile) return errors
      if (files.some((f) => f.id === id)) {
        saveOverride(id, raw)
        setOverrides((o) => ({ ...o, [id]: raw }))
      } else {
        persistLocals(locals.map((l) => (l.id === id ? { id, raw } : l)))
      }
      return []
    },
    [files, locals, persistLocals],
  )

  const reset = useCallback((id: string) => {
    clearOverride(id)
    setOverrides((o) => {
      const { [id]: _drop, ...rest } = o
      return rest
    })
  }, [])

  const remove = useCallback((id: string) => persistLocals(locals.filter((l) => l.id !== id)), [locals, persistLocals])

  const add = useCallback(
    (raw: RawProfile) => {
      const { profile } = parseProfile('new.json', raw)
      if (!profile) return null
      const id = newId()
      persistLocals([...locals, { id, raw }])
      return id
    },
    [locals, persistLocals],
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
      let nextLocals = [...locals]
      const nextOverrides = { ...overrides }
      for (const p of profiles) {
        const raw = profileToRaw(parseProfile(`${p.id ?? 'x'}.json`, p.raw).profile!)
        if (p.id !== null && files.some((f) => f.id === p.id)) {
          saveOverride(p.id, raw)
          nextOverrides[p.id] = raw
        } else if (p.id !== null && nextLocals.some((l) => l.id === p.id)) {
          nextLocals = nextLocals.map((l) => (l.id === p.id ? { id: p.id!, raw } : l))
        } else {
          nextLocals.push({ id: p.id ?? newId(), raw })
        }
      }
      setOverrides(nextOverrides)
      persistLocals(nextLocals)
      return { added: profiles.length, errors }
    },
    [files, locals, overrides, persistLocals],
  )

  const exportAll = useCallback(() => exportProfiles(entries.map((e) => ({ id: e.id, raw: e.raw }))), [entries])

  return { entries, update, reset, remove, add, duplicate, importAll, exportAll }
}
