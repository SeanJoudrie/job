import type { Applied, AppliedCtx, AppliedStatus, Job } from '../types'
import { normaliseCompany, normaliseTitle } from './dedupe'
import { read, write } from './storage'

/**
 * The record of what was actually sent.
 *
 * This is the one piece of data in this application that must never be lost.
 * Losing an entry causes a second application to a company that already said
 * no, which is worse than any other bug here.
 *
 * So it is written the moment the box is ticked, never on a deferred effect,
 * and it is keyed on company and title rather than on a job id — ids belong to
 * whichever board the job came from, and the nightly scan rebuilds them. The
 * job list is disposable. This is not.
 */

const KEY = 'job.applied.v1'

/** Stable across rescans, across boards, and across a rebuilt list. */
export const appliedKey = (company: string, title: string) => `${normaliseCompany(company)}::${normaliseTitle(title)}`
export const keyOf = (job: Job) => appliedKey(job.company, job.title)

export type AppliedLog = Record<string, Applied>

export function loadApplied(): AppliedLog {
  const raw = read<Record<string, unknown>>(KEY, {})
  const out: AppliedLog = {}
  for (const [k, v] of Object.entries(raw)) {
    if (!v || typeof v !== 'object') continue
    const e = v as Applied
    if (typeof e.at === 'string' && typeof e.title === 'string') out[k] = { ...e, key: k }
  }
  return out
}

/**
 * Synchronous by design — a reload a second later must still know.
 *
 * `ctx` is what the job looked like when it was sent. It is optional so the
 * function still works from a test or a place that has no scoring context, but
 * every real call site passes it: without it the log can say how many were sent
 * and nothing about which ones were worth sending.
 */
export function markApplied(job: Job, ctx?: AppliedCtx, at = new Date().toISOString()): AppliedLog {
  const log = loadApplied()
  const key = keyOf(job)
  if (!log[key]) {
    log[key] = { key, title: job.title, company: job.company, url: job.url, at, status: 'applied', ctx, variant: ctx?.variant }
    write(KEY, log)
  }
  return log
}

export function unmarkApplied(job: Job): AppliedLog {
  const log = loadApplied()
  delete log[keyOf(job)]
  write(KEY, log)
  return log
}

/**
 * Move an application along, and stamp when a human first answered.
 *
 * `respondedAt` is set once and never moved. The interesting number is how long
 * the first reply took, not how long the last stage change took — overwriting it
 * at the offer stage would turn a two-day reply into a six-week one and make
 * every board look equally slow.
 *
 * `ghosted` is not a response. It is what the app concludes after three weeks of
 * silence, and marking it by hand must not stamp a reply that never came.
 */
export function setStatus(key: string, status: AppliedStatus, at = new Date().toISOString()): AppliedLog {
  const log = loadApplied()
  const e = log[key]
  if (e) {
    const answered = status !== 'applied' && status !== 'ghosted'
    log[key] = { ...e, status, respondedAt: e.respondedAt ?? (answered ? at : undefined) }
    write(KEY, log)
  }
  return log
}

/**
 * The one field he has to set himself.
 *
 * Every interview so far has come from someone passing the resume along, and
 * roughly six thousand portal applications have produced no offer. If that is
 * true it is the largest effect in the whole log, and it cannot be inferred
 * from a posting — so it is a toggle on the row.
 */
export function setReferral(key: string, referral: boolean): AppliedLog {
  const log = loadApplied()
  if (log[key]) {
    log[key] = { ...log[key], referral }
    write(KEY, log)
  }
  return log
}

export function setNote(key: string, note: string): AppliedLog {
  const log = loadApplied()
  if (log[key]) {
    log[key] = { ...log[key], note: note || undefined }
    write(KEY, log)
  }
  return log
}

/**
 * Three weeks without a reply is not a shortlist. Calling it keeps the counts
 * honest instead of leaving dead applications inflating an "in progress" number
 * for months. Only `applied` ages out — anything that got a human response is
 * left alone.
 */
export const GHOST_DAYS = 21

export function withGhosting(log: AppliedLog, now = Date.now()): AppliedLog {
  const out: AppliedLog = {}
  for (const [k, e] of Object.entries(log)) {
    const age = (now - Date.parse(e.at)) / 86_400_000
    out[k] = e.status === 'applied' && age >= GHOST_DAYS ? { ...e, status: 'ghosted' } : e
  }
  return out
}

/**
 * A job applied to that reappears as a fresh posting is a dead req — not a
 * suspicion but a dated record. This is what accounts for a lot of silence.
 */
export function isDeadReq(job: Job, log: AppliedLog): boolean {
  const entry = log[keyOf(job)]
  if (!entry) return false
  const appliedAt = Date.parse(entry.at)
  const reappeared = Date.parse(job.firstSeen)
  return job.reposts > 0 || (reappeared > appliedAt && (reappeared - appliedAt) / 86_400_000 > 14)
}

export const exportApplied = (log: AppliedLog) =>
  JSON.stringify({ exportedAt: new Date().toISOString(), applications: Object.values(log) }, null, 2)
