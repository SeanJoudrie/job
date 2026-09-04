import { beforeEach, describe, expect, it } from 'vitest'
import type { Job } from '../../types'
import { GHOST_DAYS, isDeadReq, keyOf, loadApplied, markApplied, setNote, setReferral, setStatus, unmarkApplied, withGhosting } from '../applied'

beforeEach(() => {
  const data: Record<string, string> = {}
  globalThis.localStorage = {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void delete data[k],
    clear: () => void Object.keys(data).forEach((k) => delete data[k]),
    key: () => null,
    length: 0,
  } as unknown as Storage
})

const job = (company: string, title: string, over: Partial<Job> = {}): Job => ({
  id: `greenhouse:x:${Math.random()}`,
  source: 'greenhouse',
  sector: 'tech',
  company,
  title,
  url: 'https://example.com/j',
  descText: '',
  locations: [],
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
  linkOk: true,
  ...over,
})

describe('ticking the box', () => {
  it('records it', () => {
    markApplied(job('Acme', 'Program Coordinator'), undefined, '2026-08-01T00:00:00.000Z')
    const log = loadApplied()
    expect(Object.values(log)[0]).toMatchObject({ company: 'Acme', status: 'applied' })
  })

  it('keeps the first date if ticked twice', () => {
    const j = job('Acme', 'Program Coordinator')
    markApplied(j, undefined, '2026-08-01T00:00:00.000Z')
    markApplied(j, undefined, '2026-09-09T00:00:00.000Z')
    expect(Object.values(loadApplied())[0].at).toBe('2026-08-01T00:00:00.000Z')
  })

  it('un-ticking removes it', () => {
    const j = job('Acme', 'Program Coordinator')
    markApplied(j)
    unmarkApplied(j)
    expect(Object.keys(loadApplied())).toHaveLength(0)
  })
})

describe('the key survives everything the job list does not', () => {
  it('is the same after a rescan gives the job a new id', () => {
    const monday = job('Acme', 'Program Coordinator', { id: 'greenhouse:acme:111' })
    const tuesday = job('Acme', 'Program Coordinator', { id: 'greenhouse:acme:999' })
    expect(keyOf(monday)).toBe(keyOf(tuesday))
  })

  it('is the same across boards and legal suffixes', () => {
    expect(keyOf(job('Acme Inc.', 'Sr. Program Coordinator'))).toBe(keyOf(job('Acme LLC', 'Senior Program Coordinator')))
  })

  it('THE test: the whole job list is destroyed and the log survives', () => {
    // The failure this design exists to prevent — a rebuilt list taking the
    // record of real work with it.
    markApplied(job('Acme', 'Program Coordinator'))
    markApplied(job('Globex', 'Operations Analyst'))
    localStorage.removeItem('job.cache.v1')
    localStorage.removeItem('job.nets.v1')
    localStorage.removeItem('job.settings.v1')
    expect(Object.keys(loadApplied())).toHaveLength(2)
  })
})

describe('ghosting is named rather than left blank', () => {
  const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString()

  it(`calls it at ${GHOST_DAYS} days`, () => {
    markApplied(job('Acme', 'A'), undefined, at(GHOST_DAYS + 1))
    expect(Object.values(withGhosting(loadApplied()))[0].status).toBe('ghosted')
  })

  it('leaves a recent application alone', () => {
    markApplied(job('Acme', 'A'), undefined, at(3))
    expect(Object.values(withGhosting(loadApplied()))[0].status).toBe('applied')
  })

  it('never overwrites a real outcome', () => {
    const j = job('Acme', 'A')
    markApplied(j, undefined, at(90))
    setStatus(keyOf(j), 'rejected')
    expect(Object.values(withGhosting(loadApplied()))[0].status).toBe('rejected')
  })
})

describe('dead reqs', () => {
  it('a job you already applied to that reappears as new is dead', () => {
    const j = job('Acme', 'Analyst', { firstSeen: '2026-09-01' })
    markApplied(j, undefined, '2026-08-01T00:00:00.000Z')
    expect(isDeadReq({ ...j, firstSeen: '2026-09-01' }, loadApplied())).toBe(true)
  })
  it('a job you never applied to is not', () => {
    expect(isDeadReq(job('Acme', 'Analyst'), loadApplied())).toBe(false)
  })
})


describe('what was true when it was sent', () => {
  const ctx = {
    source: 'lever' as const,
    boards: 2,
    sector: 'university',
    pack: 'education',
    industry: 'higher education administration',
    tier: 'A',
    score: 7.4,
    match: 9.1,
    hourly: 27,
    minutes: 22,
    remote: false,
    letter: true,
    variant: 'full' as const,
    daysLive: 4,
  }

  it('stores the snapshot alongside the entry', () => {
    const j = job('Northeastern', 'Program Coordinator')
    const log = markApplied(j, ctx)
    expect(log[keyOf(j)].ctx).toEqual(ctx)
    expect(log[keyOf(j)].variant).toBe('full')
    expect(loadApplied()[keyOf(j)].ctx?.industry).toBe('higher education administration')
  })

  it('does not overwrite the snapshot if the box is ticked twice', () => {
    const j = job('Northeastern', 'Program Coordinator')
    markApplied(j, ctx)
    const log = markApplied(j, { ...ctx, score: 2 })
    expect(log[keyOf(j)].ctx?.score).toBe(7.4)
  })

  it('still works without one, so a test or an old entry is not a crash', () => {
    const j = job('Somewhere', 'Clerk')
    expect(markApplied(j)[keyOf(j)].ctx).toBeUndefined()
  })
})

describe('when a human first answered', () => {
  it('stamps the first reply and never moves it', () => {
    const j = job('Brandeis', 'Assistant')
    markApplied(j, undefined, '2026-08-01T00:00:00.000Z')
    const first = setStatus(keyOf(j), 'replied', '2026-08-05T00:00:00.000Z')
    expect(first[keyOf(j)].respondedAt).toBe('2026-08-05T00:00:00.000Z')
    const later = setStatus(keyOf(j), 'offer', '2026-09-20T00:00:00.000Z')
    expect(later[keyOf(j)].respondedAt).toBe('2026-08-05T00:00:00.000Z')
  })

  it('does not stamp a reply for a ghosting, because silence is not an answer', () => {
    const j = job('Somewhere', 'Clerk')
    markApplied(j)
    expect(setStatus(keyOf(j), 'ghosted')[keyOf(j)].respondedAt).toBeUndefined()
  })
})

describe('the referral flag', () => {
  it('is set by hand and survives a reload', () => {
    const j = job('Bentley', 'Coordinator')
    markApplied(j)
    setReferral(keyOf(j), true)
    expect(loadApplied()[keyOf(j)].referral).toBe(true)
    setReferral(keyOf(j), false)
    expect(loadApplied()[keyOf(j)].referral).toBe(false)
  })

  it('drops an emptied note rather than storing a blank string', () => {
    const j = job('Bentley', 'Coordinator')
    markApplied(j)
    setNote(keyOf(j), 'spoke to Dana')
    expect(loadApplied()[keyOf(j)].note).toBe('spoke to Dana')
    setNote(keyOf(j), '')
    expect(loadApplied()[keyOf(j)].note).toBeUndefined()
  })
})
