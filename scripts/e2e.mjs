/**
 * Browser checks against the built app.
 *
 * Written to test the paths actually used rather than the ones easiest to
 * assert. The lesson carried over from the sibling project: a check that
 * passes while the bug is live is worse than no check, because it turns a bug
 * into a confident denial.
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://127.0.0.1:4174/'
const results = []
const check = (name, pass, detail = '') => results.push({ name, pass, detail })

/** The list renders a window and grows on scroll, so counting rendered rows
 *  caps out. The header's own total is the honest number. */
const showing = async () => Number(((await page.locator('header').innerText()).match(/(\d+) showing/) ?? [])[1])

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }) // a phone
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('nav', { timeout: 20000 })

// --- the pool loads at all -------------------------------------------------
const rows = () => page.locator('li:has(input[type="checkbox"])')
const laneChips = page.locator('.chip:has(.tabular)')
await page.waitForFunction(() => document.querySelectorAll('li input[type=checkbox]').length > 0, null, { timeout: 20000 })
check('the pool renders real jobs', (await rows().count()) > 0, `${await rows().count()} rows`)

const header = await page.locator('header').innerText()
check('the header states how many were scanned', /\d{3,} scanned/.test(header), header.split('\n')[0])

// --- lanes -----------------------------------------------------------------
const laneText = await laneChips.allInnerTexts()
check('every lane carries its own count', laneText.every((t) => /\d/.test(t)), laneText.join(' | ').slice(0, 90))

const firstLaneCount = await rows().count()
await laneChips.nth(1).click()
await page.waitForTimeout(400)
const secondLaneCount = await rows().count()
check('switching lane changes what is listed', firstLaneCount !== secondLaneCount, `${firstLaneCount} -> ${secondLaneCount}`)

// --- the filter stack, and what a rule costs -------------------------------
await page.getByRole('button', { name: /show the \d+ rules/ }).click()
await page.waitForTimeout(200)
const stackText = await page.locator('.panel').first().innerText()
check('the stack lists its rules with counts', /within 25 miles/.test(stackText), stackText.split('\n').slice(0, 3).join(' / '))

// A rule's cost, proven by adding one and taking it away again. Done on the
// broadest lane, because in a narrow lane a later rule can already exclude
// everything an earlier one would have — so an unchanged count there is
// correct behaviour and proves nothing either way.
await laneChips.filter({ hasText: 'Everything' }).click()
await page.waitForTimeout(500)
const wideBefore = await page.locator('header').innerText()
const wideCount = Number((wideBefore.match(/(\d+) showing/) ?? [])[1])

await page.getByLabel('Subtract a word').fill('engineer')
await page.getByRole('button', { name: '− add' }).click()
await page.waitForTimeout(500)
const cutText = await page.locator('header').innerText()
const cutCount = Number((cutText.match(/(\d+) showing/) ?? [])[1])
check('adding a rule visibly cuts the pool', cutCount < wideCount, `${wideCount} -> ${cutCount}`)

const stackAfterAdd = await page.locator('.panel').first().innerText()
check('and the stack says what that rule cost', /−\d+/.test(stackAfterAdd), (stackAfterAdd.match(/both contains[^\n]*/) ?? [''])[0])

const addedToggle = page.locator("input[aria-label*='contains']").last()
await addedToggle.uncheck()
await page.waitForTimeout(500)
const restored = Number(((await page.locator('header').innerText()).match(/(\d+) showing/) ?? [])[1])
check('switching it off puts back exactly what it removed', restored === wideCount, `${cutCount} -> ${restored}, was ${wideCount}`)
await page.locator('button[aria-label*="Remove"]').last().click()
await page.waitForTimeout(400)

// --- search ----------------------------------------------------------------
const searchBase = await showing()
await page.getByLabel('Search this lane').fill('engineer')
await page.waitForTimeout(500)
const searched = await showing()
check('search narrows the lane', searched < searchBase, `${searched} of ${searchBase} match "engineer"`)

// Search covers the description as well as the heading. Where the match is in
// the description, the row must show the matching words — a result with no
// visible reason for being there reads as the search misfiring.
const shownRows = await rows().allInnerTexts()
const unexplained = shownRows.filter((t) => !/engineer/i.test(t))
check('every result shows why it matched', unexplained.length === 0, `${shownRows.length - unexplained.length}/${shownRows.length} explain themselves`)
await page.getByLabel('Search this lane').fill('')
await page.waitForTimeout(400)

// --- sorting ---------------------------------------------------------------
await page.getByLabel('Sort').selectOption('commute')
await page.waitForTimeout(400)
const miles = (await rows().allInnerTexts()).map((t) => Number((t.match(/(\d+) mi/) ?? [])[1])).filter(Number.isFinite)
const ascending = miles.every((m, i) => i === 0 || miles[i - 1] <= m)
check('sorting by commute really is ascending', ascending, miles.slice(0, 8).join(','))

await page.getByLabel('Sort').selectOption('pay')
await page.waitForTimeout(400)
const firstPay = (await rows().first().innerText()).match(/\$[\d.]+k?/)
check('sorting by pay puts a paid job first', !!firstPay, firstPay?.[0] ?? 'none')
await page.getByLabel('Sort').selectOption('fit')
await page.waitForTimeout(300)

// --- expanding a job -------------------------------------------------------
await rows().first().locator('button').first().click()
await page.waitForTimeout(600)
const open = await rows().first().innerText()
check('expanding shows the scoring axes', /Container/.test(open) && /Reachable/.test(open))
check('and the requirement verdicts', /(met|soft|hard)/.test(open))
check('and a link to the real posting', (await page.locator('a:has-text("open the posting")').count()) > 0)

const href = await page.locator('a:has-text("open the posting")').first().getAttribute('href')
check('the apply link is a real URL', /^https?:\/\//.test(href ?? ''), (href ?? '').slice(0, 48))

// --- the applied log, which is the data that must not be lost --------------
const poolBefore = await showing()
// Deliberately click rather than check(): the row is expected to leave the
// pool the moment it is ticked, so waiting for a checked box would time out
// on correct behaviour.
await page.getByLabel('I applied').first().click()
await page.waitForTimeout(400)
const logged = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('job.applied.v1') ?? '{}')).length)
check('ticking applied writes it immediately', logged === 1, `${logged} entry`)
const poolAfter = await showing()
check('and the job leaves the pool, so it never comes back around as new', poolAfter === poolBefore - 1, `${poolBefore} -> ${poolAfter}`)

await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('nav')
await page.getByRole('button', { name: /^applied/ }).click()
await page.waitForTimeout(400)
check('it survives a reload', (await page.locator('li').count()) > 0)

// THE test: destroy everything else and confirm the record stands.
await page.evaluate(() => {
  for (const k of Object.keys(localStorage)) if (k !== 'job.applied.v1') localStorage.removeItem(k)
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('nav')
await page.getByRole('button', { name: /^applied/ }).click()
await page.waitForTimeout(400)
const survived = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('job.applied.v1') ?? '{}')).length)
check('AND survives every other key being wiped', survived === 1, `${survived} entry after a wipe`)

const appliedText = await page.locator('main').innerText()
check('the applied view can export', /export/.test(appliedText))

// --- duplicates ------------------------------------------------------------
await page.getByRole('button', { name: /^dupes/ }).click()
await page.waitForTimeout(400)
const dupText = await page.locator('main').innerText()
check('the duplicates view explains itself', /Every merge is listed/.test(dupText) || /No duplicates/.test(dupText))

// --- settings --------------------------------------------------------------
await page.getByRole('button', { name: 'settings' }).click()
await page.waitForTimeout(300)
const setText = await page.locator('main').innerText()
check('settings names the running build', /Build \d{4}-\d{2}-\d{2}/.test(setText), (setText.match(/Build .*/) ?? [''])[0])
check('the pay floor is editable and on-device', /pay floor/i.test(setText))
check('the weights are sliders, not fixed', (await page.locator('input[type="range"]').count()) >= 5)

check('no page errors anywhere in that run', errors.length === 0, errors.slice(0, 2).join(' | '))

await page.getByRole('button', { name: 'pool' }).click()
await page.waitForTimeout(600)
await page.screenshot({ path: 'screenshot-pool.png' })

await browser.close()
console.log(results.map((r) => `${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  [${r.detail}]` : ''}`).join('\n'))
const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
