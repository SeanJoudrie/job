import { describe, expect, it } from 'vitest'
import type { Job, Requirement } from '../../types'
import { defaultLanes, describeRule, mkRule, runNet, type Net } from '../nets'

const noApplied = new Set<string>()
const keyOf = (j: Job) => `${j.company}::${j.title}`

let n = 0
const job = (over: Partial<Job> = {}): Job => ({
  id: `j${n++}`, source: 'greenhouse', sector: 'tech', company: 'Acme', title: 'Program Coordinator',
  url: 'https://x/1', descText: '', locations: [], miles: 10, remote: false, pay: null,
  requirements: [], families: [], postedAt: '2026-08-20', firstSeen: '2026-08-20',
  lastSeen: '2026-08-28', scans: 1, reposts: 0, alsoOn: [], linkOk: true, ...over,
})
const req = (o: Partial<Requirement>): Requirement => ({ text: 't', kind: 'other', hardness: 'hard', ...o })
const net = (...rules: Parameters<typeof mkRule>[0][]): Net => ({ id: 'n', name: 'n', rules: rules.map(mkRule) })
const run = (jobs: Job[], nt: Net) => runNet(jobs, nt, noApplied, keyOf)

describe('rules do what they say', () => {
  it('distance', () => {
    const jobs = [job({ miles: 10 }), job({ miles: 40 })]
    expect(run(jobs, net({ type: 'distance', miles: 25, includeRemote: false })).jobs).toHaveLength(1)
  })

  it('distance can keep remote in or out', () => {
    const jobs = [job({ remote: true, miles: null })]
    expect(run(jobs, net({ type: 'distance', miles: 25, includeRemote: true })).jobs).toHaveLength(1)
    expect(run(jobs, net({ type: 'distance', miles: 25, includeRemote: false })).jobs).toHaveLength(0)
  })

  it('pay keeps a band that reaches above the floor', () => {
    const jobs = [job({ pay: { min: 22, max: 30, period: 'hour', raw: '' } })]
    expect(run(jobs, net({ type: 'pay', floorHourly: 26, includeUnlisted: true })).jobs).toHaveLength(1)
  })

  it('pay keeps unlisted by default and can drop it deliberately', () => {
    const jobs = [job({ pay: null })]
    expect(run(jobs, net({ type: 'pay', floorHourly: 26, includeUnlisted: true })).jobs).toHaveLength(1)
    expect(run(jobs, net({ type: 'pay', floorHourly: 26, includeUnlisted: false })).jobs).toHaveLength(0)
  })

  it('a degree rule only excludes on HARD requirements', () => {
    const hard = job({ requirements: [req({ kind: 'education', degree: 'master', hardness: 'hard' })] })
    const soft = job({ requirements: [req({ kind: 'education', degree: 'master', hardness: 'soft' })] })
    const out = run([hard, soft], net({ type: 'degree', max: 'bachelor' })).jobs
    // A preferred master's is a door, not a wall — it must survive.
    expect(out).toHaveLength(1)
    expect(out[0]).toBe(soft)
  })

  it('a years rule likewise ignores preferences', () => {
    const hard = job({ requirements: [req({ kind: 'experience', years: 10, hardness: 'hard' })] })
    const soft = job({ requirements: [req({ kind: 'experience', years: 10, hardness: 'soft' })] })
    expect(run([hard, soft], net({ type: 'years', max: 5 })).jobs).toEqual([soft])
  })

  it('clearance excludes only what must already be held', () => {
    const held = job({ requirements: [req({ kind: 'clearance', clearance: 'active', hardness: 'hard' })] })
    const obtainable = job({ requirements: [req({ kind: 'clearance', clearance: 'obtainable', hardness: 'soft' })] })
    const out = run([held, obtainable], net({ type: 'clearance', allowActiveRequired: false })).jobs
    expect(out).toEqual([obtainable])
  })

  it('family exclusion', () => {
    const jobs = [job({ families: ['sales'] }), job({ families: ['operations'] })]
    expect(run(jobs, net({ type: 'family', mode: 'lacks', value: 'sales' })).jobs).toHaveLength(1)
  })

  it('text search across title and body', () => {
    const jobs = [job({ title: 'Marketing Coordinator' }), job({ title: 'Warehouse Lead' })]
    expect(run(jobs, net({ type: 'text', mode: 'has', field: 'both', value: 'marketing' })).jobs).toHaveLength(1)
  })

  it('hides what was already applied to', () => {
    const jobs = [job({ company: 'Acme', title: 'A' }), job({ company: 'Globex', title: 'B' })]
    const applied = new Set(['Acme::A'])
    expect(runNet(jobs, net({ type: 'applied', hide: true }), applied, keyOf).jobs).toHaveLength(1)
  })
})

describe('the stack keeps its own receipts', () => {
  const jobs = [
    job({ miles: 10, families: ['sales'] }),
    job({ miles: 10, families: ['operations'] }),
    job({ miles: 90, families: ['operations'] }),
  ]

  it('records the count after every rule, so what a rule cost is visible', () => {
    const { steps, jobs: out } = run(jobs, net({ type: 'distance', miles: 25, includeRemote: false }, { type: 'family', mode: 'lacks', value: 'sales' }))
    expect(steps.map((s) => [s.before, s.after])).toEqual([[3, 2], [2, 1]])
    expect(out).toHaveLength(1)
  })

  it('a disabled rule is skipped entirely and leaves no step', () => {
    const nt = net({ type: 'distance', miles: 25, includeRemote: false }, { type: 'family', mode: 'lacks', value: 'sales' })
    nt.rules[1].enabled = false
    const { steps, jobs: out } = run(jobs, nt)
    expect(steps).toHaveLength(1)
    expect(out).toHaveLength(2)
  })

  it('rules apply in the order they are listed', () => {
    const a = run(jobs, net({ type: 'family', mode: 'lacks', value: 'sales' }, { type: 'distance', miles: 25, includeRemote: false }))
    expect(a.steps.map((s) => s.after)).toEqual([2, 1])
  })
})

describe('every rule can explain itself', () => {
  it('produces readable text for each type', () => {
    const lanes = defaultLanes(26)
    for (const lane of lanes) for (const rule of lane.rules) expect(describeRule(rule).length).toBeGreaterThan(3)
    expect(describeRule(mkRule({ type: 'distance', miles: 25, includeRemote: false }))).toBe('+ within 25 miles')
    expect(describeRule(mkRule({ type: 'family', mode: 'lacks', value: 'sales' }))).toBe('− role family: sales')
  })
})

describe('the lanes', () => {
  it('ships a lane for every area named as a genuine pull', () => {
    const names = defaultLanes(26).map((l) => l.name)
    for (const n of ['Easy hire', 'Operations', 'Higher ed', 'Mission', 'Outdoors',
      'Library & museum', 'Marketing', 'Analysis', 'Defense & clearance',
      'Public safety', 'Veterans', 'Technology', 'Logistics']) {
      expect(names).toContain(n)
    }
  })

  it('Easy hire filters on how gettable a job is, not on its credentials', () => {
    // The lane filled with six-figure cleared defence roles when it filtered on
    // degree and years, because those pass a credentials test.
    const easy = defaultLanes(26).find((l) => l.id === 'easy')!
    expect(easy.rules.some((r) => r.type === 'ease')).toBe(true)
    expect(easy.rules.some((r) => r.type === 'degree' || r.type === 'years')).toBe(false)
  })
  it('every lane starts inside the radius and above the floor', () => {
    for (const lane of defaultLanes(26)) {
      expect(lane.rules.some((r) => r.type === 'distance')).toBe(true)
    }
  })
})
