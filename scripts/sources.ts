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
  if (board.ats === 'silkroad') return fetchSilkRoad(board)
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
      body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: board.search ?? '' }),
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
  //
  // Retried, because it was failing quietly and at scale. A single attempt each
  // left 562 postings — a fifth of the whole pool, 465 of them Beth Israel and
  // 97 Tufts Medicine — with no description at all: no requirements, nothing
  // for the posture, hours or industry parsers to read, and no way to tell from
  // the app that anything was missing. Six workers against one tenant is enough
  // to get throttled, and a throttle looked exactly like a job with nothing to
  // say. Three attempts with backoff, and the failures are counted and printed
  // rather than swallowed.
  let cursor = 0
  let failed = 0
  const ATTEMPTS = 3
  const worker = async () => {
    while (cursor < near.length) {
      const row = near[cursor++]
      const id = row.id.split(':').pop()
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        try {
          const res = await fetch(`${api}/job/${id}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000) })
          if (!res.ok) {
            // 404 means the posting is gone; retrying will not bring it back.
            if (res.status === 404 || res.status === 410) break
            throw new Error(String(res.status))
          }
          const d = (await res.json()) as { jobPostingInfo?: { jobDescription?: string; startDate?: string } }
          row.descText = htmlToText(d.jobPostingInfo?.jobDescription ?? '')
          row.postedAt = iso(d.jobPostingInfo?.startDate)
          break
        } catch {
          if (attempt === ATTEMPTS) { failed++; break }
          await new Promise((r) => setTimeout(r, 400 * 2 ** attempt))
        }
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  const blank = near.filter((r) => !r.descText.trim()).length
  if (blank) console.log(`    ${blank} of ${near.length} postings returned no description (${failed} after ${ATTEMPTS} attempts)`)
  return near.filter((r) => r.title)
}

/**
 * SilkRoad, which is what Boston University runs on.
 *
 * No JSON anywhere: a paginated HTML list, ten to a page, and a detail page per
 * posting. Both are server-rendered, which is the whole reason this is worth
 * doing — Tufts is on iCIMS and MIT on a JavaScript app, and neither returns a
 * posting to anything that is not a browser. BU is the largest employer within
 * range that publishes readable HTML, and its first page of listings is three
 * Administrative Coordinators.
 *
 * The detail page is sliced between two class markers rather than parsed as a
 * tree. That is fragile against a redesign, so the scan's data check reports a
 * board that returns nothing, and this returns an empty list rather than
 * throwing — one employer changing its markup must not take the run down.
 */
/**
 * BU's hiring range, rejoined.
 *
 * "Expected Hiring Range Minimum $24.00 ... Maximum $27.00" is one band written
 * as two separately labelled figures, so parsePay sees only the first and reads
 * the BOTTOM of the range — the one number a pay floor must never be compared
 * against. Every BU posting failed a $25 floor on its own minimum.
 *
 * The unit is never stated and BU uses all three: $24.00 hourly, $45,000.00
 * annual, and $2,091.00 against a salary grade that is monthly or biweekly with
 * nothing on the page to say which. Magnitude settles the first two and cannot
 * settle the third, so the third is left out and the job reads "no pay listed".
 * A wrong number is worse than none — it silently filters the job in or out.
 *
 * Labelled "Pay range" so that it still wins if it is ever parsed alongside the
 * description rather than ahead of it: parsePay ranks a figure sitting next to
 * a pay word above a merely joined range, and the page's own wording contains
 * "Range".
 */
export function silkRoadPayHint(body: string): string {
  const num = (v: string | undefined) => (v ? Number(v.replace(/,/g, '')) : null)
  const min = num(body.match(/Expected Hiring Range Minimum\s*\$([\d,.]+)/i)?.[1])
  const max = num(body.match(/Expected Hiring Range Maximum\s*\$([\d,.]+)/i)?.[1])
  if (min === null || max === null) return ''
  const unit = max < 250 ? ' per hour' : max >= 15_000 ? ' per year' : ''
  return unit ? `Pay range: $${min} - $${max}${unit}` : ''
}

async function fetchSilkRoad(board: Extract<Board, { ats: 'silkroad' }>): Promise<Raw[]> {
  const base = `https://jobs.silkroad.com/${board.token}/External`
  const UA = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36' }
  const text = async (url: string) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) })
        if (res.ok) return await res.text()
        if (res.status === 404 || res.status === 410) return ''
        throw new Error(String(res.status))
      } catch {
        if (attempt === 3) return ''
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt))
      }
    }
    return ''
  }

  // Walk the pager until a page introduces nothing new. The pager itself only
  // ever shows two page links, so it cannot be read for a total.
  const ids = new Set<string>()
  for (let page = 1; page <= 60; page++) {
    const before = ids.size
    for (const m of (await text(`${base}?page=${page}`)).matchAll(/\/jobs\/(\d+)/g)) ids.add(m[1])
    if (ids.size === before) break
  }

  const out: Raw[] = []
  const list = [...ids]
  let cursor = 0
  const worker = async () => {
    while (cursor < list.length) {
      const id = list[cursor++]
      const url = `${base}/jobs/${id}`
      const page = await text(url)
      const marker = page.indexOf('sr-job-detail__description')
      if (marker < 0) continue
      // Past the end of the attribute, or the class name itself lands in the
      // preview text and is the first thing shown on the row.
      const from = page.indexOf('>', marker) + 1
      const to = page.indexOf('sr-job-detail__cta', from)
      const body = htmlToText(page.slice(from, to > from ? to : from + 40_000))
      const title = (page.match(/sr-job-detail__job-title[^>]*>([^<]{3,140})/)?.[1] ?? '').trim()
      if (!title) continue

      /*
       * "Expected Hiring Range Minimum $24.00 ... Maximum $27.00" is one band
       * written as two separately labelled figures, so parsePay sees only the
       * first and reads the BOTTOM of the range — the one number a pay floor
       * must never be compared against. Rejoined here.
       *
       * The unit is never stated, and BU uses all three: $24.00 hourly,
       * $45,000.00 annual and $2,091.00 for a salary grade that is monthly or
       * biweekly with nothing on the page to say which. Magnitude settles the
       * first two and cannot settle the third, so the third is left out
       * entirely and the job reads as "no pay listed". A wrong number is worse
       * than no number: it silently filters the job in or out.
       */

      out.push({
        id: `silkroad:${board.token}:${id}`,
        source: 'silkroad' as Source,
        company: board.name,
        sector: board.sector,
        title: decodeEntities(title),
        url,
        descText: body,
        locationRaw: (body.match(/Job Location\s*\n?\s*([^\n]{3,60})/i)?.[1] ?? '').trim(),
        payHint: silkRoadPayHint(body),
        regionHint: board.region,
        postedAt: iso(body.match(/Posted Date\s*\n?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1] ?? undefined),
      })
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  return out
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
        /** The grade ladder, stated outright. Text carries it on only 42%. */
        LowGrade?: string; HighGrade?: string
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
    /*
     * The grade, from the field rather than the prose.
     *
     * It is the hardest requirement on a federal posting — an HR specialist
     * applies it before a human reads anything — and the only one nothing here
     * could see. The full description repeats it in 42% of postings; this field
     * carries it on all of them. The high end is taken because a ladder posting
     * fills at the top far more often than the bottom.
     */
    const grade = Math.max(Number(details?.HighGrade ?? 0), Number(details?.LowGrade ?? 0)) || null
    const extras = [
      grade && grade >= 1 && grade <= 15 ? `Advertised at GS-${grade}.` : '',
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

/**
 * The Massachusetts Board of Library Commissioners job board.
 *
 * Every public library in the state posts here, plus the academic and special
 * libraries, and it is the answer to a measured gap: the whole pool carried
 * eight library, museum and archives postings, in a category the case file puts
 * near the top of the list.
 *
 * It is a PHP table, which is better than it sounds — it is server-rendered,
 * and it hands over structured columns that no ATS bothers with: the
 * institution, the town, the library type, whether it is full or part time, and
 * the education level the employer itself has classified the job at. The detail
 * page states the salary under its own heading rather than buried in prose.
 *
 * That education column is the reason this is worth doing carefully rather than
 * quickly. Half of these want an MLS, which is a two-year degree he does not
 * have — and the other half are library assistants, circulation staff and
 * technicians who want a high school diploma. Read as one undifferentiated
 * "library jobs" feed it would be half noise. Parsed, the requirement flows
 * into the same degree machinery every other board uses, so the assistant roles
 * rank and the librarian roles fall where they belong.
 */

const MBLC_BASE = 'https://mblc.state.ma.us/jobs/find_jobs'

/** Map the board's own library-type column onto an employer kind. */
export function mblcSector(libraryType: string): Job['sector'] {
  const t = libraryType.toLowerCase()
  if (t.includes('academic')) return 'university'
  if (t.includes('special') || t.includes('corporate')) return 'nonprofit'
  // Public and school libraries are municipal. Never `gov` — that means federal
  // here, and it would both misclassify the employer and hand the job the
  // federal veterans' preference bonus it has not earned.
  return 'municipal'
}

/**
 * The town column carries a bare name — "Northbridge", "Webster" — because the
 * board is the Massachusetts one and the state goes without saying. It does not
 * go without saying to a gazetteer: a name with no state resolves to nothing,
 * and the scan drops anything it cannot place. Every one of these would have
 * been fetched, parsed, scored and then silently thrown away.
 *
 * Out-of-state postings name their state — "Narragansett, RI", "Manchester, NH"
 * — so they are left exactly as they are and the radius filter handles them.
 */
export function mblcPlace(town: string): string {
  const t = town.trim()
  if (!t) return ''
  return /,\s*[A-Z]{2}\b/.test(t) ? t : `${t}, MA`
}

export type MblcRow = {
  id: string
  title: string
  town: string
  institution: string
  libraryType: string
  posted: string
  jobType: string
  education: string
}

/**
 * Pull the rows out of the results table.
 *
 * Matched on the `data-title` attributes rather than on column position. The
 * table ships with two columns marked `never` — hidden at every width — so
 * counting `<td>`s means silently reading the wrong field the day a column is
 * shown or hidden. The attribute is the column's own name and moves with it.
 */
export function parseMblcRows(html: string): MblcRow[] {
  const out: MblcRow[] = []
  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = new Map<string, string>()
    for (const cell of row[1].matchAll(/<td[^>]*data-title="([^"]+)"[^>]*>([\s\S]*?)<\/td>/g)) {
      cells.set(cell[1].toLowerCase(), decodeEntities(cell[2].replace(/<[^>]*>/g, '').trim()))
    }
    const id = row[1].match(/display_jobs\.php\?job_id=(\d+)/)?.[1]
    // Posted by hand by a librarian, so titles arrive with stray leading
    // punctuation — ": Archives and Records Management Assistant" is live on
    // the board right now, and it reads as a bug on the row.
    const title = cells.get('title')?.replace(/^[\s:;,–—-]+/, '').trim()
    if (!id || !title) continue
    out.push({
      id,
      title,
      town: cells.get('city/town') ?? '',
      institution: cells.get('institution') ?? '',
      libraryType: cells.get('library type') ?? '',
      posted: cells.get('date posted') ?? '',
      jobType: cells.get('job type') ?? '',
      education: cells.get('education') ?? '',
    })
  }
  return out
}

/**
 * The salary, from its own heading.
 *
 * "$21.00 / hour" sits under an `<h4>Salary</h4>` with no prose around it, so
 * this is the rare board where the number needs no guessing. Returned as raw
 * text for parsePay to read, including the unit, because the unit is the thing
 * that is usually missing and here it is not.
 */
export function mblcSalary(html: string): string {
  const at = html.search(/<h4[^>]*>\s*Salary\s*<\/h4>/i)
  if (at < 0) return ''
  const after = html.slice(at, at + 600).replace(/<h4[^>]*>\s*Salary\s*<\/h4>/i, '')
  const upToNext = after.split(/<h4/i)[0]
  return htmlToText(upToNext).replace(/\s+/g, ' ').trim().slice(0, 120)
}

/** "09/04/26" — two-digit year, and this century. */
export function mblcDate(posted: string): string | null {
  const m = posted.match(/^(\d{2})\/(\d{2})\/(\d{2})$/)
  return m ? `20${m[3]}-${m[1]}-${m[2]}` : null
}

export async function fetchMblc(keep: Keep = () => true): Promise<Raw[]> {
  const UA = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36' }
  const text = async (url: string) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) })
        if (res.ok) return await res.text()
        if (res.status === 404 || res.status === 410) return ''
        throw new Error(String(res.status))
      } catch {
        if (attempt === 3) return ''
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt))
      }
    }
    return ''
  }

  const rows = parseMblcRows(await text(`${MBLC_BASE}/`))
  // The board is regional and carries Rhode Island and New Hampshire postings.
  // Filtered on the town before any detail page is fetched, same as everywhere.
  const near = rows.filter((r) => keep(mblcPlace(r.town)))

  const out: Raw[] = []
  let cursor = 0
  const worker = async () => {
    while (cursor < near.length) {
      const row = near[cursor++]
      const url = `${MBLC_BASE}/display_jobs.php?job_id=${row.id}`
      const page = await text(url)
      if (!page) continue
      // The education level is the employer's own classification and the single
      // most useful line on the page, so it is stated in words the requirement
      // parser already understands rather than left as a table cell it will
      // never see.
      const body = [
        htmlToText(page.slice(page.indexOf('<h4'), page.length)).replace(/\s+/g, ' ').trim(),
        row.education ? `\nRequirements: ${row.education} required.` : '',
        row.jobType ? `\n${row.jobType} position.` : '',
      ].join('')
      out.push({
        id: `mblc:${row.id}`,
        source: 'mblc' as Source,
        company: row.institution || 'Massachusetts library',
        sector: mblcSector(row.libraryType),
        title: row.title,
        url,
        descText: body,
        locationRaw: mblcPlace(row.town),
        payHint: mblcSalary(page),
        postedAt: mblcDate(row.posted),
      })
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  return out.filter((r) => r.title)
}
