import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES } from '../lib/naturalisation'
import { parseProfile } from './parseProfile'

describe('parseProfile', () => {
  it('fills default rules and derives id from the file name', () => {
    const r = parseProfile('../profiles/me.json', { name: 'Me', arrivedUK: '2022-09-01', absences: [] })
    expect(r.errors).toEqual([])
    expect(r.profile).toEqual({ id: 'me', name: 'Me', arrivedUK: '2022-09-01', rules: DEFAULT_RULES, absences: [] })
  })

  it('merges partial rules over defaults and keeps ilrDate and applicationDate', () => {
    const r = parseProfile('../profiles/wife.json', {
      name: 'Wife',
      arrivedUK: '2022-09-01',
      ilrDate: '2025-09-01',
      applicationDate: '2028-01-01',
      rules: { totalLimit: 270, windowYears: 3, ilrMonths: 0 },
      absences: [],
    })
    expect(r.profile?.rules).toEqual({ ...DEFAULT_RULES, totalLimit: 270, windowYears: 3, ilrMonths: 0 })
    expect(r.profile?.ilrDate).toBe('2025-09-01')
    expect(r.profile?.applicationDate).toBe('2028-01-01')
  })

  it('reports a malformed applicationDate', () => {
    const r = parseProfile('x.json', { name: 'X', arrivedUK: '2022-09-01', applicationDate: 'soon', absences: [] })
    expect(r.errors).toEqual([expect.stringMatching(/"applicationDate"/)])
  })

  it('keeps an open-ended absence (missing or empty "in") without an "in" key', () => {
    const r = parseProfile('x.json', {
      name: 'X',
      arrivedUK: '2022-09-01',
      absences: [{ out: '2023-01-10', in: '2023-01-20' }, { out: '2026-08-18', in: '' }],
    })
    expect(r.errors).toEqual([])
    expect(r.profile?.absences[1]).toEqual({ out: '2026-08-18' })
  })

  it('reports missing or malformed top-level fields', () => {
    const r = parseProfile('../profiles/x.json', { arrivedUK: '2022/09/01', absences: 'nope' })
    expect(r.profile).toBeNull()
    expect(r.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/"name"/), expect.stringMatching(/"arrivedUK"/), expect.stringMatching(/"absences"/)]),
    )
  })

  it('reports invalid absences via the core validator', () => {
    const r = parseProfile('../profiles/x.json', { name: 'X', arrivedUK: '2022-09-01', absences: [{ out: '2023-01-20', in: '2023-01-10' }] })
    expect(r.profile).toBeNull()
    expect(r.errors[0]).toMatch(/absence #1/)
  })
})
