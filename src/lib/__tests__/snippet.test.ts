import { describe, expect, it } from 'vitest'
import { snippet } from '../../components/JobRow'
import type { Job } from '../../types'

const job = (over: Partial<Job> = {}): Job => ({
  id: 'x', source: 'usajobs', sector: 'gov', company: 'U.S. Army Corps of Engineers',
  title: 'Program Analyst', url: 'https://example.com', descText: '', locations: [], miles: 10,
  remote: false, pay: null, requirements: [], families: [], postedAt: null,
  firstSeen: '2026-09-01', lastSeen: '2026-09-04', scans: 1, reposts: 0, alsoOn: [], linkOk: true,
  ...over,
})

/**
 * Grouped, the employer is in the group header and not on the row. Suppressing
 * a company match there hid the only reason the row was in the results — three
 * federal postings came back with the search term nowhere on them, and it took
 * an employer with a common word in its name to expose it.
 */
describe('why a search result is on screen', () => {
  it('names the employer when the employer matched and the row does not show it', () => {
    expect(snippet(job(), 'engineer', false)).toBe('U.S. Army Corps of Engineers')
  })

  it('stays quiet when the row shows the employer itself', () => {
    expect(snippet(job(), 'engineer', true)).toBeNull()
  })

  it('stays quiet when the title carries the word either way', () => {
    const j = job({ title: 'Systems Engineer' })
    expect(snippet(j, 'engineer', true)).toBeNull()
    expect(snippet(j, 'engineer', false)).toBeNull()
  })

  it('still quotes the description when that is where the match is', () => {
    const j = job({ company: 'Northeastern', descText: 'Supports the college of engineering and its labs.' })
    expect(snippet(j, 'engineering', false)).toMatch(/engineering/i)
  })

  it('prefers the title over everything, so an obvious match says nothing', () => {
    const j = job({ title: 'Engineering Coordinator', descText: 'engineering engineering' })
    expect(snippet(j, 'engineering', false)).toBeNull()
  })

  it('says nothing at all without a query', () => {
    expect(snippet(job(), '', false)).toBeNull()
    expect(snippet(job(), '   ', false)).toBeNull()
  })

  it('returns null when nothing matched anywhere, rather than an empty string', () => {
    expect(snippet(job({ company: 'Northeastern' }), 'zebra', false)).toBeNull()
  })
})
