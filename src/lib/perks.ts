/**
 * Tuition remission, and why it is a fact about an employer rather than a job.
 *
 * The case file asks for tuition benefits to count toward how strategically
 * valuable a job is, and the reasoning is sound — remission at Northeastern is
 * a degree a year, which is worth more than the gap between a $27 and a $32
 * hourly rate. So the pool was measured for it: 462 of 2,902 postings name one.
 *
 * They do not distribute the way a job-level signal would. Northeastern names
 * it on 234 of 234 postings and Harvard on 91 of 91; Beth Israel names it on 8
 * of 700. It is a paragraph in a benefits block, present on an employer's whole
 * board or on none of it. Scoring it per posting would therefore be scoring
 * "is this Northeastern", which the industry and sector axes already do — the
 * same employer counted twice, and the calibration quietly wrong.
 *
 * So it is not an axis. It is read at scan time, decided per employer, and
 * shown on the row as something to know when choosing between two jobs. The
 * model ranks; this informs.
 */

export const TUITION =
  /\b(?:tuition (?:remission|benefits?|reimbursement|assistance|waiver|exchange|discount)|free tuition|tuition-free|educational assistance program)\b/i

/**
 * Half the board, and at least four postings.
 *
 * The threshold is high because the signal is boilerplate: an employer either
 * puts its benefits block on the posting or it does not. Requiring four stops a
 * single-posting employer being called a tuition employer on one sentence,
 * which is how a rule like this usually goes wrong.
 */
export const MIN_POSTINGS = 4
export const MIN_SHARE = 0.5

/** Employers whose board says they pay for study. */
export function tuitionEmployers(postings: { company: string; body: string }[]): Set<string> {
  const counts = new Map<string, { hit: number; total: number }>()
  for (const p of postings) {
    const c = counts.get(p.company) ?? { hit: 0, total: 0 }
    c.total++
    if (TUITION.test(p.body)) c.hit++
    counts.set(p.company, c)
  }
  const out = new Set<string>()
  for (const [company, c] of counts) {
    if (c.total >= MIN_POSTINGS && c.hit / c.total >= MIN_SHARE) out.add(company)
  }
  return out
}
