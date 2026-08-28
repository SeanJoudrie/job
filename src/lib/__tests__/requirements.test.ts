import { describe, expect, it } from 'vitest'
import { countGaps, gapsFor, parseRequirements, type Profile } from '../requirements'

const SEAN: Profile = { years: 5, degree: 'bachelor', clearance: 'none' }
const one = (line: string) => parseRequirements(line)[0]

describe('the line-level calls from the spec', () => {
  const cases: [string, 'hard' | 'soft'][] = [
    ["Bachelor's degree required", 'hard'],
    ["Bachelor's degree preferred", 'soft'],
    ["Bachelor's degree or equivalent experience", 'soft'],
    ['5+ years of experience required', 'hard'],
    ['3-5 years of experience preferred', 'soft'],
    ['Must have an active TS/SCI clearance', 'hard'],
    ['Must be able to obtain a Secret clearance', 'soft'],
    ['Familiarity with Salesforce is a plus', 'soft'],
    ['Candidates without a CPA will not be considered', 'hard'],
  ]
  for (const [line, hardness] of cases) {
    it(`${line} -> ${hardness.toUpperCase()}`, () => expect(one(line)?.hardness).toBe(hardness))
  }
})

describe('the heading above the line beats the line', () => {
  const posting = `
    Minimum Qualifications
    Bachelor's degree in a related field
    3 years of operations experience

    Preferred Qualifications
    5 years of program management experience
    Experience with Workday
  `
  const reqs = parseRequirements(posting)

  it('a bullet under Minimum is hard even with no hard wording', () => {
    const r = reqs.find((x) => x.text.includes('3 years'))
    expect(r?.hardness).toBe('hard')
  })

  it('the same shape of bullet under Preferred is soft', () => {
    // This is the whole point: identical phrasing, opposite meaning.
    const r = reqs.find((x) => x.text.includes('5 years'))
    expect(r?.hardness).toBe('soft')
  })

  it('a degree under Minimum is hard', () => {
    const r = reqs.find((x) => x.degree === 'bachelor')
    expect(r?.hardness).toBe('hard')
  })

  it('stops treating things as requirements once the benefits start', () => {
    const withBenefits = posting + '\n Benefits\n 5 years of vesting on equity\n'
    const all = parseRequirements(withBenefits)
    expect(all.some((r) => r.text.includes('vesting'))).toBe(false)
  })
})

describe('extraction', () => {
  it('a range gates at its lower bound, not its upper', () => {
    // "3-5 years" excludes nobody with 3. Reading it as 5 invents exclusion.
    expect(one('3-5 years of experience')?.years).toBe(3)
  })
  it('reads a plus form', () => expect(one('7+ years required')?.years).toBe(7))
  it('reads degree levels', () => {
    expect(one("Master's degree required")?.degree).toBe('master')
    expect(one('High school diploma or GED required')?.degree).toBe('highschool')
    expect(one('PhD preferred')?.degree).toBe('doctorate')
  })
  it('separates a held clearance from an obtainable one', () => {
    expect(one('Active Secret clearance required')?.clearance).toBe('active')
    expect(one('Must be eligible to obtain a Secret clearance')?.clearance).toBe('obtainable')
    expect(one('Ability to obtain a security clearance')?.clearance).toBe('obtainable')
  })
})

describe('the gap list — what actually stands in the way', () => {
  it('an obtainable clearance is MET today, not a gap', () => {
    // The single distinction worth the most jobs.
    const gaps = gapsFor(parseRequirements('Must be able to obtain a Secret clearance'), SEAN)
    expect(gaps[0].verdict).toBe('matched')
    expect(gaps[0].why).toMatch(/met today/)
  })

  it('an active clearance is a real gap', () => {
    const gaps = gapsFor(parseRequirements('Active TS/SCI clearance required'), SEAN)
    expect(gaps[0].verdict).toBe('hard-gap')
  })

  it('names the shortfall in years in plain words', () => {
    const gaps = gapsFor(parseRequirements('Minimum of 8 years of experience required'), SEAN)
    expect(gaps[0].verdict).toBe('hard-gap')
    expect(gaps[0].why).toBe('wants 8 years; you have 5')
  })

  it('a preferred shortfall is a soft gap, so it is worth applying to', () => {
    const gaps = gapsFor(parseRequirements('8 years of experience preferred'), SEAN)
    expect(gaps[0].verdict).toBe('soft-gap')
  })

  it("a master's preference does not become a wall", () => {
    const gaps = gapsFor(parseRequirements("Master's degree preferred"), SEAN)
    expect(gaps[0].verdict).toBe('soft-gap')
  })

  it("a bachelor's requirement is met", () => {
    const gaps = gapsFor(parseRequirements("Bachelor's degree required"), SEAN)
    expect(gaps[0].verdict).toBe('matched')
  })

  it('counts a whole posting', () => {
    const posting = `
      Minimum Qualifications
      Bachelor's degree required
      Must be able to obtain a Secret clearance
      10 years of experience required

      Preferred Qualifications
      Master's degree preferred
    `
    const counts = countGaps(gapsFor(parseRequirements(posting), SEAN))
    expect(counts.matched).toBe(2)
    expect(counts.hard).toBe(1)
    expect(counts.soft).toBe(1)
  })
})

describe('not everything is a requirement', () => {
  it('ignores prose that mentions nothing measurable', () => {
    expect(parseRequirements('We are a fast-growing company that values teamwork.')).toHaveLength(0)
  })
  it('survives an empty posting', () => expect(parseRequirements('')).toHaveLength(0))
  it('survives HTML', () => {
    const html = '<ul><li>Bachelor&nbsp;degree required</li><li>3 years preferred</li></ul>'
    expect(parseRequirements(html)).toHaveLength(2)
  })
})
