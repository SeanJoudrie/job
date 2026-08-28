# Job scanner — working spec

Status: **spec only. Nothing built yet, by request.**

A job search tool that runs on rules you write and can read, instead of a feed
that decides what you're allowed to see.

---

## 0. The privacy split — read this first

The app is served from GitHub Pages, which on a free account means **this repo is
public.** So the line is hard and it is not a preference:

| Lives in this repo (public) | Lives only on the phone |
|---|---|
| The scanner and the app | The profile |
| Scanned job listings (public data already) | The resume and its variants |
| Filter *mechanics* — how a rule works | ZIP, pay floor, commute limit |
| The starter company list | Saved nets, selections, scores |
| | Generated cover letters |

Scoring and letter-writing run **in the browser** with the owner's own API key,
so nothing personal ever reaches the scheduled job at all.

Nothing about employment history, health, motivation, or what any given role
would cost the person doing it goes in this repo in any form. The axes below
describe *what the machine measures*. They deliberately do not record why those
measurements were chosen.

---

## 1. The core idea

Not a recommendation engine. A **funnel built by hand.**

Every rule is visible, reorderable, and switch-off-able, and the count after each
one is shown. You watch the net tighten and you can see exactly what each rule
cost you.

The problem with the big boards isn't that their ranking is bad — it's that it's
theirs, it's invisible, and it optimises for their engagement. A single click
should not be able to define a career category for years, and there should never
be a job reachable through a friend's link but not through your own search.

---

## 2. Screen 1 — the pool

One list. Expandable rows. **No pagination.** Virtualised so several thousand
rows scroll smoothly on a phone.

- **Collapsed row:** title · company · pay · distance · posted · source
- **Expanded:** full description, extracted requirements, apply link, and
  one-tap "turn this phrase into a rule"
- **Sort, always visible:** commute · pay · newest · title (reversible)
- **Search:** free text, narrows live

### The filter stack

```
  Everything scanned                          4,312
+ within 25 miles of home                     1,204
− role family: commission sales                 890
− requires an active clearance                  812
− fully remote                                  770
+ pay >= $2,000/month (incl. unlisted)          732
+ posted in the last 14 days                    511
```

- **Add** by typing, or by long-pressing any phrase in a description
- **Toggle off without deleting**, and watch the count jump back — this is how
  you catch a rule that was quietly killing 300 good jobs
- **Reorder** by drag
- **Save a stack as a named net** and switch between them. Nets are how you keep
  one list and keep cutting it down without starting over.

Rule types: contains / doesn't contain · **role family** · distance · pay floor ·
posted within · education required · years required · **requirement hardness** ·
employment type · onsite / hybrid / remote · **clearance state** · source ·
company · **posting liveness**.

### Role families, not keywords

`− sales` as a keyword catches nothing, because the postings are titled Account
Executive, Business Development Representative, Territory Manager, Client
Partner, Inside Sales Rep, Enterprise AE, Revenue Associate.

Exclusions are therefore **families**: one toggle, many titles, in a list you can
open, read, and edit. Nothing is ever excluded by a rule you can't see.

Pre-loaded families — `commission sales`, `fully remote`, `solo / independent
contributor`, `rule enforcement`. Boost families — `coordinator`, `operations`,
`program`, `analyst`, `administrative`, `student services`, `facilities`,
`logistics`.

### Clearance state

Three states, because "holds" and "can obtain" are different markets:

- `requires an active clearance` — off by default
- `clearable / employer sponsors` — **on**. "Must be able to obtain a Secret
  clearance" is a requirement a US citizen in the Guard **meets today.**
- `no clearance mentioned` — on

---

## 3. Screen 2 — the score

Select any number, hit **Next**. Each job comes back with a **1–10** that is
never a single opaque number: it decomposes into axes you can see and reweight.

### The axes

| Axis | What it measures | Default weight |
|---|---|---|
| **Container** | Recurring in-person contact with the same people, on a schedule, with a defined task | **Highest** |
| **With-people** | Social contact embedded in shared work — not quota-carrying, not policing people | High |
| **Reachable** | How much of the requirement gap is soft rather than hard | High |
| **Overqualification risk** | Whether this posting is likely to auto-reject as "flight risk" | Medium |
| **Service-compatible** | Veteran-friendly, USERRA-routine, defense-adjacent, federal | **Heavy** |
| **Domain pull** | Analysis · higher-ed admin · student affairs · operations · program coordination · events & facilities · investigative / research | Medium |
| **Liveness** | Is this a real open req or a ghost? | Gate, not a score |

Every weight is a slider the owner controls. The default weighting is an
argument, not a fact, and it should be overridable in one tap.

### Reachable — soft vs hard requirements

The single highest-value piece of parsing in the app.

- **Soft:** "preferred", "a plus", "nice to have", "or equivalent experience",
  "or equivalent combination of education and experience", "or related field",
  "familiarity with"
- **Hard:** "must have", "required", "minimum of N years", "will not be
  considered without"

A posting reading *"Bachelor's preferred; 5 years or equivalent experience"* is
**open**, and the app should say so in those words. Self-selecting out of soft
requirements is a bigger source of missed jobs than any filter.

The score shows the gap line by line: matched / soft-gap / hard-gap / unstated.
A hard gap is worth knowing. A soft gap is worth applying anyway.

### Overqualification risk

Rejection happens at both ends — too credentialed for hourly work, not
credentialed enough for the roles above it. So the app classifies posting tier
(hourly · entry ops · professional · senior) and, where the tier is below the
resume, flags it and **switches to the stripped resume variant** (§4).

### A low score never blocks anything

A 4/10 stays selectable and still gets a full application pack. The score is
information that was asked for, not permission. The rubric is an editable text
block, not a hidden prompt.

---

## 4. Screen 3 — the application pack

Select from the scored set → **Next** → per job, a **resume variant** and a
**cover letter**, both editable in place.

### Two resume variants

| Variant | Used for | Difference |
|---|---|---|
| **Full** | professional / career roles | Everything. Leads with the Verizon result. |
| **Stripped** | hourly and operations roles | Honor society, certificate wall, and the "Senior Account Manager II" title removed — they read as flight risk to a hiring manager filling an hourly req. |

Picked automatically from posting tier, always overridable.

Both variants:

- **Lead with 28 months at Verizon growing business-segment revenue 4.5x.** It
  is the strongest line available and it is habitually undersold. It leads
  unless the posting makes it irrelevant.
- **Carry Platoon Guide (selected peer leader, 58 soldiers) and unit SHARP
  representative** as what they are — accountability, coordination, compliance,
  records, and mediation credentials that map directly onto program-coordinator
  and operations language.

### Cover letter rules

- **Never claim anything the profile doesn't support.** A letter that invents
  experience is worse than no letter.
- **A clearance in progress is an asset arriving, not a gap.** Phrase it as
  eligible and pending with a rough date, never as absent.
- **Service obligations stated plainly and early** for veteran-friendly and
  defense-adjacent employers, where it is a positive; not led with elsewhere.
- Says what it deliberately left out, so the last pass can be in the owner's own
  words. That pass is what makes these land.

---

## 5. Wildcard

A section that **ignores the filter stack on purpose** — jobs that wouldn't
survive the funnel, tagged so they never look like a bug:

`easy money` · `interesting` · `stretch` · `weird`

**One override:** the Container axis still applies here. A solo overnight post
scores as "easy money" on every other measure and is exactly the wrong
recommendation — so wildcards are drawn from roles that still put you in a room
with people. Low-demand, not low-contact.

---

## 6. Liveness — not chasing ghosts

- Posting age is shown on every row
- **Reposts are detected and flagged.** A req that reappears every 30 days is
  usually dead, and applying to it is where applications quietly go to die.
- Anything past a set age is de-weighted rather than hidden

This needs no infrastructure: the scheduled scan commits its results, so **the
repo's own git history is the posting-age database.** First-seen date and repost
count come free.

---

## 7. Sources

| Source | How | Coverage |
|---|---|---|
| ATS boards — Greenhouse, Lever, Ashby, Workable, SmartRecruiters | public JSON, no key, no login | Deepest and **earliest** — days ahead of the aggregators |
| USAJOBS | free official API | All federal. Veteran preference is scored, not decorative. |
| Adzuna | free API | Broad aggregate |
| Remotive, Arbeitnow, HN Who's Hiring | free APIs | Breadth |
| **LinkedIn / Indeed / ZipRecruiter** | **paste one of their alert emails; every job in it is extracted** | Their matches, filtered by your rules instead of their feed |
| Anything, anywhere | paste a URL or a description | The "a friend linked me a job I can't find myself" case |

Direct scraping of the big three is deliberately absent. Their bot defence is
good and the penalty for losing lands on the account, which is not a thing worth
risking. The alert-email path gets their listings in without that bet.

Distance uses an offline ZIP-centroid table — free, no key, no rate limit,
accurate to a couple of miles, which is all a radius filter needs. The home ZIP
is a setting that never leaves the device, so a move is one field, not a rebuild.

---

## 8. The starter scan list

Seeded, then owned and edited. Weighted toward commutable, service-compatible,
and coordination-shaped rather than a generic top-200.

- **Defense tech** — Anduril, Shield AI, Palantir, Vannevar Labs, Applied
  Intuition, Scale AI, Govini, Second Front.
  *Verified live: Anduril 2,180 open roles, 167 listing Boston; Shield AI 440
  with 9 in Boston; Palantir 307.*
- **Local primes and labs** — MITRE, Draper, MIT Lincoln Laboratory, Raytheon,
  BAE, Textron Systems, L3Harris. Inside a 25-mile radius, and most sponsor
  clearances rather than demanding one up front.
- **Higher education** — every college inside the radius. Student affairs,
  program coordination, events, facilities. A field already done and enjoyed.
- **Local tech and operations** — Klaviyo, HubSpot, Datadog, Toast, Wayfair.
- **Federal** — USAJOBS inside the radius, veteran-preference paths surfaced
  rather than buried.

Operations, coordination, and analyst roles are pulled **alongside** engineering.
A resume that is five years of operations *and* a shipped software portfolio is
badly served by searching only one half of it.

---

## 9. Pay is a floor, not a target

The pay rule is a **hard floor with unlisted-pay included by default.** This is a
bridging role, so the floor sits low, and at a low floor an "exclude unlisted"
default would throw away half the board to filter almost nothing.

Money is not a scoring axis. A job clearing the floor is not made better by
clearing it twice over — the axes in §3 decide, not the number.

---

## 10. How it runs

- Static site on GitHub Pages, phone-first
- A scheduled GitHub Action scans overnight and commits results, so the page is
  simply *there* in the morning
- Rules, nets, profile and selections in `localStorage`, exportable as a backup
- Scoring and letters call Claude from the browser with the owner's key
- Every part inspectable in this repo. No service, no account, no ranking that
  can't be read.

---

## 11. Not yet decided

- Whether the paste box parses alert emails on-device or needs a small parser
  service (on-device preferred; some HTML is hostile)
- Refresh cadence for the scan — nightly vs twice daily
- Whether saved nets sync across devices at all, given nothing personal is
  allowed in the repo
