import { describe, expect, it } from 'vitest'
import { exportProfiles, importProfiles } from './transfer'

const a = { name: 'A', arrivedUK: '2022-09-01', absences: [{ out: '2023-01-10', in: '2023-01-20' }] }
const b = { name: 'B', arrivedUK: '2022-09-01', absences: [] }

describe('export / import', () => {
  it('round-trips profiles with their ids', () => {
    const json = exportProfiles([{ id: 'me', raw: a }, { id: 'local-1', raw: b }])
    expect(JSON.parse(json)).toMatchObject({ app: 'uk-days', version: 1 })
    const r = importProfiles(json)
    expect(r.errors).toEqual([])
    expect(r.profiles).toEqual([{ id: 'me', raw: a }, { id: 'local-1', raw: b }])
  })

  it('accepts a bare single profile object (a profiles/*.json file)', () => {
    const r = importProfiles(JSON.stringify(a))
    expect(r.errors).toEqual([])
    expect(r.profiles).toEqual([{ id: null, raw: a }])
  })

  it('validates each profile and reports the bad ones by id', () => {
    const json = exportProfiles([{ id: 'ok', raw: a }, { id: 'bad', raw: { name: 'X' } }])
    const r = importProfiles(json)
    expect(r.profiles.map((p) => p.id)).toEqual(['ok'])
    expect(r.errors[0]).toMatch(/bad/)
  })

  it('rejects non-JSON and unknown shapes', () => {
    expect(importProfiles('{nope').errors[0]).toMatch(/JSON/)
    expect(importProfiles('[1,2]').errors[0]).toMatch(/not a uk-days export/)
  })
})

import { mergeImport } from './transfer'

describe('mergeImport', () => {
  const fileIds = ['example-standard']
  const locals = [{ id: 'local-1', raw: b }]

  it('adds new profiles, replaces same-id locals, overrides file profiles, and counts each', () => {
    const r = mergeImport(
      [
        { id: 'example-standard', raw: a },
        { id: 'local-1', raw: a },
        { id: 'local-9', raw: b },
        { id: null, raw: b },
      ],
      fileIds,
      locals,
      () => 'local-new',
    )
    expect(r.overrides).toEqual({ 'example-standard': a })
    expect(r.locals.map((l) => l.id)).toEqual(['local-1', 'local-9', 'local-new'])
    expect(r.locals[0].raw).toEqual(a)
    expect(r.added).toBe(2)
    expect(r.replaced).toBe(2)
  })

  it('does not touch anything when the import is empty', () => {
    const r = mergeImport([], fileIds, locals, () => 'x')
    expect(r).toEqual({ overrides: {}, locals, added: 0, replaced: 0 })
  })
})
