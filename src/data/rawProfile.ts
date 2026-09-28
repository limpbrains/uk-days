import { type Absence, type Profile, type Rules } from '../lib/naturalisation'

/** The editable, file-shaped form of a profile (what profiles/<id>.json contains). */
export interface RawProfile {
  name: string
  arrivedUK: string
  ilrDate?: string
  applicationDate?: string
  rules: Rules
  absences: Absence[]
}

export function profileToRaw(p: Profile): RawProfile {
  return {
    name: p.name,
    arrivedUK: p.arrivedUK,
    ...(p.ilrDate !== undefined ? { ilrDate: p.ilrDate } : {}),
    ...(p.applicationDate !== undefined ? { applicationDate: p.applicationDate } : {}),
    rules: { ...p.rules },
    absences: p.absences.map((a) => ({ ...a })),
  }
}
