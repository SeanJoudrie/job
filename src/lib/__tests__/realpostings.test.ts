import { describe, expect, it } from 'vitest'
import { htmlToText, normaliseTypography } from '../../../scripts/sources'
import { gapsFor, parseRequirements, type Profile } from '../requirements'
import { parsePay } from '../pay'
import { classifyFamilies } from '../roles'

/**
 * Regressions from the first real scan. Every string here is text that came off
 * a live job board and produced a wrong answer — synthetic examples had all
 * passed. Keeping the exact wording matters more than keeping it tidy.
 */

const SEAN: Profile = { years: 5, degree: 'bachelor', clearance: 'none' }

describe('an em dash entity turned a salary range into one number', () => {
  // Real Anduril posting. 325 of 421 jobs were affected: with the range
  // flattened to its lower bound, "compare against the top" had nothing to
  // compare, and jobs that pay well were filtered out as if they did not.
  const raw = ' US Salary Range\n $86,000 &mdash; $114,000 USD \n The salary range for this role is an estimate'

  it('decodes the dash so the range survives', () => {
    expect(htmlToText(raw)).toContain('$86,000 - $114,000')
  })

  it('and the pay parser then reads both ends', () => {
    expect(parsePay(htmlToText(raw))).toMatchObject({ min: 86000, max: 114000, period: 'year' })
  })

  it('without the fix it reads only the bottom', () => {
    expect(parsePay(raw)).toMatchObject({ min: 86000, max: 86000 })
  })
})

describe('a curly apostrophe hid every degree requirement', () => {
  // Real Anduril posting. "Bachelor’s" does not match /bachelor'?s/, so these
  // lines fell through to "other" and never appeared in the gap list at all.
  const line = "• Must be pursuing or have recently completed a Bachelor’s or Master’s degree in Electrical Engineering"

  it('normalises the apostrophe', () => {
    expect(normaliseTypography(line)).toContain("Bachelor's")
  })

  it('so the requirement is classified as education, not other', () => {
    const r = parseRequirements(line)[0]
    expect(r.kind).toBe('education')
    expect(r.degree).toBe('bachelor')
  })

  it('and a bachelor requirement then reads as met', () => {
    expect(gapsFor(parseRequirements(line), SEAN)[0].verdict).toBe('matched')
  })
})

describe('"Must be a U.S. Person" was read as a held clearance', () => {
  // Real Anduril posting. A bare "must be" in the ACTIVE pattern turned a
  // requirement this person already meets into a hard blocker.
  const line =
    '• Must be a U.S. Person due to required access to U.S. export controlled information or facilities; U.S. clearance eligibility may be required depending on program.'

  it('is citizenship, not a clearance', () => {
    expect(parseRequirements(line)[0].kind).toBe('citizenship')
  })

  it('and a US citizen meets it', () => {
    const g = gapsFor(parseRequirements(line), SEAN)[0]
    expect(g.verdict).toBe('matched')
    expect(g.why).toBe('US citizen')
  })
})

describe('an obtainable clearance is still told apart from a held one', () => {
  const obtainable = '• Eligible to obtain and maintain an active U.S. Secret security clearance'
  const held = '• Must hold an active TS/SCI clearance at time of hire'

  it('eligibility is met today', () => {
    expect(parseRequirements(obtainable)[0].clearance).toBe('obtainable')
    expect(gapsFor(parseRequirements(obtainable), SEAN)[0].verdict).toBe('matched')
  })

  it('a held clearance is a real hard gap', () => {
    expect(parseRequirements(held)[0].clearance).toBe('active')
    expect(gapsFor(parseRequirements(held), SEAN)[0].verdict).toBe('hard-gap')
  })
})

describe('"autonomous" is a product category, not a working style', () => {
  // It matched 117 of 421 real postings and excluded exactly the defence roles
  // most worth surfacing.
  const anduril = 'Anduril is fielding the next generation of Autonomous Underwater Vehicles (AUVs) to tackle the hardest problems in maritime autonomy.'

  it('does not mark an autonomy job as solo work', () => {
    expect(classifyFamilies('Software Engineer, Autonomy', anduril)).not.toContain('solo')
  })

  it('while genuinely solo work is still caught', () => {
    expect(classifyFamilies('Night Auditor', 'Works independently with minimal supervision on overnight shifts.')).toContain('solo')
  })
})

describe('two-letter abbreviations that were not degrees', () => {
  // Real Formlabs posting. `a.?s.?` matched the word "As"; `m.?a.?` matched the
  // "MA" in a location line. Education requirements were massively inflated
  // and a location was reported as needing a master's.
  it('does not read "As a Retail Sales Enablement Manager" as an associate degree', () => {
    expect(parseRequirements('As a Retail Sales Enablement Manager, you will partner with peers')[0]?.degree).toBeUndefined()
  })

  it('does not read "Somerville, MA (on-site)" as a master requirement', () => {
    expect(parseRequirements('Location: Somerville, MA (on-site)')[0]?.degree).toBeUndefined()
  })

  it('still reads a real abbreviation', () => {
    expect(parseRequirements('B.S. in Computer Science required')[0].degree).toBe('bachelor')
    expect(parseRequirements('MS in Engineering preferred')[0].degree).toBe('master')
  })
})

describe('a J.D. is a wall, and was not recognised at all', () => {
  const line = '• J.D. and admission to at least one state bar, plus registration to practice before the USPTO'

  it('is read as a doctorate-level requirement', () => {
    expect(parseRequirements(line)[0].degree).toBe('doctorate')
  })

  it('so a legal role stops appearing in an entry-level lane', () => {
    expect(gapsFor(parseRequirements(line), SEAN)[0].verdict).toBe('hard-gap')
  })
})

describe('"trade secret" is not a security clearance', () => {
  const line = '• Deep expertise in U.S. patent law, trade secret protection, and international patent strategy'

  it('is not classified as a clearance requirement', () => {
    expect(parseRequirements(line)[0]?.kind).not.toBe('clearance')
  })

  it('while a real clearance line still is', () => {
    expect(parseRequirements('• Active Secret security clearance required')[0].kind).toBe('clearance')
  })
})

describe('a title with the word sales in it', () => {
  it('joins the sales family however it is dressed up', () => {
    expect(classifyFamilies('Retail Sales Enablement Manager', '')).toContain('sales')
    expect(classifyFamilies('Sales Operations Analyst', '')).toContain('sales')
  })
})
