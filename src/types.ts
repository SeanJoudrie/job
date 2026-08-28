export type Source = 'greenhouse' | 'lever' | 'ashby' | 'workday' | 'workable' | 'smartrecruiters' | 'usajobs' | 'paste'

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
}

export type Applied = {
  key: string
  title: string
  company: string
  url: string
  at: string
  status: 'applied' | 'replied' | 'interviewing' | 'offer' | 'rejected' | 'ghosted'
  variant?: 'full' | 'stripped'
  note?: string
}
