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

describe('parseProfile: rule and date sanity', () => {
  const base = { name: 'X', arrivedUK: '2022-09-01', absences: [] }

  it('rejects non-integer, negative and absurd rule values', () => {
    expect(parseProfile('x.json', { ...base, rules: { windowYears: 2.5 } }).errors[0]).toMatch(/rules\.windowYears/)
    expect(parseProfile('x.json', { ...base, rules: { totalLimit: -1 } }).errors[0]).toMatch(/rules\.totalLimit/)
    expect(parseProfile('x.json', { ...base, rules: { windowYears: 300000 } }).errors[0]).toMatch(/rules\.windowYears/)
    expect(parseProfile('x.json', { ...base, rules: { windowYears: 0 } }).errors[0]).toMatch(/rules\.windowYears/)
    expect(parseProfile('x.json', { ...base, rules: { ilrMonths: 500 } }).errors[0]).toMatch(/rules\.ilrMonths/)
  })

  it('requires the discretion bands to be ordered', () => {
    expect(parseProfile('x.json', { ...base, rules: { softLimit: 400 } }).errors[0]).toMatch(/softLimit.*totalLimit/)
    expect(parseProfile('x.json', { ...base, rules: { hardLimit: 470 } }).errors[0]).toMatch(/hardLimit.*softLimit/)
    expect(parseProfile('x.json', { ...base, rules: { lastYearSoftLimit: 80 } }).errors[0]).toMatch(/lastYearSoftLimit.*lastYearLimit/)
  })

  it('accepts the spouse preset and a 1-year window', () => {
    expect(parseProfile('x.json', { ...base, rules: { windowYears: 3, totalLimit: 270, softLimit: 300, hardLimit: 540, ilrMonths: 0 } }).errors).toEqual([])
    expect(parseProfile('x.json', { ...base, rules: { windowYears: 1 } }).errors).toEqual([])
  })

  it('keeps dates inside 1900–2200 so timelines stay small', () => {
    expect(parseProfile('x.json', { ...base, arrivedUK: '0202-09-01' }).errors[0]).toMatch(/"arrivedUK".*1900/)
    expect(parseProfile('x.json', { ...base, ilrDate: '9999-01-01' }).errors[0]).toMatch(/"ilrDate".*2200/)
    expect(parseProfile('x.json', { ...base, applicationDate: '2201-01-01' }).errors[0]).toMatch(/"applicationDate".*2200/)
    expect(parseProfile('x.json', { ...base, absences: [{ out: '2500-01-01', in: '2500-01-05' }] }).errors[0]).toMatch(/absence #1.*2200/)
  })

  it('rejects ilrDate and applicationDate before arrival', () => {
    expect(parseProfile('x.json', { ...base, ilrDate: '2020-01-01' }).errors[0]).toMatch(/ilrDate.*arrivedUK/)
    expect(parseProfile('x.json', { ...base, applicationDate: '2022-08-31' }).errors[0]).toMatch(/applicationDate.*arrivedUK/)
  })
})

describe('parseProfile: shapes, sizes and open trips', () => {
  const base = { name: 'X', arrivedUK: '2022-09-01', absences: [] }

  it('requires absence dates to be strings, not coerced', () => {
    const r = parseProfile('x.json', { ...base, absences: [{ out: ['2023-01-10'], in: '2023-01-20' }] })
    expect(r.profile).toBeNull()
    expect(r.errors[0]).toMatch(/absence #1: "out" must be a string/)
  })

  it('limits the number of absences and the length of names and notes', () => {
    const many = Array.from({ length: 2001 }, (_, i) => ({ out: `2100-01-01`, in: '2100-01-02', note: String(i) }))
    expect(parseProfile('x.json', { ...base, absences: many }).errors[0]).toMatch(/at most 2000 absences/)
    expect(parseProfile('x.json', { ...base, name: 'x'.repeat(201) }).errors[0]).toMatch(/"name" .*200/)
    expect(parseProfile('x.json', { ...base, absences: [{ out: '2023-01-10', in: '2023-01-20', note: 'n'.repeat(201) }] }).errors[0]).toMatch(/absence #1: "note".*200/)
  })

  it('rejects an open-ended trip that starts after today when today is given', () => {
    const today = '2026-09-28'
    expect(parseProfile('x.json', { ...base, absences: [{ out: '2026-10-10' }] }, today).errors[0]).toMatch(/absence #1 .*open-ended.*after today/)
    expect(parseProfile('x.json', { ...base, absences: [{ out: '2026-09-28' }] }, today).errors).toEqual([])
    expect(parseProfile('x.json', { ...base, absences: [{ out: '2026-10-10' }] }).errors).toEqual([])
  })
})
