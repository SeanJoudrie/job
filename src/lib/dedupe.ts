import type { Job } from '../types'

/**
 * One job, one row.
 *
 * The same req arrives from the company's own board, an aggregator, an alert
 * email and a friend's link. Four rows for one job makes every count a lie and
 * makes the applied log unreliable, because ticking one copy leaves three
 * pretending to be new.
 *
 * Merging is never silent. Every group keeps its sources so a wrong merge can
 * be seen and split apart — collapsing rows invisibly is the same sin as
 * filtering invisibly.
 */

/** Companies that trade under more than one name. */
const ALIASES: Record<string, string> = {
  rtx: 'raytheon',
  'raytheon technologies': 'raytheon',
  'raytheon company': 'raytheon',
  'bae systems': 'bae',
  'l3harris technologies': 'l3harris',
  'the mitre corporation': 'mitre',
  'mitre corporation': 'mitre',
  'draper laboratory': 'draper',
  'charles stark draper laboratory': 'draper',
  'massachusetts institute of technology': 'mit',
  'mit lincoln laboratory': 'mit lincoln lab',
  'lincoln laboratory': 'mit lincoln lab',
  'anduril industries': 'anduril',
  'shield ai': 'shieldai',
  'palantir technologies': 'palantir',
}

const LEGAL = /\b(?:inc|inc\.|llc|l\.l\.c\.|ltd|limited|corp|corporation|co|company|plc|gmbh|holdings|group)\b/g

export function normaliseCompany(name: string): string {
  const base = name.toLowerCase().replace(/[.,]/g, ' ').replace(LEGAL, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  return ALIASES[base] ?? base
}

/**
 * Abbreviations are expanded, but seniority numbers are kept: "Engineer II" and
 * "Engineer III" are different jobs and merging them would hide one.
 */
const TITLE_WORDS: [RegExp, string][] = [
  [/\bsr\.?\b/gi, 'senior'],
  [/\bjr\.?\b/gi, 'junior'],
  [/\bmgr\.?\b/gi, 'manager'],
  [/\bcoord\.?\b/gi, 'coordinator'],
  [/\badmin\.?\b/gi, 'administrative'],
  [/\bassoc\.?\b/gi, 'associate'],
  [/\basst\.?\b/gi, 'assistant'],
  [/\bspec\.?\b/gi, 'specialist'],
  [/\bops\b/gi, 'operations'],
  [/\beng\.?\b/gi, 'engineer'],
  [/\bdev\.?\b/gi, 'developer'],
]

/** Req numbers and location suffixes boards bolt on: "(R5046)", "- Boston". */
const TITLE_NOISE = /\((?:r|req|job)?[\s#-]*\d[\w-]*\)|\breq(?:uisition)?\s*#?\s*\d+\b|\bjob id\s*:?\s*\d+\b/gi

export function normaliseTitle(title: string): string {
  let t = title.toLowerCase().replace(TITLE_NOISE, ' ')
  for (const [re, word] of TITLE_WORDS) t = t.replace(re, word)
  return t.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

const tokens = (s: string) => new Set(s.split(' ').filter(Boolean))

/** Jaccard over title words — cheap, and enough for the variations boards introduce. */
export function titleSimilarity(a: string, b: string): number {
  const x = tokens(normaliseTitle(a))
  const y = tokens(normaliseTitle(b))
  if (x.size === 0 || y.size === 0) return 0
  let shared = 0
  for (const t of x) if (y.has(t)) shared++
  return shared / (x.size + y.size - shared)
}

const place = (job: Job) => {
  const l = job.locations[0]
  return l?.city && l?.state ? `${l.city.toLowerCase()}|${l.state}` : (l?.state ?? (job.remote ? 'remote' : ''))
}

/** Exact key first — most duplicates are exact once normalised. */
export const dedupeKey = (job: Job) => `${normaliseCompany(job.company)}::${normaliseTitle(job.title)}::${place(job)}`

/** Which board's link to keep. The company's own board is the direct apply path. */
const SOURCE_RANK: Record<string, number> = { greenhouse: 0, lever: 0, ashby: 0, usajobs: 1, adzuna: 3, paste: 2 }

export const SIMILARITY_THRESHOLD = 0.82

/**
 * Merge duplicates. Returns one canonical job per real posting, each carrying
 * every source it was found on.
 */
export function dedupe(jobs: Job[]): Job[] {
  const groups = new Map<string, Job[]>()
  for (const job of jobs) {
    const key = dedupeKey(job)
    const bucket = groups.get(key)
    if (bucket) bucket.push(job)
    else groups.set(key, [job])
  }

  // A second pass catches near-misses: same company and place, title differing
  // by wording rather than by job.
  const merged: Job[][] = []
  const byCompanyPlace = new Map<string, number[]>()
  for (const bucket of groups.values()) {
    const head = bucket[0]
    const cp = `${normaliseCompany(head.company)}::${place(head)}`
    const siblings = byCompanyPlace.get(cp) ?? []
    const hit = siblings.find((i) => titleSimilarity(merged[i][0].title, head.title) >= SIMILARITY_THRESHOLD)
    if (hit !== undefined) {
      merged[hit].push(...bucket)
    } else {
      merged.push(bucket)
      siblings.push(merged.length - 1)
      byCompanyPlace.set(cp, siblings)
    }
  }

  return merged.map((bucket) => {
    const sorted = [...bucket].sort((a, b) => (SOURCE_RANK[a.source] ?? 9) - (SOURCE_RANK[b.source] ?? 9))
    const canonical = sorted[0]
    const others = sorted.slice(1)
    return {
      ...canonical,
      // The longest description wins: aggregators frequently truncate.
      descText: sorted.reduce((best, j) => (j.descText.length > best.length ? j.descText : best), canonical.descText),
      firstSeen: sorted.reduce((min, j) => (j.firstSeen < min ? j.firstSeen : min), canonical.firstSeen),
      alsoOn: others.map((j) => ({ source: j.source, url: j.url })),
    }
  })
}

/** How many boards carry this job. Five usually means hard to fill; one means fresh. */
export const boardCount = (job: Job) => 1 + job.alsoOn.length
