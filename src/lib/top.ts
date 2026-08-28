import type { Job } from '../types'
import { normaliseCompany, normaliseTitle } from './dedupe'
import { rank, type Weights } from './score'
import type { Profile } from './requirements'

/**
 * The best jobs across every lane, in one list.
 *
 * Ranking alone does not produce that. Sorted purely by score the real pool
 * returns "Patient Access Representative" ten times from one hospital — the
 * same role posted once per shift. Ten rows saying the same thing is not a
 * top ten, so near-identical postings collapse into one and no employer is
 * allowed to own the list.
 */

/**
 * Shift and schedule wording. Matching every time format directly proved
 * hopeless — "8a-12p", "3pm-11:30pm", "430pm", "24hrs." — so instead the title
 * is cut at its first separator, but ONLY when what follows looks like
 * scheduling rather than a different job. "Patient Access Representative, ED
 * Registration 3pm-11:30pm" folds; "Scheduler II, Radiation Oncology" does not.
 */
const SCHEDULE_TAIL = /\d|\b(?:hrs?|hours?|shift|per diem|weekends?|weekdays?|nights?|evenings?|rotating|varying|full[- ]?time|part[- ]?time|m-?f|mon-?fri)\b/i
const SEPARATOR = /[,;(]|\s-\s|\s–\s/

export function roleKey(job: Job): string {
  const [head, ...rest] = job.title.split(SEPARATOR)
  const tail = rest.join(' ')
  const base = tail && SCHEDULE_TAIL.test(tail) ? head : job.title
  // Whatever survives, drop tokens carrying a number: they are shift detail,
  // never the role. Seniority numerals are kept by normaliseTitle upstream.
  const SHIFT_WORD = /^(?:m-?f|mon-?fri|hrs?|hours?|shift|days?|nights?|evenings?|weekends?|weekdays?|rotating|varying|per|diem|flex|prn)$/i
  const cleaned = base
    .split(/\s+/)
    .filter((w) => (!/\d/.test(w) || /^[ivx]+$/i.test(w)) && !SHIFT_WORD.test(w.replace(/[.,;]/g, '')))
    .join(' ')
  return `${normaliseCompany(job.company)}::${normaliseTitle(cleaned)}`
}

export type TopEntry = {
  job: Job
  score: number
  fit: number
  gettable: number
  /** other postings of the same role at the same employer, folded in */
  variants: Job[]
}

/** No employer may take more than this many places, however well it scores. */
export const PER_EMPLOYER = 3

export function topJobs(
  jobs: Job[],
  profile: Profile,
  weights: Weights,
  { limit = 60, perEmployer = PER_EMPLOYER }: { limit?: number; perEmployer?: number } = {},
): TopEntry[] {
  const ranked = jobs
    .map((job) => {
      const r = rank(job, profile, weights)
      return { job, score: r.score, fit: r.fit, gettable: r.gettable.score }
    })
    .sort((a, b) => b.score - a.score)

  // One entry per role, keeping the best-scoring posting of it.
  const byRole = new Map<string, TopEntry>()
  for (const r of ranked) {
    const key = roleKey(r.job)
    const seen = byRole.get(key)
    if (seen) seen.variants.push(r.job)
    else byRole.set(key, { ...r, variants: [] })
  }

  const out: TopEntry[] = []
  const perCompany = new Map<string, number>()
  for (const entry of [...byRole.values()].sort((a, b) => b.score - a.score)) {
    const company = normaliseCompany(entry.job.company)
    const used = perCompany.get(company) ?? 0
    if (used >= perEmployer) continue
    perCompany.set(company, used + 1)
    out.push(entry)
    if (out.length >= limit) break
  }
  return out
}
