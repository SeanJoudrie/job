import { describe, expect, it } from 'vitest'
import type { Job, Requirement } from '../../types'
import { defaultLanes, describeRule, mkRule, runNet, type Net } from '../nets'
import { driveMinutes } from '../commute'

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
  it('commute is measured in minutes, not miles', () => {
    // Ten straight-line miles is a 26-minute drive; forty is over an hour. The
    // case file gives the constraint as "30 min max by car", and a mile radius
    // cannot express that.
    const jobs = [job({ miles: 10 }), job({ miles: 40 })]
    expect(driveMinutes(10)).toBeLessThanOrEqual(30)
    expect(driveMinutes(40)).toBeGreaterThan(60)
    expect(run(jobs, net({ type: 'commute', maxMinutes: 30, includeRemote: false })).jobs).toHaveLength(1)
  })

  it('commute keeps a Boston job whatever the drive says, because of the train', () => {
    const far = job({ miles: 80, locations: [{ raw: 'Boston, MA', city: 'Boston', state: 'MA', remote: false, hybrid: false }] })
    expect(run([far], net({ type: 'commute', maxMinutes: 30, includeRemote: false })).jobs).toHaveLength(1)
  })

  it('commute can keep remote in or out', () => {
    const jobs = [job({ remote: true, miles: null })]
    expect(run(jobs, net({ type: 'commute', maxMinutes: 30, includeRemote: true })).jobs).toHaveLength(1)
    expect(run(jobs, net({ type: 'commute', maxMinutes: 30, includeRemote: false })).jobs).toHaveLength(0)
  })

  it('the industry rule drops Tier E and nothing above it', () => {
    const jobs = [
      job({ title: 'Claims Adjuster' }),
      job({ title: 'Police Officer' }),
      job({ title: 'HVAC Technician' }),
      job({ title: 'Program Coordinator' }),
    ]
    const out = run(jobs, net({ type: 'industry', min: 0.5 })).jobs
    expect(out.map((j) => j.title)).toEqual(['Program Coordinator'])
  })

  it('the industry rule can narrow to named industries', () => {
    const jobs = [job({ title: 'Records Clerk' }), job({ title: 'Program Coordinator' })]
    const out = run(jobs, net({ type: 'industry', min: 0.5, ids: ['archives_records_management'] })).jobs
    expect(out.map((j) => j.title)).toEqual(['Records Clerk'])
  })

  it('front-line service survives only above the stated rate', () => {
    const cheap = job({ title: 'Retail Associate', pay: { min: 20, max: 24, period: 'hour', raw: '' } })
    const paid = job({ title: 'Retail Associate', pay: { min: 30, max: 34, period: 'hour', raw: '' } })
    // Unstated pay cannot clear a floor it never stated — this is the one rule
    // where an unknown is a failure, because the number is the whole point.
    const silent = job({ title: 'Retail Associate', pay: null })
    const other = job({ title: 'Program Coordinator', pay: null })
    const out = run([cheap, paid, silent, other], net({ type: 'frontline', minHourly: 30 })).jobs
    expect(out).toEqual([paid, other])
  })

  it('the creative rule selects on function, not on employer', () => {
    const jobs = [job({ title: 'Communications Coordinator' }), job({ title: 'Facilities Technician' })]
    expect(run(jobs, net({ type: 'creative' })).jobs.map((j) => j.title)).toEqual(['Communications Coordinator'])
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
    const { steps, jobs: out } = run(jobs, net({ type: 'commute', maxMinutes: 30, includeRemote: false }, { type: 'family', mode: 'lacks', value: 'sales' }))
    expect(steps.map((s) => [s.before, s.after])).toEqual([[3, 2], [2, 1]])
    expect(out).toHaveLength(1)
  })

  it('a disabled rule is skipped entirely and leaves no step', () => {
    const nt = net({ type: 'commute', maxMinutes: 30, includeRemote: false }, { type: 'family', mode: 'lacks', value: 'sales' })
    nt.rules[1].enabled = false
    const { steps, jobs: out } = run(jobs, nt)
    expect(steps).toHaveLength(1)
    expect(out).toHaveLength(2)
  })

  it('rules apply in the order they are listed', () => {
    const a = run(jobs, net({ type: 'family', mode: 'lacks', value: 'sales' }, { type: 'commute', maxMinutes: 30, includeRemote: false }))
    expect(a.steps.map((s) => s.after)).toEqual([2, 1])
  })
})

describe('every rule can explain itself', () => {
  it('produces readable text for each type', () => {
    const lanes = defaultLanes(25)
    for (const lane of lanes) for (const rule of lane.rules) expect(describeRule(rule).length).toBeGreaterThan(3)
    expect(describeRule(mkRule({ type: 'commute', maxMinutes: 30, includeRemote: false }))).toBe('+ within 30 min of home')
    expect(describeRule(mkRule({ type: 'family', mode: 'lacks', value: 'sales' }))).toBe('− role family: sales')
    // Industry ids are snake_case in the table and unreadable in a rule list.
    expect(describeRule(mkRule({ type: 'industry', min: 0.5, ids: ['archives_records_management'] }))).toBe('+ archives records management')
  })
})

describe('the lanes', () => {
  it('ships a lane for every area the case file names', () => {
    const names = defaultLanes(25).map((l) => l.name)
    for (const n of ['Easy hire', 'Crossover', 'Coordination', 'Operations', 'Higher ed & schools',
      'Creative & media', 'Library & museum', 'Records & archives', 'Government',
      'Legal & HR', 'Health admin', 'IT & data', 'Warehouse & logistics',
      'Facilities & custodial', 'Mission', 'Outdoors', 'Sponsors a clearance', 'Everything']) {
      expect(names).toContain(n)
    }
  })

  it('no longer ships the lanes the case file scores at zero', () => {
    // I built a Public safety lane. The table puts emergency_management_dispatch
    // and police_fire at 0, so the lane was pointing at excluded work.
    const names = defaultLanes(25).map((l) => l.name)
    expect(names).not.toContain('Public safety')
  })

  it('Easy hire filters on how gettable a job is, not on its credentials', () => {
    // The lane filled with six-figure cleared defence roles when it filtered on
    // degree and years, because those pass a credentials test.
    const easy = defaultLanes(26).find((l) => l.id === 'easy')!
    expect(easy.rules.some((r) => r.type === 'ease')).toBe(true)
    expect(easy.rules.some((r) => r.type === 'degree' || r.type === 'years')).toBe(false)
  })
  it('every lane starts inside the commute and above the floor', () => {
    for (const lane of defaultLanes(25)) {
      expect(lane.rules.some((r) => r.type === 'commute')).toBe(true)
    }
  })

  it('every lane but Everything carries the hard exclusions', () => {
    // Hard exclusions are hard. A lane that quietly readmits insurance or
    // police work is the failure mode this whole file exists to prevent.
    for (const lane of defaultLanes(25)) {
      if (lane.id === 'everything') continue
      expect(lane.rules.some((r) => r.type === 'industry' && r.min >= 0.5 && !r.ids), lane.name).toBe(true)
      expect(lane.rules.some((r) => r.type === 'frontline'), lane.name).toBe(true)
    }
  })
})
