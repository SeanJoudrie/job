# Overhaul — bug fixes and improvements

Written from the live pool of 28 August (2,760 postings), not from reading the
code. Every item below names the posting that exposed it and the number of jobs
it affects. Nothing here is speculative; where something is a suspicion rather
than a proven defect it says so.

Order is by damage done. A parser that reports a wrong number is worse than one
that reports nothing, because a wrong number silently filters a job in or out
and nobody can see it happen.

---

## P0 — pay is being read wrong, and it decides everything

Pay is the first constraint in the profile and the first rule in every lane.
Four separate defects, all in `src/lib/pay.ts`, all found in the live pool.

### 1. `$X USD - $Y USD` loses the top of the band — 103 postings

Beth Israel Lahey Health writes its bands as:

```
$79,268.80 USD - $204,318.40 USD
```

`SEP` only accepts a bare separator between the two numbers (`-`, `–`, `to`,
`up to`). Here the text between them is `" USD - "`, so the range never joins,
only the first number is taken, and `min === max === 79,268`.

**245 BILH postings use this format. 103 of them are currently read as a single
value.** Every one is compared against the *bottom* of its band, which is
exactly the failure `meetsFloor` was written to avoid. A Surgical Scheduling
Supervisor reads as $64,480 when the band tops out far higher.

Fix: allow a currency code between the number and the separator. Accept `USD`,
`CAD` and a bare `/yr`-style unit. Regression test with the exact BILH string.

### 2. `M` and `B` suffixes are unrecognised — a whole employer deleted

`MONEY` recognises `$1,000` and `$50k`. It does not recognise `$3M`. So:

- Vannevar Labs: *"In just three years, we grew from $3M to $80M in ARR"* →
  parsed as **`$3/hr`**. `inferPeriod(3)` returns `'hour'`, the value fails the
  $25 floor, and **every Vannevar Labs posting is silently dropped from every
  lane.** Nobody can see that happen; the job simply is not there.
- Harvard: *"responsible for the development of the School's $400M+ annual
  operating budget"* → parsed as **`$400/yr`**. `budget` is already in
  `NOT_PAY`, but the poison window is 22 characters after the token and
  `budget` sits at 24.

**29 postings across eight employers currently carry an implausibly small
figure.**

Fix: recognise `M` and `B` suffixes so the number is at least the right size,
and then reject it — a figure in millions is a company statistic, never a wage.
Add `ARR`, `valuation`, `funding`, `raised` and `operating budget` to `NOT_PAY`,
and widen the trailing window enough to catch a qualifier that follows the unit
rather than the number.

### 3. `k` on a number that is already large — $185 million at Ginkgo

Ginkgo Bioworks published *"The base salary range for this role is $185,000k -
$278,800k"*. The posting itself is wrong; the parser multiplies anyway and
reports **$185,000,000**.

Fix: a `k` suffix on a value already ≥ 1,000 is a typo in the posting. Take the
number as written. Test with the exact string.

### 4. Period reconciliation is too lax — $101 a week

`reconcile` only overrides a stated period when the result is absurd, defined as
over $1M or under $5k a year. A BILH Nurse Navigator posting reads
`$39.14 - $101.14` with `per week` inside the 45-character window; that
annualises to $5,259, which clears the $5k bar, so the override never fires and
an hourly rate is stored as a weekly one.

Fix: raise the implausibility band to under **$15k** or over **$1M** a year.
Verify the legitimate cases still survive — Formlabs pays interns
`$1,575 - $1,950` a week and that is real, as is a `$500` day rate.

**Acceptance for P0:** re-run the scan; zero postings with an hourly figure
below $7 or above $150, zero annual figures below $20k or above $900k, and the
BILH band count for two-sided ranges rises from 142 to 245.

---

## P1 — half the pool has no role family

**1,331 of 2,760 postings (48%) carry an empty `families` array.** Families
drive the Coordination and Operations lanes and three of the scoring axes, so an
unclassified posting is invisible to all of them.

The gaps are not exotic. From Anduril alone: `Buyer`, `Buyer/Planner`,
`Materials Associate`, `Production Support Specialist`, `People Business
Partner`, `Project Controls Lead`, `Electronics Test Technician`.

- `Buyer`, `Buyer/Planner`, `Materials Associate`, `Inventory Planner`,
  `Procurement`, `Sourcing` (non-recruiting) → **logistics**
- `People Business Partner`, `People Operations`, `Talent Coordinator` → the HR
  side, which the industry table already scores at 7.8
- `Production Support`, `Project Controls`, `Program Management`,
  `Business Operations` → **operations**

Fix `src/lib/roles.ts`. Do not simply widen the regexes until the empty count
falls — that trades one invisible failure for another. Every addition needs a
title from the live pool in the test, and the ambiguous ones (`Sourcer` is
recruiting, `Sourcing` is procurement) need the body to settle them, which is
what `ambiguous`/`tell` already exists for.

**Acceptance:** empty-family share below 30%, with no title moving into a family
that a reader would call wrong. Report the before/after count per family.

---

## P2 — the industry table's health rule is too broad

`hospitals_health_admin` matches on `sector: ['health']`, and the board list
files Ginkgo Bioworks, Alnylam, Benchling, Amwell and Butterfly Network under
`health`. A biotech bench-science role is not hospital administration, and it is
currently scoring 6.5 on that basis.

Fix: split the sector, or require a hospital-shaped employer or role for the
6.5. Biotech with no matching role should fall back to unclassified rather than
borrow a tier it has not earned.

---

## P3 — requirements are missing on the two largest employers

494 Beth Israel postings and 100 Tufts Medicine postings parse to zero
requirements, which blinds the `reachable` axis on roughly a fifth of the pool.

**This is a suspicion, not a proven defect.** Sampled BILH postings genuinely
carry only duties and no qualifications section, in which case zero is the
correct answer and the axis correctly reports "nothing measurable stated". Check
a stratified sample before changing the parser. If a real section heading is
being missed, fix that; if the postings are simply written that way, leave the
parser alone and say so here.

---

## P4 — things worth improving, in order

1. **A pay-sanity guard in the scan.** Every defect above shipped because
   nothing checked the output for plausibility. The scan should count postings
   outside a believable band and print the count, the same way it prints dead
   links. It does not need to fail the run — it needs to be visible.
2. **`npm run audit` should carry the pay-sanity numbers too**, so one command
   answers "is the data any good" as well as "is the ranking any good".
3. The commute axis has a standard deviation of 0.20 across the top 200 —
   almost every posting resolves to "Boston, MA" and therefore to the same 10.3
   miles. It works as a filter and does nothing as a ranking signal. Worth
   stating in the docs rather than pretending otherwise.

---

## Standing rules for this work

- **Reproduce before claiming.** Every fix starts from the exact string in the
  live pool that broke it, and that string becomes the regression test.
- **A wrong number is worse than no number.** Where a fix cannot be made safe,
  return `null` rather than a guess.
- **Measure the blast radius before and after.** "Fixed" means a number moved.
- **No check that measures nothing.** This project has shipped three assertions
  that passed over empty arrays. An assertion that cannot fail is a lie.
- Ship the whole loop: `npm test`, `npm run build`, `npm run scan`,
  `npm run audit`, preview, `npm run e2e`, push, confirm the run is green.
