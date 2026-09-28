import { DEFAULT_RULES, type Rules } from '../lib/naturalisation'
import type { RawProfile } from './rawProfile'

export type PresetId = 'standard' | 'spouse'

export interface Preset {
  id: PresetId
  rules: Rules
}

/** Route presets: they only fill the rule fields, everything stays editable. */
export const PRESETS: Record<PresetId, Preset> = {
  standard: { id: 'standard', rules: { ...DEFAULT_RULES } },
  spouse: {
    id: 'spouse',
    rules: { windowYears: 3, totalLimit: 270, softLimit: 300, hardLimit: 540, lastYearLimit: 90, lastYearSoftLimit: 100, ilrMonths: 0 },
  },
}

export const PRESET_IDS = Object.keys(PRESETS) as PresetId[]

export interface NewProfileFields {
  name: string
  arrivedUK: string
  /** Empty string = no ILR yet. */
  ilrDate: string
}

export function newProfileRaw(preset: PresetId, f: NewProfileFields): RawProfile {
  return {
    name: f.name,
    arrivedUK: f.arrivedUK,
    ...(f.ilrDate ? { ilrDate: f.ilrDate } : {}),
    rules: { ...PRESETS[preset].rules },
    absences: [],
  }
}
