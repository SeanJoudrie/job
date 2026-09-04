import type { Degree, Hardness, ReqKind, Requirement } from '../types'

/**
 * Telling a wall from a door.
 *
 * This is the classifier the whole application is worth having for. Postings
 * routinely list a wish list and a hard gate in the same voice, and reading a
 * wish list as a gate is how a qualified person talks themselves out of a job
 * they would have got.
 *
 * The single most useful signal is not in the sentence, it's the heading above
 * it. A bullet reading "5+ years of experience" under "Preferred
 * Qualifications" is soft no matter how it is phrased, and the same words under
 * "Minimum Qualifications" are hard. So the section is tracked while walking
 * the posting, and a line inherits it unless the line says otherwise.
 */

const HARD_SECTION =
  /^\s*(?:minimum|basic|required|essential)?\s*(?:qualifications|requirements|what you(?:'| a)?ll need|who you are|must haves?)\b/i
const SOFT_SECTION =
  /^\s*(?:preferred|desired|nice[- ]to[- ]haves?|bonus(?: points)?|pluses|what would set you apart|icing on the cake|additionally)\b/i
/** Headings that end a requirements run — anything after is not a requirement. */
const END_SECTION =
  /^\s*(?:benefits|what we offer|perks|about (?:us|the (?:team|company))|compensation|equal opportunity|eeo|our values|how to apply)\b/i

const SOFT_LINE =
  /\b(?:preferred|preferable|a plus|nice to have|desirable|desired|ideally|bonus|familiarity|exposure to|helpful|not required|willing to train|we'?d love|would be great|advantageous)\b/i
const HARD_LINE =
  /\b(?:required|require[sd]?|must (?:have|possess|hold|be|maintain)|minimum of|at least|mandatory|essential|non-?negotiable|will not be considered|need to have)\b/i
/** A genuine softener for a degree: the door is explicitly left open. */
const EQUIVALENT = /\bor\s+(?:an?\s+)?equivalent(?:\s+(?:experience|combination|work experience))?\b/i

/**
 * Degree patterns, deliberately strict.
 *
 * A looser earlier version matched a bare `a.?s.?`, which hit the word "As" at
 * the start of a sentence, and `m.?a.?`, which hit the "MA" in "Somerville,
 * MA" — so a location line was read as a master's requirement. Bare initials
 * are only accepted with their full stops, or when a degree word or an "in
 * <field>" follows them.
 *
 * J.D., M.D. and LL.M are professional doctorates: they gate as hard as a PhD
 * and much harder than a bachelor's, so they rank with the doctorates.
 */
const DEGREES: [RegExp, Degree][] = [
  // No trailing \b on the stopped forms: after a full stop the next character
  // is a space, which is not a word boundary, so \b could never match.
  [/\b(?:ph\.?\s?d|doctorate|doctoral|d\.phil)\b|\bj\.\s?d\.|\bll\.\s?m\b|\bm\.\s?d\.|\bJD\s+(?:degree|and|required|preferred)\b|\blaw degree\b/i, 'doctorate'],
  [/\bmaster'?s?\b|\bm\.s\.|\bm\.a\.|\bmba\b|\bm\.b\.a\.|\bgraduate degree\b|\b(?:MS|MA)\s+(?:degree|in)\b/i, 'master'],
  [/\bbachelor'?s?\b|\bb\.s\.|\bb\.a\.|\bundergraduate degree\b|\b(?:BS|BA)\s+(?:degree|in)\b|\b4[-\s]year degree\b/i, 'bachelor'],
  [/\bassociate'?s?\s+degree\b|\ba\.a\.|\ba\.s\.|\b2[-\s]year degree\b/i, 'associate'],
  [/\bhigh school\b|\bged\b|\bsecondary school\b/i, 'highschool'],
]

export const DEGREE_RANK: Record<Degree, number> = {
  highschool: 1,
  associate: 2,
  bachelor: 3,
  master: 4,
  doctorate: 5,
}

/**
 * A bare "secret" is not enough: patent and legal postings talk about trade
 * secrets constantly, and one of them was being reported as a clearance
 * requirement. The word only counts when it is clearly about a clearance.
 */
const CLEARANCE = /\b(?:security\s+)?clearance\b|\bts\/sci\b|\btop[- ]secret\b|\b(?:secret|confidential)\s+(?:security\s+)?clearance\b|\bpoly(?:graph)?\b/i
/** Being a US person is a requirement a US citizen already meets. Not a clearance. */
const CITIZENSHIP = /\b(?:u\.?s\.?\s*(?:person|citizen(?:ship)?)|united states citizen|itar|export[- ]controlled)\b/i
/** "Must be able to obtain" is a requirement a citizen already meets. */
const OBTAINABLE =
  /\b(?:able to obtain|ability to obtain|eligibilit(?:y|ies)|eligible (?:for|to)|willing(?:ness)? to (?:obtain|undergo)|can obtain|clearable|obtainable|may be required)\b/i
/**
 * Deliberately narrow. An earlier version accepted a bare "must be", which read
 * "Must be a U.S. Person ... clearance eligibility may be required" as a held
 * clearance — turning a requirement already met into a hard blocker.
 */
const ACTIVE = /\b(?:active|current|existing|in scope|adjudicated|must (?:hold|possess)|must have an? (?:active|current))\b/i

function splitLines(text: string): string[] {
  // Defence in depth: sources normalise typography, but a pasted posting has
  // not been through that path and curly quotes would silently break matching.
  return text
    .replace(/[\u2018\u2019\u201B\u02BC]/g, "'")
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\r/g, '')
    .split(/\n|(?:<\/(?:li|p|h[1-6]|div)>)/i)
    .map((l) => l.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/**
 * The LOWEST degree named, not the first found. "Bachelor's or Master's degree"
 * is satisfied by a bachelor's — reading it as a master's invents a wall out of
 * a sentence that was offering a choice. Same principle as a years range
 * gating at its lower bound.
 */
function degreeOf(line: string): Degree | undefined {
  let lowest: Degree | undefined
  for (const [re, d] of DEGREES) {
    if (!re.test(line)) continue
    if (!lowest || DEGREE_RANK[d] < DEGREE_RANK[lowest]) lowest = d
  }
  return lowest
}

/**
 * Years demanded. A range takes its lower bound, because "3-5 years" gates at
 * three; reading it as five invents two years of exclusion that isn't there.
 */
function yearsOf(line: string): number | undefined {
  const m = line.match(/(\d{1,2})\s*(?:\+|-|–|to)?\s*(?:\d{1,2})?\s*(?:\+)?\s*years?\b/i)
  if (!m) return undefined
  const n = Number(m[1])
  return Number.isFinite(n) && n <= 40 ? n : undefined
}

function kindOf(line: string, degree?: Degree, years?: number): ReqKind {
  // Citizenship first: these lines often mention a clearance in passing, and
  // reading them as clearance requirements invents a gap that isn't there.
  if (CITIZENSHIP.test(line) && !ACTIVE.test(line)) return 'citizenship'
  if (CLEARANCE.test(line)) return 'clearance'
  if (degree) return 'education'
  if (years !== undefined) return 'experience'
  if (/\b(?:proficien|experience with|skilled|knowledge of|ability to use|certif)/i.test(line)) return 'skill'
  return 'other'
}

const looksLikeRequirement = (line: string) =>
  line.length > 8 &&
  line.length < 400 &&
  (SOFT_LINE.test(line) ||
    HARD_LINE.test(line) ||
    CLEARANCE.test(line) ||
    DEGREES.some(([re]) => re.test(line)) ||
    /\d\s*\+?\s*years?\b/i.test(line) ||
    /\b(?:proficien|experience|knowledge of|ability to|certif|skilled)/i.test(line))

export function parseRequirements(description: string): Requirement[] {
  const out: Requirement[] = []
  let section: Hardness | null = null
  // Once the benefits or the EEO boilerplate start, nothing below is a
  // requirement — "5 years of vesting on equity" is not five years of
  // experience. Collection resumes only if another requirements heading opens.
  let past = false

  for (const line of splitLines(description)) {
    if (END_SECTION.test(line)) {
      section = null
      past = true
      continue
    }
    if (SOFT_SECTION.test(line)) {
      section = 'soft'
      past = false
      // A heading is not itself a requirement unless it carries one.
      if (!/\d|degree|clearance/i.test(line)) continue
    } else if (HARD_SECTION.test(line)) {
      section = 'hard'
      past = false
      if (!/\d|degree|clearance/i.test(line)) continue
    }
    if (past) continue
    if (!looksLikeRequirement(line)) continue

    const degree = degreeOf(line)
    const years = yearsOf(line)
    const kind = kindOf(line, degree, years)

    let clearance: Requirement['clearance']
    if (kind === 'clearance') clearance = ACTIVE.test(line) && !OBTAINABLE.test(line) ? 'active' : 'obtainable'

    // Line beats section; section beats the fallback. The fallback is soft
    // because an unmarked bullet with no heading above it is more often a wish
    // than a gate, and the cost of a wasted application is far below the cost
    // of a job never applied to.
    let hardness: Hardness
    if (SOFT_LINE.test(line)) hardness = 'soft'
    else if (EQUIVALENT.test(line)) hardness = 'soft'
    else if (clearance === 'obtainable') hardness = 'soft'
    // A clearance that must already be held is a gate, whatever section it sits in.
    else if (clearance === 'active') hardness = 'hard'
    else if (HARD_LINE.test(line)) hardness = 'hard'
    else hardness = section ?? 'soft'

    out.push({ text: line, kind, hardness, ...(years !== undefined && { years }), ...(degree && { degree }), ...(clearance && { clearance }) })
  }
  return out
}

/**
 * Cards you can hold by next Friday.
 *
 * First aid, CPR, AED, OSHA 10, ServSafe, a forklift ticket — a posting listing
 * these reads as a wall and is the softest thing on the page. Every one is a
 * weekend course, most cost under two hundred dollars, and employers who ask
 * for them usually run the class themselves. Left unclassified they came back
 * "not something the profile can answer", which is the same as silence, and
 * silence on a line like this is what makes someone skip the posting.
 *
 * A CDL is deliberately excluded: weeks of training, a road test and a medical
 * card is not a weekend, and calling it one would be the exact optimism this
 * classifier exists to prevent. A state professional licence is excluded for
 * the same reason and is already handled as an outright exclusion elsewhere.
 */
const QUICK_CERT =
  /\b(?:first[- ]aid|cpr|aed|bls\b|basic life support|osha\s?(?:10|30)|servsafe|food (?:handler|safety) (?:card|certificat)|forklift|powered industrial truck|allergen|tips certif|crowd manager|flagger)\b/i

/**
 * He holds one, and it is on the resume. A commercial licence is not the same.
 *
 * Both apostrophes are accepted. `normaliseTypography` straightens the curly
 * one during a scan, but a pasted posting does not go through it, and a
 * requirement line that fails to match because of a smart quote is a silent
 * wrong answer rather than a visible one.
 */
const PLAIN_LICENCE = /\b(?:valid\s+)?drivers?['\u2019]?s?\s+licen[cs]e\b/i
const COMMERCIAL = /\b(?:cdl|commercial driver|class [ab]\b|hazmat|passenger endorsement)\b/i

export type Profile = {
  years: number
  degree: Degree
  /** what the person can satisfy today */
  clearance: 'none' | 'obtainable' | 'active'
}

export type GapVerdict = 'matched' | 'soft-gap' | 'hard-gap' | 'unstated'
export type Gap = { requirement: Requirement; verdict: GapVerdict; why: string }

/**
 * What actually stands between this person and this job, line by line.
 * A hard gap is worth knowing. A soft gap is worth applying anyway, and the
 * app has to say so in those words rather than leaving it to be inferred.
 */
export function gapsFor(reqs: Requirement[], profile: Profile): Gap[] {
  return reqs.map((r) => {
    const gap = (why: string): Gap => ({ requirement: r, verdict: r.hardness === 'hard' ? 'hard-gap' : 'soft-gap', why })

    if (r.kind === 'education' && r.degree) {
      if (DEGREE_RANK[profile.degree] >= DEGREE_RANK[r.degree])
        return { requirement: r, verdict: 'matched', why: `has a ${profile.degree}'s degree` }
      return gap(`wants a ${r.degree}'s; you have a ${profile.degree}'s`)
    }
    if (r.kind === 'experience' && r.years !== undefined) {
      if (profile.years >= r.years) return { requirement: r, verdict: 'matched', why: `${profile.years} years covers ${r.years}` }
      return gap(`wants ${r.years} years; you have ${profile.years}`)
    }
    if (r.kind === 'citizenship') return { requirement: r, verdict: 'matched', why: 'US citizen' }
    if (r.kind === 'clearance') {
      if (r.clearance === 'obtainable')
        return profile.clearance === 'none'
          ? { requirement: r, verdict: 'matched', why: 'eligible to obtain one — this is met today' }
          : { requirement: r, verdict: 'matched', why: 'already cleared' }
      if (profile.clearance === 'active') return { requirement: r, verdict: 'matched', why: 'holds an active clearance' }
      return gap('wants a clearance already held; yours is pending')
    }
    // Before the fall-through, because these are the openings most likely to
    // be misread as closed. Stated hardness is overridden on purpose: "First
    // Aid/CPR required" means required by day one, not required to apply.
    if (QUICK_CERT.test(r.text) && !COMMERCIAL.test(r.text))
      return { requirement: r, verdict: 'soft-gap', why: 'a weekend course, and usually run by the employer' }
    if (PLAIN_LICENCE.test(r.text) && !COMMERCIAL.test(r.text))
      return { requirement: r, verdict: 'matched', why: 'holds one, with a clean record' }

    return { requirement: r, verdict: 'unstated', why: 'not something the profile can answer' }
  })
}

export const countGaps = (gaps: Gap[]) => ({
  matched: gaps.filter((g) => g.verdict === 'matched').length,
  soft: gaps.filter((g) => g.verdict === 'soft-gap').length,
  hard: gaps.filter((g) => g.verdict === 'hard-gap').length,
  unstated: gaps.filter((g) => g.verdict === 'unstated').length,
})
