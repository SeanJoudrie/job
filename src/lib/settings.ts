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
   * Filled in, not left blank.
   *
   * I kept these empty on the argument that a phone number in a public repo is
   * a different kind of exposure from a list of job postings. That argument was
   * put and overruled: this app has one user, the details are on every resume
   * he sends to strangers anyway, and a cover letter that opens "Your name"
   * is worse than useless — it is the kind of thing you send by accident.
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
  contact: {
    name: 'Sean Maxwell Joudrie',
    city: 'Wakefield, MA',
    phone: '(781) 621-5413',
    email: 'sjoudrie@gmail.com',
    links: 'linkedin.com/in/seanjoudrie',
  },
  dates: DEFAULT_DATES,
}

/**
 * v2: the floor dropped to the case file's $25, the radius became a drive time,
 * and the axis set changed. A stored v1 would carry a stale $26 floor and a
 * weights object with axes that no longer exist, so it is not migrated.
 *
 * v3: the contact block shipped blank, so a phone that opened the app once has
 * an empty name saved and would keep printing "Your name" on every letter
 * forever — the stored value wins over the default, which is exactly the trap
 * the lane set has its own version number for.
 */
const KEY = 'job.settings.v3'
/** The key lives apart from everything else so it can never ride along in an export. */
const KEY_API = 'job.apikey.v1'

export function loadSettings(): Settings {
  const s = read<Partial<Settings>>(KEY, {})
  return {
    ...DEFAULTS,
    ...s,
    profile: { ...DEFAULTS.profile, ...(s.profile ?? {}) },
    weights: { ...DEFAULTS.weights, ...(s.weights ?? {}) },
    // A blank field is a field never filled in, not a field deliberately
    // emptied. Falling back per-key means a half-completed contact block still
    // prints the rest rather than printing nothing.
    contact: { ...DEFAULTS.contact, ...Object.fromEntries(Object.entries(s.contact ?? {}).filter(([, v]) => v)) },
    dates: { ...DEFAULTS.dates, ...(s.dates ?? {}) },
    apiKey: read<string>(KEY_API, ''),
  }
}

export function saveSettings(next: Settings): void {
  const { apiKey, ...rest } = next
  write(KEY, rest)
  write(KEY_API, apiKey)
}
