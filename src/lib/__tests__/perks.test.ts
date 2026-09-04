import { describe, expect, it } from 'vitest'
import { MIN_POSTINGS, TUITION, tuitionEmployers } from '../perks'

const many = (company: string, hits: number, misses: number) => [
  ...Array.from({ length: hits }, () => ({ company, body: 'Benefits include tuition remission for employees and dependents.' })),
  ...Array.from({ length: misses }, () => ({ company, body: 'Benefits include health and dental.' })),
]

describe('what counts as a tuition benefit', () => {
  it('reads the several ways it is written', () => {
    for (const s of [
      'tuition remission', 'Tuition Reimbursement', 'tuition benefits', 'tuition assistance',
      'tuition waiver', 'tuition exchange', 'free tuition', 'tuition-free', 'Educational Assistance Program',
    ]) expect(TUITION.test(s)).toBe(true)
  })

  it('is not fooled by the word tuition on its own', () => {
    expect(TUITION.test('students pay tuition by the semester')).toBe(false)
    expect(TUITION.test('processes tuition payments')).toBe(false)
  })
})

describe('deciding it per employer', () => {
  it('takes an employer whose whole board says it', () => {
    expect(tuitionEmployers(many('Northeastern', 20, 0)).has('Northeastern')).toBe(true)
  })

  it('does not take one that mentions it on a handful of seven hundred', () => {
    expect(tuitionEmployers(many('Beth Israel Lahey', 8, 692)).has('Beth Israel Lahey')).toBe(false)
  })

  it('refuses to judge an employer on one or two postings', () => {
    const tiny = many('Somewhere Small', MIN_POSTINGS - 1, 0)
    expect(tuitionEmployers(tiny).size).toBe(0)
    expect(tuitionEmployers(many('Somewhere Small', MIN_POSTINGS, 0)).size).toBe(1)
  })

  it('keeps employers apart', () => {
    const got = tuitionEmployers([...many('Harvard', 10, 0), ...many('Anduril', 0, 10)])
    expect([...got]).toEqual(['Harvard'])
  })
})
