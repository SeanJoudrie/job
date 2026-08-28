import type { Job, Source } from '../src/types'
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
}

const iso = (v: unknown): string | null => {
  if (typeof v === 'number') return new Date(v).toISOString().slice(0, 10)
  if (typeof v === 'string' && v) {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
  }
  return null
}

export async function fetchBoard(board: Board): Promise<Raw[]> {
  if (board.ats === 'greenhouse') {
    const data = (await getJson(`https://boards-api.greenhouse.io/v1/boards/${board.token}/jobs?content=true`)) as {
      jobs?: { id: number; title: string; absolute_url: string; location?: { name?: string }; content?: string; updated_at?: string; first_published?: string }[]
    }
    return (data.jobs ?? []).map((j) => ({
      id: `greenhouse:${board.token}:${j.id}`,
      source: 'greenhouse' as Source,
      company: board.name,
      title: j.title ?? '',
      url: j.absolute_url,
      descText: htmlToText(j.content ?? ''),
      locationRaw: j.location?.name ?? '',
      payHint: '',
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
        title: j.text ?? '',
        url: j.hostedUrl,
        descText: [j.descriptionPlain ?? '', lists, j.additionalPlain ?? ''].join('\n').trim(),
        locationRaw: (j.categories?.allLocations ?? []).join('; ') || (j.categories?.location ?? ''),
        payHint: sal?.min ? `$${sal.min} - $${sal.max ?? sal.min} per ${interval || 'year'}` : '',
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
    title: j.title ?? '',
    url: j.jobUrl ?? j.applyUrl ?? '',
    descText: j.descriptionPlain ?? '',
    locationRaw: [j.location ?? '', ...(j.secondaryLocations ?? []).map((s) => s.location ?? '')].filter(Boolean).join('; '),
    payHint: j.compensation?.scrapeableCompensationSalarySummary ?? '',
    postedAt: iso(j.publishedAt),
  }))
}

export type { Raw }
