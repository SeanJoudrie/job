import { describe, expect, it } from 'vitest'
import type { Job, Loc } from '../../types'
import { commuteOf, commuteScore, driveMinutes, railReachable, withinCommute } from '../commute'

const at = (city: string, miles: number): Loc => ({ raw: `${city}, MA`, city, state: 'MA', remote: false, hybrid: false, miles })
const job = (over: Partial<Job> = {}): Job => ({
  id: 'j', source: 'greenhouse', sector: 'tech', company: 'Acme', title: 'Program Coordinator',
  url: 'https://x/1', descText: '', locations: [], miles: 10, remote: false, pay: null,
  requirements: [], families: [], postedAt: null, firstSeen: '2026-08-01', lastSeen: '2026-08-28',
  scans: 1, reposts: 0, alsoOn: [], linkOk: true, ...over,
})

describe('miles are not minutes', () => {
  it('puts Boston at about half an hour, which is what it takes', () => {
    // 10.3 straight-line miles from Wakefield. Every location that resolves to
    // "Boston, MA" in the pool sits on this number, so getting it wrong moves
    // most of the board at once.
    expect(driveMinutes(10.3)).toBeGreaterThanOrEqual(24)
    expect(driveMinutes(10.3)).toBeLessThanOrEqual(28)
  })

  it('charges surface streets for the first few miles and highway after', () => {
    const firstFive = driveMinutes(5) - driveMinutes(0)
    const laterFive = driveMinutes(25) - driveMinutes(20)
    expect(firstFive).toBeGreaterThan(laterFive)
  })

  it('rises with distance and never runs backwards', () => {
    for (let m = 0; m < 60; m++) expect(driveMinutes(m + 1)).toBeGreaterThanOrEqual(driveMinutes(m))
  })

  it('is stricter than the 25-mile radius it replaces', () => {
    // The old radius admitted a 50-minute drive as if it were a commute.
    expect(driveMinutes(25)).toBeGreaterThan(30)
  })
})

describe('the train', () => {
  it('keeps a Boston job in range whatever the drive says', () => {
    const j = job({ miles: 45, locations: [at('Boston', 45)] })
    expect(railReachable(j)).toBe(true)
    expect(withinCommute(j, 30)).toBe(true)
  })

  it('covers the Haverhill line, which is the one that runs through Wakefield', () => {
    expect(railReachable(job({ locations: [at('Haverhill', 22)] }))).toBe(true)
    expect(railReachable(job({ locations: [at('Reading', 4)] }))).toBe(true)
  })

  it('is not every station in the system', () => {
    // Franklin is rail-served and is not a commute anyone would take.
    expect(railReachable(job({ locations: [at('Franklin', 32)] }))).toBe(false)
  })

  it('never lets a rail job score at the bottom, but does not pretend it is next door', () => {
    const far = job({ miles: 45, locations: [at('Boston', 45)] })
    const near = job({ miles: 4, locations: [at('Reading', 4)] })
    expect(commuteScore(far, 30)).toBeGreaterThanOrEqual(6)
    expect(commuteScore(near, 30)).toBeGreaterThan(commuteScore(far, 30))
  })
})

describe('the commute score', () => {
  it('is full marks close to home and falls off past the ceiling', () => {
    expect(commuteScore(job({ miles: 3 }), 30)).toBe(10)
    expect(commuteScore(job({ miles: 40 }), 30)).toBeLessThan(5)
  })

  it('is exactly the halfway mark at the ceiling', () => {
    const j = job({ miles: 13 })
    expect(driveMinutes(13)).toBe(30)
    expect(commuteScore(j, 30)).toBe(5)
  })

  it('says which of the two numbers it used', () => {
    expect(commuteOf(job({ miles: 10 })).why).toMatch(/min drive/)
    expect(commuteOf(job({ miles: 10, locations: [at('Boston', 10)] })).why).toMatch(/train/)
  })

  it('admits when the employer’s region was used instead of the posting', () => {
    const j = job({ miles: 10, locations: [{ ...at('Boston', 10), approx: true }] })
    expect(commuteOf(j).why).toMatch(/employer region/)
  })

  it('does not guess when the location could not be resolved', () => {
    expect(commuteOf(job({ miles: null })).minutes).toBe(null)
    expect(withinCommute(job({ miles: null }), 30)).toBe(false)
  })
})
