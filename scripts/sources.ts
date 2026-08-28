import type { Job, Source } from '../src/types'
import { LICENSED_CLINICAL } from '../src/lib/industry'
import type { Board } from '../src/lib/companies'

/** Greenhouse double-escapes its HTML, so entities have to come off first. */
const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  // Every one of these turned up in real postings. `mdash` is the expensive
  // one: "$86,000 &mdash; $114,000" reads as a single salary rather than a
  // range if it survives, which under-reports pay on a third of the board.
  mdash: '-', ndash: '-', minus: '-', hellip: '...', middot: '·', bull: '•',
  rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', sbquo: ',', deg: '°',
  reg: '', copy: '', trade: '', times: 'x', frac12: '.5', laquo: '"', raquo: '"',
}
export function decodeEntities(s: string): string {
  let out = s
  for (let i = 0; i < 2; i++) {
    out = out.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, name: string) => {
      const key = name.toLowerCase()
      if (ENTITIES[key] !== undefined) return ENTITIES[key]
      if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16))
      if (key.startsWith('#')) return String.fromCodePoint(Number(key.slice(1)))
      return m
    })
  }
  return out
}

/** Keep the line breaks — the requirements parser reads bullets line by line. */
/**
 * Curly quotes and long dashes are everywhere in real postings and they break
 * naive patterns: "Bachelor’s" does not match /bachelor'?s/, and an em dash
 * between two numbers is not a range separator. Flattened once, here, so no
 * downstream parser has to remember.
 */
export function normaliseTypography(s: string): string {
  return s
    .replace(/[\u2018\u2019\u201B\u02BC]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
}

export function htmlToText(html: string): string {
  return normaliseTypography(decodeEntities(html))
    .replace(/<\s*(?:br|\/li|\/p|\/div|\/h[1-6]|\/tr)\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function getJson(url: string, timeoutMs = 45000): Promise<unknown> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'job-scanner (personal use)' } })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

type Raw = Omit<Job, 'locations' | 'miles' | 'remote' | 'pay' | 'requirements' | 'families' | 'firstSeen' | 'lastSeen' | 'scans' | 'reposts' | 'alsoOn' | 'linkOk'> & {
  locationRaw: string
  payHint: string
  /** Used only when locationRaw names a facility rather than a place. */
  regionHint?: string
}

const iso = (v: unknown): string | null => {
  if (typeof v === 'number') return new Date(v).toISOString().slice(0, 10)
  if (typeof v === 'string' && v) {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
  }
  return null
}

/** Whether a location string is worth spending a description request on. */
export type Keep = (locationRaw: string) => boolean

/**
 * Roles requiring a clinical licence or certification this profile does not
 * hold. A hospital system posts thousands of them and each one costs a
 * description request, so they are skipped at the source rather than filtered
 * later — the scan does not spend ten minutes fetching jobs nobody can apply
 * for.
 *
 * The list itself lives with the industry table, so the scan and the scoring
 * cannot disagree about what is clinical. They did, and a surgical technologist
 * post reached the top twenty because of it.
 */
export const isLicensedClinical = (title: string) => LICENSED_CLINICAL.test(title)

export async function fetchBoard(board: Board, keep: Keep = () => true): Promise<Raw[]> {
  if (board.ats === 'workday') return fetchWorkday(board, keep)
  if (board.ats === 'workable') return fetchWorkable(board)
  if (board.ats === 'smartrecruiters') return fetchSmartRecruiters(board)

  if (board.ats === 'greenhouse') {
    const data = (await getJson(`https://boards-api.greenhouse.io/v1/boards/${board.token}/jobs?content=true`)) as {
      jobs?: { id: number; title: string; absolute_url: string; location?: { name?: string }; content?: string; updated_at?: string; first_published?: string }[]
    }
    return (data.jobs ?? []).map((j) => ({
      id: `greenhouse:${board.token}:${j.id}`,
      source: 'greenhouse' as Source,
      company: board.name,
      sector: board.sector,
      title: j.title ?? '',
      url: j.absolute_url,
      descText: htmlToText(j.content ?? ''),
      locationRaw: j.location?.name ?? '',
      payHint: '',
      regionHint: board.region,
      postedAt: iso(j.first_published ?? j.updated_at),
    }))
  }

  if (board.ats === 'lever') {
    const data = (await getJson(`https://api.lever.co/v0/postings/${board.token}?mode=json`)) as {
      id: string; text: string; hostedUrl: string; createdAt?: number; descriptionPlain?: string; additionalPlain?: string
      salaryRange?: { min?: number; max?: number; interval?: string; currency?: string }
      lists?: { text?: string; content?: string }[]
      categories?: { location?: string; allLocations?: string[] }
    }[]
    return (data ?? []).map((j) => {
      // Lever keeps the requirement bullets in `lists`, away from the description.
      const lists = (j.lists ?? []).map((l) => `${l.text ?? ''}\n${htmlToText(l.content ?? '')}`).join('\n')
      const sal = j.salaryRange
      const interval = (sal?.interval ?? '').replace('per-', '')
      return {
        id: `lever:${board.token}:${j.id}`,
        source: 'lever' as Source,
        company: board.name,
        sector: board.sector,
        title: j.text ?? '',
        url: j.hostedUrl,
        descText: [j.descriptionPlain ?? '', lists, j.additionalPlain ?? ''].join('\n').trim(),
        locationRaw: (j.categories?.allLocations ?? []).join('; ') || (j.categories?.location ?? ''),
        payHint: sal?.min ? `$${sal.min} - $${sal.max ?? sal.min} per ${interval || 'year'}` : '',
        regionHint: board.region,
        postedAt: iso(j.createdAt),
      }
    })
  }

  const data = (await getJson(`https://api.ashbyhq.com/posting-api/job-board/${board.token}?includeCompensation=true`)) as {
    jobs?: { id: string; title: string; jobUrl?: string; applyUrl?: string; location?: string; secondaryLocations?: { location?: string }[]
      isRemote?: boolean; publishedAt?: string; descriptionPlain?: string
      compensation?: { scrapeableCompensationSalarySummary?: string } }[]
  }
  return (data.jobs ?? []).map((j) => ({
    id: `ashby:${board.token}:${j.id}`,
    source: 'ashby' as Source,
    company: board.name,
    sector: board.sector,
    title: j.title ?? '',
    url: j.jobUrl ?? j.applyUrl ?? '',
    descText: j.descriptionPlain ?? '',
    locationRaw: [j.location ?? '', ...(j.secondaryLocations ?? []).map((s) => s.location ?? '')].filter(Boolean).join('; '),
    payHint: j.compensation?.scrapeableCompensationSalarySummary ?? '',
    postedAt: iso(j.publishedAt),
  }))
}

/**
 * Workday. Higher education, hospitals and the defence labs live here and
 * nowhere else, so without it a whole half of the target market is invisible.
 * The endpoint is a POST and paginates twenty at a time.
 */
async function fetchWorkday(board: Extract<Board, { ats: 'workday' }>, keep: Keep): Promise<Raw[]> {
  const base = `https://${board.token}.wd${board.wd}.myworkdayjobs.com`
  const api = `${base}/wday/cxs/${board.token}/${board.site}`
  const out: Raw[] = []
  // `total` is reported on the first page only; every later page says 0. An
  // earlier version compared against it each time and stopped after forty of
  // four hundred and eighty-eight.
  let total = Infinity

  for (let offset = 0; offset < 3000; offset += 20) {
    const res = await fetch(`${api}/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: '' }),
      signal: AbortSignal.timeout(45000),
    })
    if (!res.ok) break
    const page = (await res.json()) as {
      total?: number
      jobPostings?: { title?: string; externalPath?: string; locationsText?: string; postedOn?: string; bulletFields?: string[] }[]
    }
    if (offset === 0 && typeof page.total === 'number' && page.total > 0) total = page.total
    const rows = page.jobPostings ?? []
    if (rows.length === 0) break

    for (const j of rows) {
      const path = j.externalPath ?? ''
      out.push({
        id: `workday:${board.token}:${path.split('/').pop() ?? Math.random()}`,
        source: 'workday' as Source,
        company: board.name,
        sector: board.sector,
        title: j.title ?? '',
        url: `${base}/en-US/${board.site}${path}`,
        // The list view carries no description; it is fetched per posting below.
        descText: '',
        locationRaw: j.locationsText ?? '',
        payHint: '',
        regionHint: board.region,
        postedAt: null,
      })
    }
    if (out.length >= total || rows.length < 20) break
  }

  // Drop what is out of range BEFORE fetching descriptions. A hospital system
  // posts hundreds of roles and each description is its own request; filtering
  // first turns four hundred and eighty-eight calls into a few dozen.
  const near = out.filter((r) => keep(r.locationRaw) && !isLicensedClinical(r.title))

  // Workday only returns a description one posting at a time, and the parsers
  // are worth nothing without it. Slow, and that is the accepted trade.
  let cursor = 0
  const worker = async () => {
    while (cursor < near.length) {
      const row = near[cursor++]
      const id = row.id.split(':').pop()
      try {
        const res = await fetch(`${api}/job/${id}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000) })
        if (!res.ok) continue
        const d = (await res.json()) as { jobPostingInfo?: { jobDescription?: string; startDate?: string } }
        row.descText = htmlToText(d.jobPostingInfo?.jobDescription ?? '')
        row.postedAt = iso(d.jobPostingInfo?.startDate)
      } catch {
        /* a posting that will not load is still worth listing */
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  return near.filter((r) => r.title)
}

async function fetchWorkable(board: Extract<Board, { ats: 'workable' }>): Promise<Raw[]> {
  const data = (await getJson(`https://apply.workable.com/api/v1/widget/accounts/${board.token}?details=true`)) as {
    jobs?: { id?: string; shortcode?: string; title?: string; url?: string; application_url?: string
      city?: string; state?: string; telecommuting?: boolean
      description?: string; requirements?: string; benefits?: string; published_on?: string }[]
  }
  return (data.jobs ?? []).map((j) => ({
    id: `workable:${board.token}:${j.shortcode ?? j.id}`,
    source: 'workable' as Source,
    company: board.name,
    sector: board.sector,
    title: j.title ?? '',
    url: j.url ?? j.application_url ?? '',
    descText: htmlToText([j.description ?? '', j.requirements ?? ''].join('\n')),
    // city/state sit at the top level here; there is no nested location object.
    locationRaw: j.telecommuting ? 'Remote' : [j.city, j.state].filter(Boolean).join(', '),
    payHint: '',
    regionHint: board.region,
    postedAt: iso(j.published_on),
  }))
}

async function fetchSmartRecruiters(board: Extract<Board, { ats: 'smartrecruiters' }>): Promise<Raw[]> {
  const list = (await getJson(`https://api.smartrecruiters.com/v1/companies/${board.token}/postings?limit=100`)) as {
    content?: { id: string; name?: string; releasedDate?: string; location?: { city?: string; region?: string; remote?: boolean } }[]
  }
  const rows = list.content ?? []
  const out: Raw[] = rows.map((j) => ({
    id: `smartrecruiters:${board.token}:${j.id}`,
    source: 'smartrecruiters' as Source,
    company: board.name,
    sector: board.sector,
    title: j.name ?? '',
    url: `https://jobs.smartrecruiters.com/${board.token}/${j.id}`,
    descText: '',
    locationRaw: j.location?.remote ? 'Remote' : [j.location?.city, j.location?.region].filter(Boolean).join(', '),
    payHint: '',
    regionHint: board.region,
    postedAt: iso(j.releasedDate),
  }))
  let cursor = 0
  const worker = async () => {
    while (cursor < out.length) {
      const row = out[cursor++]
      const id = row.id.split(':').pop()
      try {
        const d = (await getJson(`https://api.smartrecruiters.com/v1/companies/${board.token}/postings/${id}`, 20000)) as {
          jobAd?: { sections?: Record<string, { text?: string }> }
        }
        const sections = d.jobAd?.sections ?? {}
        row.descText = htmlToText(Object.values(sections).map((x) => x?.text ?? '').join('\n'))
      } catch {
        /* keep the listing even when the detail call fails */
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  return out
}

/**
 * USAJOBS. Federal work, and the one channel where Guard service and veteran
 * preference are a scored advantage rather than a line a recruiter skims past.
 *
 * Needs a free key from developer.usajobs.gov, supplied as USAJOBS_KEY with the
 * registered address as USAJOBS_EMAIL — the API requires that address as the
 * User-Agent and rejects anything else. Without both the scan skips it and says
 * so rather than failing.
 */
const RATE: Record<string, 'hour' | 'day' | 'week' | 'month' | 'year'> = {
  PH: 'hour', PD: 'day', PW: 'week', PM: 'month', PA: 'year', PB: 'year',
}

export type UsaJobsItem = {
  MatchedObjectId?: string
  MatchedObjectDescriptor?: {
    PositionTitle?: string; PositionURI?: string; ApplyURI?: string[]
    OrganizationName?: string; DepartmentName?: string
    PositionLocation?: { LocationName?: string }[]
    QualificationSummary?: string
    PublicationStartDate?: string
    PositionRemuneration?: { MinimumRange?: string; MaximumRange?: string; RateIntervalCode?: string }[]
    UserArea?: {
      Details?: {
        JobSummary?: string; MajorDuties?: string[]; Requirements?: string
        Education?: string; Evaluations?: string; KeyRequirements?: string[]
        SecurityClearance?: string; HiringPathDisplay?: string[]; RemoteIndicator?: boolean
        TotalOpenings?: string
      }
    }
  }
}

/** Pure, so the shape can be checked without a key or a network call. */
export function mapUsaJobs(items: UsaJobsItem[]): Raw[] {
  const out: Raw[] = []
  for (const item of items) {
    const d = item.MatchedObjectDescriptor
    if (!d?.PositionTitle) continue
    const details = d.UserArea?.Details
    const pay = d.PositionRemuneration?.[0]
    const period = RATE[pay?.RateIntervalCode ?? ''] ?? 'year'
    // Federal postings put the qualifying text in Education, Requirements and
    // QualificationSummary rather than the summary. Reading only the summary
    // found requirements in 12% of them against 99% everywhere else.
    const paths = details?.HiringPathDisplay ?? []
    const clearance = details?.SecurityClearance ?? ''
    const extras = [
      paths.length ? `Hiring paths: ${paths.join(', ')}.` : '',
      // A stated level is an eligibility bar, not a held clearance: federal
      // hiring runs the investigation as part of onboarding.
      clearance && !/not required/i.test(clearance) ? `Security clearance: must be able to obtain ${clearance}.` : '',
    ]
    out.push({
      id: `usajobs:${item.MatchedObjectId}`,
      source: 'usajobs' as Source,
      company: d.OrganizationName ?? d.DepartmentName ?? 'Federal government',
      sector: 'gov',
      title: d.PositionTitle,
      // USAJOBS returns "https://www.usajobs.gov:443/job/123". Valid, but the
      // explicit port trips some in-app browsers and looks broken.
      url: (d.ApplyURI?.[0] ?? d.PositionURI ?? '').replace(/:443(?=\/|$)/, ''),
      descText: htmlToText(
        [
          details?.JobSummary ?? '',
          (details?.MajorDuties ?? []).join('\n'),
          d.QualificationSummary ?? '',
          details?.Education ?? '',
          details?.Requirements ?? '',
          (details?.KeyRequirements ?? []).join('\n'),
          ...extras,
        ].join('\n\n'),
      ),
      locationRaw: details?.RemoteIndicator
        ? 'Remote'
        : (d.PositionLocation ?? []).map((l) => l.LocationName ?? '').filter(Boolean).join('; '),
        payHint: pay?.MinimumRange ? `$${pay.MinimumRange} - $${pay.MaximumRange ?? pay.MinimumRange} per ${period}` : '',
      postedAt: iso(d.PublicationStartDate),
    })
  }
  return out
}

export async function fetchUsaJobs(locationName: string, radiusMiles: number): Promise<Raw[]> {
  const key = process.env.USAJOBS_KEY
  const email = process.env.USAJOBS_EMAIL
  if (!key || !email) return []

  const out: Raw[] = []
  for (let page = 1; page <= 10; page++) {
    const url = `https://data.usajobs.gov/api/search?LocationName=${encodeURIComponent(locationName)}&Radius=${radiusMiles}&ResultsPerPage=500&Page=${page}`
    const res = await fetch(url, {
      headers: { Host: 'data.usajobs.gov', 'User-Agent': email, 'Authorization-Key': key },
      signal: AbortSignal.timeout(45000),
    })
    if (!res.ok) throw new Error(`usajobs ${res.status}`)
    const data = (await res.json()) as { SearchResult?: { SearchResultCountAll?: number; SearchResultItems?: UsaJobsItem[] } }
    const items = data.SearchResult?.SearchResultItems ?? []
    if (items.length === 0) break
    out.push(...mapUsaJobs(items))
    if (out.length >= (data.SearchResult?.SearchResultCountAll ?? 0)) break
  }
  return out
}

export type { Raw }
