import { describe, expect, it } from 'vitest'
import { formatPay, meetsFloor, parsePay, toAnnual } from '../pay'

const p = (s: string) => parsePay(s)

describe('the formats postings actually use', () => {
  it('hourly range', () => {
    expect(p('$26.00 - $32.00 per hour')).toMatchObject({ min: 26, max: 32, period: 'hour' })
  })
  it('annual range with an em dash', () => {
    expect(p('$55,000 — $70,000 a year')).toMatchObject({ min: 55000, max: 70000, period: 'year' })
  })
  it('k-suffixed range with no dollar signs', () => {
    expect(p('55k-70k DOE')).toMatchObject({ min: 55000, max: 70000, period: 'year' })
  })
  it('a single hourly rate', () => {
    expect(p('$25/hr')).toMatchObject({ min: 25, max: 25, period: 'hour' })
  })
  it('monthly', () => {
    expect(p('$4,500/month')).toMatchObject({ min: 4500, max: 4500, period: 'month' })
  })
  it('weekly', () => {
    expect(p('$1,200 per week')).toMatchObject({ min: 1200, max: 1200, period: 'week' })
  })
  it('a ceiling only', () => {
    expect(p('Up to $80,000')).toMatchObject({ min: null, max: 80000, period: 'year' })
  })
  it('a floor only', () => {
    expect(p('From $22 an hour')).toMatchObject({ min: 22, max: null, period: 'hour' })
  })
  it('"to" as the range separator', () => {
    expect(p('$60,000 to $75,000 annually')).toMatchObject({ min: 60000, max: 75000 })
  })
  it('a range buried in a paragraph', () => {
    const body = `About the role. We are hiring a coordinator.
      The salary range for this position is $58,000 - $64,000 per year.
      We offer great benefits.`
    expect(p(body)).toMatchObject({ min: 58000, max: 64000, period: 'year' })
  })
})

describe('saying nothing, which half of them do', () => {
  it('competitive salary is not a number', () => expect(p('Competitive salary')).toBeNull())
  it('DOE alone is not a number', () => expect(p('Salary DOE')).toBeNull())
  it('empty input', () => expect(p('')).toBeNull())
  it('a posting with no money in it at all', () => {
    expect(p('We are looking for a motivated program coordinator to join our team.')).toBeNull()
  })
})

describe('the traps — each of these parses as money and is not', () => {
  it('401(k) is not four hundred thousand', () => {
    expect(p('We offer a 401(k) with company match.')).toBeNull()
  })
  it('401k without parens either', () => {
    expect(p('Benefits include 401k and dental.')).toBeNull()
  })
  it('403(b) for the university postings', () => {
    expect(p('Retirement: 403(b) plan available.')).toBeNull()
  })
  it('a phone number is not a salary range', () => {
    expect(p('Questions? Call 781-621-5413.')).toBeNull()
  })
  it('a signing bonus is not the salary', () => {
    expect(p('$5,000 signing bonus for new hires.')).toBeNull()
  })
  it('tuition reimbursement is not the salary', () => {
    expect(p('Up to $10,000 in tuition reimbursement.')).toBeNull()
  })
  it('picks the salary out of a posting that also lists a bonus', () => {
    const body = 'Base salary $70,000 - $85,000 per year. Plus a $5,000 signing bonus.'
    expect(p(body)).toMatchObject({ min: 70000, max: 85000, period: 'year' })
  })
})

describe('refusing to guess when the guess is a coin flip', () => {
  it('reports an ambiguous bare number as nothing rather than inventing a period', () => {
    // 8,000 could be a monthly salary or an annual stipend. Either guess is a
    // coin flip, and a wrong one silently filters the job.
    expect(p('Compensation: 8,000')).toBeNull()
  })
  it('but infers hourly for a small number', () => {
    expect(p('Pay rate: $27.50')).toMatchObject({ period: 'hour', min: 27.5 })
  })
  it('and annual for a large one', () => {
    expect(p('Salary: $62,000')).toMatchObject({ period: 'year', min: 62000 })
  })
})

describe('one unit, so a floor cannot ignore three of them', () => {
  it('converts every period to a year', () => {
    expect(toAnnual(26, 'hour')).toBe(54080)
    expect(toAnnual(4500, 'month')).toBe(54000)
    expect(toAnnual(1200, 'week')).toBe(62400)
    expect(toAnnual(60000, 'year')).toBe(60000)
  })
})

describe('the floor compares against the top of a range', () => {
  const FLOOR = 26

  it('keeps a band that opens below the floor but reaches above it', () => {
    // The whole point: this is a negotiation, not a rejection.
    expect(meetsFloor(p('$22 - $30 per hour'), FLOOR)).toBe('pass')
  })
  it('rejects a band entirely below the floor', () => {
    expect(meetsFloor(p('$18 - $22 per hour'), FLOOR)).toBe('fail')
  })
  it('an unstated salary is unknown, never a failure', () => {
    expect(meetsFloor(null, FLOOR)).toBe('unknown')
    expect(meetsFloor(p('Competitive'), FLOOR)).toBe('unknown')
  })
  it('compares annual postings against an hourly floor correctly', () => {
    expect(meetsFloor(p('$50,000 a year'), FLOOR)).toBe('fail') // 26/hr is 54,080
    expect(meetsFloor(p('$56,000 a year'), FLOOR)).toBe('pass')
  })
  it('a ceiling-only posting is judged on the ceiling', () => {
    expect(meetsFloor(p('Up to $60,000'), FLOOR)).toBe('pass')
    expect(meetsFloor(p('Up to $40,000'), FLOOR)).toBe('fail')
  })
  it('a floor-only posting is judged on what it promises', () => {
    expect(meetsFloor(p('From $30 an hour'), FLOOR)).toBe('pass')
  })
})

describe('display', () => {
  it('reads like money', () => {
    expect(formatPay(p('$26 - $32 per hour'))).toBe('$26–$32/hr')
    expect(formatPay(p('$55,000 - $70,000 a year'))).toBe('$55k–$70k/yr')
    expect(formatPay(null)).toBe('no pay listed')
    expect(formatPay(p('Up to $80,000'))).toBe('up to $80k/yr')
  })
})

describe('a period word can be in the window and still be the wrong period', () => {
  // Both of these are real postings. The window that finds "per week" or "per
  // month" is 45 characters wide, and a benefits paragraph fits inside it.
  it('reads $70,200 - $78,000 as a salary, not a weekly wage', () => {
    const p = parsePay('Employees work 40 hours per week. Salary range: $70,200 - $78,000')
    expect(p?.period).toBe('year')
    expect(p?.max).toBe(78_000)
  })

  it('reads $166,000 - $220,000 as a salary, not a monthly one', () => {
    const p = parsePay('Reviewed month over month. The salary range is $166,000 - $220,000')
    expect(p?.period).toBe('year')
  })

  it('leaves a genuine weekly or daily rate alone', () => {
    expect(parsePay('Contract rate of $2,000 per week')?.period).toBe('week')
    expect(parsePay('Day rate: $500 per day')?.period).toBe('day')
    expect(parsePay('$45 per hour')?.period).toBe('hour')
  })
})

describe('numbers that are not wages', () => {
  // Every string here is lifted verbatim from a live posting. Each one was
  // producing a confidently wrong figure, which is worse than producing none:
  // a wrong number silently filters a job in or out and nobody can see it.

  it('does not read a company’s revenue as an hourly wage', () => {
    // Vannevar Labs opens every posting with this. "$3M" matched as a bare "$3",
    // inferred to $3/hr, failed the floor, and removed the entire employer from
    // every lane with nothing on screen to say so.
    const p = parsePay('With customer empathy and disciplined growth. In just three years, we grew from $3M to $80M in ARR, achieved early profitability.')
    expect(p).toBe(null)
  })

  it('does not read a budget the role manages as the salary', () => {
    // Harvard, Director of Financial Planning and Analysis. Stored as $400/yr.
    const p = parsePay("Supervising two analysts, the Director is responsible for the development of the School's $400M+ annual operating budget, multi-year financial plan and monthly forecast.")
    expect(p).toBe(null)
  })

  it('reads a thousands suffix on an already-large number as the posting’s typo', () => {
    // Ginkgo Bioworks published this. Parsed as $185,000,000.
    const p = parsePay('The base salary range for this role is $185,000k - $278,800k. Actual pay within this range will depend on skills.')
    expect(p?.min).toBe(185_000)
    expect(p?.max).toBe(278_800)
    expect(p?.period).toBe('year')
  })

  it('still reads a real figure that happens to sit near a large one', () => {
    const p = parsePay('We raised $80M last year. The salary range for this role is $70,000 - $95,000 per year.')
    expect(p?.min).toBe(70_000)
    expect(p?.max).toBe(95_000)
  })
})

describe('a currency code in the middle of a range', () => {
  it('joins the two halves of a Beth Israel band', () => {
    // 245 of their postings use this format and 103 were read as a single
    // value, so the floor was comparing against the BOTTOM of the band.
    const p = parsePay('Pay Range:\n$79,268.80 USD - $204,318.40 USD\nThe pay range listed is the base annual wage range.')
    expect(p?.min).toBe(79_268.8)
    expect(p?.max).toBe(204_318.4)
  })

  it('keeps the top of the band, which is what the floor is compared against', () => {
    const p = parsePay('$64,480.00 USD - $96,720.00 USD')
    expect(p?.max).toBe(96_720)
    expect(meetsFloor(p, 25)).toBe('pass')
  })
})

describe('an hourly rate wearing a weekly label', () => {
  it('is corrected, because nobody is paid $101 a week', () => {
    // Beth Israel, Nurse Navigator. "per week" fell inside the 45-character
    // window; $101.14 x 52 is $5,259, which cleared the old $5k absurdity bar.
    const p = parsePay('Scheduled 40 hours per week. Pay Range: $39.14 - $101.14')
    expect(p?.period).toBe('hour')
  })

  it('leaves a real weekly rate alone', () => {
    // Formlabs pays its interns this, and it is genuinely weekly.
    const p = parsePay('This internship pays $1,575 - $1,950 per week for the duration of the program.')
    expect(p?.period).toBe('week')
    expect(p?.max).toBe(1_950)
  })

  it('leaves a real day rate alone', () => {
    expect(parsePay('Day rate: $500 per day')?.period).toBe('day')
  })
})

describe('a band that is not a wage', () => {
  it('reads a placeholder as unstated rather than as failing the floor', () => {
    // CarGurus published a Finance Operations Coordinator at "$1 - $1 USD".
    // The parse was correct and the outcome was the worst available: reported
    // as a dollar an hour, the job failed the floor and left every lane.
    expect(parsePay('$1 - $1 USD')).toBe(null)
    expect(meetsFloor(parsePay('$1 - $1 USD'), 25)).toBe('unknown')
  })

  it('keeps a low but real wage, which is a fail rather than an unknown', () => {
    const p = parsePay('Pay Range: $17.00 - $22.88 per hour')
    expect(p?.max).toBe(22.88)
    expect(meetsFloor(p, 25)).toBe('fail')
  })
})
