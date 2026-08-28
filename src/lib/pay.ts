import type { Pay, Period } from '../types'

/**
 * Reading money out of a job posting.
 *
 * Postings state pay in every format anyone has ever invented, or not at all,
 * and the traps are worse than the formats. `401(k)` reads as 401 thousand.
 * A signing bonus reads as salary. A phone number reads as a range. Each of
 * those produces a confidently wrong number, which is worse than no number,
 * because a wrong number silently filters a job in or out.
 *
 * So: poison the known traps first, then look for money, then find the period
 * near it, and refuse to guess when the guess would be a coin flip.
 */

const HOURS_PER_YEAR = 2080

/** Wiped before scanning, because each of these parses as money and isn't. */
const TRAPS: RegExp[] = [
  /\b401\s*\(?k\)?/gi,
  /\b403\s*\(?b\)?/gi,
  /\b457\s*\(?b\)?/gi,
  /\b(?:19|20)\d{2}\b/g, // years
  /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g, // phone numbers
]

/** Money near these words is not the salary. */
const NOT_PAY = /\b(bonus|equity|stock|rsu|match(?:ing)?|reimburse|stipend|tuition|referral|relocation|budget|revenue|savings|deductible|premium)\b/i

const PERIODS: [RegExp, Period][] = [
  [/(?:per\s+hour|hourly|an?\s+hour|\/\s*(?:hr|hour)s?|\bhrs?\b)/i, 'hour'],
  [/(?:per\s+year|per\s+annum|annually|annualized|annual|a\s+year|yearly|\/\s*(?:yr|year)s?)/i, 'year'],
  [/(?:per\s+month|monthly|a\s+month|\/\s*(?:mo|month)s?)/i, 'month'],
  [/(?:per\s+week|weekly|a\s+week|\/\s*(?:wk|week)s?)/i, 'week'],
  [/(?:per\s+day|daily|a\s+day|day\s+rate|\/\s*days?)/i, 'day'],
]

/** A number that looks like money: $-prefixed, comma-grouped, or k-suffixed. */
const MONEY = /(\$\s*\d[\d,]*(?:\.\d+)?\s*[kK]?)|(\b\d[\d,]*(?:\.\d+)?\s*[kK]\b)/g

const SEP = /^\s*(?:-|–|—|to|through|up\s+to)\s*$/i

function toNumber(token: string): number | null {
  const k = /[kK]\s*$/.test(token)
  const digits = token.replace(/[^\d.]/g, '')
  if (!digits) return null
  const n = Number(digits)
  if (!Number.isFinite(n)) return null
  return k ? n * 1000 : n
}

function periodNear(text: string, from: number, to: number): Period | null {
  const window = text.slice(Math.max(0, from - 45), Math.min(text.length, to + 45))
  for (const [re, period] of PERIODS) if (re.test(window)) return period
  return null
}

/**
 * Infer a period from magnitude, but only where the answer isn't a coin flip.
 * 40,000 could be a salary or a very good month; that ambiguity is reported as
 * unknown rather than resolved by guessing.
 */
function inferPeriod(value: number): Period | null {
  if (value > 0 && value < 250) return 'hour'
  if (value >= 15000) return 'year'
  return null
}

/**
 * A period found in the text can be the wrong one.
 *
 * `periodNear` reads a 45-character window, and a posting will happily put
 * "40 hours per week" and "$70,200 - $78,000" inside one. That produced a real
 * band of $78,000 a WEEK, which annualises to $4m, reads as $1,950 an hour and
 * put an accounts-payable job in the top twenty. Magnitude settles it where
 * magnitude can: a five-figure number is a salary whatever word sits beside it.
 *
 * Only where the stated period would be absurd. A $2,000 weekly contract rate
 * and a $500 day rate are both real and both stay as written.
 */
function reconcile(period: Period, value: number): Period {
  const inferred = inferPeriod(value)
  if (!inferred || inferred === period) return period
  const annual = toAnnual(value, period)
  return annual > 1_000_000 || annual < 5_000 ? inferred : period
}

export function parsePay(input: string): Pay {
  if (!input) return null
  let text = input
  for (const trap of TRAPS) text = text.replace(trap, (m) => ' '.repeat(m.length))

  const tokens: { value: number; start: number; end: number }[] = []
  for (const m of text.matchAll(MONEY)) {
    const value = toNumber(m[0])
    if (value === null || value <= 0) continue
    tokens.push({ value, start: m.index!, end: m.index! + m[0].length })
  }
  if (tokens.length === 0) return null

  type Candidate = { min: number | null; max: number | null; period: Period; raw: string; score: number }
  const candidates: Candidate[] = []

  for (let i = 0; i < tokens.length; i++) {
    const a = tokens[i]
    const b = tokens[i + 1]
    const joined = b ? SEP.test(text.slice(a.end, b.start)) : false
    const start = a.start
    const end = joined ? b!.end : a.end

    // A narrow window on purpose. Too wide and a signing bonus mentioned two
    // sentences later disqualifies the real salary range; too narrow and
    // "$5,000 signing bonus" is read as the salary.
    const near = text.slice(Math.max(0, start - 30), Math.min(text.length, end + 22))
    if (NOT_PAY.test(near)) continue

    const top = joined ? Math.max(a.value, b!.value) : a.value
    let period = periodNear(text, start, end)
    if (period) period = reconcile(period, top)
    else period = inferPeriod(top)
    if (!period) continue

    // "up to X" is a ceiling; "from X" / "starting at X" is a floor.
    const before = text.slice(Math.max(0, start - 24), start)
    const ceilingOnly = !joined && /\b(?:up\s+to|as\s+much\s+as|maximum\s+of)\s*$/i.test(before)
    const floorOnly = !joined && /\b(?:from|starting\s+at|minimum\s+of|at\s+least)\s*$/i.test(before)

    let min: number | null
    let max: number | null
    if (joined) {
      min = Math.min(a.value, b!.value)
      max = Math.max(a.value, b!.value)
    } else if (ceilingOnly) {
      min = null
      max = a.value
    } else if (floorOnly) {
      min = a.value
      max = null
    } else {
      min = a.value
      max = a.value
    }

    // Prefer money that sits next to words about pay, and ranges over singles.
    const context = text.slice(Math.max(0, start - 60), Math.min(text.length, end + 30))
    const labelled = /\b(salary|compensation|pay|wage|rate|base|range|earn)\b/i.test(context)
    candidates.push({
      min,
      max,
      period,
      raw: text.slice(start, end).trim(),
      score: (labelled ? 2 : 0) + (joined ? 1 : 0),
    })
    if (joined) i++
  }

  if (candidates.length === 0) return null
  candidates.sort((x, y) => y.score - x.score)
  const best = candidates[0]
  return { min: best.min, max: best.max, period: best.period, raw: best.raw }
}

/** Everything compared in one unit, so a floor can't silently ignore three of them. */
export function toAnnual(value: number, period: Period): number {
  switch (period) {
    case 'hour':
      return value * HOURS_PER_YEAR
    case 'day':
      return value * 260
    case 'week':
      return value * 52
    case 'month':
      return value * 12
    case 'year':
      return value
  }
}

export const hourlyToAnnual = (hourly: number) => hourly * HOURS_PER_YEAR

/**
 * The top of the band in dollars an hour, whatever unit the posting used.
 * The top, not the bottom, for the same reason `meetsFloor` uses it: a band
 * opening below the floor is a negotiation, not a rejection.
 */
export function topHourly(pay: Pay): number | null {
  if (!pay) return null
  const top = pay.max ?? pay.min
  if (top === null) return null
  return toAnnual(top, pay.period) / HOURS_PER_YEAR
}

/**
 * Does this clear the floor?
 *
 * Compared against the TOP of a range, never the bottom: a band opening below
 * the floor is a negotiation, and filtering on the bottom throws away jobs that
 * would have paid. `unknown` is its own answer — an unstated salary is not a
 * failure, and treating it as one would quietly delete half the board.
 */
export function meetsFloor(pay: Pay, floorHourly: number): 'pass' | 'fail' | 'unknown' {
  if (!pay) return 'unknown'
  const top = pay.max ?? pay.min
  if (top === null) return 'unknown'
  return toAnnual(top, pay.period) >= hourlyToAnnual(floorHourly) ? 'pass' : 'fail'
}

/** For display: "$26–32/hr", "$55k–70k/yr". */
export function formatPay(pay: Pay): string {
  if (!pay) return 'no pay listed'
  const unit = { hour: '/hr', day: '/day', week: '/wk', month: '/mo', year: '/yr' }[pay.period]
  const fmt = (n: number) => (n >= 10000 ? `$${Math.round(n / 1000)}k` : `$${n % 1 === 0 ? n : n.toFixed(2)}`)
  if (pay.min !== null && pay.max !== null && pay.min !== pay.max) return `${fmt(pay.min)}–${fmt(pay.max)}${unit}`
  if (pay.min === null && pay.max !== null) return `up to ${fmt(pay.max)}${unit}`
  if (pay.min !== null && pay.max === null) return `from ${fmt(pay.min)}${unit}`
  return `${fmt(pay.min ?? pay.max!)}${unit}`
}
