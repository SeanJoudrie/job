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

export type AxisId = 'gettable' | 'container' | 'people' | 'reachable' | 'overqual' | 'service' | 'domain' | 'liveness'

export type Axis = { id: AxisId; label: string; score: number; why: string }
export type Weights = Record<AxisId, number>

/**
 * The container axis carries the most weight because it is the strongest
 * predictor in this person's history, and service-compatibility carries a heavy
 * one. These are an argument, not a fact, and every one is a slider.
 */
export const DEFAULT_WEIGHTS: Weights = {
  gettable: 3,
  container: 3,
  service: 2.5,
  reachable: 2,
  people: 2,
  overqual: 1.5,
  domain: 1.5,
  liveness: 1,
}

export const AXIS_LABELS: Record<AxisId, string> = {
  gettable: 'Gettable',
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
  const gaps = countGaps(gapsFor(job.requirements, profile))
  const known = gaps.matched + gaps.soft + gaps.hard
  const reachable = known === 0 ? 6 : clamp(10 - gaps.hard * 3 - gaps.soft * 0.4)
  const reachableWhy = known === 0 ? 'nothing measurable stated' : `${gaps.matched} met · ${gaps.soft} soft · ${gaps.hard} hard`

  // Overqualification — the other end of the rejection.
  let overqual = 8
  let overqualWhy = 'level looks right'
  if (ENTRY.test(job.title) && !SENIOR.test(job.title)) {
    overqual = 5
    overqualWhy = 'entry-level posting — use the stripped resume'
  }
  if (SENIOR.test(job.title)) {
    overqual = 6
    overqualWhy = 'senior posting — may want more years than the resume shows'
  }

  // Service compatibility.
  const vet = (text.match(VETERAN) ?? []).length > 0
  const clearanceFriendly = job.requirements.some((r) => r.kind === 'clearance' && r.clearance === 'obtainable')
  const service = clamp(4 + (vet ? 3 : 0) + (clearanceFriendly ? 3 : 0))
  const serviceWhy = clearanceFriendly ? 'sponsors a clearance' : vet ? 'veteran / defence language' : 'nothing either way'

  const pulls = job.families.filter((f) => PULL.has(f))
  const domain = clamp(4 + pulls.length * 3)
  const domainWhy = pulls.length ? pulls.join(', ') : 'outside the usual areas'

  // Liveness — down-ranked, never hidden. A dead req occasionally revives.
  const age = job.postedAt ? (Date.now() - Date.parse(job.postedAt)) / 86_400_000 : 30
  let liveness = age <= 7 ? 10 : age <= 21 ? 8 : age <= 45 ? 5 : 3
  let livenessWhy = age <= 7 ? 'posted this week' : `about ${Math.round(age)} days old`
  if (job.reposts > 0) { liveness = Math.min(liveness, 3); livenessWhy = `reposted ${job.reposts}× — often a dead req` }
  if (job.linkOk === false) { liveness = 0; livenessWhy = 'apply link is dead' }

  const ease = easeOf(job)

  return [
    { id: 'gettable', label: AXIS_LABELS.gettable, score: ease.score, why: ease.why.join(', ') || 'nothing either way' },
    { id: 'container', label: AXIS_LABELS.container, score: clamp(container), why: containerWhy.join(', ') },
    { id: 'people', label: AXIS_LABELS.people, score: clamp(people), why: peopleWhy.join(', ') || 'neutral' },
    { id: 'reachable', label: AXIS_LABELS.reachable, score: reachable, why: reachableWhy },
    { id: 'overqual', label: AXIS_LABELS.overqual, score: overqual, why: overqualWhy },
    { id: 'service', label: AXIS_LABELS.service, score: service, why: serviceWhy },
    { id: 'domain', label: AXIS_LABELS.domain, score: domain, why: domainWhy },
    { id: 'liveness', label: AXIS_LABELS.liveness, score: liveness, why: livenessWhy },
  ]
}

/**
 * A job you cannot get is not a good job.
 *
 * Gettability is an axis like any other, but averaging is not enough on its
 * own: a perfect fit that is impossible to win still averaged out near the top
 * of the list, and the top of the list is exactly where attention goes. So it
 * also caps the total. A gettability of 0 cannot present as anything above a 3,
 * however well the rest of it reads.
 *
 * The cap is deliberately visible in `ceilingFor` so the number can always be
 * explained rather than just trusted.
 */
export const ceilingFor = (gettable: number) => gettable + 3

export function scoreOf(axes: Axis[], weights: Weights = DEFAULT_WEIGHTS): number {
  let total = 0
  let denom = 0
  for (const a of axes) {
    total += a.score * weights[a.id]
    denom += weights[a.id]
  }
  const mean = denom === 0 ? 0 : total / denom
  const gettable = axes.find((a) => a.id === 'gettable')?.score ?? 10
  return Math.round(Math.min(mean, ceilingFor(gettable)) * 10) / 10
}

/** True when gettability, not fit, is what is holding the score down. */
export function cappedBy(axes: Axis[], weights: Weights = DEFAULT_WEIGHTS): number | null {
  let total = 0
  let denom = 0
  for (const a of axes) {
    total += a.score * weights[a.id]
    denom += weights[a.id]
  }
  const mean = denom === 0 ? 0 : total / denom
  const gettable = axes.find((a) => a.id === 'gettable')?.score ?? 10
  return mean > ceilingFor(gettable) ? Math.round(mean * 10) / 10 : null
}

/** Which resume goes out. Rejection happens at both ends, so this is not cosmetic. */
export const variantFor = (job: Job): 'full' | 'stripped' =>
  ENTRY.test(job.title) && !SENIOR.test(job.title) ? 'stripped' : 'full'
