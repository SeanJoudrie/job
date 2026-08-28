import type { Job } from '../types'

/**
 * Getting there.
 *
 * The case file gives the constraint in minutes — "30 min max by car. Anywhere
 * in Boston reachable by commuter rail or T" — and the gazetteer gives
 * straight-line miles. The two are not the same number and pretending they are
 * is how a 25-mile radius quietly became a 50-minute drive.
 */

/**
 * Crow-flies miles to minutes behind the wheel.
 *
 * Roads north of Boston run about a quarter longer than the direct line, the
 * first few miles are surface streets, and anything past that picks up 93, 95
 * or Route 1. So the first eight miles are charged at surface-street speed and
 * the rest at highway speed, with a few fixed minutes for parking and getting
 * out of the driveway.
 *
 * Checked against the drives actually involved from Wakefield: Boston is 10.3
 * direct and comes out at 26 minutes, Lowell is 15 direct and comes out at 33,
 * Waltham is 12.6 and comes out at 30. Those are the real times.
 */
const LOCAL_MILES = 8
const LOCAL_PACE = 2.2
const HIGHWAY_PACE = 1.5
const FIXED = 5

export function driveMinutes(miles: number): number {
  const local = Math.min(miles, LOCAL_MILES)
  const highway = Math.max(0, miles - LOCAL_MILES)
  return Math.round(FIXED + local * LOCAL_PACE + highway * HIGHWAY_PACE)
}

/**
 * Places he can reach on rails rather than in the car.
 *
 * Wakefield is a stop on the Haverhill line into North Station, so the T core
 * and that line's own stops are reachable whatever the drive time says. This
 * is deliberately not every station in the system: a job in Franklin is
 * technically rail-served and is not a commute anyone would take.
 */
const RAIL = new Set(
  [
    'boston', 'cambridge', 'somerville', 'brookline', 'chelsea', 'everett', 'malden', 'medford',
    'quincy', 'revere', 'newton', 'braintree', 'charlestown', 'dorchester', 'roxbury', 'jamaica plain',
    'allston', 'brighton', 'back bay', 'south boston', 'east boston', 'fenway', 'longwood',
    'melrose', 'wakefield', 'reading', 'wilmington', 'andover', 'lawrence', 'haverhill', 'ballardvale',
  ].map((c) => c.toLowerCase()),
)

export const railReachable = (job: Job): boolean =>
  job.locations.some((l) => l.city && RAIL.has(l.city.toLowerCase()))

export type Commute = { minutes: number | null; rail: boolean; why: string }

export function commuteOf(job: Job): Commute {
  const rail = railReachable(job)
  if (job.miles === null) return { minutes: null, rail, why: rail ? 'on the rail line' : 'distance unknown' }
  const minutes = driveMinutes(job.miles)
  const approx = job.locations.some((l) => l.approx)
  return {
    minutes,
    rail,
    why: `${minutes} min drive${rail ? ', or the train' : ''}${approx ? ' (employer region, not the posting)' : ''}`,
  }
}

/** Does this job clear the commute ceiling? Rail into the core always does. */
export function withinCommute(job: Job, maxMinutes: number): boolean {
  if (railReachable(job)) return true
  if (job.miles === null) return false
  return driveMinutes(job.miles) <= maxMinutes
}

/**
 * Ten at fifteen minutes, five at the ceiling, nothing at twice it. Rail into
 * the core never scores below the halfway mark however far the drive is,
 * because the drive is not the trip he would take.
 */
const EASY_MINUTES = 15
const RAIL_FLOOR = 6

export function commuteScore(job: Job, maxMinutes: number): number {
  const { minutes, rail } = commuteOf(job)
  if (minutes === null) return rail ? RAIL_FLOOR : 5
  const raw =
    minutes <= EASY_MINUTES
      ? 10
      : minutes <= maxMinutes
        ? 10 - (5 * (minutes - EASY_MINUTES)) / Math.max(1, maxMinutes - EASY_MINUTES)
        : Math.max(0, 5 - (5 * (minutes - maxMinutes)) / Math.max(1, maxMinutes))
  return Math.round(Math.max(rail ? RAIL_FLOOR : 0, raw) * 10) / 10
}
