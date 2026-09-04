import { describe, expect, it } from 'vitest'
import type { Applied, AppliedCtx, AppliedStatus } from '../../types'
import {
  MIN_LEARN,
  MIN_SAMPLE,
  advanced,
  breakdown,
  heardBack,
  isSettled,
  median,
  nudges,
  rateOf,
  responseDays,
  runwayOf,
  tierOf,
  weekStart,
  weekly,
  wilson,
} from '../outcomes'
import { GHOST_DAYS } from '../applied'

const NOW = Date.parse('2026-09-04T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString()

const ctx = (over: Partial<AppliedCtx> = {}): AppliedCtx => ({
  source: 'greenhouse',
  boards: 1,
  sector: 'tech',
  pack: 'office',
  industry: 'higher education administration',
  tier: 'A',
  score: 7,
  match: 8,
  hourly: 25,
  minutes: 20,
  remote: false,
  letter: false,
  variant: 'full',
  daysLive: 3,
  ...over,
})

let n = 0
const app = (status: AppliedStatus, ageDays: number, over: Partial<Applied> = {}): Applied => ({
  key: `k${n++}`,
  title: 'Coordinator',
  company: 'Somewhere',
  url: 'https://example.com',
  at: daysAgo(ageDays),
  status,
  ctx: ctx(),
  ...over,
})

const many = (count: number, status: AppliedStatus, ageDays: number, over: Partial<Applied> = {}) =>
  Array.from({ length: count }, () => app(status, ageDays, over))

describe('what counts as an answer', () => {
  it('treats a rejection as a response and silence as the thing being measured', () => {
    expect(heardBack(app('rejected', 30))).toBe(true)
    expect(heardBack(app('replied', 30))).toBe(true)
    expect(heardBack(app('ghosted', 30))).toBe(false)
    expect(heardBack(app('applied', 1))).toBe(false)
  })

  it('counts only interviews and offers as advancing', () => {
    expect(advanced(app('interviewing', 30))).toBe(true)
    expect(advanced(app('offer', 30))).toBe(true)
    expect(advanced(app('rejected', 30))).toBe(false)
  })
})

describe('the denominator', () => {
  it('leaves an application sent this week out of it entirely', () => {
    expect(isSettled(app('applied', 2), NOW)).toBe(false)
    expect(isSettled(app('applied', GHOST_DAYS + 1), NOW)).toBe(true)
  })

  it('counts one that already answered, however recent', () => {
    expect(isSettled(app('interviewing', 1), NOW)).toBe(true)
  })

  it('does not let today’s applications drag yesterday’s rate down', () => {
    const settled = [...many(5, 'replied', 40), ...many(5, 'ghosted', 40)]
    const before = rateOf('x', 'x', settled, NOW)
    const after = rateOf('x', 'x', [...settled, ...many(20, 'applied', 1)], NOW)
    expect(before.rate).toBe(0.5)
    expect(after.rate).toBe(0.5)
    expect(after.sent).toBe(30)
    expect(after.settled).toBe(10)
  })
})

describe('rates nobody should read are not shown', () => {
  it('gives no percentage below the minimum sample', () => {
    const r = rateOf('x', 'x', many(MIN_SAMPLE - 1, 'replied', 40), NOW)
    expect(r.heard).toBe(MIN_SAMPLE - 1)
    expect(r.rate).toBeNull()
    expect(r.interval).toBeNull()
  })

  it('gives one at the minimum, with an interval', () => {
    const r = rateOf('x', 'x', many(MIN_SAMPLE, 'replied', 40), NOW)
    expect(r.rate).toBe(1)
    expect(r.interval).not.toBeNull()
  })
})

describe('wilson', () => {
  it('is wide enough at small n to stop a conclusion being drawn', () => {
    const [lo, hi] = wilson(3, 20)
    expect(lo).toBeLessThan(0.15)
    expect(hi).toBeGreaterThan(0.3)
  })

  it('narrows as the sample grows', () => {
    const small = wilson(15, 100)
    const large = wilson(150, 1000)
    expect(large[1] - large[0]).toBeLessThan(small[1] - small[0])
  })

  it('never leaves the unit interval', () => {
    for (const [h, n] of [[0, 1], [1, 1], [0, 50], [50, 50]] as const) {
      const [lo, hi] = wilson(h, n)
      expect(lo).toBeGreaterThanOrEqual(0)
      expect(hi).toBeLessThanOrEqual(1)
    }
  })
})

describe('breakdown', () => {
  it('splits by board and puts the readable rates first', () => {
    const rows = breakdown(
      [
        ...many(MIN_SAMPLE, 'replied', 40, { ctx: ctx({ source: 'lever' }) }),
        ...many(3, 'ghosted', 40, { ctx: ctx({ source: 'workday' }) }),
      ],
      'source',
      NOW,
    )
    expect(rows.map((r) => r.key)).toEqual(['lever', 'workday'])
    expect(rows[0].rate).toBe(1)
    expect(rows[1].rate).toBeNull()
  })

  it('separates referrals from cold applications without needing a captured context', () => {
    const rows = breakdown([app('replied', 40, { referral: true, ctx: undefined }), app('ghosted', 40)], 'referral', NOW)
    expect(rows.map((r) => r.key).sort()).toEqual(['cold', 'referral'])
  })

  it('files an entry logged before capture existed as not recorded, rather than dropping it', () => {
    const rows = breakdown([app('replied', 40, { ctx: undefined })], 'source', NOW)
    expect(rows[0].key).toBe('not recorded')
    expect(rows[0].sent).toBe(1)
  })

  it('buckets how long a posting had been live', () => {
    const rows = breakdown(
      [
        app('replied', 40, { ctx: ctx({ daysLive: 2 }) }),
        app('ghosted', 40, { ctx: ctx({ daysLive: 20 }) }),
        app('ghosted', 40, { ctx: ctx({ daysLive: 90 }) }),
      ],
      'daysLive',
      NOW,
    )
    expect(rows.map((r) => r.key).sort()).toEqual(['first week', 'over a month', 'under a month'])
  })
})

describe('time to an answer', () => {
  it('measures from sending to the first reply', () => {
    const e = app('interviewing', 30, { respondedAt: daysAgo(26) })
    expect(responseDays([e])).toEqual([4])
  })

  it('ignores the ones that never answered', () => {
    expect(responseDays([app('ghosted', 40)])).toEqual([])
  })

  it('medians an even count between the middle two', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(median([])).toBeNull()
  })
})

describe('weeks', () => {
  it('anchors on Monday', () => {
    // 2026-09-04 is a Friday.
    expect(weekStart(Date.parse('2026-09-04T12:00:00Z'))).toBe('2026-08-31')
    expect(weekStart(Date.parse('2026-08-31T00:30:00Z'))).toBe('2026-08-31')
  })

  it('shows a week with nothing sent as a zero instead of closing the gap', () => {
    const weeks = weekly([app('applied', 1)], 4, NOW)
    expect(weeks).toHaveLength(4)
    expect(weeks.filter((w) => w.sent === 0)).toHaveLength(3)
    expect(weeks.at(-1)!.sent).toBe(1)
  })
})

describe('what the outcomes say about the weights', () => {
  const withAxes = (status: AppliedStatus, pay: number) =>
    app(status, 40, { ctx: ctx({ axes: { pay, commute: 5 } }) })

  it('says nothing at all until there is something to say', () => {
    const out = nudges([withAxes('replied', 9), withAxes('ghosted', 3)], NOW)
    expect(out.ready).toBe(false)
    expect(out.rows).toEqual([])
    expect(out.need).toBe(MIN_LEARN - 2)
  })

  it('stays silent when the sample is large but one side of it is empty', () => {
    const out = nudges(Array.from({ length: 40 }, () => withAxes('ghosted', 5)), NOW)
    expect(out.ready).toBe(false)
  })

  it('reports the axis that separated the answers from the silence', () => {
    const out = nudges(
      [
        ...Array.from({ length: 10 }, () => withAxes('replied', 9)),
        ...Array.from({ length: 20 }, () => withAxes('ghosted', 3)),
      ],
      NOW,
    )
    expect(out.ready).toBe(true)
    expect(out.rows[0].axis).toBe('pay')
    expect(out.rows[0].diff).toBeCloseTo(6)
    // The axis that did not move must not be reported as though it did.
    expect(out.rows.find((r) => r.axis === 'commute')!.diff).toBe(0)
  })
})

describe('runway', () => {
  it('shows nothing at all without a figure entered', () => {
    expect(runwayOf(null, 2000)).toEqual({ stage: 'ok', say: null, months: null })
  })

  it('escalates through review, bridge and take', () => {
    expect(runwayOf(30_000, 2000).stage).toBe('ok')
    expect(runwayOf(20_000, 2000).stage).toBe('review')
    expect(runwayOf(15_000, 2000).stage).toBe('bridge')
    expect(runwayOf(9_000, 2000).stage).toBe('take')
  })

  it('gives months only when a burn rate is known', () => {
    expect(runwayOf(20_000, 2000).months).toBe(10)
    expect(runwayOf(20_000, 0).months).toBeNull()
  })
})

describe('tiers', () => {
  it('reads the letter off the industry weight, and calls an exclusion E', () => {
    expect(tierOf(9, false)).toBe('A')
    expect(tierOf(7.2, false)).toBe('B')
    expect(tierOf(6.5, false)).toBe('C')
    expect(tierOf(3, false)).toBe('D')
    expect(tierOf(8.5, true)).toBe('E')
  })
})
