import { describe, expect, it } from 'vitest'
import type { Job } from '../../types'
import { DEFAULT_WEIGHTS } from '../score'
import { roleKey, topJobs } from '../top'

const SEAN = { years: 5, degree: 'bachelor' as const, clearance: 'none' as const }
let n = 0
const job = (over: Partial<Job> = {}): Job => ({
  id: `j${n++}`, source: 'workday', sector: 'health', company: 'Beth Israel Lahey Health',
  title: 'Patient Access Representative', url: 'https://x/1', descText: 'Hiring immediately, will train. Work closely with the team on site.',
  locations: [], miles: 10, remote: false, pay: { min: 26, max: 32, period: 'hour', raw: '' },
  requirements: [], families: ['coordinator'], postedAt: '2026-08-26', firstSeen: '2026-08-26',
  lastSeen: '2026-08-28', scans: 1, reposts: 0, alsoOn: [], linkOk: true, ...over,
})
const top = (jobs: Job[], opts = {}) => topJobs(jobs, SEAN, DEFAULT_WEIGHTS, opts)

const ROLES = [
  'Program Coordinator', 'Operations Assistant', 'Scheduling Specialist', 'Records Clerk',
  'Front Desk Associate', 'Materials Handler', 'Office Administrator', 'Patient Navigator',
]

describe('one role, however many shifts it is posted as', () => {
  // Sorted purely by score the real pool returned this title ten times from one
  // hospital, each a different shift. Ten identical rows is not a top ten.
  const shifts = [
    'Patient Access Representative -24hrs. 8a-12p',
    'Patient Access Representative, ED Registration 3pm-11:30pm',
    'Patient Access Representative 8am-430pm M-F',
    'Patient Access Representative; 40 hrs. varying',
  ].map((title) => job({ title }))

  it('folds them into a single entry', () => {
    const out = top(shifts)
    expect(out).toHaveLength(1)
    expect(out[0].variants).toHaveLength(3)
  })

  it('and keys them the same regardless of the shift wording', () => {
    expect(roleKey(shifts[0])).toBe(roleKey(shifts[2]))
  })

  it('but keeps genuinely different roles apart', () => {
    const out = top([...shifts, job({ title: 'Scheduler II, Radiation Oncology' })])
    expect(out).toHaveLength(2)
  })

  it('and the same title at a different employer is its own entry', () => {
    expect(top([job(), job({ company: 'Tufts Medicine' })])).toHaveLength(2)
  })
})

describe('no employer owns the list', () => {
  it('caps how many places one company can take', () => {
    // Genuinely different roles, not one role numbered twelve ways — those
    // correctly fold into a single entry.
    const many = ROLES.map((title) => job({ title }))
    expect(top(many)).toHaveLength(3)
  })

  it('so a smaller employer still reaches the list', () => {
    const flood = ROLES.map((title) => job({ title }))
    const other = job({ company: 'The Trustees of Reservations', title: 'Land Steward' })
    const out = top([...flood, other])
    expect(out.map((e) => e.job.company)).toContain('The Trustees of Reservations')
  })

  it('the cap is adjustable', () => {
    expect(top(ROLES.map((title) => job({ title })), { perEmployer: 5 })).toHaveLength(5)
  })
})

describe('ordering', () => {
  it('is by score, highest first', () => {
    const out = top([
      job({ title: 'Warehouse Associate' }),
      job({ title: 'Senior Director of Engineering', sector: 'defense', pay: { min: 200000, max: 250000, period: 'year', raw: '' } }),
    ])
    expect(out[0].score).toBeGreaterThanOrEqual(out[1].score)
  })

  it('carries the fit and gettability behind each score', () => {
    const [e] = top([job()])
    expect(e.fit).toBeGreaterThan(0)
    expect(e.gettable).toBeGreaterThan(0)
  })

  it('an empty pool is not an error', () => expect(top([])).toEqual([]))
})

describe('placeholder postings', () => {
  it('are excluded as a family, having reached the top fifteen of the real pool', async () => {
    const { classifyFamilies } = await import('../roles')
    expect(classifyFamilies('Mattie Test Job', '')).toContain('placeholder')
    expect(classifyFamilies('Do Not Apply - Requisition', '')).toContain('placeholder')
  })
  it('without catching a real job that mentions testing', async () => {
    const { classifyFamilies } = await import('../roles')
    expect(classifyFamilies('Quality Assurance Test Engineer', '')).not.toContain('placeholder')
  })
})

describe('Top obeys the same baseline as every lane', () => {
  it('does not recommend a job paying below the floor', async () => {
    // It first reused the Everything lane, which deliberately carries only a
    // radius so a manual search hides nothing — and so Top recommended a
    // coordinator role topping out at $23.51 against a $26 floor.
    const { runNet, topBaseline } = await import('../nets')
    const under = job({ title: 'Clinical Administrative Coordinator', pay: { min: 18.81, max: 23.51, period: 'hour', raw: '' } })
    const over = job({ title: 'Program Coordinator', pay: { min: 26, max: 32, period: 'hour', raw: '' } })
    const kept = runNet([under, over], topBaseline(26), new Set(), (j) => j.id).jobs
    expect(kept.map((j) => j.title)).toEqual(['Program Coordinator'])
  })
})
