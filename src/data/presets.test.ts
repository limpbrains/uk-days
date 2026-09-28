import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES } from '../lib/naturalisation'
import { PRESETS, newProfileRaw } from './presets'

describe('presets', () => {
  it('standard preset equals the default rules', () => {
    expect(PRESETS.standard.rules).toEqual(DEFAULT_RULES)
  })

  it('spouse preset is the 3-year route without the ILR wait', () => {
    expect(PRESETS.spouse.rules).toMatchObject({ windowYears: 3, totalLimit: 270, softLimit: 300, hardLimit: 540, lastYearLimit: 90, ilrMonths: 0 })
  })

  it('newProfileRaw builds an empty profile from a preset', () => {
    expect(newProfileRaw('spouse', { name: 'Anna', arrivedUK: '2023-01-01', ilrDate: '' })).toEqual({
      name: 'Anna',
      arrivedUK: '2023-01-01',
      rules: PRESETS.spouse.rules,
      absences: [],
    })
    expect(newProfileRaw('standard', { name: 'Bob', arrivedUK: '2023-01-01', ilrDate: '2026-01-01' }).ilrDate).toBe('2026-01-01')
  })
})
