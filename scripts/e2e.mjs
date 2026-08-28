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

// --- the Top tab -----------------------------------------------------------
await page.waitForTimeout(1200)
const topText = await page.locator('main').innerText()
check('the app opens on Top', /Best across every lane/.test(topText))

// Read the score from its own element, never off the row's concatenated text.
// `textContent` runs the score straight into the title, and GBH is currently
// posting a "2027 FRONTLINE/CUNY-Newmark Journalism School Reporting Fellow" —
// so a row scoring 7.1 read as 7.12027, and a correctly ordered list failed
// this check. The list was right; the way it was being read was not.
const topRows = await page.evaluate(() =>
  [...document.querySelectorAll('li:has(> div > input) button[aria-expanded]')].slice(0, 20).map((b) => {
    const score = Number((b.querySelector('span')?.textContent ?? '').trim())
    return { score, line: (b.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) }
  }).filter((r) => Number.isFinite(r.score)))
check('Top lists scored jobs', topRows.length > 5, `${topRows.length} rows`)
check('and they descend by score', topRows.every((r, i) => i === 0 || topRows[i - 1].score >= r.score),
  // Every score, not the first six: the break is never in the first six.
  topRows.map((r) => r.score).join(' '))

// One employer posting a role once per shift must not own the list.
// Read the employer from the row's own meta line. An earlier version matched
// nothing and asserted over an empty object, which passes while proving
// nothing at all.
const employers = await page.evaluate(() =>
  // The row's second div is its meta line; the first holds the score and title.
  [...document.querySelectorAll('li:has(> div > input) button[aria-expanded] > div + div')]
    .slice(0, 15)
    .map((d) => (d.querySelector('span')?.textContent ?? '').trim())
    .filter(Boolean))
const counts = employers.reduce((m, e) => ({ ...m, [e]: (m[e] ?? 0) + 1 }), {})
const worst = Math.max(0, ...Object.values(counts))
check('the employer of each top row is readable at all', employers.length >= 10, `${employers.length} read`)
check('and no employer takes more than three places', worst > 0 && worst <= 3, JSON.stringify(counts).slice(0, 130))

// Top is a recommendation, so it obeys the pay floor the lanes do.
const belowFloor = await page.evaluate(() =>
  [...document.querySelectorAll('li:has(> div > input)')].slice(0, 20)
    .map((li) => li.textContent ?? '')
    .filter((t) => { const m = t.match(/\$([\d.]+)[–-]\$([\d.]+)\/hr/); return m && Number(m[2]) < 25 }).length)
check('nothing below the pay floor is recommended', belowFloor === 0, `${belowFloor} under $25/hr`)

// --- the deeper pass has to be reachable from the screen the app opens on ---
// It was not. Every row on Top carries a checkbox, and the only buttons that
// did anything with a selection lived in the pool header — and even there the
// handler filtered the selection out of the pool's own list, so a job ticked on
// Top would not have been found by it either.
await page.locator('li:has(> div > input) input[type="checkbox"]').first().check()
await page.waitForTimeout(300)
const topBar = await page.locator('header').innerText()
check('a job ticked on Top offers something to do with it', /1 selected/.test(topBar) && /write letters/.test(topBar),
  (topBar.match(/\d+ selected[^\n]*/) ?? ['nothing'])[0])

// Pressing it with no key must say so. That proves the handler is wired to the
// selection rather than quietly finding nothing — the failure it used to have.
await page.getByRole('button', { name: 'write letters →' }).click()
await page.waitForTimeout(400)
check('and pressing it reaches the letter writer', /Add an API key/.test(await page.locator('header').innerText()),
  (await page.locator('header').innerText()).split('\n').find((l) => /API key/.test(l)) ?? 'no response')
await page.getByRole('button', { name: 'clear' }).click()
await page.waitForTimeout(300)

await page.getByRole('button', { name: 'pool' }).click()
await page.waitForTimeout(600)

// --- the pool loads at all -------------------------------------------------
// A job row, specifically: an <li> whose own child div holds the checkbox.
// `li:has(input)` also matches the employer group wrapping them, which made
// counts double and sent clicks to the group header.
const rows = () => page.locator('li:has(> div > input[type="checkbox"])')
const laneChips = page.locator('.chip:has(.tabular)')
await page.waitForFunction(() => document.querySelectorAll('li > div > input[type=checkbox]').length > 0, null, { timeout: 20000 })
check('the pool renders real jobs', (await rows().count()) > 0, `${await rows().count()} rows`)

const header = await page.locator('header').innerText()
check('the header states how many were scanned', /\d{3,} scanned/.test(header), header.split('\n')[0])

// --- lanes -----------------------------------------------------------------
const laneText = await laneChips.allInnerTexts()
check('every lane carries its own count', laneText.every((t) => /\d/.test(t)), laneText.join(' | ').slice(0, 90))

// Counting rendered rows does not work here: employers are collapsed, so two
// very different lanes can show the same number of open rows. The header's own
// total is the number that means something.
const firstLaneCount = await showing()
await laneChips.nth(1).click()
await page.waitForTimeout(500)
const secondLaneCount = await showing()
check('switching lane changes what is listed', firstLaneCount !== secondLaneCount, `${firstLaneCount} -> ${secondLaneCount}`)

// A phone that opened the app before the lanes changed must still receive the
// new set — the stale-saved-data trap from the sibling project.
await page.evaluate(() => localStorage.setItem('job.nets.v1', JSON.stringify([{ id: 'old', name: 'Stale lane', rules: [] }])))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('nav')
const laneNames = await laneChips.allInnerTexts()
check('an old saved lane set is replaced by the shipped one', !laneNames.some((t) => /Stale lane/.test(t)) && laneNames.length > 8,
  `${laneNames.length} lanes after a stale set was planted`)

// The case file flags one search as never having been run: a Tier A employer
// and a job that involves writing or making something. It now has a lane.
const crossoverChip = laneChips.filter({ hasText: 'Crossover' })
check('the crossover search has a lane of its own', (await crossoverChip.count()) === 1)
await crossoverChip.click()
await page.waitForTimeout(600)
const crossoverCount = await showing()
check('and it returns actual jobs', crossoverCount > 0, `${crossoverCount} in Crossover`)

// The lane the case file scores at zero is gone. I built it before reading it.
check('the public safety lane is gone', !laneNames.some((t) => /Public safety/.test(t)))

// Light, always — this is read outdoors, and a phone flipping to dark at dusk
// changed the app out from under its owner.
const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
const isLight = (() => {
  const [r, g, b] = (bg.match(/\d+/g) ?? ['0', '0', '0']).map(Number)
  return (r + g + b) / 3 > 200
})()
check('the page is light regardless of the phone theme', isLight, bg)

// A job that cannot be won must not present as a top result, because the top
// of the list is exactly where attention goes.
const capped = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('li:has(> div > input) button[aria-expanded]')]
  return rows.slice(0, 25).map((b) => Number((b.querySelector('span')?.textContent ?? '').trim())).filter(Number.isFinite)
})
check('top-of-list scores exist and are bounded', capped.length > 0 && capped.every((n) => n <= 10), capped.slice(0, 6).join(' '))

// --- the two complaints that drove this round ------------------------------
// 1. "Easy hire" filled with Anduril, which is a six-figure cleared defence
//    role with several interview rounds. Nothing about that is an easy hire.
await laneChips.filter({ hasText: 'Easy hire' }).click()
await page.waitForTimeout(600)
// Not "no Anduril at all": their warehouse roles at $25-33/hr with one hard
// requirement genuinely are easy hires and belong here. What must not happen
// is 178 competitive engineering roles filling the lane.
const andurilInEasy = await page.evaluate(() => {
  const header = [...document.querySelectorAll('button[aria-label]')]
    .find((b) => /Anduril/.test(b.getAttribute('aria-label') ?? ''))
  const m = header?.getAttribute('aria-label')?.match(/(\d+) jobs/)
  return m ? Number(m[1]) : 0
})
check('Easy hire is not filled by one competitive defence employer', andurilInEasy <= 5,
  `${andurilInEasy} Anduril roles in Easy hire, of 178 in the pool`)

// 2. One employer could own the whole screen. Grouped, with the big ones shut.
const groupHeaders = page.locator('button[aria-label*="Expand"], button[aria-label*="Collapse"]')
check('the list groups by employer', (await groupHeaders.count()) > 0, `${await groupHeaders.count()} groups`)

const firstGroup = groupHeaders.first()
const groupLabel = await firstGroup.getAttribute('aria-label')
const rowsBeforeExpand = await rows().count()
await firstGroup.click()
await page.waitForTimeout(400)
const rowsAfterExpand = await rows().count()
check('an employer folds open and shut', rowsAfterExpand !== rowsBeforeExpand, `${groupLabel}: ${rowsBeforeExpand} -> ${rowsAfterExpand}`)
await firstGroup.click()
await page.waitForTimeout(300)
check('and folds back', (await rows().count()) === rowsBeforeExpand)

await page.getByRole('button', { name: 'flat list' }).click()
await page.waitForTimeout(500)
check('and can be turned off entirely', (await page.getByRole('button', { name: 'group by employer' }).count()) === 1)
await page.getByRole('button', { name: 'group by employer' }).click()
await page.waitForTimeout(400)

// --- the filter stack, and what a rule costs -------------------------------
await page.getByRole('button', { name: /show the \d+ rules/ }).click()
await page.waitForTimeout(200)
const stackText = await page.locator('.panel').first().innerText()
// The commute is stated in minutes, which is the constraint. A mile radius
// admitted a fifty-minute drive as though it were a commute.
check('the stack lists its rules with counts', /within \d+ min of home/.test(stackText), stackText.split('\n').slice(0, 3).join(' / '))
check('and it names the hard exclusions it applies', /Tier E/.test(stackText) && /front-line service under \$\d+/.test(stackText),
  stackText.split('\n').filter((l) => /Tier E|front-line/.test(l)).join(' / '))

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
await page.waitForTimeout(500)

// Grouped, rows are sorted within each employer, so reading straight down the
// screen is legitimately not monotonic — the flat list is where a global sort
// can actually be checked.
await page.getByRole('button', { name: 'flat list' }).click()
await page.waitForTimeout(600)
const minutes = (await rows().allInnerTexts()).map((t) => Number((t.match(/(\d+) min/) ?? [])[1])).filter(Number.isFinite)
const ascending = minutes.length > 0 && minutes.every((m, i) => i === 0 || minutes[i - 1] <= m)
// `minutes.length > 0` is the point of the next line and half the point of
// this one: remote jobs used to sort to the front, none of them states a drive
// time, and `[].every()` is true — so this check passed for as long as it was
// measuring nothing at all.
check('sorting by commute really is ascending', ascending, minutes.slice(0, 10).join(','))
check('and the commute is shown in minutes, not miles', minutes.length > 0, `${minutes.length} rows state a drive time`)

await page.getByRole('button', { name: 'group by employer' }).click()
await page.waitForTimeout(600)
// And grouped, the employers themselves must be ordered by their nearest job,
// or "sort by commute" would mean nothing once the list is grouped.
const groupOrder = await page.evaluate(() => {
  const out = []
  for (const li of document.querySelectorAll('main > ul > li')) {
    const rows = [...li.querySelectorAll('li')]
      .map((r) => Number((r.textContent?.match(/(\d+) min/) ?? [])[1]))
      .filter(Number.isFinite)
    if (rows.length) out.push(Math.min(...rows))
  }
  return out
})
check('and grouped, employers are ordered by their nearest job',
  groupOrder.every((m, i) => i === 0 || groupOrder[i - 1] <= m), groupOrder.slice(0, 8).join(','))

await page.getByLabel('Sort').selectOption('pay')
await page.waitForTimeout(400)
const firstPay = (await rows().first().innerText()).match(/\$[\d.]+k?/)
check('sorting by pay puts a paid job first', !!firstPay, firstPay?.[0] ?? 'none')
await page.getByLabel('Sort').selectOption('fit')
await page.waitForTimeout(300)

// --- expanding a job -------------------------------------------------------
await rows().first().locator('button[aria-expanded]').first().click()
await page.waitForTimeout(600)
const open = await rows().first().innerText()
check('expanding shows the scoring axes', /Container/.test(open) && /Reachable/.test(open))
// The four the case file puts first, and the tier table that replaced the old
// hand-waved "domain pull" axis.
check('including the logistics the case file leads with',
  /Pay/.test(open) && /Commute/.test(open) && /Posture/.test(open) && /Hours/.test(open) && /Industry/.test(open))
check('and the split between them', /logistics [\d.]+ · overall fit [\d.]+/.test(open),
  (open.match(/logistics [^\n]*/) ?? [''])[0])
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

// --- the pre-made documents ------------------------------------------------
// The whole point: the posting open in one tab, the right resume one press
// away in the other. Nothing generated, nothing to wait for, no key to buy.
await page.getByRole('button', { name: 'docs' }).click()
await page.waitForTimeout(400)
const docsText = await page.locator('main').innerText()
check('eight packs, each with a resume and a letter already written',
  (await page.getByRole('button', { name: 'resume ↗' }).count()) === 8, `${await page.getByRole('button', { name: 'resume ↗' }).count()} packs`)
check('and one of them is the stripped variant for hourly employers', /stripped/.test(docsText))

await page.getByRole('button', { name: 'resume ↗' }).first().click()
await page.waitForTimeout(400)
const sheet = await page.locator('.sheet').innerText()
// Section headings are upper-cased in CSS, so innerText comes back shouting.
check('opening one renders a real document', /experience/i.test(sheet) && /Verizon/i.test(sheet), sheet.split('\n').slice(0, 3).join(' / '))
check('and it carries the 4.5x line, which is the strongest thing on it', /4\.5x/.test(sheet))
check('a blank contact block says so rather than printing an empty header',
  /set (?:it|these) in Settings/.test(sheet) || /Wakefield/.test(sheet))

// The letter for the same pack, and only the marked blanks in it.
await page.getByRole('button', { name: 'letter', exact: true }).click()
await page.waitForTimeout(300)
const letter = await page.locator('.sheet').innerText()
check('the letter for that pack is written and addressed', /Dear Hiring Committee/.test(letter) && letter.length > 700, `${letter.length} chars`)
await page.getByRole('button', { name: '← back' }).click()
await page.waitForTimeout(300)

// And the same pair reachable from a job, which is how it gets used.
await page.getByRole('button', { name: 'top' }).click()
await page.waitForTimeout(600)
await page.locator('li:has(> div > input) button[aria-expanded]').first().click()
await page.waitForTimeout(400)
await page.getByRole('button', { name: 'My documents for this kind of job' }).first().click()
await page.waitForTimeout(300)
check('a job row opens the documents written for its kind of job',
  (await page.getByRole('button', { name: 'cover letter ↗' }).count()) > 0)
await page.getByRole('button', { name: 'resume ↗' }).first().click()
await page.waitForTimeout(400)
check('and that really is a document, not an empty panel', /experience/i.test(await page.locator('.sheet').innerText()))
await page.getByRole('button', { name: '← back' }).click()
await page.waitForTimeout(300)

// --- settings --------------------------------------------------------------
await page.getByRole('button', { name: 'settings' }).click()
await page.waitForTimeout(300)
const setText = await page.locator('main').innerText()
check('settings names the running build', /Build \d{4}-\d{2}-\d{2}/.test(setText), (setText.match(/Build .*/) ?? [''])[0])
check('the pay floor is editable and on-device', /pay floor/i.test(setText))
// The label is upper-cased in CSS, so innerText comes back shouting.
check('the commute is set in minutes', /Commute \(minutes\)/i.test(setText))
check('contact details are set here and stay on the device', /Full name/i.test(setText) && /never leave this device/i.test(setText))
check('and the weights are grouped, so the 60/40 is visible', /Logistics carry 60%/.test(setText),
  (setText.match(/Logistics carry[^\n]*/) ?? [''])[0])
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
