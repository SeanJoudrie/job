import { describe, expect, it } from 'vitest'
import { canApply, isGuardPath, pathWhy } from '../federal'

/**
 * Measured on the live pool: of 418 federal postings whose paths could be read,
 * 255 were open to the public and 163 were not. Two of every five federal jobs
 * on the list were ones an application would be binned for.
 */
describe('whether he can apply at all', () => {
  it('lets him at anything open to the public', () => {
    expect(canApply(['Open to the public'])).toBe(true)
    expect(canApply(['The public', 'Internal to an agency'])).toBe(true)
  })

  it('keeps him out of what is restricted to people already inside', () => {
    for (const paths of [
      ['Internal to an agency'],
      ['Competitive service'],
      ['Excepted service'],
      ['Senior executives'],
      ['Career transition (CTAP, ICTAP, RPL)'],
    ]) {
      expect(canApply(paths)).toBe(false)
    }
  })

  /**
   * Veterans' preference and VEOA both need three years of continuous active
   * service or a campaign badge. Training-only active duty for basic training
   * is neither, so a Guard member mid-pipeline is not preference eligible —
   * however much the service is worth to a hiring manager. Counting it would
   * send him at jobs that reject him on a rule.
   */
  it('does not treat the veterans path as open to him', () => {
    expect(canApply(['Veterans'])).toBe(false)
    expect(canApply(['Military spouses'])).toBe(false)
  })

  it('does treat Guard and reserve postings as his, because they are', () => {
    expect(canApply(['National Guard and reserves'])).toBe(true)
    expect(isGuardPath(['National Guard and reserves'])).toBe(true)
    expect(isGuardPath(['Open to the public'])).toBe(false)
  })

  /**
   * Nothing stated is not a closed door. Every non-federal posting in the pool
   * has no paths at all, and treating silence as a rejection would delete the
   * state and municipal half of this section.
   */
  it('leaves a posting that states nothing alone', () => {
    expect(canApply(undefined)).toBe(true)
    expect(canApply([])).toBe(true)
  })

  it('says why, in the posting’s own words', () => {
    expect(pathWhy(['Open to the public'])).toMatch(/open to the public/)
    expect(pathWhy(['National Guard and reserves'])).toMatch(/Guard/)
    expect(pathWhy(['Internal to an agency'])).toMatch(/only open to/)
    expect(pathWhy(undefined)).toBe('')
  })
})
