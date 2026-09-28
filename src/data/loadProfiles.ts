import { parseProfile } from './parseProfile'
import { type Profile } from '../lib/naturalisation'

export interface ProfileError {
  file: string
  errors: string[]
}

export interface LoadedProfiles {
  profiles: Profile[]
  errors: ProfileError[]
}

/** Loads every profiles/*.json at build time; Vite hot-reloads the app on edits. */
export function loadProfiles(): LoadedProfiles {
  const modules = import.meta.glob('../../profiles/*.json', { eager: true, import: 'default' })
  const profiles: Profile[] = []
  const errors: ProfileError[] = []
  for (const path of Object.keys(modules).sort()) {
    const { profile, errors: errs } = parseProfile(path, modules[path])
    if (profile) profiles.push(profile)
    else errors.push({ file: 'profiles/' + path.split('/').pop(), errors: errs })
  }
  return { profiles, errors }
}
