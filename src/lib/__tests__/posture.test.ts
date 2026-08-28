import { describe, expect, it } from 'vitest'
import type { Job } from '../../types'
import { postureOf, scheduleOf } from '../posture'

const job = (over: Partial<Job> = {}): Job => ({
  id: 'j', source: 'greenhouse', sector: 'tech', company: 'Acme', title: 'Program Coordinator',
  url: 'https://x/1', descText: '', locations: [], miles: 5, remote: false, pay: null,
  requirements: [], families: [], postedAt: null, firstSeen: '2026-08-01', lastSeen: '2026-08-28',
  scans: 1, reposts: 0, alsoOn: [], linkOk: true, ...over,
})

describe('either seated all day or moving all day', () => {
  it('scores a desk job well', () => {
    const j = job({ title: 'Records Clerk', descText: 'Sedentary work; sitting for extended periods at a computer.' })
    expect(postureOf(j).kind).toBe('seated')
    expect(postureOf(j).score).toBeGreaterThan(8)
  })

  it('scores a warehouse job just as well', () => {
    const j = job({ title: 'Warehouse Associate', descText: 'Frequently walk and stand. Lifting up to 50 lbs.' })
    expect(postureOf(j).kind).toBe('moving')
    expect(postureOf(j).score).toBeGreaterThan(8)
  })

  it('scores standing in one place worst of all', () => {
    // "Standing still in one place is the worst case." Not a mild penalty.
    const j = job({ title: 'Greeter', descText: 'Must be able to stand for long periods at the entrance.' })
    expect(postureOf(j).kind).toBe('standing')
    expect(postureOf(j).score).toBeLessThan(3)
    expect(postureOf(j).score).toBeLessThan(postureOf(job({ title: 'Warehouse Associate' })).score)
  })

  it('does not punish a warehouse posting for the sentence every warehouse posting contains', () => {
    // Nearly every physical-requirements paragraph says "stand for long
    // periods" and then says "walk, lift and move about" in the next clause.
    // Reading the first half alone would zero out an entire acceptable tier.
    const j = job({
      title: 'Inventory Associate',
      descText: 'Must be able to stand for long periods, frequently walk the floor, and lift up to 40 lbs.',
    })
    expect(postureOf(j).kind).toBe('moving')
    expect(postureOf(j).score).toBeGreaterThan(8)
  })

  it('says so when the posting does not, rather than guessing', () => {
    expect(postureOf(job({ title: 'Widget Wrangler' })).kind).toBe('unknown')
    expect(postureOf(job({ title: 'Widget Wrangler' })).why).toMatch(/does not say/)
  })

  it('reads the title when the body is silent', () => {
    expect(postureOf(job({ title: 'Cashier' })).kind).toBe('standing')
    expect(postureOf(job({ title: 'Data Entry Clerk' })).kind).toBe('seated')
    expect(postureOf(job({ title: 'Custodian' })).kind).toBe('moving')
  })
})

describe('hours', () => {
  it('weekday daytime is the ideal', () => {
    expect(scheduleOf(job({ descText: 'Monday through Friday, 9am-5pm.' })).score).toBeGreaterThan(8)
    expect(scheduleOf(job({ descText: 'First shift, standard business hours.' })).score).toBeGreaterThan(8)
  })
  it('overnights are close to disqualifying', () => {
    expect(scheduleOf(job({ title: 'Overnight Stocker' })).score).toBeLessThan(3)
    expect(scheduleOf(job({ descText: 'Third shift, 11pm to 7am.' })).score).toBeLessThan(3)
    expect(scheduleOf(job({ descText: 'Rotating shifts including nights.' })).score).toBeLessThan(3)
  })
  it('a scheduled second shift is regular late nights, which is also unacceptable', () => {
    // "Acceptable: occasional late nights. Unacceptable: regular late nights."
    // A 3pm-11pm rota is the second of those, not the first.
    const s = scheduleOf(job({ descText: 'Second shift, 3pm-11pm.' })).score
    expect(s).toBeLessThan(3)
    expect(s).toBeGreaterThan(scheduleOf(job({ descText: 'Overnight shift.' })).score)
  })

  it('weekend coverage sits in the middle — the case file does not rule it out', () => {
    const s = scheduleOf(job({ descText: 'Weekends required on a rotating basis with the team.' })).score
    expect(s).toBeGreaterThan(scheduleOf(job({ descText: 'Second shift.' })).score)
    expect(s).toBeLessThan(scheduleOf(job({ descText: 'Monday through Friday, day shift.' })).score)
  })
  it('an overnight beats out a daytime mention, because the overnight is the constraint', () => {
    const both = job({ descText: 'Monday through Friday. Overnight shift, 11pm start.' })
    expect(scheduleOf(both).score).toBeLessThan(3)
  })
})
