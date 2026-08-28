import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { BOARDS } from '../src/lib/companies'
import { dedupe } from '../src/lib/dedupe'
import { HOME, isRemote, nearestMiles, parseLocations } from '../src/lib/location'
import { parsePay } from '../src/lib/pay'
import { parseRequirements } from '../src/lib/requirements'
import { classifyFamilies } from '../src/lib/roles'
import type { Job } from '../src/types'
import { fetchBoard, type Raw } from './sources'

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
type Seen = { firstSeen: string; lastSeen: string; scans: number; reposts: number }
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

/** Cheap pre-filter so sources that pay per description do not pay for jobs we drop. */
const inRange = (locationRaw: string): boolean => {
  if (!locationRaw) return true
  const locations = parseLocations(locationRaw, HOME)
  if (locations.some((l) => l.remote)) return true
  const miles = nearestMiles(locations)
  return miles === null || miles <= MAX_MILES
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
  const locations = parseLocations(raw.locationRaw, HOME)
  const miles = nearestMiles(locations)
  const remote = isRemote(locations)

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
    families: classifyFamilies(raw.title, raw.descText),
    postedAt: raw.postedAt,
    firstSeen: TODAY,
    lastSeen: TODAY,
    scans: 1,
    reposts: 0,
    alsoOn: [],
    linkOk: null,
  }
}

/** Every apply link is checked. A board full of dead links is worth less than none. */
async function checkLinks(jobs: Job[], concurrency = 8): Promise<void> {
  let cursor = 0
  const worker = async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++]
      if (!job.url) {
        job.linkOk = false
        continue
      }
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(), 15000)
      try {
        const res = await fetch(job.url, { method: 'GET', redirect: 'follow', signal: ctl.signal })
        job.linkOk = res.status < 400
      } catch {
        job.linkOk = null // couldn't tell; not the same as known-dead
      } finally {
        clearTimeout(timer)
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
}

async function main() {
  const seen = previous()
  const raws: Raw[] = []

  for (const board of BOARDS) {
    try {
      const rows = await fetchBoard(board, inRange)
      raws.push(...rows)
      console.log(`  ${board.name.padEnd(20)} ${String(rows.length).padStart(5)} postings`)
    } catch (err) {
      console.log(`  ${board.name.padEnd(20)}     ! ${(err as Error).message}`)
    }
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

  console.log('  checking every apply link...')
  await checkLinks(merged)
  const dead = merged.filter((j) => j.linkOk === false).length
  console.log(`  ${dead} dead links flagged`)

  // A near-empty scan means the network or a board changed, not that the job
  // market vanished. Failing here keeps the last good deploy live rather than
  // replacing it with an empty board that looks like a working one.
  const FLOOR = 50
  if (merged.length < FLOOR) {
    console.error(`\n  only ${merged.length} jobs survived — refusing to publish (floor is ${FLOOR}).`)
    process.exit(2)
  }

  mkdirSync(DIR, { recursive: true })

  const index = merged.map(({ descText, ...rest }) => ({ ...rest, preview: descText.slice(0, 280) }))
  writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: merged.length, chunks: DESC_CHUNKS, jobs: index }))

  const buckets: Record<string, string>[] = Array.from({ length: DESC_CHUNKS }, () => ({}))
  for (const job of merged) buckets[chunkOf(job.id)][job.id] = job.descText
  buckets.forEach((bucket, i) => writeFileSync(`${DIR}/desc-${String(i).padStart(2, '0')}.json`, JSON.stringify(bucket)))

  // Keep the history for everything ever seen, not just what is live today —
  // a job has to be remembered while it is gone for its return to count.
  const history: Record<string, Seen> = { ...seen }
  for (const job of merged) {
    history[job.id] = { firstSeen: job.firstSeen, lastSeen: TODAY, scans: job.scans, reposts: job.reposts }
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
