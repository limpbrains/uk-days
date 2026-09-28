import { describe, expect, it } from 'vitest'
import { parseProfile } from './parseProfile'
import { profileToRaw } from './rawProfile'
import { DEFAULT_RULES } from '../lib/naturalisation'

describe('profileToRaw', () => {
  it('produces the file shape without id, and round-trips through parseProfile', () => {
    const parsed = parseProfile('../profiles/me.json', {
      name: 'Me',
      arrivedUK: '2022-09-01',
      ilrDate: '2025-09-01',
      rules: { totalLimit: 400 },
      absences: [{ out: '2023-01-10', in: '2023-01-20', note: 'x' }],
    }).profile!
    const raw = profileToRaw(parsed)
    expect(raw).toEqual({
      name: 'Me',
      arrivedUK: '2022-09-01',
      ilrDate: '2025-09-01',
      rules: { ...DEFAULT_RULES, totalLimit: 400 },
      absences: [{ out: '2023-01-10', in: '2023-01-20', note: 'x' }],
    })
    expect(parseProfile('../profiles/me.json', raw).profile).toEqual(parsed)
  })

  it('omits ilrDate when absent', () => {
    const parsed = parseProfile('../profiles/me.json', { name: 'Me', arrivedUK: '2022-09-01', absences: [] }).profile!
    expect('ilrDate' in profileToRaw(parsed)).toBe(false)
  })
})
