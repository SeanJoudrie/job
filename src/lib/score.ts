import type { Job } from '../types'
import { commuteOf, commuteScore } from './commute'
import { easeOf } from './ease'
import { industryFor } from './industry'
import { topHourly } from './pay'
import { postureOf, scheduleOf } from './posture'
import { countGaps, gapsFor, type Profile } from './requirements'

/**
 * The score, decomposed.
 *
 * A single 1–10 hides the thing most worth looking at. So it is built from
 * axes that are each visible and each reweightable, and the number is only
 * ever the weighted sum of parts you can inspect.
 *
 * The axes are in two groups, because the case file is explicit about their
 * relative worth: "Logistics outrank industry. Weight roughly 60% logistics,
 * 40% industry fit. A Tier C role at $28/hr twenty minutes away beats a Tier A
 * role at $21/hr in Boston." Pay, commute, posture and hours are the logistics;
 * everything else describes the job itself.
 *
 * This runs locally over the whole pool: instant, free, offline, and it is what
 * orders the list. The deeper written analysis is a separate, deliberate step
 * on a handful of chosen jobs.
 */

export type AxisId =
  | 'pay'
  | 'commute'
  | 'posture'
  | 'schedule'
  | 'industry'
  | 'container'
  | 'people'
  | 'reachable'
  | 'overqual'
  | 'service'
  | 'liveness'

export type Axis = { id: AxisId; label: string; score: number; why: string }
export type Weights = Record<AxisId, number>

/** Getting there and getting through the day. */
export const LOGISTICS: AxisId[] = ['pay', 'commute', 'posture', 'schedule']
/** What the job actually is. */
export const FIT: AxisId[] = ['industry', 'container', 'people', 'reachable', 'overqual', 'service', 'liveness']

/** "Weight roughly 60% logistics, 40% industry fit." */
export const LOGISTICS_SHARE = 0.6

/**
 * Within each group the weighting is an argument, not a fact, and every one is
 * a slider. Pay and commute lead the logistics because they are the two the
 * case file states as hard numbers. Posture is next because the case file asks
 * for it in as many words — "weight this heavily" — and it is the axis nothing
 * else captures.
 */
export const DEFAULT_WEIGHTS: Weights = {
  pay: 3,
  commute: 3,
  posture: 2.5,
  schedule: 1.5,

  industry: 3,
  container: 2,
  service: 1.5,
  people: 1.5,
  reachable: 1.5,
  overqual: 1,
  liveness: 1,
}

export const AXIS_LABELS: Record<AxisId, string> = {
  pay: 'Pay',
  commute: 'Commute',
  posture: 'Posture',
  schedule: 'Hours',
  industry: 'Industry',
  container: 'Container',
  people: 'With people',
  reachable: 'Reachable',
  overqual: 'Overqualification',
  service: 'Service-compatible',
  liveness: 'Liveness',
}

/** What the axes need to know that is not on the job. */
export type Ctx = { floorHourly: number; maxMinutes: number; now: Date }
export const defaultCtx = (): Ctx => ({ floorHourly: 25, maxMinutes: 30, now: new Date() })

const TEAM = /\b(?:team|collaborat|cross-?functional|partner with|work closely|department|colleagues|peers|coordinate with|stakeholder)\b/i
const SHIFT = /\b(?:shift|schedule|on-?site|in-?person|in the office|hybrid|campus|facility|front desk|reports? to)\b/i
const QUOTA = /\b(?:quota|commission|\bote\b|pipeline|prospect|cold call|book of business|upsell|close deals|net new)\b/i
const POLICE = /\b(?:enforce|discipline|citations|reprimand|patrol|surveillance of (?:staff|employees))\b/i
const VETERAN = /\b(?:veteran|military|\busera\b|userra|guard|reserve|dd-?214|security clearance|cleared|defense|dod\b|federal|gs-?\d|govcon)\b/i
const SENIOR = /\b(?:senior|staff|principal|lead|director|head of|vp\b|chief|manager iii?)\b/i
const ENTRY = /\b(?:entry|associate|assistant|coordinator|clerk|junior|\bi\b|intern|apprentice|trainee)\b/i

const clamp = (n: number) => Math.max(0, Math.min(10, n))
const round = (n: number) => Math.round(n * 10) / 10
const body = (job: Job) => job.descText || job.preview || ''

/**
 * Pay, relative to the floor.
 *
 * Not a pass/fail — that is what the lane rule is for. This is how much better
 * than the minimum the money is, and it curves: the first five dollars over the
 * floor matter far more than the fifth five, because the floor is the number
 * that decides whether the job is possible at all.
 *
 * An unstated salary scores slightly above the middle rather than badly.
 * Three-quarters of the pool states a band, so silence is unusual — but it is
 * still silence, not evidence of a bad one.
 */
const UNSTATED_PAY = 5.5
/**
 * The two benefits that are worth money here. Health cover is not one of them —
 * TRICARE already provides it, so a job offering it is offering nothing, and
 * $28/hr without beats $22/hr with. Tuition remission and staff meals are cash.
 */
const PAID_IN_KIND = /\b(?:tuition (?:remission|benefit|waiver|assistance|reimbursement)|free (?:meals?|lunch|breakfast)|meals? provided|employee meals?|complimentary meals?)\b/i
const IN_KIND_BONUS = 0.75

export function payScore(job: Job, floorHourly: number): { score: number; why: string } {
  const inKind = PAID_IN_KIND.test(job.descText || job.preview || '')
  const bonus = inKind ? IN_KIND_BONUS : 0
  const kind = inKind ? ', plus tuition or meals' : ''
  const top = topHourly(job.pay)
  if (top === null) return { score: round(UNSTATED_PAY + bonus), why: `no pay listed${kind}` }
  if (top < floorHourly) return { score: round(clamp(5 * (top / floorHourly) + bonus)), why: `$${top.toFixed(0)}/hr — under the floor${kind}` }
  const over = top - floorHourly
  return {
    score: round(clamp(5 + 5 * (1 - Math.exp(-over / 9)) + bonus)),
    why: `$${top.toFixed(0)}/hr — $${over.toFixed(0)} over the floor${kind}`,
  }
}

export function axesFor(job: Job, profile: Profile, ctx: Ctx = defaultCtx()): Axis[] {
  const text = body(job)

  // ── Logistics ──────────────────────────────────────────────────────────────
  const pay = payScore(job, ctx.floorHourly)
  const commute = { score: commuteScore(job, ctx.maxMinutes), why: commuteOf(job).why }
  const posture = postureOf(job)
  const schedule = scheduleOf(job)

  // ── Fit ────────────────────────────────────────────────────────────────────
  const industry = industryFor(job, ctx.now)

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
  // Massachusetts gives veterans statutory preference in municipal civil
  // service too. Scored below federal because it reaches civil-service posts
  // rather than every municipal job, and this cannot tell which is which.
  else if (job.sector === 'municipal') { service += 2; serviceWhy.push('municipal — state veterans’ preference') }
  else if (job.sector === 'defense') { service += 1; serviceWhy.push('defence-adjacent') }
  else if (job.sector === 'university' || job.sector === 'health') { service += 1; serviceWhy.push('large employer, used to reserve duty') }
  if (job.requirements.some((r) => r.kind === 'clearance' && r.clearance === 'obtainable')) { service += 3; serviceWhy.push('sponsors a clearance') }
  if (/\bveterans?\b/i.test(text) || job.families.includes('veterans')) { service += 2; serviceWhy.push('veteran hiring path') }
  if (/\b(?:userra|guard|reserve|drill weekend|military leave)\b/i.test(text)) { service += 1; serviceWhy.push('names reserve duty') }
  if (VETERAN.test(text)) { service += 1; serviceWhy.push('defence language') }

  // Liveness — down-ranked, never hidden. A dead req occasionally revives.
  const age = job.postedAt ? (Date.now() - Date.parse(job.postedAt)) / 86_400_000 : 30
  let liveness = age <= 7 ? 10 : age <= 21 ? 8 : age <= 45 ? 5 : 3
  let livenessWhy = age <= 7 ? 'posted this week' : `about ${Math.round(age)} days old`
  // "Deprioritize postings reposted more than 30 days old — likely dead reqs."
  if (job.reposts > 0) { liveness = Math.min(liveness, 3); livenessWhy = `reposted ${job.reposts}× — often a dead req` }
  if (job.linkOk === false) { liveness = 0; livenessWhy = 'apply link is dead' }

  return [
    { id: 'pay', label: AXIS_LABELS.pay, score: pay.score, why: pay.why },
    { id: 'commute', label: AXIS_LABELS.commute, score: commute.score, why: commute.why },
    { id: 'posture', label: AXIS_LABELS.posture, score: posture.score, why: posture.why },
    { id: 'schedule', label: AXIS_LABELS.schedule, score: schedule.score, why: schedule.why },
    { id: 'industry', label: AXIS_LABELS.industry, score: industry.weight, why: industry.why },
    { id: 'container', label: AXIS_LABELS.container, score: clamp(container), why: containerWhy.join(', ') },
    { id: 'people', label: AXIS_LABELS.people, score: clamp(people), why: peopleWhy.join(', ') || 'neutral' },
    { id: 'reachable', label: AXIS_LABELS.reachable, score: reachable, why: reachableWhy },
    { id: 'overqual', label: AXIS_LABELS.overqual, score: clamp(overqual), why: overqualWhy },
    { id: 'service', label: AXIS_LABELS.service, score: clamp(service), why: serviceWhy.join(', ') || 'nothing either way' },
    { id: 'liveness', label: AXIS_LABELS.liveness, score: liveness, why: livenessWhy },
  ]
}

/**
 * How much of the final number gettability owns.
 *
 * Chosen by measurement, not taste, and re-measured whenever the axes change —
 * because it interacts with them, and the interaction is not obvious.
 *
 * The thing worth knowing about this pool: pay and gettability correlate at
 * r = −0.84. They are very nearly the same number with the sign flipped. The
 * jobs that pay well here are defence and software engineering, which are hard
 * to win; the jobs that are easy to win are university and hospital
 * administration, which pay less. So every point of gettability blended in is
 * a point taken off pay, and the case file makes pay the first constraint
 * there is. An earlier sweep — run before pay was an axis at all, so nothing
 * showed — left the pay axis correlating with the final score at −0.47. Paying
 * better made a job score worse, and nobody could see it.
 *
 * Sweeping the coefficient against the real pool, with the impossible-ceiling
 * in place. Two columns, because the whole-pool figure mixes two populations:
 * the 270 capped-unwinnable postings sitting at the bottom, and the list he
 * actually reads. The first measures the cap; the second measures the ranking.
 *
 *     share    whole pool: r(pay)   |  top 200: r(fit)  r(pay)  r(gettable)
 *      0.10          -0.22          |       0.55       -0.09       0.38
 *      0.15          -0.30          |       0.42        0.06       0.40
 *      0.20          -0.39          |       0.48        0.20       0.33     <- here
 *      0.25          -0.48          |       0.43        0.18       0.40
 *
 * 0.20 is where every group moves the top of the list in the direction it
 * should and none of them owns it. Re-measure this if the axes change again.
 */
export const GETTABLE_SHARE = 0.2

/** Below this, a job is not realistically winnable and must not sit at the top. */
export const IMPOSSIBLE = 1
export const IMPOSSIBLE_CEILING = 4
/** A Tier E industry is a hard exclusion. If a rule is switched off, it still cannot rank. */
export const EXCLUDED_CEILING = 3

const mean = (axes: Axis[], weights: Weights, ids: AxisId[]): number => {
  let total = 0
  let denom = 0
  for (const a of axes) {
    if (!ids.includes(a.id)) continue
    total += a.score * weights[a.id]
    denom += weights[a.id]
  }
  return denom === 0 ? 0 : total / denom
}

export const logisticsOf = (axes: Axis[], weights: Weights = DEFAULT_WEIGHTS) => mean(axes, weights, LOGISTICS)
export const industryFitOf = (axes: Axis[], weights: Weights = DEFAULT_WEIGHTS) => mean(axes, weights, FIT)

/** How good this job would be if it could be had: 60% logistics, 40% the job itself. */
export function fitOf(axes: Axis[], weights: Weights = DEFAULT_WEIGHTS): number {
  return logisticsOf(axes, weights) * LOGISTICS_SHARE + industryFitOf(axes, weights) * (1 - LOGISTICS_SHARE)
}

/**
 * The score before rounding.
 *
 * `scoreOf` rounds to one decimal, which is right for display and wrong for
 * ranking: over the real pool it leaves about forty distinct values across two
 * thousand jobs, so the top of a percentile came out as ten jobs all reading
 * 10.0. The match is built from this instead.
 */
export function scoreExactOf(axes: Axis[], weights: Weights = DEFAULT_WEIGHTS, gettable = 10, excluded = false): number {
  const blended = fitOf(axes, weights) * (1 - GETTABLE_SHARE) + gettable * GETTABLE_SHARE
  let capped = gettable <= IMPOSSIBLE ? Math.min(blended, IMPOSSIBLE_CEILING) : blended
  if (excluded) capped = Math.min(capped, EXCLUDED_CEILING)
  return capped
}

export function scoreOf(axes: Axis[], weights: Weights = DEFAULT_WEIGHTS, gettable = 10, excluded = false): number {
  const blended = fitOf(axes, weights) * (1 - GETTABLE_SHARE) + gettable * GETTABLE_SHARE
  // The blend alone still lets a superb, unwinnable job creep up the list, and
  // the top of the list is where attention goes. Only the genuinely impossible
  // are held down, rather than everything being squashed.
  let capped = gettable <= IMPOSSIBLE ? Math.min(blended, IMPOSSIBLE_CEILING) : blended
  if (excluded) capped = Math.min(capped, EXCLUDED_CEILING)
  return round(capped)
}

/** The fit before gettability was blended in, so the number can be explained. */
export function rawFit(axes: Axis[], weights: Weights = DEFAULT_WEIGHTS): number {
  return round(fitOf(axes, weights))
}

/** The one call sites should use: axes, gettability and weights in one place. */
export function rank(job: Job, profile: Profile, weights: Weights = DEFAULT_WEIGHTS, ctx: Ctx = defaultCtx()) {
  const axes = axesFor(job, profile, ctx)
  const gettable = easeOf(job)
  const industry = industryFor(job, ctx.now)
  return {
    axes,
    gettable,
    industry,
    logistics: round(logisticsOf(axes, weights)),
    fit: rawFit(axes, weights),
    score: scoreOf(axes, weights, gettable.score, industry.excluded),
    /** Unrounded, for ranking. See scoreExactOf. */
    exact: scoreExactOf(axes, weights, gettable.score, industry.excluded),
  }
}

/**
 * Which resume goes out. Rejection happens at both ends, so this is not
 * cosmetic: "ghosted by professional roles, and rejected as overqualified by
 * hourly employers." The case file selects on the industry tier — full resume
 * for Tier A and B, stripped for Tier C and D — with the title as the
 * tiebreaker when the table has nothing to say.
 */
export const STRIPPED_BELOW = 7

export function variantFor(job: Job, now: Date = new Date()): 'full' | 'stripped' {
  const industry = industryFor(job, now)
  if (industry.id !== 'unclassified') return industry.weight >= STRIPPED_BELOW ? 'full' : 'stripped'
  return ENTRY.test(job.title) && !SENIOR.test(job.title) ? 'stripped' : 'full'
}
