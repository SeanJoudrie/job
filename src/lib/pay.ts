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
const NOT_PAY =
  /\b(bonus|equity|stock|rsu|match(?:ing)?|reimburse|stipend|tuition|referral|relocation|budget|revenue|savings|deductible|premium|arr\b|valuation|funding|raised|in sales|under management|endowment|grant)\b/i

const PERIODS: [RegExp, Period][] = [
  [/(?:per\s+hour|hourly|an?\s+hour|\/\s*(?:hr|hour)s?|\bhrs?\b)/i, 'hour'],
  [/(?:per\s+year|per\s+annum|annually|annualized|annual|a\s+year|yearly|\/\s*(?:yr|year)s?)/i, 'year'],
  [/(?:per\s+month|monthly|a\s+month|\/\s*(?:mo|month)s?)/i, 'month'],
  [/(?:per\s+week|weekly|a\s+week|\/\s*(?:wk|week)s?)/i, 'week'],
  [/(?:per\s+day|daily|a\s+day|day\s+rate|\/\s*days?)/i, 'day'],
]

/**
 * A number that looks like money: $-prefixed, comma-grouped, or suffixed.
 *
 * `M` and `B` are matched deliberately, even though no wage is ever quoted in
 * millions. Without them "$3M" matched as a bare "$3" — and Vannevar Labs opens
 * every posting with "we grew from $3M to $80M in ARR", so every one of their
 * jobs was stored at three dollars an hour, failed the pay floor, and vanished
 * from every lane with nothing to show it had happened. Matching the suffix
 * makes the number its real size, and TOO_LARGE below then throws it out.
 */
const MONEY = /(\$\s*\d[\d,]*(?:\.\d+)?\s*[kKmMbB]?)|(\b\d[\d,]*(?:\.\d+)?\s*[kK]\b)/g

/**
 * The gap between the two halves of a range.
 *
 * A currency code may sit in it. Beth Israel writes every band as
 * "$79,268.80 USD - $204,318.40 USD", and without this the range never joined:
 * 103 of their postings were stored as a single value, so the floor was being
 * compared against the BOTTOM of the band — the exact mistake `meetsFloor`
 * exists to prevent.
 */
const SEP = /^\s*(?:USD|CAD|per\s+year|annually)?\s*(?:-|–|—|to|through|up\s+to)\s*$/i

/** No wage is quoted in millions. Anything this large is a company statistic. */
const TOO_LARGE = 1_000_000

/**
 * Below this a year, it is not a wage.
 *
 * CarGurus published a Finance Operations Coordinator with a band of
 * "$1 - $1 USD". The parser read it correctly; the posting is a placeholder.
 * Reported as a dollar an hour it failed the pay floor and the job disappeared,
 * which is the worst outcome available — an unstated salary is an unknown and
 * stays on the list, so a nonsense one should be treated the same way rather
 * than as a wage low enough to disqualify the job.
 */
const NOT_A_WAGE_ANNUAL = 10_000

function toNumber(token: string): number | null {
  const suffix = (token.match(/([kKmMbB])\s*$/)?.[1] ?? '').toLowerCase()
  const digits = token.replace(/[^\d.]/g, '')
  if (!digits) return null
  const n = Number(digits)
  if (!Number.isFinite(n)) return null
  // Ginkgo Bioworks published "$185,000k - $278,800k". A thousands suffix on a
  // number already in the thousands is a typo in the posting, not a multiplier
  // — applying it reported a base salary of $185 million.
  if (suffix === 'k') return n >= 1000 ? n : n * 1000
  if (suffix === 'm') return n * 1_000_000
  if (suffix === 'b') return n * 1_000_000_000
  return n
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
 * Only where the stated period would be implausible as a year's pay. A $2,000
 * weekly contract rate ($104k) and a $500 day rate ($130k) are both real and
 * both stay as written; so do Formlabs' interns at $1,575-$1,950 a week.
 *
 * The band is $15k to $1M, not $5k to $1M. At the narrower one a Beth Israel
 * posting reading "$39.14 - $101.14" with "per week" inside the window came to
 * $5,259 a year, cleared the $5k bar, and an hourly rate was stored as a weekly
 * one. Nobody is paid $101 a week.
 */
const IMPLAUSIBLE_ANNUAL_MIN = 15_000
const IMPLAUSIBLE_ANNUAL_MAX = 1_000_000

function reconcile(period: Period, value: number): Period {
  const inferred = inferPeriod(value)
  if (!inferred || inferred === period) return period
  const annual = toAnnual(value, period)
  return annual > IMPLAUSIBLE_ANNUAL_MAX || annual < IMPLAUSIBLE_ANNUAL_MIN ? inferred : period
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
    //
    // Thirty-four after, not twenty-two: Harvard advertises a Director "responsible
    // for the development of the School's $400M+ annual operating budget", and
    // `budget` — already on the list — sat two characters past the old edge, so
    // an operating budget was stored as the salary.
    const near = text.slice(Math.max(0, start - 30), Math.min(text.length, end + 34))
    if (NOT_PAY.test(near)) continue

    const top = joined ? Math.max(a.value, b!.value) : a.value
    // A wage is never this large. Reaching here means the number is the company's
    // revenue, its funding, or a budget it manages.
    if (top >= TOO_LARGE) continue
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
  const top = best.max ?? best.min
  if (top !== null && toAnnual(top, best.period) < NOT_A_WAGE_ANNUAL) return null
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
