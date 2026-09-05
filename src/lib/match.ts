/**
 * How good a job is *relative to what is actually available*.
 *
 * The raw score is an absolute measure and it does not spread: over the real
 * pool it runs 4.0 to 7.7, with 56% of every job between 6 and 7 and the top
 * three points of the scale never used at all. Two jobs a hundred places apart
 * both read "6.8", which is the same as not ranking them.
 *
 * That is not a bug in the score — it is an average of eleven axes, and
 * averages cluster. It is a bug in showing the average as if it were a rank.
 * So the number on the row is a percentile: where this job sits among every job
 * in range, on a scale of ten. The best job available is a 10, the median a 5,
 * and the spacing between two rows means something because it is defined by the
 * pool rather than by an average.
 *
 * It says "better than 93% of what is out there for you", not "93% qualified" —
 * a distinction worth keeping, because the second would be a claim about him
 * and this is a claim about the market.
 */

/**
 * `of` is the tenth shown on a row. `percentile` is the unrounded position,
 * which the explainer needs: at the top of the list every job is above the
 * 99th, and "better than 100% of what is in range" is printed on eleven rows
 * at once.
 */
export type Match = ((score: number) => number) & { percentile: (score: number) => number }

/**
 * Ties share a match. Two jobs scoring 6.8 are not distinguishable by the
 * model, and giving them different numbers would invent a precision the score
 * does not have — so both take the midpoint of the range they span.
 */
export function buildMatch(scores: number[]): Match {
  if (scores.length === 0) return Object.assign(() => 5, { percentile: () => 50 })
  const sorted = [...scores].sort((a, b) => a - b)
  const n = sorted.length
  const rankOf = (score: number) => {
    // First index with a score >= this one, and first strictly greater.
    let lo = 0
    let hi = n
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (sorted[mid] < score) lo = mid + 1
      else hi = mid
    }
    const below = lo
    hi = n
    let lo2 = below
    while (lo2 < hi) {
      const mid = (lo2 + hi) >> 1
      if (sorted[mid] <= score) lo2 = mid + 1
      else hi = mid
    }
    const atOrBelow = lo2
    return (below + atOrBelow) / 2
  }
  return Object.assign((score: number) => Math.round((rankOf(score) / n) * 100) / 10, {
    percentile: (score: number) => (rankOf(score) / n) * 100,
  })
}
