import type { Applied, AppliedCtx, Job } from '../types'
import { GHOST_DAYS } from './applied'
import { commuteOf } from './commute'
import { boardCount } from './dedupe'
import { industryFor } from './industry'
import { packFor } from './packs'
import { topHourly } from './pay'
import { rank, variantFor, type Ctx, type Weights } from './score'
import type { Profile } from './requirements'
import type { Match } from './match'

/**
 * What actually happened, and what can honestly be concluded from it.
 *
 * Roughly six thousand portal applications have produced no offer, and every
 * interview so far came through a person rather than a form. That is the only
 * real evidence this application has about the world, and until now none of it
 * was written down: the log recorded that something was sent, not what was
 * sent, through where, or with what attached. So no question about it could be
 * answered, and the scoring model had nothing to be wrong against.
 *
 * Everything here is descriptive. It reports rates; it does not invent them.
 * Two rules keep it honest, and both matter more than any number it prints:
 *
 *  - The denominator is *settled* applications, not sent ones. Something sent
 *    on Tuesday has not been ignored, it has not been answered yet, and putting
 *    it in the bottom of a fraction makes every rate fall every time he applies
 *    to something — the one behaviour the log exists to encourage.
 *  - Below MIN_SAMPLE there is no percentage at all, only a count. "1 of 1
 *    replied" is not a hundred percent response rate, and printing it as one
 *    would send him to spend a week on whichever board happened to answer first.
 */

/** A rejection is an answer. Silence is the thing being measured. */
export const RESPONSES: Applied['status'][] = ['replied', 'interviewing', 'offer', 'rejected']
export const ADVANCES: Applied['status'][] = ['interviewing', 'offer']

export const heardBack = (e: Applied) => RESPONSES.includes(e.status)
export const advanced = (e: Applied) => ADVANCES.includes(e.status)

export const ageDays = (e: Applied, now: number) => (now - Date.parse(e.at)) / 86_400_000

/**
 * Old enough to have an answer, or already answered.
 *
 * Anything sent inside the last three weeks is still out. It is not evidence
 * yet and it is not counted as a failure.
 */
export const isSettled = (e: Applied, now: number) => heardBack(e) || ageDays(e, now) >= GHOST_DAYS

/**
 * Ten settled applications before a percentage is shown at all.
 *
 * Even ten is thin — the interval below is what says how thin. It is set here
 * rather than guessed at each call site so that raising it raises it everywhere.
 */
export const MIN_SAMPLE = 10

/**
 * Wilson score interval. The width is the entire point of showing it.
 *
 * At a response rate anywhere near the real one, twelve percent and four
 * percent on forty applications each are the same number. Without the interval
 * the dashboard invites him to rewrite his strategy around noise, which is the
 * specific failure mode of every "insights" panel ever built.
 */
export function wilson(hits: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1]
  const p = hits / n
  const d = 1 + (z * z) / n
  const centre = p + (z * z) / (2 * n)
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return [Math.max(0, (centre - spread) / d), Math.min(1, (centre + spread) / d)]
}

export type Rate = {
  key: string
  label: string
  /** Everything sent in this bucket, including what is still out. */
  sent: number
  /** How many of those are old enough to judge. */
  settled: number
  heard: number
  advanced: number
  /** null below MIN_SAMPLE — a rate nobody should read. */
  rate: number | null
  /** 95% interval on that rate, same condition. */
  interval: [number, number] | null
}

export function rateOf(key: string, label: string, entries: Applied[], now: number): Rate {
  const settled = entries.filter((e) => isSettled(e, now))
  const heard = settled.filter(heardBack).length
  const enough = settled.length >= MIN_SAMPLE
  return {
    key,
    label,
    sent: entries.length,
    settled: settled.length,
    heard,
    advanced: settled.filter(advanced).length,
    rate: enough ? heard / settled.length : null,
    interval: enough ? wilson(heard, settled.length) : null,
  }
}

/** The dimensions the log can be cut by. Every one is captured automatically bar the referral. */
export type Dimension = 'source' | 'tier' | 'industry' | 'pack' | 'sector' | 'variant' | 'referral' | 'letter' | 'remote' | 'daysLive'

const UNKNOWN = 'not recorded'

/** Bucket an entry along one dimension. Entries logged before capture existed fall in `not recorded`. */
export function bucketOf(e: Applied, dim: Dimension): string {
  if (dim === 'referral') return e.referral ? 'referral' : 'cold'
  const c = e.ctx
  if (!c) return UNKNOWN
  switch (dim) {
    case 'source': return c.source
    case 'tier': return `tier ${c.tier}`
    case 'industry': return c.industry
    case 'pack': return c.pack
    case 'sector': return c.sector
    case 'variant': return c.variant
    case 'letter': return c.letter ? 'with letter' : 'no letter'
    case 'remote': return c.remote ? 'remote' : 'on site'
    case 'daysLive':
      if (c.daysLive === null) return UNKNOWN
      return c.daysLive <= 7 ? 'first week' : c.daysLive <= 30 ? 'under a month' : 'over a month'
  }
}

/**
 * Response rate along one dimension, best first.
 *
 * Buckets with a readable rate sort above buckets without one, so the top of
 * the table is always the part that means something. A bucket nobody has
 * applied through is not listed at all.
 */
export function breakdown(list: Applied[], dim: Dimension, now = Date.now()): Rate[] {
  const groups = new Map<string, Applied[]>()
  for (const e of list) {
    const b = bucketOf(e, dim)
    const at = groups.get(b)
    if (at) at.push(e)
    else groups.set(b, [e])
  }
  return [...groups]
    .map(([k, entries]) => rateOf(k, k, entries, now))
    .sort((a, b) => {
      if ((a.rate === null) !== (b.rate === null)) return a.rate === null ? 1 : -1
      if (a.rate !== null && b.rate !== null && a.rate !== b.rate) return b.rate - a.rate
      return b.settled - a.settled || b.sent - a.sent
    })
}

/** Days from sending to the first human answer, for the ones that got one. */
export function responseDays(list: Applied[]): number[] {
  return list
    .filter((e) => e.respondedAt)
    .map((e) => (Date.parse(e.respondedAt!) - Date.parse(e.at)) / 86_400_000)
    .filter((d) => Number.isFinite(d) && d >= 0)
    .sort((a, b) => a - b)
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Monday-anchored, because a week that starts on whatever day it is now cannot be compared to the last one. */
export function weekStart(at: number): string {
  const d = new Date(at)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

export type Week = { week: string; sent: number; heard: number }

export function weekly(list: Applied[], weeks = 8, now = Date.now()): Week[] {
  const counts = new Map<string, Week>()
  const first = weekStart(now)
  // Seed the empty weeks so a week with nothing sent shows as a zero rather
  // than closing the gap and hiding that nothing went out.
  for (let i = 0; i < weeks; i++) {
    const d = new Date(first)
    d.setDate(d.getDate() - i * 7)
    counts.set(d.toISOString().slice(0, 10), { week: d.toISOString().slice(0, 10), sent: 0, heard: 0 })
  }
  for (const e of list) {
    const w = counts.get(weekStart(Date.parse(e.at)))
    if (!w) continue
    w.sent++
    if (heardBack(e)) w.heard++
  }
  return [...counts.values()].sort((a, b) => a.week.localeCompare(b.week))
}

/**
 * What the outcomes say about the weights, stated as a suggestion he can refuse.
 *
 * For each axis: the mean score among applications that got an answer, against
 * the mean among the ones that did not. A positive gap means that axis was
 * pointing at something real and is currently underweighted. This is a
 * point-biserial difference and nothing cleverer, on purpose — anything with
 * more machinery in it would be harder to argue with, and the requirement is
 * that he can argue with it.
 *
 * It stays silent until there is something to say. Below MIN_LEARN settled
 * applications, or with fewer than MIN_GROUP on either side, it returns nothing
 * at all rather than a confident number built on four data points.
 */
export const MIN_LEARN = 25
export const MIN_GROUP = 5

export type Nudge = { axis: string; heard: number; missed: number; diff: number; n: number }

export function nudges(list: Applied[], now = Date.now()): { ready: boolean; need: number; rows: Nudge[] } {
  const settled = list.filter((e) => isSettled(e, now) && e.ctx?.axes)
  const yes = settled.filter(heardBack)
  const no = settled.filter((e) => !heardBack(e))
  const ready = settled.length >= MIN_LEARN && yes.length >= MIN_GROUP && no.length >= MIN_GROUP
  if (!ready) return { ready: false, need: Math.max(0, MIN_LEARN - settled.length), rows: [] }

  const axes = new Set<string>()
  for (const e of settled) for (const a of Object.keys(e.ctx!.axes!)) axes.add(a)
  const meanOf = (es: Applied[], axis: string) => {
    const vs = es.map((e) => e.ctx!.axes![axis]).filter((v) => typeof v === 'number')
    return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null
  }
  const rows: Nudge[] = []
  for (const axis of axes) {
    const h = meanOf(yes, axis)
    const m = meanOf(no, axis)
    if (h === null || m === null) continue
    rows.push({ axis, heard: h, missed: m, diff: h - m, n: settled.length })
  }
  return { ready: true, need: 0, rows: rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)) }
}

/**
 * Money left, and what it obliges.
 *
 * These thresholds were set by him, not by the app, and they are stated as
 * instructions rather than warnings because that is how they were given: at
 * $20k review the strategy, at $15k bridge employment is no longer optional, at
 * $10k take the job that is on the table. Nothing shows at all until a savings
 * figure is entered — a runway panel with a guessed number in it is worse than
 * no runway panel.
 */
export type Stage = 'ok' | 'review' | 'bridge' | 'take'

export const TRIGGERS: { at: number; stage: Stage; say: string }[] = [
  { at: 10_000, stage: 'take', say: 'Take the viable job. Not the right job — the one that is actually on the table.' },
  { at: 15_000, stage: 'bridge', say: 'Bridge employment is mandatory now. Anything that pays, while the search continues.' },
  { at: 20_000, stage: 'review', say: 'Review the strategy. What has been sent for three months has not worked.' },
]

export type Runway = { stage: Stage; say: string | null; months: number | null }

export function runwayOf(savings: number | null, monthlyBurn: number): Runway {
  if (savings === null || !Number.isFinite(savings)) return { stage: 'ok', say: null, months: null }
  const months = monthlyBurn > 0 ? savings / monthlyBurn : null
  for (const t of TRIGGERS) if (savings <= t.at) return { stage: t.stage, say: t.say, months }
  return { stage: 'ok', say: null, months }
}

/**
 * Read the state of a job at the moment it is being sent.
 *
 * Everything a later question could need, taken once. If a field cannot be
 * resolved it is null rather than a plausible default — a made-up commute in
 * the record would eventually be averaged into an answer about commutes.
 */
export function captureCtx(
  job: Job,
  opts: { profile: Profile; weights: Weights; ctx: Ctx; match: Match; letter: boolean },
): AppliedCtx {
  const { exact, axes } = rank(job, opts.profile, opts.weights, opts.ctx)
  const ind = industryFor(job, opts.ctx.now)
  const live = Number.isFinite(Date.parse(job.firstSeen))
    ? Math.max(0, Math.round((opts.ctx.now.getTime() - Date.parse(job.firstSeen)) / 86_400_000))
    : null
  return {
    source: job.source,
    boards: boardCount(job),
    sector: job.sector,
    pack: packFor(job, opts.ctx.now).id,
    industry: ind.label,
    tier: tierOf(ind.weight, ind.excluded),
    score: Math.round(exact * 100) / 100,
    match: opts.match(exact),
    hourly: topHourly(job.pay),
    minutes: commuteOf(job).minutes,
    remote: job.remote,
    letter: opts.letter,
    variant: variantFor(job, opts.ctx.now),
    daysLive: live,
    axes: Object.fromEntries(axes.map((a) => [a.id, a.score])),
  }
}

/** A letter, from the industry weight the table gave it. E is a field he applied into anyway. */
export function tierOf(weight: number, excluded: boolean): string {
  if (excluded || weight <= 0) return 'E'
  if (weight >= 8) return 'A'
  if (weight >= 7) return 'B'
  if (weight >= 6) return 'C'
  return 'D'
}
