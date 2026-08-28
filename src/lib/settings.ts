import { read, write } from './storage'
import type { Profile } from './requirements'
import { DEFAULT_WEIGHTS, type Weights } from './score'

/**
 * Everything personal. Kept on the device: the pay floor especially, since it
 * is the number on the other side of any negotiation that follows.
 */
export type Settings = {
  floorHourly: number
  /** one step down, for a job scoring at the very top */
  stretchFloor: number
  miles: number
  profile: Profile
  weights: Weights
  apiKey: string
}

export const DEFAULTS: Settings = {
  floorHourly: 26,
  stretchFloor: 25,
  miles: 25,
  profile: { years: 5, degree: 'bachelor', clearance: 'none' },
  weights: DEFAULT_WEIGHTS,
  apiKey: '',
}

const KEY = 'job.settings.v1'
/** The key lives apart from everything else so it can never ride along in an export. */
const KEY_API = 'job.apikey.v1'

export function loadSettings(): Settings {
  const s = read<Partial<Settings>>(KEY, {})
  return {
    ...DEFAULTS,
    ...s,
    profile: { ...DEFAULTS.profile, ...(s.profile ?? {}) },
    weights: { ...DEFAULTS.weights, ...(s.weights ?? {}) },
    apiKey: read<string>(KEY_API, ''),
  }
}

export function saveSettings(next: Settings): void {
  const { apiKey, ...rest } = next
  write(KEY, rest)
  write(KEY_API, apiKey)
}
