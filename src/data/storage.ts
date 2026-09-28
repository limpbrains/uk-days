/** Minimal subset of the Web Storage API, so tests can pass an in-memory store. */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const PREFIX = 'uk-days:profile:'

function browserStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** The raw (unvalidated) profile object a user saved in the browser, or null. */
export function loadOverride(id: string, store: KeyValueStore | null = browserStore()): unknown {
  try {
    const raw = store?.getItem(PREFIX + id)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveOverride(id: string, raw: unknown, store: KeyValueStore | null = browserStore()): void {
  try {
    store?.setItem(PREFIX + id, JSON.stringify(raw))
  } catch {
    /* storage unavailable or full: edits stay in memory for this session */
  }
}

export function clearOverride(id: string, store: KeyValueStore | null = browserStore()): void {
  try {
    store?.removeItem(PREFIX + id)
  } catch {
    /* ignore */
  }
}

const LOCAL_KEY = 'uk-days:profiles'

export interface StoredProfile {
  id: string
  raw: unknown
}

/** Profiles created in the browser, in creation order. */
export function loadLocalProfiles(store: KeyValueStore | null = browserStore()): StoredProfile[] {
  try {
    const parsed: unknown = JSON.parse(store?.getItem(LOCAL_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((p): p is StoredProfile => typeof p === 'object' && p !== null && typeof (p as StoredProfile).id === 'string')
  } catch {
    return []
  }
}

export function saveLocalProfiles(list: StoredProfile[], store: KeyValueStore | null = browserStore()): void {
  try {
    store?.setItem(LOCAL_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}
