import { describe, expect, it } from 'vitest'
import type { Job, Source } from '../../types'
import { boardCount, dedupe, normaliseCompany, normaliseTitle, titleSimilarity } from '../dedupe'

let n = 0
const job = (company: string, title: string, source: Source = 'greenhouse', over: Partial<Job> = {}): Job => ({
  id: `j${n++}`,
  source,
  sector: 'tech',
  company,
  title,
  url: `https://example.com/${n}`,
  descText: 'a description',
  locations: [{ raw: 'Boston, MA', city: 'Boston', state: 'MA', remote: false, hybrid: false, miles: 10 }],
  miles: 10,
  remote: false,
  pay: null,
  requirements: [],
  families: [],
  postedAt: null,
  firstSeen: '2026-08-01',
  lastSeen: '2026-08-28',
  scans: 1,
  reposts: 0,
  alsoOn: [],
  linkOk: null,
  ...over,
})

describe('company names that are the same company', () => {
  it('collapses the legal suffixes', () => {
    expect(normaliseCompany('Acme, Inc.')).toBe(normaliseCompany('Acme LLC'))
  })
  it('knows the trading names from the spec', () => {
    expect(normaliseCompany('RTX')).toBe('raytheon')
    expect(normaliseCompany('Raytheon Technologies')).toBe('raytheon')
    expect(normaliseCompany('Raytheon')).toBe('raytheon')
  })
})

describe('titles that are the same title', () => {
  it('expands abbreviations', () => {
    expect(normaliseTitle('Sr. Program Coordinator')).toBe(normaliseTitle('Senior Program Coordinator'))
    expect(normaliseTitle('Ops Mgr')).toBe(normaliseTitle('Operations Manager'))
  })
  it('strips requisition numbers boards bolt on', () => {
    expect(normaliseTitle('Software Engineer II (R5046)')).toBe('software engineer ii')
  })
  it('keeps seniority levels, because II and III are different jobs', () => {
    expect(normaliseTitle('Engineer II')).not.toBe(normaliseTitle('Engineer III'))
    expect(titleSimilarity('Engineer II', 'Engineer III')).toBeLessThan(0.82)
  })
})

describe('merging', () => {
  it('merges the same job seen on three boards into one row', () => {
    const out = dedupe([
      job('Acme Inc', 'Program Coordinator', 'smartrecruiters'),
      job('Acme', 'Program Coordinator', 'greenhouse'),
      job('Acme LLC', 'Program Coordinator', 'paste'),
    ])
    expect(out).toHaveLength(1)
    expect(boardCount(out[0])).toBe(3)
  })

  it('keeps the company board as the canonical apply link', () => {
    // The direct path. Aggregator redirects are where applications get lost.
    const out = dedupe([job('Acme', 'Program Coordinator', 'smartrecruiters'), job('Acme', 'Program Coordinator', 'greenhouse')])
    expect(out[0].source).toBe('greenhouse')
    expect(out[0].alsoOn[0].source).toBe('smartrecruiters')
  })

  it('merges wording variants of one title', () => {
    const out = dedupe([job('Acme', 'Sr. Program Coordinator'), job('Acme', 'Senior Program Coordinator')])
    expect(out).toHaveLength(1)
  })

  it('does NOT merge two genuinely different jobs at one company', () => {
    const out = dedupe([job('Acme', 'Program Coordinator'), job('Acme', 'Warehouse Associate')])
    expect(out).toHaveLength(2)
  })

  it('does not merge the same title at different companies', () => {
    expect(dedupe([job('Acme', 'Analyst'), job('Globex', 'Analyst')])).toHaveLength(2)
  })

  it('does not merge the same title in different cities', () => {
    const far = job('Acme', 'Analyst', 'greenhouse', {
      locations: [{ raw: 'Austin, TX', city: 'Austin', state: 'TX', remote: false, hybrid: false, miles: 1700 }],
    })
    expect(dedupe([job('Acme', 'Analyst'), far])).toHaveLength(2)
  })

  it('keeps the earliest first-seen date, so age is not reset by a new board', () => {
    const out = dedupe([
      job('Acme', 'Analyst', 'smartrecruiters', { firstSeen: '2026-08-20' }),
      job('Acme', 'Analyst', 'greenhouse', { firstSeen: '2026-07-01' }),
    ])
    expect(out[0].firstSeen).toBe('2026-07-01')
  })

  it('keeps the fullest description, since aggregators truncate', () => {
    const long = 'x'.repeat(500)
    const out = dedupe([
      job('Acme', 'Analyst', 'greenhouse', { descText: 'short' }),
      job('Acme', 'Analyst', 'smartrecruiters', { descText: long }),
    ])
    expect(out[0].descText).toBe(long)
  })

  it('an empty list is not an error', () => expect(dedupe([])).toEqual([]))
})
