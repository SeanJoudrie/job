import type { Requirement } from '../types'

/**
 * The General Schedule grade, which is the most informative line on a federal
 * posting and the one nothing here could read.
 *
 * Federal work arrived and took fourteen of the top thirty. Several of those
 * were GS-14 and GS-15 analyst posts paying $126k–$197k, and the pay axis was
 * rewarding them for it — a job is scored better the more it pays, and nothing
 * was saying that this particular money is unreachable. A GS-14 requires a year
 * of specialized experience at GS-13, which requires a year at GS-12, and so on
 * down a ladder he has never stepped onto. The higher the grade, the better it
 * scored and the less gettable it was.
 *
 * Grades are not like a private-sector "5+ years preferred", which is a wish.
 * A grade is a legal qualification standard an HR specialist applies before a
 * human ever reads the application. It is the hardest requirement in the pool
 * and it was the only one invisible.
 */

/**
 * The highest grade he can realistically be found qualified for.
 *
 * GS-5 is the bachelor's entry point and GS-7 is reachable on Superior Academic
 * Achievement, which a 3.7 GPA meets outright. GS-9 wants two years of graduate
 * study or a year of specialized experience at GS-7 — a genuine stretch, so it
 * is the last grade left alone. From GS-11 up the ladder assumes federal or
 * directly equivalent specialized service, and that is a wall rather than a
 * stretch.
 */
export const REACHABLE_GRADE = 9

/**
 * Grade to the years of *specialized* experience its standard implies.
 *
 * These feed the ordinary experience machinery rather than a rule of their own,
 * so the row explains itself in the same words as every other gap. The profile
 * carries five years, which is what puts the cut between GS-9 and GS-11 —
 * deliberately, because that is where the ladder stops being climbable from
 * outside. The numbers are the ladder's shape, not a claim that a year at
 * Verizon and a year at GS-12 are the same thing.
 */
const YEARS: Record<number, number> = {
  1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 1, 7: 1, 8: 2, 9: 2,
  10: 4, 11: 6, 12: 7, 13: 8, 14: 9, 15: 10,
}

/**
 * Find the grade a posting is advertised at.
 *
 * The highest one mentioned, because a posting advertised "GS-9/11/12" is
 * filled at the top of its ladder far more often than the bottom, and reading
 * the lowest would be the optimistic error this whole classifier exists to
 * avoid. Matches "GS-14", "GS-0560-14" and "GS 14"; the four-digit group in the
 * middle is an occupational series, not a grade, so it is consumed and dropped.
 */
export function parseGsGrade(text: string): number | null {
  const found: number[] = []
  // The trailing group takes the whole advertised ladder — "GS-9/11/12" is one
  // posting fillable at three grades, and only the first carries the GS prefix.
  for (const m of text.matchAll(/\bGS[-–\s]?(?:\d{4}[-–])?(\d{1,2}(?:\s*\/\s*\d{1,2})*)\b/gi)) {
    for (const part of m[1].split('/')) {
      const g = Number(part.trim())
      // Grades run 1 to 15. Anything outside that is an occupational series
      // that slipped the group above, or a year, and is not a grade.
      if (g >= 1 && g <= 15) found.push(g)
    }
  }
  return found.length ? Math.max(...found) : null
}

/**
 * State the grade as a requirement, so it lands in the same gap counts, the
 * same "why", and the same reachability arithmetic as everything else.
 *
 * A reachable grade still emits one — as met, not as silence. "GS-7, and you
 * qualify" is worth reading on a row, and a federal posting with no stated
 * requirement at all otherwise scores as though nothing were known.
 */
export function gradeRequirement(grade: number | null): Requirement | null {
  if (grade === null) return null
  const years = YEARS[grade] ?? 0
  const reachable = grade <= REACHABLE_GRADE
  return {
    text: reachable
      ? `Advertised at GS-${grade}, which is within reach from outside the federal service.`
      : `Advertised at GS-${grade}. The standard is a year of specialized experience at GS-${grade - 1}, and each grade below that in turn.`,
    kind: 'experience',
    hardness: reachable ? 'soft' : 'hard',
    years,
  }
}

/**
 * Roughly what each grade tops out at, Boston locality, including step 10.
 *
 * Approximate on purpose — this is a contradiction check, not a pay table, and
 * it is only ever asked whether a number is wildly out of range.
 */
const CEILING: Record<number, number> = {
  1: 32_000, 2: 36_000, 3: 40_000, 4: 45_000, 5: 50_000, 6: 56_000, 7: 62_000,
  8: 69_000, 9: 76_000, 10: 84_000, 11: 92_000, 12: 110_000, 13: 131_000,
  14: 155_000, 15: 195_000,
}

/**
 * Does the grade agree with the money?
 *
 * A guard against being confidently wrong, added after being confidently wrong.
 * An IRS "Supervisory Program Analyst, $125,776–$197,200" was read as GS-4 —
 * the number was real, but it was an IR band, a scale on which 4 means senior
 * rather than entry. Written down as a GS grade it made a job he cannot have
 * look like the fourth best thing available.
 *
 * The pay plan is now checked at the source, so that particular route is
 * closed. This stays because it closes the whole class: a description quoting
 * "GS-5" in a sentence about something else, a series number that survives the
 * regex, a plan this does not know about yet. Grade and salary come from
 * different fields, so when they disagree by this much one of them is wrong,
 * and the safe move is to say nothing rather than guess which.
 *
 * The margin is deliberately loose — 60% above the top step — because locality
 * pay, special salary rates and supervisory differentials are all real. It is
 * meant to catch a scale error, not a rounding one.
 */
export function gradeAgreesWithPay(grade: number, annualMax: number | null): boolean {
  if (annualMax === null || !Number.isFinite(annualMax) || annualMax <= 0) return true
  const ceiling = CEILING[grade]
  return ceiling === undefined ? true : annualMax <= ceiling * 1.6
}
