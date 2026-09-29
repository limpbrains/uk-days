import { describe, expect, it } from 'vitest'
import { loadProfiles } from './loadProfiles'

// Runs the real loader (import.meta.glob over profiles/) so the `today` argument is proven to
// reach parseProfile. profiles/example-spouse.json contains an open-ended trip from 2026-08-18.
describe('loadProfiles passes today through to validation', () => {
  it('rejects the example spouse profile when today is before its open-ended trip starts', () => {
    const { profiles, errors } = loadProfiles('2026-08-01')
    expect(profiles.some((p) => p.id === 'example-spouse')).toBe(false)
    const err = errors.find((e) => e.file === 'profiles/example-spouse.json')
    expect(err?.errors[0]).toMatch(/open-ended trip cannot start after today \(2026-08-01\)/)
  })

  it('accepts it once today has reached the departure day', () => {
    const { profiles, errors } = loadProfiles('2026-08-18')
    expect(profiles.some((p) => p.id === 'example-spouse')).toBe(true)
    expect(errors.some((e) => e.file === 'profiles/example-spouse.json')).toBe(false)
  })
})
