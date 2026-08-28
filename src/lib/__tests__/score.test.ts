import { describe, expect, it } from 'vitest'
import type { Job } from '../../types'
import type { Profile } from '../requirements'
import { axesFor, DEFAULT_WEIGHTS, scoreOf, variantFor } from '../score'

const SEAN: Profile = { years: 5, degree: 'bachelor', clearance: 'none' }
let n = 0
const job = (over: Partial<Job> = {}): Job => ({
  id: `j${n++}`, source: 'greenhouse', sector: 'tech', company: 'Acme', title: 'Program Coordinator',
  url: 'https://x/1', descText: '', locations: [], miles: 10, remote: false, pay: null,
  requirements: [], families: [], postedAt: new Date().toISOString().slice(0, 10),
  firstSeen: '2026-08-20', lastSeen: '2026-08-28', scans: 1, reposts: 0, alsoOn: [], linkOk: true, ...over,
})
const axis = (j: Job, id: string) => axesFor(j, SEAN).find((a) => a.id === id)!

describe('the container axis, which carries the most weight', () => {
  it('punishes fully remote hard', () => {
    expect(axis(job({ remote: true }), 'container').score).toBeLessThan(3)
  })
  it('rewards on-site work with a named team', () => {
    const j = job({ descText: 'You will work closely with the operations team on a set schedule.' })
    expect(axis(j, 'container').score).toBeGreaterThan(7)
  })
  it('punishes solo work even when on site', () => {
    expect(axis(job({ families: ['solo'] }), 'container').score).toBeLessThan(5)
  })
  it('a remote job cannot outrank an on-site one on the total', () => {
    const desk = job({ descText: 'Work closely with the team on site.' })
    const away = job({ remote: true, descText: 'Work closely with the team on site.' })
    expect(scoreOf(axesFor(desk, SEAN))).toBeGreaterThan(scoreOf(axesFor(away, SEAN)))
  })
})

describe('with people, not at them', () => {
  it('a quota role scores low even though it is very social', () => {
    expect(axis(job({ families: ['sales'] }), 'people').score).toBeLessThan(3)
  })
  it('a coordination role scores high', () => {
    const j = job({ families: ['coordinator'], descText: 'Coordinate with stakeholders across the department.' })
    expect(axis(j, 'people').score).toBeGreaterThan(8)
  })
})

describe('reachable', () => {
  it('a hard gap hurts far more than a soft one', () => {
    const hard = job({ requirements: [{ text: 'x', kind: 'experience', hardness: 'hard', years: 15 }] })
    const soft = job({ requirements: [{ text: 'x', kind: 'experience', hardness: 'soft', years: 15 }] })
    expect(axis(soft, 'reachable').score).toBeGreaterThan(axis(hard, 'reachable').score + 2)
  })
  it('says what the gap actually is', () => {
    const j = job({ requirements: [{ text: 'x', kind: 'education', hardness: 'hard', degree: 'doctorate' }] })
    expect(axis(j, 'reachable').why).toMatch(/hard/)
  })
})

describe('service compatibility', () => {
  it('a clearance-sponsoring job scores at the top', () => {
    const j = job({ requirements: [{ text: 'able to obtain a Secret clearance', kind: 'clearance', hardness: 'soft', clearance: 'obtainable' }] })
    expect(axis(j, 'service').score).toBeGreaterThanOrEqual(7)
  })
  it('an ordinary job is neutral, not penalised', () => {
    expect(axis(job(), 'service').score).toBe(4)
  })
})

describe('liveness is a down-rank, never a disappearance', () => {
  it('a reposted job scores low but still scores', () => {
    const a = axis(job({ reposts: 2 }), 'liveness')
    expect(a.score).toBeLessThanOrEqual(3)
    expect(a.why).toMatch(/dead req/)
  })
  it('a dead link bottoms out', () => {
    expect(axis(job({ linkOk: false }), 'liveness').score).toBe(0)
  })
  it('fresh scores full', () => {
    expect(axis(job(), 'liveness').score).toBe(10)
  })
})

describe('the total', () => {
  it('is the weighted mean of parts you can see', () => {
    const axes = axesFor(job(), SEAN)
    expect(axes).toHaveLength(7)
    const s = scoreOf(axes)
    expect(s).toBeGreaterThanOrEqual(0)
    expect(s).toBeLessThanOrEqual(10)
  })
  it('moves when the weights move, which is the point of them', () => {
    const j = job({ remote: true, descText: 'Work with the team.' })
    const axes = axesFor(j, SEAN)
    const withContainer = scoreOf(axes, DEFAULT_WEIGHTS)
    const without = scoreOf(axes, { ...DEFAULT_WEIGHTS, container: 0 })
    expect(without).toBeGreaterThan(withContainer)
  })
})

describe('which resume goes out', () => {
  it('stripped for entry-level postings', () => {
    expect(variantFor(job({ title: 'Office Assistant' }))).toBe('stripped')
    expect(variantFor(job({ title: 'Operations Coordinator' }))).toBe('stripped')
  })
  it('full for professional postings', () => {
    expect(variantFor(job({ title: 'Senior Program Manager' }))).toBe('full')
    expect(variantFor(job({ title: 'Intelligence Analyst' }))).toBe('full')
  })
})
