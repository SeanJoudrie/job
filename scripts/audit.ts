import { existsSync, readFileSync } from 'node:fs'
import { easeScore } from '../src/lib/ease'
import { industryFor } from '../src/lib/industry'
import { defaultLanes, runNet, topBaseline } from '../src/lib/nets'
import { topHourly } from '../src/lib/pay'
import { axesFor, DEFAULT_WEIGHTS, defaultCtx, fitOf, GETTABLE_SHARE, logisticsOf, rank } from '../src/lib/score'
import { topJobs } from '../src/lib/top'
import type { Job } from '../src/types'

/**
 * Measure the model against the real pool.
 *
 * Every scoring decision in this project that turned out to be wrong looked
 * fine in the code and looked wrong here: gettability quietly owning the whole
 * ranking, a quarter of the pool pinned on one number, pay correlating
 * NEGATIVELY with the score because the ease model penalised it and nobody had
 * plotted the two together. `score.ts` says to re-measure whenever the axes
 * change. This is the thing that does it.
 *
 *   npm run scan && npm run audit
 */

const INDEX = 'public/data/jobs.json'
if (!existsSync(INDEX)) {
  console.error(`no index at ${INDEX} — run \`npm run scan\` first.`)
  process.exit(2)
}

const jobs: Job[] = JSON.parse(readFileSync(INDEX, 'utf8')).jobs
const PROFILE = { years: 5, degree: 'bachelor' as const, clearance: 'none' as const }
const FLOOR = 25
const MINUTES = 30
const ctx = { ...defaultCtx(), floorHourly: FLOOR, maxMinutes: MINUTES }
const keyOf = (j: Job) => `${j.company}::${j.title}`
const none = new Set<string>()

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const sd = (xs: number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)))
const r = (xs: number[], ys: number[]) => {
  const mx = mean(xs)
  const my = mean(ys)
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  return sxy / Math.sqrt(sxx * syy)
}

console.log(`pool ${jobs.length}\n`)

const byId = new Map<string, number>()
let excluded = 0
for (const j of jobs) {
  const i = industryFor(j, ctx.now)
  byId.set(i.id, (byId.get(i.id) ?? 0) + 1)
  if (i.excluded) excluded++
}
console.log(`Tier E and out-of-season: ${excluded} (${((100 * excluded) / jobs.length).toFixed(1)}%)`)
console.log('\nindustries:')
for (const [id, n] of [...byId.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${id}`)

console.log('\nthe baseline funnel, and what each rule costs:')
const { steps, jobs: pool } = runNet(jobs, topBaseline(FLOOR, MINUTES), none, keyOf)
for (const s of steps) console.log(`  ${String(s.before).padStart(5)} → ${String(s.after).padStart(5)}  −${String(s.before - s.after).padEnd(5)} ${s.rule.type}`)

console.log('\nlanes:')
for (const lane of defaultLanes(FLOOR, MINUTES)) {
  console.log(`  ${String(runNet(jobs, lane, none, keyOf).jobs.length).padStart(5)}  ${lane.name}`)
}

const rows = pool.map((j) => {
  const axes = axesFor(j, PROFILE, ctx)
  return { j, axes, score: rank(j, PROFILE, DEFAULT_WEIGHTS, ctx).score, fit: fitOf(axes), log: logisticsOf(axes), get: easeScore(j) }
})
const sorted = [...rows].sort((a, b) => b.score - a.score)

/**
 * Two populations, reported separately on purpose. A whole-pool correlation
 * mixes the capped-unwinnable postings sitting at the bottom with the list that
 * is actually read, and then measures the cap rather than the ranking.
 */
const report = (set: typeof rows, label: string) => {
  console.log(`\n${label} (${set.length}):`)
  const score = set.map((x) => x.score)
  const line = (name: string, v: number[]) =>
    console.log(`  ${name.padEnd(12)} mean ${mean(v).toFixed(2).padStart(5)}  sd ${sd(v).toFixed(2).padStart(5)}  r(score) ${r(v, score).toFixed(2).padStart(5)}`)
  line('fit', set.map((x) => x.fit))
  line('logistics', set.map((x) => x.log))
  line('gettable', set.map((x) => x.get))
  for (const id of DEFAULT_WEIGHTS ? Object.keys(DEFAULT_WEIGHTS) : []) {
    line(id, set.map((x) => x.axes.find((a) => a.id === id)!.score))
  }
}
report(rows, 'whole pool')
report(sorted.slice(0, 200), 'top 200 — the part that gets read')

console.log(`\ngettability owns ${GETTABLE_SHARE} of the blend; pay and gettability correlate at ${r(rows.map((x) => x.axes.find((a) => a.id === 'pay')!.score), rows.map((x) => x.get)).toFixed(2)}`)

console.log('\ntop 20:')
for (const e of topJobs(pool, PROFILE, DEFAULT_WEIGHTS, { limit: 20, ctx })) {
  const h = topHourly(e.job.pay)
  console.log(
    `  ${e.score.toFixed(1)}  ${(h ? '$' + h.toFixed(0) + '/hr' : '   —  ').padStart(8)}  ${e.job.title.slice(0, 44).padEnd(44)} ${e.job.company.slice(0, 22).padEnd(22)} ${industryFor(e.job, ctx.now).id}`,
  )
}
