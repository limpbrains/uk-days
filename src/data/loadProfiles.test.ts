import { describe, expect, it } from 'vitest'
import { parseProfile } from './parseProfile'

// loadProfiles() itself needs Vite's import.meta.glob; the contract it must honour is that file
// profiles go through the same validation as imports and edits, including the "today" rule.
describe('file profiles use the same validation as every other path', () => {
  const raw = { name: 'F', arrivedUK: '2022-09-01', absences: [{ out: '2026-10-01' }] }

  it('rejects a future open-ended trip when today is given', () => {
    expect(parseProfile('../../profiles/f.json', raw, '2026-09-29').errors[0]).toMatch(/absence #1 .*cannot start after today/)
  })

  it('accepts the same trip once today has reached the departure day', () => {
    expect(parseProfile('../../profiles/f.json', raw, '2026-10-01').errors).toEqual([])
  })
})
