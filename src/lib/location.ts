import type { Loc } from '../types'
import gazetteer from './gazetteer.json'

/**
 * Where a job actually is.
 *
 * The trap here is real and was hit while researching this project: testing
 * whether a location string contains "MA" matches Lima, Roman, and Format. So
 * nothing is matched by substring. Strings are tokenised, a token is only a
 * state if it is a whole token and a known code or name, and only then is a
 * city read from the token beside it.
 *
 * Postings also list several locations in one field. Anduril writes
 * "Atlanta, Georgia, United States; Boston, Massachusetts, United States" —
 * which is a Boston job for anyone filtering on Boston, so a multi-location
 * posting qualifies if ANY of its locations does.
 */

type Point = [number, number]
const CITIES = gazetteer.cities as unknown as Record<string, Point>
const STATES = gazetteer.states as unknown as Record<string, Point>

const STATE_NAMES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO',
  connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
  illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
  'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
}
const STATE_CODES = new Set(Object.values(STATE_NAMES))

const REMOTE = /\b(?:remote|work from home|wfh|anywhere|distributed|virtual)\b/i
const HYBRID = /\bhybrid\b/i
const NOISE = /^(?:united states|usa|us|u\.s\.a?\.?|multiple locations|various|onsite|on-site|office)$/i

export function distanceMiles(a: Point, b: Point): number {
  const R = 3958.8
  const p1 = (a[0] * Math.PI) / 180
  const p2 = (b[0] * Math.PI) / 180
  const dp = p2 - p1
  const dl = ((b[1] - a[1]) * Math.PI) / 180
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Split a field that may name several places at once. */
function splitLocations(raw: string): string[] {
  return raw
    .split(/[;|]|\s+\bor\b\s+|\s{2,}/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function resolveOne(raw: string, home: Point): Loc {
  const remote = REMOTE.test(raw)
  const hybrid = HYBRID.test(raw)

  // Strip the working-arrangement words so they can't be read as a place name.
  const cleaned = raw
    .replace(/\b(?:remote|hybrid|onsite|on-site|work from home|wfh)\b/gi, ' ')
    // Drop the whole parenthesised qualifier, not just the brackets. Keeping
    // the contents turned "Boston, MA (Main Campus)" into a token reading
    // "MA Main Campus", which is not a state, so every Boston campus job
    // resolved to nowhere and fell out of the radius.
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s*[-–—]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()

  const tokens = cleaned
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t && !NOISE.test(t))

  let state: string | undefined
  let stateAt = -1
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    // Whole-token match only. This is the line that stops "Lima" being MA.
    if (t.length === 2 && STATE_CODES.has(t.toUpperCase())) {
      state = t.toUpperCase()
      stateAt = i
      break
    }
    const named = STATE_NAMES[t.toLowerCase()]
    if (named) {
      state = named
      stateAt = i
      break
    }
    // A token that opens with a state and carries a qualifier after it.
    const [head] = t.split(/\s+/)
    if (head.length === 2 && STATE_CODES.has(head.toUpperCase())) {
      state = head.toUpperCase()
      stateAt = i
      break
    }
  }

  /**
   * The city is normally the token before the state — "Woburn, MA".
   *
   * Large Workday tenants write it the other way round. RTX posts
   * "US-MA-WOBURN-WB2 ~ 225 Presidential Way", which becomes US, MA, WOBURN,
   * WB2 once the hyphens are split; US is dropped as noise, so the state is
   * first and the city sits AFTER it. Every one of those resolved to the
   * Massachusetts centroid instead — 29.4 miles for a Woburn job that is nine,
   * and for a Pittsfield job that is a hundred and twenty. Under a 30-minute
   * limit that silently deletes the whole employer, which is how it would have
   * shipped: 61 postings added and none of them ever visible.
   *
   * The token after the state is only accepted if the gazetteer knows it as a
   * city in that state. Without that guard "US-MA-TEWKSBURY-322" would offer
   * 322 as a city, and "Massachusetts, United States" would offer anything at
   * all. A name that does not resolve is left alone rather than guessed at.
   */
  const before = stateAt > 0 ? tokens[stateAt - 1] : undefined
  const after = stateAt >= 0 ? tokens[stateAt + 1] : undefined
  const known = (name: string | undefined) => (name && state && CITIES[`${name.toLowerCase()}|${state}`] ? name : undefined)
  const city = known(before) ?? known(after) ?? before
  const loc: Loc = { raw, remote, hybrid, ...(city && { city }), ...(state && { state }) }

  const point = city && state ? CITIES[`${city.toLowerCase()}|${state}`] : undefined
  const fallback = state ? STATES[state] : undefined
  const resolved = point ?? fallback
  if (resolved) {
    loc.lat = resolved[0]
    loc.lon = resolved[1]
    loc.miles = Math.round(distanceMiles(home, resolved) * 10) / 10
  }
  return loc
}

export function parseLocations(raw: string, home: Point = gazetteer.home as unknown as Point): Loc[] {
  if (!raw || !raw.trim()) return []
  return splitLocations(raw).map((part) => resolveOne(part, home))
}

/** The closest resolved location — a multi-location posting counts as its nearest. */
export function nearestMiles(locations: Loc[]): number | null {
  const known = locations.map((l) => l.miles).filter((m): m is number => typeof m === 'number')
  return known.length ? Math.min(...known) : null
}

export const isRemote = (locations: Loc[]) => locations.length > 0 && locations.every((l) => l.remote && !l.city)
export const HOME = gazetteer.home as unknown as Point
