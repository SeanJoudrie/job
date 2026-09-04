export type Source = 'greenhouse' | 'lever' | 'ashby' | 'workday' | 'workable' | 'smartrecruiters' | 'usajobs' | 'paste' | 'silkroad'

export type Period = 'hour' | 'day' | 'week' | 'month' | 'year'

/** What a posting says about money. `null` means it said nothing we could trust. */
export type Pay = {
  min: number | null
  max: number | null
  period: Period
  raw: string
} | null

export type Hardness = 'hard' | 'soft'
export type ReqKind = 'education' | 'experience' | 'clearance' | 'citizenship' | 'skill' | 'other'

export type Requirement = {
  text: string
  kind: ReqKind
  hardness: Hardness
  /** years demanded, when the line is about experience */
  years?: number
  degree?: Degree
  /** 'active' must already be held; 'obtainable' only needs eligibility */
  clearance?: 'active' | 'obtainable'
}

export type Degree = 'highschool' | 'associate' | 'bachelor' | 'master' | 'doctorate'

export type Loc = {
  raw: string
  city?: string
  state?: string
  remote: boolean
  hybrid: boolean
  lat?: number
  lon?: number
  /** distance from home, when it could be resolved */
  miles?: number
  /** true when the distance came from the employer's region, not the posting */
  approx?: boolean
}

export type Job = {
  id: string
  source: Source
  company: string
  /** which kind of employer — feeds how gettable the job is judged to be */
  sector: import('./lib/companies').Sector
  title: string
  url: string
  descText: string
  locations: Loc[]
  /** closest resolved location, the one distance rules use */
  miles: number | null
  remote: boolean
  pay: Pay
  requirements: Requirement[]
  families: string[]
  postedAt: string | null
  firstSeen: string
  lastSeen: string
  /** how many separate scans have seen this posting */
  scans: number
  /** times it vanished and came back — the dead-req signal */
  reposts: number
  /** other boards carrying the same job, after merging */
  alsoOn: { source: Source; url: string }[]
  linkOk: boolean | null
  /** first slice of the description, so the index alone can render a row */
  preview?: string
  /** how many places the posting named, before the index kept only the nearest */
  placeCount?: number
  /**
   * Gap counts computed at scan time from the FULL requirement list.
   * The index drops unclassifiable requirement lines to stay small, which left
   * 38% of jobs looking like they had no requirements at all and defaulted the
   * reachability axis to a constant. The counts survive the trim.
   */
  gaps?: { matched: number; soft: number; hard: number; unstated: number }
  /**
   * Case-file industry, classified at scan time from the FULL description.
   * Only the id is stored: the weight is resolved at read time because the
   * seasonal rule depends on today's date, and a scan from October must not
   * still be paying out 6.5 for groundskeeping in January.
   */
  industry?: { id: string; why: string }
}

export type AppliedStatus = 'applied' | 'replied' | 'interviewing' | 'offer' | 'rejected' | 'ghosted'

/**
 * What was true about the job at the moment it was sent.
 *
 * Captured, never typed. A form asking for thirteen fields after every
 * application is a form that gets filled in for the first four and then never
 * again, and a half-filled outcome log is worse than none — it looks like
 * evidence. Everything here is read off the job and the app's own state when
 * the box is ticked. `referral` is the single exception, because nothing in the
 * index knows whether a human passed the resume along, and it is also the one
 * field that has ever correlated with an interview.
 *
 * It is a snapshot on purpose. The scoring model changes; this must not change
 * with it, or last winter's applications get re-judged by this winter's weights
 * and the record stops being a record.
 */
export type AppliedCtx = {
  /** Which board it was sent through. */
  source: Source
  /** How many boards carried the same posting — a proxy for how contested it is. */
  boards: number
  sector: string
  /** Resume/letter pack, and the industry the table put it in. */
  pack: string
  industry: string
  /** A–E, from the industry weight. E is an excluded field he applied to anyway. */
  tier: string
  /** Fit score and pool percentile, both as they stood that day. */
  score: number
  match: number
  hourly: number | null
  minutes: number | null
  remote: boolean
  /** Was a written cover letter attached, and which resume variant. */
  letter: boolean
  variant: 'full' | 'stripped'
  /** Days the posting had already been live. A 60-day-old req is usually filled. */
  daysLive: number | null
  /** The eleven axis scores, so the weights can be checked against outcomes. */
  axes?: Record<string, number>
}

export type Applied = {
  key: string
  title: string
  company: string
  url: string
  at: string
  status: AppliedStatus
  variant?: 'full' | 'stripped'
  note?: string
  /** Captured at apply time. Absent on entries logged before this existed. */
  ctx?: AppliedCtx
  /** Stamped the first time the status leaves `applied`. Gives days-to-first-response. */
  respondedAt?: string
  /** Set by hand: did a person put this in front of someone. */
  referral?: boolean
}
