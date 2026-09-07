import type { Job } from '../types'
import { easeScore } from './ease'
import { industryFor } from './industry'
import { rank, type Ctx, type Weights } from './score'
import type { Profile } from './requirements'

/**
 * Remote and part-time, which he asked for in the strongest terms he has used
 * about anything: a ten out of ten, "even if it's the most boring shit ever".
 *
 * This directly reverses a premise the rest of the model was built on. The case
 * file said he degrades in isolation, so a fully remote job takes minus five on
 * the container axis — the largest single penalty anywhere in the scoring — and
 * the baseline every lane is built from excluded remote work outright, which
 * meant 285 postings were invisible in the entire application. Both of those
 * came from him. So does this. When someone tells you a new thing about
 * themselves, the new thing wins; the ranking is a record of what he said, not
 * an argument with him.
 *
 * The penalty is not deleted, because "I want a remote job" and "I do better
 * around people" are both true and he has said both. Remote is visible
 * everywhere now and still ranks below an equivalent job on site — and inside
 * this section, where every job is remote or part-time, it cancels out and
 * stops mattering at all.
 */

/**
 * Part-time in the sense he means it: fewer hours, not a lesser job.
 *
 * Per diem and seasonal are in deliberately. A per diem coordinator post at a
 * hospital is exactly the shape he asked for, and the pool has 326 of these
 * against 285 remote — the two together are what make a section rather than a
 * short list.
 */
export const PART_TIME =
  /\b(?:part[- ]time|part time|per diem|prn\b|seasonal|temporary|temp\b|casual|flexible (?:hours|schedule)|hours per week|as needed|on[- ]call)\b/i

export type RemoteKind = 'remote' | 'hybrid' | 'part-time'

export function remoteKind(job: Job): RemoteKind | null {
  if (job.remote) return 'remote'
  if (job.locations.some((l) => l.hybrid)) return 'hybrid'
  return PART_TIME.test(`${job.title} ${job.descText || job.preview || ''}`) ? 'part-time' : null
}

export const isFlexible = (job: Job): boolean => remoteKind(job) !== null

/**
 * Ranked half on whether he wants it and half on whether he can get it.
 *
 * "As long as it's slightly achievable — I know I'm not the most IT person
 * ever." Ranking these purely on fit puts seventy-three remote software
 * engineering posts at the top, which is the pool's answer and not his. An even
 * split is the plainest reading of what he asked for, and it is a different
 * weighting from the rest of the app on purpose: everywhere else gettability is
 * twenty percent, because everywhere else he has not said this.
 */
export function flexibleScore(job: Job, profile: Profile, weights: Weights, ctx: Ctx): number {
  return rank(job, profile, weights, ctx).exact * 0.5 + easeScore(job) * 0.5
}

/**
 * Remote leads, then hybrid, then part-time — and achievability orders each.
 *
 * Without the tiering the list is two thirds local per-diem work, because a
 * per diem shift at a hospital twenty-six minutes away is easier to get than
 * anything remote. All of it is wanted; a tab called "remote" that opens on
 * Beth Israel dietary aide is still the wrong first screen.
 */
const TIER: Record<RemoteKind, number> = { remote: 0, hybrid: 1, 'part-time': 2 }

/** Everything remote, hybrid or part-time that is not an excluded field. */
export function flexibleJobs(jobs: Job[], profile: Profile, weights: Weights, ctx: Ctx): Job[] {
  return jobs
    .filter((j) => isFlexible(j) && !industryFor(j, ctx.now).excluded)
    .sort((a, b) => {
      const tier = TIER[remoteKind(a)!] - TIER[remoteKind(b)!]
      return tier !== 0 ? tier : flexibleScore(b, profile, weights, ctx) - flexibleScore(a, profile, weights, ctx)
    })
}
