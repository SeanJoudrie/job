import { describe, expect, it } from 'vitest'
import type { Job } from '../../types'
import { PART_TIME, flexibleJobs, isFlexible, remoteKind } from '../remote'
import { DEFAULT_WEIGHTS } from '../score'

const PROFILE = { years: 5, degree: 'bachelor' as const, clearance: 'none' as const }
const CTX = { floorHourly: 25, maxMinutes: 30, now: new Date('2026-09-06T12:00:00Z') }

let n = 0
const job = (over: Partial<Job> = {}): Job => ({
  id: `j${n++}`, source: 'greenhouse', sector: 'university', company: 'Berklee', title: 'Coordinator',
  url: 'https://example.com', descText: '', locations: [], miles: 10, remote: false, pay: null,
  requirements: [], families: [], postedAt: null, firstSeen: '2026-09-01', lastSeen: '2026-09-06',
  scans: 1, reposts: 0, alsoOn: [], linkOk: true, ...over,
})

describe('what counts as flexible', () => {
  it('reads fully remote off the job', () => {
    expect(remoteKind(job({ remote: true }))).toBe('remote')
  })

  it('reads hybrid off the location', () => {
    expect(remoteKind(job({ locations: [{ raw: 'Boston, MA (hybrid)', remote: false, hybrid: true }] }))).toBe('hybrid')
  })

  it('reads part-time out of the title or the body', () => {
    expect(remoteKind(job({ title: 'Office Receptionist, Part-Time' }))).toBe('part-time')
    expect(remoteKind(job({ title: 'Dietary Aide', descText: 'Per diem, as needed.' }))).toBe('part-time')
    expect(remoteKind(job({ title: 'Shuttle Driver', descText: 'Seasonal position.' }))).toBe('part-time')
  })

  it('leaves an ordinary full-time on-site job out', () => {
    expect(remoteKind(job({ title: 'Administrative Coordinator', descText: 'Full time, on site.' }))).toBeNull()
    expect(isFlexible(job())).toBe(false)
  })

  it('does not read "part" in an unrelated word as part-time', () => {
    expect(PART_TIME.test('Works with the Parts Department')).toBe(false)
    expect(PART_TIME.test('participates in weekly meetings')).toBe(false)
  })
})

/**
 * He rated remote a ten out of ten and part-time the same, and the pool's own
 * ordering answers with local per-diem work: a hospital shift twenty-six
 * minutes away is easier to get than anything remote, so an achievability
 * ranking floats it to the top. All of it is wanted; a tab called "remote"
 * that opens on a dietary aide post is still the wrong first screen.
 */
describe('the order the section is in', () => {
  it('leads with remote, then part-time', () => {
    const list = flexibleJobs(
      [
        job({ title: 'Dietary Aide, Per Diem', company: 'Beth Israel' }),
        job({ title: 'Student Finance Representative', remote: true }),
      ],
      PROFILE, DEFAULT_WEIGHTS, CTX,
    )
    expect(list.map((j) => remoteKind(j))).toEqual(['remote', 'part-time'])
  })

  it('drops an excluded field rather than offering him remote commission sales', () => {
    const sales = job({ title: 'Remote Sales Development Representative', remote: true, families: ['sales'] })
    expect(flexibleJobs([sales], PROFILE, DEFAULT_WEIGHTS, CTX)).toEqual([])
  })

  it('keeps a boring job, because boring was the explicit ask', () => {
    const dull = job({ title: 'Data Entry Clerk, Part-Time', descText: 'Repetitive data entry.' })
    expect(flexibleJobs([dull], PROFILE, DEFAULT_WEIGHTS, CTX)).toHaveLength(1)
  })
})
