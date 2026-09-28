import { describe, expect, it } from 'vitest'
import { clearOverride, loadOverride, saveOverride, type KeyValueStore } from './storage'

function memoryStore(): KeyValueStore {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  }
}

describe('profile overrides', () => {
  it('returns null when nothing is stored', () => {
    expect(loadOverride('me', memoryStore())).toBeNull()
  })

  it('round-trips a raw profile object', () => {
    const s = memoryStore()
    saveOverride('me', { name: 'Me', arrivedUK: '2022-09-01', absences: [] }, s)
    expect(loadOverride('me', s)).toEqual({ name: 'Me', arrivedUK: '2022-09-01', absences: [] })
  })

  it('keeps profiles separate', () => {
    const s = memoryStore()
    saveOverride('me', { name: 'Me' }, s)
    expect(loadOverride('wife', s)).toBeNull()
  })

  it('clears an override', () => {
    const s = memoryStore()
    saveOverride('me', { name: 'Me' }, s)
    clearOverride('me', s)
    expect(loadOverride('me', s)).toBeNull()
  })

  it('treats corrupt or throwing storage as empty', () => {
    const s = memoryStore()
    s.setItem('uk-days:profile:me', '{not json')
    expect(loadOverride('me', s)).toBeNull()
    const throwing: KeyValueStore = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
      removeItem: () => { throw new Error('denied') },
    }
    expect(loadOverride('me', throwing)).toBeNull()
    expect(() => saveOverride('me', {}, throwing)).not.toThrow()
    expect(() => clearOverride('me', throwing)).not.toThrow()
  })
})

import { loadLocalProfiles, saveLocalProfiles } from './storage'

describe('local profiles', () => {
  it('is empty when nothing is stored or storage is corrupt', () => {
    const s = memoryStore()
    expect(loadLocalProfiles(s)).toEqual([])
    s.setItem('uk-days:profiles', '[broken')
    expect(loadLocalProfiles(s)).toEqual([])
    s.setItem('uk-days:profiles', '{"not":"a list"}')
    expect(loadLocalProfiles(s)).toEqual([])
  })

  it('round-trips an ordered list of {id, raw}', () => {
    const s = memoryStore()
    const list = [
      { id: 'local-a', raw: { name: 'A' } },
      { id: 'local-b', raw: { name: 'B' } },
    ]
    saveLocalProfiles(list, s)
    expect(loadLocalProfiles(s)).toEqual(list)
  })
})
