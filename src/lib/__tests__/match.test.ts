import { describe, expect, it } from 'vitest'
import { buildMatch } from '../match'

describe('a match is a place in the pool, not an average', () => {
  it('puts the best job at the top of the scale and the worst at the bottom', () => {
    const m = buildMatch([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(m(10)).toBeGreaterThan(9)
    expect(m(1)).toBeLessThan(1)
  })

  it('puts the median in the middle', () => {
    const m = buildMatch(Array.from({ length: 101 }, (_, i) => i / 10))
    expect(m(5)).toBeCloseTo(5, 0)
  })

  it('spreads a clustered score across the whole range, which is the point', () => {
    // The real pool: 4.0 to 7.7, 56% of it between 6 and 7. As an absolute
    // number that cannot rank anything; as a percentile it uses all ten points.
    const clustered = [
      ...Array.from({ length: 271 }, () => 4.5),
      ...Array.from({ length: 249 }, () => 5.5),
      ...Array.from({ length: 1185 }, (_, i) => 6 + (i % 10) / 10),
      ...Array.from({ length: 398 }, (_, i) => 7 + (i % 8) / 10),
    ]
    const m = buildMatch(clustered)
    const spread = m(7.7) - m(4.5)
    expect(spread).toBeGreaterThan(8)
    // And it still orders the same way the score does.
    expect(m(7.7)).toBeGreaterThan(m(6.5))
    expect(m(6.5)).toBeGreaterThan(m(4.5))
  })

  it('gives tied scores the same match', () => {
    // Two jobs the model cannot tell apart must not be given different numbers.
    const m = buildMatch([5, 6, 6, 6, 7])
    expect(m(6)).toBe(m(6))
    expect(m(6)).toBeGreaterThan(m(5))
    expect(m(6)).toBeLessThan(m(7))
  })

  it('never returns something outside the scale', () => {
    const m = buildMatch([3, 4, 5])
    for (const s of [0, 3, 4, 5, 99]) {
      expect(m(s)).toBeGreaterThanOrEqual(0)
      expect(m(s)).toBeLessThanOrEqual(10)
    }
  })

  it('does not fall over on an empty pool', () => {
    expect(buildMatch([])(7)).toBe(5)
  })
})
