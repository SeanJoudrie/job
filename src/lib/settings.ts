import { read, write } from './storage'
import { DEFAULT_DATES, type Contact, type Dates } from './documents'
import type { Profile } from './requirements'
import { DEFAULT_WEIGHTS, type Weights } from './score'

/**
 * Everything personal. Kept on the device: the pay floor especially, since it
 * is the number on the other side of any negotiation that follows.
 */
export type Settings = {
  /** "$25/hr (~$52k/yr). Absolute minimum, not a preference." */
  floorHourly: number
  /** "30 min max by car." Measured in minutes, because that is the constraint. */
  maxMinutes: number
  profile: Profile
  weights: Weights
  apiKey: string
  /**
   * On the device, never in the repository. The documents are public content —
   * where he worked and what he did — but an address and a phone number in a
   * public repo is a different kind of exposure, and dates guessed wrong are
   * worse on a resume than dates left blank.
   */
  contact: Contact
  dates: Dates
}

export const DEFAULTS: Settings = {
  floorHourly: 25,
  maxMinutes: 30,
  profile: { years: 5, degree: 'bachelor', clearance: 'none' },
  weights: DEFAULT_WEIGHTS,
  apiKey: '',
  contact: { name: '', city: 'Wakefield, MA', email: '', phone: '', links: '' },
  dates: DEFAULT_DATES,
}

/**
 * v2: the floor dropped to the case file's $25, the radius became a drive time,
 * and the axis set changed. A stored v1 would carry a stale $26 floor and a
 * weights object with axes that no longer exist, so it is not migrated.
 */
const KEY = 'job.settings.v2'
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
