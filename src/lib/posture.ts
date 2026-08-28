import type { Job } from '../types'

/**
 * How the body spends the day.
 *
 * The case file asks for this to be weighted heavily, and it is the one axis
 * that does not follow the usual good-job/bad-job axis: "Either seated all day
 * or moving all day. Standing still in one place is the worst case." Desk work
 * and warehouse work both score well. A greeter does not.
 *
 * Postings state this more often than they state anything else useful, because
 * the physical-requirements paragraph is a legal habit. That paragraph is the
 * primary evidence here; the title is the fallback.
 */

export type PostureKind = 'seated' | 'moving' | 'standing' | 'unknown'
export type Posture = { score: number; kind: PostureKind; why: string }

const SEATED_BODY =
  /\b(?:sedentary|sit(?:ting)? (?:for|at) (?:extended|long|prolonged)|primarily (?:seated|sitting)|desk[- ]based|at a (?:desk|computer) for|remain(?:s|ing)? seated|office environment)\b/i
const MOVING_BODY =
  /\b(?:walk(?:ing)? and stand(?:ing)?|frequently (?:walk|move)|lift(?:ing)? (?:up to )?\d+ ?(?:lbs?|pounds)|move about the (?:facility|campus|building|site)|push(?:ing)?,? (?:and |or )?pull(?:ing)?|climb(?:ing)? (?:stairs|ladders)|bend(?:ing)?,? (?:and |or )?stoop|on (?:your|their) feet|physically (?:active|demanding))\b/i
const STANDING_BODY =
  /\b(?:stand(?:ing)? (?:for )?(?:extended|long|prolonged) periods|must be able to stand for|stand(?:ing)? (?:for )?(?:the )?(?:entire|full|majority of the) (?:shift|day)|remain(?:s|ing)? standing|stationary position)\b/i

const SEATED_TITLE =
  /\b(?:administrative assistant|office (?:assistant|manager|coordinator)|data entry|records (?:clerk|specialist)|scheduler|analyst|paralegal|bookkeep\w*|accounts payable|coordinator|editor|writer|designer|programmer|developer|help ?desk|receptionist|secretary|registrar|accountant)\b/i
const MOVING_TITLE =
  /\b(?:warehouse|custodian|custodial|janitor\w*|housekeep\w*|groundskeep\w*|landscap\w*|maintenance|facilities|courier|driver|delivery|picker|packer|material handler|mover\b|porter\b|stock(?:er|room)?|receiving|shipping|forklift|ranger|trail)\b/i
/** The worst case, spelled out: a post you stand at. */
const STANDING_TITLE =
  /\b(?:cashier|greeter|host(?:ess)?|retail associate|sales floor|store associate|security (?:guard|officer)|gate attendant|parking attendant|usher|ticket (?:taker|agent)|teller|door (?:attendant|person)|coat check)\b/i

export function postureOf(job: Job): Posture {
  const text = job.descText || job.preview || ''
  const seated = SEATED_BODY.test(text) || SEATED_TITLE.test(job.title)
  const moving = MOVING_BODY.test(text) || MOVING_TITLE.test(job.title)
  const standing = STANDING_BODY.test(text) || STANDING_TITLE.test(job.title)

  // Standing only counts against the job when there is no walking to go with
  // it. Almost every warehouse posting says "stand for long periods" and then
  // says "walk, lift and move about" in the same paragraph; that is the good
  // case, not the bad one.
  if (standing && !moving) return { score: 2, kind: 'standing', why: 'stands in one place — the worst case' }
  if (seated && moving) return { score: 8, kind: 'moving', why: 'desk work with time on your feet' }
  if (seated) return { score: 9, kind: 'seated', why: 'seated all day' }
  if (moving) return { score: 9, kind: 'moving', why: 'moving all day' }
  return { score: 6, kind: 'unknown', why: 'posting does not say' }
}

/**
 * Hours.
 *
 * "Ideal schedule: strict 9-5, or early shift 6am-2pm. Acceptable: occasional
 * late nights. Unacceptable: regular late nights, overnight shifts."
 *
 * A scheduled second shift ending at eleven is regular late nights, so it sits
 * with the overnights rather than in the middle — the middle is for a posting
 * that wants some weekend coverage, which the case file does not rule out.
 */
const OVERNIGHT =
  /\b(?:overnight|third shift|3rd shift|night shift|graveyard|midnight|11 ?(?::00)? ?pm ?(?:-|–|to)|rotating shifts?|24\/7 (?:coverage|operations?))\b/i
const LATE = /\b(?:second shift|2nd shift|evening shift|(?:-|–|to) ?11 ?(?::00)? ?pm|evenings? required)\b/i
const WEEKEND = /\b(?:weekends? required|every other weekend|weekend (?:availability|coverage|rotation))\b/i
const DAY =
  /\b(?:monday (?:through|to|-|–) friday|m-f\b|mon-fri|9 ?(?:am)? ?(?:-|–|to) ?5|8 ?(?:am)? ?(?:-|–|to) ?4|7 ?(?:am)? ?(?:-|–|to) ?3|6 ?(?:am)? ?(?:-|–|to) ?2|day shift|first shift|1st shift|(?:standard |normal )?business hours)\b/i

export type Schedule = { score: number; why: string }

export function scheduleOf(job: Job): Schedule {
  const text = `${job.title}\n${job.descText || job.preview || ''}`
  if (OVERNIGHT.test(text)) return { score: 1, why: 'overnight or rotating shifts' }
  if (LATE.test(text)) return { score: 2, why: 'regular late nights' }
  if (WEEKEND.test(text)) return { score: 4, why: 'weekend coverage required' }
  if (DAY.test(text)) return { score: 9, why: 'weekday daytime hours' }
  return { score: 6, why: 'hours not stated' }
}
