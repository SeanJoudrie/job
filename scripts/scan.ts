import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { BOARDS } from '../src/lib/companies'
import { dedupe } from '../src/lib/dedupe'
import { industryOf } from '../src/lib/industry'
import { HOME, isRemote, nearestMiles, parseLocations } from '../src/lib/location'
import { parsePay } from '../src/lib/pay'
import { countGaps, gapsFor, parseRequirements } from '../src/lib/requirements'
import { classifyFamilies } from '../src/lib/roles'
import type { Job } from '../src/types'
import { fetchBoard, fetchUsaJobs, type Raw } from './sources'

/**
 * The nightly scan.
 *
 * Slow on purpose. Full descriptions rather than list summaries, every link
 * checked, every board walked — accuracy over speed is a stated principle of
 * this project and this is the file that spends it.
 *
 * It also carries the previous run forward, which is what makes posting age and
 * repost detection possible: a job that vanishes and returns is a dead req, and
 * that fact only exists if something remembers the earlier scans.
 */

const DIR = 'public/data'
const OUT = `${DIR}/jobs.json`
/**
 * The only file that is committed.
 *
 * The full scan is 8.7 MB, and committing that nightly would push the repo
 * past a gigabyte within the year for no benefit — the postings are public and
 * can be refetched. What cannot be refetched is when a job was FIRST seen and
 * how often it has come back, which is the whole basis of repost and dead-req
 * detection. That history is a few tens of kilobytes, so it is kept and the
 * rest is rebuilt at deploy time.
 */
const HISTORY = 'data/history.json'
type Seen = { firstSeen: string; lastSeen: string; scans: number; reposts: number; linkOk?: boolean | null; linkAt?: string }
/**
 * Descriptions are ~7 KB each and the whole set is 8.5 MB. The index alone is
 * 346 KB gzipped and loads instantly; descriptions are only needed when a job
 * is opened or scored, so they go into buckets that can be fetched one at a
 * time instead of all at once on a phone's data plan.
 */
export const DESC_CHUNKS = 16
export const chunkOf = (id: string) => {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h) % DESC_CHUNKS
}
/** Scanned wider than the 25-mile default so the radius can be widened later. */
const MAX_MILES = 60
const TODAY = new Date().toISOString().slice(0, 10)
/** Matches the app's default; only used to precompute gap counts for the index. */
const PROFILE = { years: 5, degree: 'bachelor' as const, clearance: 'none' as const }

/** Cheap pre-filter so sources that pay per description do not pay for jobs we drop. */
const inRange = (locationRaw: string, region?: string): boolean => {
  if (!locationRaw) return true
  const locations = parseLocations(locationRaw, HOME)
  if (locations.some((l) => l.remote)) return true
  const miles = nearestMiles(locations)
  // Unresolvable is kept: it may be a facility name that the region fallback
  // will place later, and dropping it here would be dropping it forever.
  if (miles === null) return !region ? true : (nearestMiles(parseLocations(region, HOME)) ?? 1e9) <= MAX_MILES
  return miles <= MAX_MILES
}

function previous(): Record<string, Seen> {
  if (!existsSync(HISTORY)) return {}
  try {
    return JSON.parse(readFileSync(HISTORY, 'utf8')) as Record<string, Seen>
  } catch {
    return {}
  }
}

function enrich(raw: Raw): Job | null {
  let locations = parseLocations(raw.locationRaw, HOME)
  let miles = nearestMiles(locations)
  const remote = isRemote(locations)

  // A facility name resolves to nowhere. For an employer that operates in one
  // region, that is still a job in that region — the alternative was dropping
  // two thousand hospital roles because the field said "Anna Jaques Hospital".
  if (!remote && miles === null && raw.regionHint) {
    const fallback = parseLocations(raw.regionHint, HOME)
    const approx = nearestMiles(fallback)
    if (approx !== null) {
      locations = locations.length
        ? locations.map((l, i) => (i === 0 ? { ...l, ...fallback[0], raw: l.raw, approx: true } : l))
        : fallback.map((l) => ({ ...l, approx: true }))
      miles = approx
    }
  }

  // Anything beyond the scan radius and not remote is dropped here rather than
  // shipped to a phone. The pool stays a size a phone can actually hold.
  if (!remote && (miles === null || miles > MAX_MILES)) return null

  const pay = parsePay(raw.payHint) ?? parsePay(raw.descText)
  return {
    id: raw.id,
    source: raw.source,
    company: raw.company,
    sector: raw.sector,
    title: raw.title,
    url: raw.url,
    descText: raw.descText,
    locations,
    miles,
    remote,
    pay,
    requirements: parseRequirements(raw.descText),
    families: classifyFamilies(raw.title, raw.descText, raw.company),
    postedAt: raw.postedAt,
    firstSeen: TODAY,
    lastSeen: TODAY,
    scans: 1,
    reposts: 0,
    alsoOn: [],
    linkOk: null,
  }
}

/**
 * Check every apply link, and be careful about what counts as dead.
 *
 * The first version marked anything that was not a 2xx as dead, and flagged 146
 * working jobs — every one of them returned 200 when checked by hand. Boards
 * rate-limit under a concurrent sweep, and a 429 was being reported to the
 * owner as "this job is gone". Telling someone a live job is dead is the worst
 * direction to be wrong in, so now only a 404 or a 410 is dead, everything else
 * is an honest unknown, and a transient failure gets a second try.
 */
const DEAD_STATUS = new Set([404, 410])

async function checkLinks(jobs: Job[], concurrency = 4): Promise<void> {
  let cursor = 0

  const probe = async (url: string): Promise<boolean | null> => {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 20000)
    try {
      const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctl.signal })
      if (DEAD_STATUS.has(res.status)) return false
      if (res.status < 400) return true
      return null // rate limited, blocked, or broken upstream — not evidence of anything
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  const worker = async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++]
      if (!job.url) {
        job.linkOk = null
        continue
      }
      let verdict = await probe(job.url)
      // One retry, because a single refusal under a sweep says more about the
      // sweep than about the job.
      if (verdict === null) {
        await new Promise((r) => setTimeout(r, 1500))
        verdict = await probe(job.url)
      }
      job.linkOk = verdict
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
}

async function main() {
  const seen = previous()
  const raws: Raw[] = []

  for (const board of BOARDS) {
    try {
      const rows = await fetchBoard(board, (loc) => inRange(loc, board.region))
      raws.push(...rows)
      console.log(`  ${board.name.padEnd(20)} ${String(rows.length).padStart(5)} postings`)
    } catch (err) {
      console.log(`  ${board.name.padEnd(20)}     ! ${(err as Error).message}`)
    }
  }

  // Federal, where veteran preference is scored rather than decorative.
  try {
    const federal = await fetchUsaJobs('Boston, Massachusetts', MAX_MILES)
    if (federal.length) {
      raws.push(...federal)
      console.log(`  ${'USAJOBS'.padEnd(20)} ${String(federal.length).padStart(5)} postings`)
    } else {
      console.log(`  ${'USAJOBS'.padEnd(20)}     - skipped (set USAJOBS_KEY and USAJOBS_EMAIL)`)
    }
  } catch (err) {
    console.log(`  ${'USAJOBS'.padEnd(20)}     ! ${(err as Error).message}`)
  }

  const enriched = raws.map(enrich).filter((j): j is Job => j !== null)
  console.log(`\n  ${raws.length} scanned -> ${enriched.length} within ${MAX_MILES} miles or remote`)

  // Carry the history forward. This is where dead reqs become visible.
  for (const job of enriched) {
    const before = seen[job.id]
    if (!before) continue
    job.firstSeen = before.firstSeen
    job.scans = before.scans + 1
    // Gone for a while and back again is the repost signal.
    const gapDays = (Date.parse(TODAY) - Date.parse(before.lastSeen)) / 86_400_000
    job.reposts = before.reposts + (gapDays > 14 ? 1 : 0)
  }

  const merged = dedupe(enriched)
  console.log(`  ${enriched.length} -> ${merged.length} after merging duplicates`)

  // Re-checking every link every night is the slowest thing here and almost
  // all of it is wasted: a link that worked yesterday almost always works
  // today. New postings are checked, and everything else weekly.
  const RECHECK_DAYS = 7
  const stale = merged.filter((job) => {
    const before = seen[job.id]
    if (!before || before.linkOk === undefined || !before.linkAt) return true
    if (before.linkOk !== true) return true
    return (Date.parse(TODAY) - Date.parse(before.linkAt)) / 86_400_000 >= RECHECK_DAYS
  })
  for (const job of merged) {
    const before = seen[job.id]
    if (before?.linkOk !== undefined) job.linkOk = before.linkOk
  }
  console.log(`  checking ${stale.length} apply links (${merged.length - stale.length} still fresh)...`)
  await checkLinks(stale)
  const dead = merged.filter((j) => j.linkOk === false).length
  const unknown = merged.filter((j) => j.linkOk === null).length
  console.log(`  ${dead} genuinely dead (404/410), ${unknown} could not be checked`)

  // A near-empty scan means the network or a board changed, not that the job
  // market vanished. Failing here keeps the last good deploy live rather than
  // replacing it with an empty board that looks like a working one.
  const FLOOR = 50
  if (merged.length < FLOOR) {
    console.error(`\n  only ${merged.length} jobs survived — refusing to publish (floor is ${FLOOR}).`)
    process.exit(2)
  }

  mkdirSync(DIR, { recursive: true })

  /**
   * The index carries only what a row needs.
   *
   * Full location arrays were 9 MB of a 13.5 MB index — federal postings list
   * dozens of places each, every one with coordinates. Only the nearest is ever
   * shown or filtered on. Requirement lines classified `other` were another
   * 62% of the rest and render as "not something the profile can answer", so
   * they stay in the descriptions rather than the index.
   *
   * The industry classification goes the same way as the gap counts: worked out
   * here against the full description and stored, because the evidence that
   * separates a museum's Collections Specialist from a debt collector is in the
   * body and the body does not survive the trim. Only the id is stored — the
   * weight depends on the month it is read in.
   */
  const index = merged.map(({ descText, locations, requirements, ...rest }) => {
    const resolved = locations.filter((l) => typeof l.miles === 'number')
    const nearest = resolved.length ? resolved.reduce((a, b) => (a.miles! <= b.miles! ? a : b)) : locations[0]
    return {
      ...rest,
      locations: nearest ? [nearest] : [],
      placeCount: locations.length,
      requirements: requirements.filter((r) => r.kind !== 'other'),
      // Counted from the full list, before the trim below throws text away.
      gaps: countGaps(gapsFor(requirements, PROFILE)),
      industry: (({ id, why }) => ({ id, why }))(
        industryOf({ title: rest.title, company: rest.company, body: descText, sector: rest.sector, families: rest.families }),
      ),
      preview: descText.slice(0, 280),
    }
  })
  writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: merged.length, chunks: DESC_CHUNKS, jobs: index }))

  const buckets: Record<string, string>[] = Array.from({ length: DESC_CHUNKS }, () => ({}))
  for (const job of merged) buckets[chunkOf(job.id)][job.id] = job.descText
  buckets.forEach((bucket, i) => writeFileSync(`${DIR}/desc-${String(i).padStart(2, '0')}.json`, JSON.stringify(bucket)))

  // Keep the history for everything ever seen, not just what is live today —
  // a job has to be remembered while it is gone for its return to count.
  const history: Record<string, Seen> = { ...seen }
  for (const job of merged) {
    const before = seen[job.id]
    history[job.id] = {
      firstSeen: job.firstSeen, lastSeen: TODAY, scans: job.scans, reposts: job.reposts,
      linkOk: job.linkOk,
      linkAt: stale.includes(job) ? TODAY : (before?.linkAt ?? TODAY),
    }
  }
  mkdirSync('data', { recursive: true })
  writeFileSync(HISTORY, JSON.stringify(history))

  const kb = (n: number) => `${Math.round(n / 1024)} KB`
  console.log(`\n  wrote ${merged.length} jobs`)
  console.log(`    ${OUT}  ${kb(statSync(OUT).size)} (index)`)
  console.log(`    ${DESC_CHUNKS} description chunks, ${kb(buckets.reduce((t, _b, i) => t + statSync(`${DIR}/desc-${String(i).padStart(2, '0')}.json`).size, 0) / DESC_CHUNKS)} each`)
  console.log(`    ${HISTORY}  ${kb(statSync(HISTORY).size)} (the only file committed)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
