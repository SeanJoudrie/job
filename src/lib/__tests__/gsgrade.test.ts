import { describe, expect, it } from 'vitest'
import { REACHABLE_GRADE, gradeRequirement, parseGsGrade } from '../gsgrade'
import { countGaps, gapsFor } from '../requirements'

const PROFILE = { years: 5, degree: 'bachelor' as const, clearance: 'none' as const }

describe('finding the grade on a federal posting', () => {
  it('reads the plain forms', () => {
    expect(parseGsGrade('Management and Program Analyst, GS-14')).toBe(14)
    expect(parseGsGrade('Program Analyst GS 9')).toBe(9)
    expect(parseGsGrade('Analyst, gs-7')).toBe(7)
  })

  it('drops the occupational series, which is not a grade', () => {
    // "GS-0560-14" is series 0560 at grade 14. Reading 560 as a grade, or 0560
    // as one, would be a number nothing else in the table could interpret.
    expect(parseGsGrade('BUDGET ANALYST, GS-0560-14, FPL GS-14')).toBe(14)
    expect(parseGsGrade('IT Specialist GS-2210-12')).toBe(12)
  })

  it('takes the top of an advertised ladder, not the bottom', () => {
    // A "GS-9/11/12" posting fills at the top far more often than the bottom,
    // and reading the bottom is the optimistic error this exists to prevent.
    expect(parseGsGrade('Analyst GS-9/11/12')).toBe(12)
  })

  it('says nothing when there is no grade, rather than guessing one', () => {
    expect(parseGsGrade('Administrative Coordinator at Northeastern')).toBeNull()
    expect(parseGsGrade('')).toBeNull()
    expect(parseGsGrade('Posted in 2026, closes in 30 days')).toBeNull()
  })
})

describe('what a grade means for him', () => {
  it('treats GS-9 and below as a door', () => {
    for (const g of [4, 5, 7, 9]) {
      const req = gradeRequirement(g)!
      expect(req.hardness).toBe('soft')
      expect(req.text).toMatch(/within reach/)
    }
    expect(REACHABLE_GRADE).toBe(9)
  })

  it('treats GS-11 and above as a wall, and says why in the posting’s own terms', () => {
    const req = gradeRequirement(13)!
    expect(req.hardness).toBe('hard')
    expect(req.text).toMatch(/GS-12/)
  })

  it('turns into a hard gap that the reachability arithmetic can see', () => {
    const hard = countGaps(gapsFor([gradeRequirement(14)!], PROFILE))
    expect(hard.hard).toBe(1)
    const soft = countGaps(gapsFor([gradeRequirement(7)!], PROFILE))
    expect(soft.hard).toBe(0)
  })

  it('reads as met rather than as silence when the grade is reachable', () => {
    const [gap] = gapsFor([gradeRequirement(5)!], PROFILE)
    expect(gap.verdict).toBe('matched')
  })

  it('emits nothing at all for a job that is not on the schedule', () => {
    expect(gradeRequirement(null)).toBeNull()
  })
})
