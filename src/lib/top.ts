import type { Job } from '../types'
import { normaliseCompany, normaliseTitle } from './dedupe'
import { commuteOf } from './commute'
import { topHourly } from './pay'
import { defaultCtx, IMPOSSIBLE, rank, type Ctx, type Weights } from './score'
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

/**
 * What "top" means. Score by default; money when he asks for money.
 *
 * "Which jobs pay most" is the wrong question, and I built it before checking.
 * Pay and gettability run at r = -0.76 across this pool, so the honest answer
 * to it was a neurosurgeon, a hospital's chief operating officer, three
 * endowed professorships and four principal engineers — the correct output of
 * a question worth nothing to him.
 *
 * The question he is actually asking is "of the jobs I could get, which pay
 * most". So a non-score sort ranks within the best CANDIDATES by fit rather
 * than across the whole pool: a wide enough net that the best-paying reachable
 * work is certainly in it, narrow enough that the top of the pay distribution
 * — which is uniformly out of reach — is not.
 */
export type TopSort = 'score' | 'pay' | 'commute' | 'newest'

/** How many jobs a money or commute sort ranks within. */
export const CANDIDATES = 250

const KEYS: Record<TopSort, (e: { job: Job; score: number }) => number> = {
  score: (e) => e.score,
  pay: (e) => topHourly(e.job.pay) ?? -1,
  // Negated so every key sorts descending and nearest still comes first.
  commute: (e) => -(commuteOf(e.job).minutes ?? 9e9),
  newest: (e) => (e.job.postedAt ? Date.parse(e.job.postedAt) : 0),
}

export function topJobs(
  jobs: Job[],
  profile: Profile,
  weights: Weights,
  { limit = 60, perEmployer = PER_EMPLOYER, ctx = defaultCtx(), by = 'score' }: { limit?: number; perEmployer?: number; ctx?: Ctx; by?: TopSort } = {},
): TopEntry[] {
  const key = KEYS[by]
  const ranked = jobs
    .map((job) => {
      const r = rank(job, profile, weights, ctx)
      return { job, score: r.score, fit: r.fit, gettable: r.gettable.score }
    })
    // Top is a recommendation, so the unwinnable have no business on it at all.
    // Score-ordering buried them; ordering by money does not, and pay and
    // gettability run at r = -0.76 across this pool — so the first screen of a
    // money sort was a hospital's chief operating officer and four principal
    // engineers. They stay in the pool, where a search can still find them.
    .filter((r) => r.gettable > IMPOSSIBLE)
    .sort((a, b) => b.score - a.score)
    // Narrow to what is reachable BEFORE re-ordering, then apply the chosen key.
    .slice(0, by === 'score' ? Infinity : CANDIDATES)
    .sort((a, b) => key(b) - key(a) || b.score - a.score)

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
  for (const entry of [...byRole.values()].sort((a, b) => key(b) - key(a) || b.score - a.score)) {
    const company = normaliseCompany(entry.job.company)
    const used = perCompany.get(company) ?? 0
    if (used >= perEmployer) continue
    perCompany.set(company, used + 1)
    out.push(entry)
    if (out.length >= limit) break
  }
  return out
}
