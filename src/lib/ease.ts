import type { Job } from '../types'
import { toAnnual } from './pay'

/**
 * How gettable a job actually is — not how few credentials it lists.
 *
 * The first version of the "Easy hire" lane filtered on degree and years, and
 * filled up with Anduril postings. Those ask for a bachelor's and three years,
 * so they passed; they are also a defence-technology company paying six
 * figures, running several rounds of interviews and often wanting a clearance.
 * Nothing about that is an easy hire.
 *
 * What actually predicts a fast, winnable process is the kind of employer, the
 * pay band, and how the posting is written. A job that says "hiring
 * immediately, will train" is a different universe from one with a take-home
 * exercise and a panel loop, whatever their stated requirements look like.
 */

/** Employers whose process is long and competitive regardless of the posting. */
const SECTOR_EASE: Record<Job['sector'], number> = {
  defense: -3,
  tech: -2,
  university: 1,
  health: 1,
  nonprofit: 1,
  gov: 0,
}

const FAST = /\b(?:hiring immediately|immediate (?:opening|start|hire)|urgently hiring|start (?:immediately|this week)|apply today|walk[- ]in|same[- ]day|on[- ]the[- ]spot|no experience (?:necessary|required)|will train|we will train|training provided|entry[- ]level|multiple openings|several positions|now hiring)\b/i
const SLOW = /\b(?:multiple rounds|interview loop|onsite loop|take[- ]home|case study|technical (?:assessment|screen|interview)|panel interview|coding challenge|presentation to the team|final round|hiring committee)\b/i
/** Roles that hire in volume and hire fast. */
const HIGH_VOLUME = /\b(?:warehouse|fulfillment|picker|packer|forklift|driver|delivery|cashier|retail associate|sales floor|stock|custodial|janitor|housekeep|food service|dining|barista|server|dishwasher|line cook|front desk|receptionist|administrative assistant|office assistant|data entry|call c(?:enter|entre)|customer service (?:rep|associate)|security officer|patient access|dietary|environmental services|groundskeeper|maintenance tech)\b/i
const SENIOR = /\b(?:senior|staff|principal|lead\b|director|head of|vp\b|chief|manager iii|iv\b|architect)\b/i
const TEMP = /\b(?:part[- ]time|seasonal|temporary|per diem|contract|casual)\b/i

export type Ease = { score: number; why: string[] }

/**
 * Signals accumulate without bound, so clamping the total to 0..10 piled a
 * quarter of the real pool onto exactly 0 — a senior cleared defence role and
 * an ordinary competitive one became indistinguishable, and the saturation
 * made gettability look like the only thing the ranking responded to. A
 * logistic curve keeps the same ordering with no cliff at either end.
 */
const spread = (raw: number) => Math.round((10 / (1 + Math.exp(-(raw - 5) / 3.5))) * 10) / 10

export function easeOf(job: Job): Ease {
  const text = job.descText || job.preview || ''
  const why: string[] = []
  let score = 5

  const sector = SECTOR_EASE[job.sector] ?? 0
  score += sector
  if (sector <= -2) why.push(`${job.sector} employer — long, competitive process`)
  else if (sector > 0) why.push(`${job.sector} employer — usually a shorter process`)

  // Pay is the clearest proxy for how many people are competing.
  if (job.pay) {
    const top = job.pay.max ?? job.pay.min
    if (top !== null) {
      const annual = toAnnual(top, job.pay.period)
      if (annual >= 130_000) { score -= 3; why.push('pays six figures — heavily competed') }
      else if (annual >= 95_000) { score -= 1; why.push('pays well — competitive') }
      else if (job.pay.period === 'hour' && annual < 70_000) { score += 2; why.push('hourly role') }
    }
  }

  if (FAST.test(text)) { score += 3; why.push('advertises immediate hiring or training provided') }
  if (SLOW.test(text)) { score -= 2; why.push('multi-stage interview process') }
  if (HIGH_VOLUME.test(job.title)) { score += 2; why.push('high-volume role') }
  if (SENIOR.test(job.title)) { score -= 3; why.push('senior title') }
  if (TEMP.test(text) || TEMP.test(job.title)) { score += 1; why.push('part-time, temporary or seasonal') }

  // A clearance that must already be held is months of process on its own.
  if (job.requirements.some((r) => r.kind === 'clearance' && r.clearance === 'active')) {
    score -= 3
    why.push('needs a clearance already held')
  }

  const hard = job.requirements.filter((r) => r.hardness === 'hard').length
  if (hard >= 6) { score -= 2; why.push(`${hard} hard requirements`) }
  else if (hard <= 1) { score += 1; why.push('few hard requirements') }

  return { score: spread(score), why }
}

export const easeScore = (job: Job) => easeOf(job).score
