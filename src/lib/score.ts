import type { Job } from '../types'
import { easeOf } from './ease'
import { countGaps, gapsFor, type Profile } from './requirements'

/**
 * The score, decomposed.
 *
 * A single 1–10 hides the thing most worth looking at. So it is built from
 * axes that are each visible and each reweightable, and the number is only
 * ever the weighted sum of parts you can inspect.
 *
 * This runs locally over the whole pool: instant, free, offline, and it is what
 * orders the list. The deeper written analysis is a separate, deliberate step
 * on a handful of chosen jobs.
 */

export type AxisId = 'container' | 'people' | 'reachable' | 'overqual' | 'service' | 'domain' | 'liveness'

export type Axis = { id: AxisId; label: string; score: number; why: string }
export type Weights = Record<AxisId, number>

/**
 * The container axis carries the most weight because it is the strongest
 * predictor in this person's history, and service-compatibility carries a heavy
 * one. These are an argument, not a fact, and every one is a slider.
 */
export const DEFAULT_WEIGHTS: Weights = {
  container: 3,
  service: 2.5,
  reachable: 2,
  people: 2,
  overqual: 1.5,
  domain: 1.5,
  liveness: 1,
}

export const AXIS_LABELS: Record<AxisId, string> = {
  container: 'Container',
  people: 'With people',
  reachable: 'Reachable',
  overqual: 'Overqualification',
  service: 'Service-compatible',
  domain: 'Domain pull',
  liveness: 'Liveness',
}

const TEAM = /\b(?:team|collaborat|cross-?functional|partner with|work closely|department|colleagues|peers|coordinate with|stakeholder)\b/i
const SHIFT = /\b(?:shift|schedule|on-?site|in-?person|in the office|hybrid|campus|facility|front desk|reports? to)\b/i
const QUOTA = /\b(?:quota|commission|\bote\b|pipeline|prospect|cold call|book of business|upsell|close deals|net new)\b/i
const POLICE = /\b(?:enforce|discipline|citations|reprimand|patrol|surveillance of (?:staff|employees))\b/i
const VETERAN = /\b(?:veteran|military|\busera\b|userra|guard|reserve|dd-?214|security clearance|cleared|defense|dod\b|federal|gs-?\d|govcon)\b/i
const SENIOR = /\b(?:senior|staff|principal|lead|director|head of|vp\b|chief|manager iii?)\b/i
const ENTRY = /\b(?:entry|associate|assistant|coordinator|clerk|junior|\bi\b|intern|apprentice|trainee)\b/i

const clamp = (n: number) => Math.max(0, Math.min(10, n))
const body = (job: Job) => job.descText || job.preview || ''

/** Domain families this profile is actually pulled toward. */
const PULL = new Set(['coordinator', 'operations', 'program', 'analyst', 'student'])
/** Named as genuine interests, worth partial credit rather than none. */
const NEAR_PULL = new Set(['education', 'mission', 'outdoors', 'culture', 'marketing', 'publicsafety', 'veterans', 'logistics', 'technical'])
const INTEREST = /\b(?:intelligence|analys[ti]|research|investigat|student|admissions|residence life|campus|librar|archiv|museum|conservation|park|trail|steward|nonprofit|community|youth|mentor|volunteer|emergency management|dispatch|preparedness|veteran|marketing|communications|outreach)\b/i

export function axesFor(job: Job, profile: Profile): Axis[] {
  const text = body(job)

  // Container — same people, on a schedule, in a room.
  let container = 5
  const containerWhy: string[] = []
  if (job.remote) {
    container -= 5
    containerWhy.push('fully remote')
  } else if (job.locations.some((l) => l.hybrid)) {
    container += 1
    containerWhy.push('hybrid')
  } else {
    container += 2
    containerWhy.push('on site')
  }
  if (TEAM.test(text)) { container += 2; containerWhy.push('names a team') }
  if (SHIFT.test(text)) { container += 1; containerWhy.push('defined schedule') }
  if (job.families.includes('solo')) { container -= 4; containerWhy.push('solo work') }

  // With people, not at them.
  let people = 6
  const peopleWhy: string[] = []
  if (job.families.includes('sales')) { people -= 5; peopleWhy.push('quota-carrying') }
  else if (QUOTA.test(text)) { people -= 2; peopleWhy.push('some quota language') }
  if (job.families.includes('enforcement') || POLICE.test(text)) { people -= 3; peopleWhy.push('enforcement') }
  if (TEAM.test(text)) { people += 2; peopleWhy.push('collaborative') }
  if (job.families.includes('coordinator')) { people += 2; peopleWhy.push('coordination role') }

  // Reachable — how much of the gap is soft.
  // Prefer counts computed at scan time from the full requirement list: the
  // index drops unclassifiable lines, which left 38% of jobs looking as though
  // they stated no requirements at all.
  const gaps = job.gaps ?? countGaps(gapsFor(job.requirements, profile))
  const known = gaps.matched + gaps.soft + gaps.hard
  const reachable = known === 0 ? 6 : clamp(10 - gaps.hard * 3 - gaps.soft * 0.4)
  const reachableWhy = known === 0 ? 'nothing measurable stated' : `${gaps.matched} met · ${gaps.soft} soft · ${gaps.hard} hard`

  // Overqualification — the other end of the rejection.
  let overqual = 8
  const overqualWhyParts: string[] = []
  const entry = ENTRY.test(job.title) && !SENIOR.test(job.title)
  if (entry) { overqual -= 2; overqualWhyParts.push('entry-level — use the stripped resume') }
  if (SENIOR.test(job.title)) { overqual -= 2; overqualWhyParts.push('senior posting') }
  if (/\b(?:director|head of|vp\b|chief|principal)\b/i.test(job.title)) { overqual -= 3; overqualWhyParts.push('leadership title, well above the resume') }
  // A hard requirement far past the profile is the clearest overreach signal.
  const wants = Math.max(0, ...job.requirements.filter((r) => r.hardness === 'hard' && r.years !== undefined).map((r) => r.years!))
  if (wants > profile.years + 4) { overqual -= 2; overqualWhyParts.push(`wants ${wants} years`) }
  else if (wants && wants <= profile.years) { overqual += 1; overqualWhyParts.push('years line up') }
  if (entry && job.pay && (job.pay.max ?? 0) < 30 && job.pay.period === 'hour') { overqual -= 1; overqualWhyParts.push('may read as a flight risk') }
  const overqualWhy = overqualWhyParts.join(', ') || 'level looks right'

  // Service compatibility. Graded rather than three-valued: 85% of the pool sat
  // on exactly one number, which cannot order anything.
  const serviceWhy: string[] = []
  let service = 5
  if (job.sector === 'gov') { service += 3; serviceWhy.push('federal — preference is scored') }
  else if (job.sector === 'defense') { service += 1; serviceWhy.push('defence-adjacent') }
  else if (job.sector === 'university' || job.sector === 'health') { service += 1; serviceWhy.push('large employer, used to reserve duty') }
  if (job.requirements.some((r) => r.kind === 'clearance' && r.clearance === 'obtainable')) { service += 3; serviceWhy.push('sponsors a clearance') }
  if (/\bveterans?\b/i.test(text) || job.families.includes('veterans')) { service += 2; serviceWhy.push('veteran hiring path') }
  if (/\b(?:userra|guard|reserve|drill weekend|military leave)\b/i.test(text)) { service += 1; serviceWhy.push('names reserve duty') }
  if (VETERAN.test(text)) { service += 1; serviceWhy.push('defence language') }

  // Domain pull. 84% of the pool scored exactly 4 before, because most jobs
  // match none of the five pull families and nothing else counted.
  const pulls = job.families.filter((f) => PULL.has(f))
  const near = job.families.filter((f) => NEAR_PULL.has(f))
  const domainWhy: string[] = []
  let domain = 4
  if (pulls.length) { domain += Math.min(5, pulls.length * 3); domainWhy.push(pulls.join(', ')) }
  if (near.length) { domain += Math.min(2, near.length); domainWhy.push(`adjacent: ${near.join(', ')}`) }
  if (INTEREST.test(job.title)) { domain += 2; domainWhy.push('title matches a stated interest') }
  else if (INTEREST.test(text)) { domain += 1; domainWhy.push('mentions a stated interest') }

  // Liveness — down-ranked, never hidden. A dead req occasionally revives.
  const age = job.postedAt ? (Date.now() - Date.parse(job.postedAt)) / 86_400_000 : 30
  let liveness = age <= 7 ? 10 : age <= 21 ? 8 : age <= 45 ? 5 : 3
  let livenessWhy = age <= 7 ? 'posted this week' : `about ${Math.round(age)} days old`
  if (job.reposts > 0) { liveness = Math.min(liveness, 3); livenessWhy = `reposted ${job.reposts}× — often a dead req` }
  if (job.linkOk === false) { liveness = 0; livenessWhy = 'apply link is dead' }

  return [
    { id: 'container', label: AXIS_LABELS.container, score: clamp(container), why: containerWhy.join(', ') },
    { id: 'people', label: AXIS_LABELS.people, score: clamp(people), why: peopleWhy.join(', ') || 'neutral' },
    { id: 'reachable', label: AXIS_LABELS.reachable, score: reachable, why: reachableWhy },
    { id: 'overqual', label: AXIS_LABELS.overqual, score: clamp(overqual), why: overqualWhy },
    { id: 'service', label: AXIS_LABELS.service, score: clamp(service), why: serviceWhy.join(', ') || 'nothing either way' },
    { id: 'domain', label: AXIS_LABELS.domain, score: clamp(domain), why: domainWhy.join(', ') || 'outside the usual areas' },
    { id: 'liveness', label: AXIS_LABELS.liveness, score: liveness, why: livenessWhy },
  ]
}

/**
 * A job you cannot get is not a good job — but it is not the only thing either.
 *
 * The first attempt made gettability BOTH the heaviest axis and a hard ceiling
 * at gettability + 3. Measured over the real pool, that left fit correlating
 * with the final score at r = 0.20: the app was ranking on one number and the
 * other seven axes were decoration. Worse, the ceiling was so aggressive that
 * clearance-sponsoring jobs — the most valuable kind here — averaged 3.50
 * against 5.35 for everything else. The feature was being punished.
 *
 * So gettability is counted once, as a multiplier, and the axes carry fit.
 * Two clean questions: how good would this job be, and can it be won. A smooth
 * factor also avoids the cliff a hard cap produced, since gettability is itself
 * bimodal and the cap split the pool into two disconnected clumps.
 */
/**
 * How much of the final number gettability owns.
 *
 * Chosen by measurement, not taste. Over the real pool, gettability has a
 * standard deviation of 3.37 and fit only 0.92 — fit is an average of seven
 * weakly-related axes, so it clusters. That means a coefficient does not mean
 * what it looks like: an even-looking 45% share made gettability correlate
 * with the result at 0.95 and fit at 0.42, so the app was ranking on one
 * number and the other seven axes were decoration.
 *
 * Sweeping the coefficient against the pool:
 *
 *     share   r(fit)  r(gettable)
 *      0.10    0.93      0.47
 *      0.20    0.78      0.72
 *      0.25    0.69      0.81     <- here
 *      0.45    0.42      0.95
 *
 * 0.25 leaves gettability the primary factor while fit still genuinely moves
 * the ranking. Re-measure this if the axes are ever made to spread wider.
 */
export const GETTABLE_SHARE = 0.25

/** Below this, a job is not realistically winnable and must not sit at the top. */
export const IMPOSSIBLE = 1
export const IMPOSSIBLE_CEILING = 4

/** The weighted mean of the axes: how good this job would be if it could be had. */
export function fitOf(axes: Axis[], weights: Weights = DEFAULT_WEIGHTS): number {
  let total = 0
  let denom = 0
  for (const a of axes) {
    total += a.score * weights[a.id]
    denom += weights[a.id]
  }
  return denom === 0 ? 0 : total / denom
}

export function scoreOf(axes: Axis[], weights: Weights = DEFAULT_WEIGHTS, gettable = 10): number {
  const blended = fitOf(axes, weights) * (1 - GETTABLE_SHARE) + gettable * GETTABLE_SHARE
  // The blend alone still lets a superb, unwinnable job creep up the list, and
  // the top of the list is where attention goes. Only the genuinely impossible
  // are held down, rather than everything being squashed.
  const capped = gettable <= IMPOSSIBLE ? Math.min(blended, IMPOSSIBLE_CEILING) : blended
  return Math.round(capped * 10) / 10
}

/** The fit before gettability was blended in, so the number can be explained. */
export function rawFit(axes: Axis[], weights: Weights = DEFAULT_WEIGHTS): number {
  return Math.round(fitOf(axes, weights) * 10) / 10
}

/** The one call sites should use: axes, gettability and weights in one place. */
export function rank(job: Job, profile: Profile, weights: Weights = DEFAULT_WEIGHTS) {
  const axes = axesFor(job, profile)
  const gettable = easeOf(job)
  return {
    axes,
    gettable,
    fit: rawFit(axes, weights),
    score: scoreOf(axes, weights, gettable.score),
  }
}

/** Which resume goes out. Rejection happens at both ends, so this is not cosmetic. */
export const variantFor = (job: Job): 'full' | 'stripped' =>
  ENTRY.test(job.title) && !SENIOR.test(job.title) ? 'stripped' : 'full'
