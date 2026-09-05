/**
 * Who a federal posting is open to, which decides whether he can apply at all.
 *
 * This is a harder gate than the grade and it was invisible in the same way.
 * Every USAJOBS posting states its hiring paths, and most of them are not open
 * to someone off the street: "Internal to an agency", "Competitive service"
 * (which means current or former federal employees with reinstatement rights),
 * "Excepted service", "Senior executives". An application against one of those
 * is rejected by HR as ineligible before a human reads a word of it.
 *
 * Measured on the live pool: of 418 federal postings whose paths could be read,
 * 255 were open to the public and 163 were not. Two of every five federal jobs
 * on the list were not jobs he could apply to.
 *
 * The other direction matters too. Seven were open to the National Guard and
 * reserves, a path he is on and most applicants are not.
 */

/** Paths a person with no federal service and no veterans' preference can use. */
const OPEN_TO_HIM = [
  'open to the public',
  'the public',
  'recent graduates',
  'students',
]

/**
 * Guard and reserve membership as a hiring path in its own right.
 *
 * Dual-status military technician posts require it, which inverts the usual
 * problem: the qualification almost nobody has is the one he does.
 */
const GUARD = ['national guard', 'reserves', 'military spouses of', 'land and base management']

/**
 * Deliberately NOT counted as open to him.
 *
 * Veterans' preference and VEOA both require qualifying active service —
 * three years continuous, or a campaign badge. Training-only active duty for
 * basic training does not count, so a Guard member mid-pipeline is not
 * preference eligible however much the service is worth elsewhere. Counting
 * this path would send him at jobs that reject him on a rule, which is the
 * most demoralising kind of rejection and the easiest to avoid.
 */
export const VETERANS_PATH = 'veterans'

const has = (paths: string[], needles: string[]) =>
  paths.some((p) => needles.some((n) => p.toLowerCase().includes(n)))

/** Can he lodge an application that will not be binned as ineligible? */
export function canApply(paths: string[] | undefined): boolean {
  // Nothing stated is not evidence of a closed door. Most non-federal postings
  // have no paths at all, and a federal one that omits them is treated the
  // same way every other unknown is here: left alone rather than guessed at.
  if (!paths || paths.length === 0) return true
  return has(paths, OPEN_TO_HIM) || has(paths, GUARD)
}

/** Open to him specifically because he is in the Guard. */
export const isGuardPath = (paths: string[] | undefined): boolean => has(paths ?? [], GUARD)

/** Why the row says what it says. */
export function pathWhy(paths: string[] | undefined): string {
  if (!paths || paths.length === 0) return ''
  if (isGuardPath(paths)) return 'open to Guard and reserve members'
  if (canApply(paths)) return 'open to the public'
  return `only open to ${paths.slice(0, 2).join(' and ').toLowerCase()}`
}
