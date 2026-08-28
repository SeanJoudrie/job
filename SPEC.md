# Job scanner — working spec

Status: **spec only. Nothing built yet, by request.**

A job search tool that runs on rules you write and can read, instead of a feed
that decides what you're allowed to see.

---

## 0. What lives where

This repo is public, by the owner's decision. `PROFILE.md` holds the personal
half — constraints, fit reasoning, resume strategy — and `SPEC.md` holds the
machine.

One carve-out stands as an offer rather than a rule: the **pay floor** is the
number on the other side of every negotiation that follows, and it can be moved
to a device-only setting without changing anything else. Everything else is here
on purpose.

What still never gets committed, because it is generated rather than decided:

- Cover letters and tailored resume variants
- The applied log, once it contains real outcomes
- Any API key

Scoring and letter-writing run **in the browser** with the owner's own key, so
none of that has to reach the scheduled scan.

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

### Accuracy over speed

An explicit trade, made on purpose: **it is fine for this to be slow.** A search
that takes thirty seconds and is right beats an instant one that is wrong.

That permission is load-bearing further down. It is why the scanner fetches full
job descriptions rather than list-view summaries, why scoring reads the whole
posting instead of a snippet, and why the scan can afford to walk a few hundred
company boards a night. None of that would survive a requirement to feel fast.

Progress is shown. Nothing is silently truncated to hit a time budget.

---

## 2. Lanes

**Not one giant list.** A wide net is the right strategy when employment is the
goal, but a wide net rendered as a single ranked column is unusable — the bridge
job and the career job compete for the same row and both lose.

So the pool is divided into **lanes**. Each lane is a saved filter stack with its
own defaults, and each shrinks independently. Free-text search runs inside
whichever lane is active, or across all of them.

The lanes are built from the industry table in [PROFILE.md](PROFILE.md) §5
rather than from ad-hoc keyword lists, so a lane and a score cannot disagree
about what a job is.

| Lane | What's in it |
|---|---|
| **Easy hire** | Judged on how gettable a job actually is — employer type, pay band, and how the posting reads — not on how few credentials it lists. |
| **Crossover** | A Tier A employer and a job that involves writing or making something. The search that had never been run. |
| **Coordination** | Coordinators, schedulers, liaisons, administrators. |
| **Operations** | Program coordination, ops management, facilities, events, scheduling. |
| **Higher ed & schools** | Higher-education administration and K-12 non-teaching. Tier A, and already done and enjoyed. |
| **Creative & media** | Media production, publishing, editorial, graphic design, video, events and AV, marketing operations. |
| **Library & museum** | Museums, cultural institutions, libraries. |
| **Records & archives** | Archives, records management, document control, public records. |
| **Government** | Municipal, state, federal, courts. |
| **Legal & HR** | Paralegal and legal support; HR, recruiting coordination, payroll, benefits. |
| **Health admin** | Hospital administration — patient access, medical records, scheduling. Not clinical. |
| **IT & data** | Helpdesk, technical support, QA, junior analysis. Apply-anyway, entry and support tier. |
| **Warehouse & logistics** | Warehouse, distribution, inventory, postal, delivery. A realistic bridging tier. |
| **Facilities & custodial** | Facilities, maintenance, custodial. Tier C at proper pay. |
| **Mission** | Faith-based nonprofits, social services, conservation, veterans services. |
| **Outdoors** | Parks, environmental field work, groundskeeping. **Empty from November to March, on purpose.** |
| **Sponsors a clearance** | Roles where a clearance is obtainable rather than already held. Service is an asset here. |
| **Everything** | The commute, and nothing else. Nothing is hidden from a manual search. |

Two lanes were removed rather than added. **Public safety** pointed at
emergency management and dispatch, which the table scores at zero; and trade
apprenticeships, which an earlier version of this spec defended as "a real
route, not noise", are now a hard exclusion. Both were my calls and both were
wrong.

### The hard exclusions are rules, not filters

Insurance, gambling, telemarketing, collections, police and fire, corrections,
transit, utilities, the trades, kitchens, food production, assembly lines,
licensed clinical work, and retail or front-line service under $30/hr are all
out. They are out as **two visible rules in every lane's stack** — one for the
Tier E table, one for the front-line pay floor — each showing what it removed
and each switchable. Switching one off shows the jobs; it does not recommend
them, because a Tier E job is capped at 3 in the ranking regardless.

Lanes are editable and addable — they are named nets, not a fixed taxonomy. Each
shows its own count, so the top of the app answers "how much is actually out
there for me right now" per lane instead of as one meaningless total.

### Gettability is its own measurement

"Easy hire" first filtered on degree and years, and filled with defence-technology
postings: they ask for a bachelor's and three years, so they passed a
credentials test. They also pay six figures, run several interview rounds and
often want a clearance already held. Nothing about that is an easy hire.

What predicts a winnable process is the kind of employer, the pay band, and how
the posting is written — "hiring immediately, will train" against "take-home
exercise and a panel loop". That is scored separately, shown on every job, and
sortable, so the claim can always be checked rather than taken on trust.

**Why lanes and not one blended score:** a bridge job and a career job are
optimised against different things. Blend them into a single ranking and the
result is wrong for both. Kept apart, each list is internally coherent and can
be worked on its own terms.

---

## 3. Screen 1 — the pool

One list. Expandable rows. **No pagination.** Virtualised so several thousand
rows scroll smoothly on a phone.

- **Collapsed row:** title · company · pay · distance · posted · source
- **Expanded:** full description, extracted requirements, apply link, and
  one-tap "turn this phrase into a rule"
- **Sort, always visible:** commute · pay · newest · title (reversible)
- **Search:** free text, narrows live; where the match is in the description
  rather than the heading, the row shows the matching words
- **Grouped by employer**, folded shut past a handful, because one company
  posting a hundred roles inside the radius would otherwise own the screen

### The filter stack

```
  Everything in this lane                     4,312
+ within 25 miles of home        (default)    1,204
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

## 4. Screen 2 — the score

Select any number, hit **Next**. Each job comes back with a **1–10** that is
never a single opaque number: it decomposes into axes you can see and reweight.

### The axes

The axes come in two groups, and the split is the point: **logistics carry 60%
of the fit and the job itself carries 40%.** A Tier C role at $28/hr twenty
minutes away beats a Tier A role at $21/hr in Boston, and a score that cannot
express that is not describing this search.

**Logistics — 60%**

| Axis | What it measures | Weight |
|---|---|---|
| **Pay** | How far above the floor the top of the band sits. Curved: the first five dollars over matter more than the fifth five | 3 |
| **Commute** | Drive minutes from home, or the train. Not miles | 3 |
| **Posture** | Seated all day or moving all day, both good. Standing still in one place, worst | 2.5 |
| **Hours** | Weekday daytime ideal; regular late nights and overnights close to disqualifying | 1.5 |

**The job itself — 40%**

| Axis | What it measures | Weight |
|---|---|---|
| **Industry** | The tier table. Replaces the hand-waved "domain pull" it used to be | 3 |
| **Container** | Recurring in-person contact with the same people, on a schedule, with a defined task | 2 |
| **Service-compatible** | Veteran-friendly, USERRA-routine, defense-adjacent, federal | 1.5 |
| **With-people** | Social contact embedded in shared work — not quota-carrying, not policing people | 1.5 |
| **Reachable** | How much of the requirement gap is soft rather than hard | 1.5 |
| **Overqualification risk** | Whether this posting is likely to auto-reject as "flight risk" | 1 |
| **Liveness** | Is this a real open req or a ghost? | 0.5 |

Every weight is a slider the owner controls. The default weighting is an
argument, not a fact, and it is overridable in one tap.

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
resume, flags it and **switches to the stripped resume variant** (§5).

### Top

A tab, and where the app opens. The best jobs across every lane, held to the
same baseline the lanes use — radius, pay floor, no sales, nothing already
applied to.

Ranking alone does not produce a useful top list. Sorted purely by score the
real pool returns the same hospital role fifteen times, once per shift. So
near-identical postings fold into one entry that says how many shifts it was
posted as, and no employer may take more than three places. The list shows the
range of what is out there rather than one company's hiring plan.

### Gettability is blended, not a ceiling

Measured over the real pool rather than reasoned about, and the first two
attempts were both wrong.

A hard ceiling at gettability + 3, with gettability also the heaviest axis,
double-counted it: fit ended up correlating with the final score at **0.20**,
so seven of the eight axes were decoration. Worse, clearance-sponsoring jobs —
the most valuable kind here — averaged **3.50** against 5.35 for everything
else. The feature was being punished.

Now gettability is counted once, as a blend, and the axes carry fit. The share
has been re-measured since pay became an axis, and the re-measurement found the
third mistake.

**Pay and gettability correlate at r = −0.84 in this pool.** They are very
nearly the same number with the sign flipped: the jobs that pay well here are
defence and software engineering, which are hard to win, and the jobs that are
easy to win are university and hospital administration, which pay less. So
every point of gettability blended in is a point taken off pay — and pay is the
first constraint there is. At the old 25% share, with pay newly an axis, the pay
axis correlated with the final score at **−0.47**. Paying better made a job
score worse, and nothing in the code said so.

Sweeping the coefficient again, with the impossible-floor in place. Two columns,
because a whole-pool correlation mixes two populations — the ~270 capped
unwinnable postings sitting at the bottom, and the list that actually gets read.
The first measures the cap; only the second measures the ranking.

| share | whole pool: r(pay) | top 200: r(fit) | r(pay) | r(gettability) |
|---|---|---|---|---|
| 0.10 | −0.22 | 0.55 | −0.09 | 0.38 |
| 0.15 | −0.30 | 0.42 | 0.06 | 0.40 |
| **0.20** | **−0.39** | **0.48** | **0.20** | **0.33** |
| 0.25 | −0.48 | 0.43 | 0.18 | 0.40 |

**20%** is where every group moves the top of the list in the direction it
should and none of them owns it. A separate floor holds the genuinely unwinnable
(gettability ≤ 1) below 4 whatever their fit, a Tier E industry is held below 3,
and the raw fit is shown alongside so the number can be explained rather than
trusted. `npm run audit` reruns all of this against the current pool.

The ease model's own pay rule had to change too. It stepped: +2 below $70k a
year, 0 above it, which put a two-point cliff at $33.65 an hour — the middle of
the band actually being searched. Two nearly identical warehouse jobs came out a
point and a half apart on nothing but which side of the step they fell. It is a
smooth curve now, and it still penalises six figures, which is a real signal
about how many people are competing.

Gettability itself was also clamped to 0..10, which piled **a quarter of the
pool onto exactly 0** — a senior cleared defence role and an ordinary
competitive one became indistinguishable. A logistic curve keeps the ordering
with no pile-up at either end.

### A low score never blocks anything

A 4/10 stays selectable and still gets a full application pack. The score is
information that was asked for, not permission. The rubric is an editable text
block, not a hidden prompt.

---

## 5. Screen 3 — the application pack

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

## 6. Wildcard

A section that **ignores the filter stack on purpose** — jobs that wouldn't
survive the funnel, tagged so they never look like a bug:

`easy money` · `interesting` · `stretch` · `weird`

**One override:** the Container axis still applies here. A solo overnight post
scores as "easy money" on every other measure and is exactly the wrong
recommendation — so wildcards are drawn from roles that still put you in a room
with people. Low-demand, not low-contact.

---

## 7. Liveness — not chasing ghosts

- Posting age is shown on every row
- **Reposts are detected and flagged.** A req that reappears every 30 days is
  usually dead, and applying to it is where applications quietly go to die.
- **Stale and reposted listings are down-ranked and flagged, never hidden.** A
  dead req occasionally revives, and hiding one makes every count a lie. The
  flag says what is suspected and the ranking acts on it; the decision stays
  with the person reading it.

This needs no infrastructure: the scheduled scan commits its results, so **the
repo's own git history is the posting-age database.** First-seen date and repost
count come free.

---

## 8. Duplicates

The same req arrives four different ways — the company's own board, an
aggregator, a LinkedIn alert, a friend's link — and four rows for one job makes
every count a lie.

**Merged into one row**, keyed on normalised company + title + location, with
fuzzy title matching for the small variations boards introduce.

- **The canonical link is the company's own board**, always, when one exists.
  It is the direct apply path, it is freshest, and it skips the aggregator
  redirect chain that loses applications.
- The row carries a `seen on 4 boards` badge, expandable to every source and
  every link.
- **A separate Duplicates view** lists every merged group, so what got collapsed
  is auditable and a wrong merge can be split back apart. Merging silently is
  the same sin as filtering silently.

**Cross-posting count is a signal, not just noise.** A job pushed to five boards
is usually hard to fill, agency-driven, or high-churn. A job sitting only on the
company's own board is often fresher and far less competed against. Both are
worth knowing, so the count is shown rather than thrown away.

---

## 9. The applied log

A tick box on every job: **Applied.** That is the whole interaction. Everything
else is derived from it.

Each entry records the date, which link was used, which resume variant went out,
and which cover letter. Statuses move `applied → replied → interviewing →
offer / rejected`, and anything sitting untouched past a set age is marked
**`ghosted`** rather than left ambiguous — that is what happened, and a log that
won't say so is less useful than one that will. **The threshold is 21 days.**
Three weeks without a reply is not a shortlist, and calling it early keeps the
counts honest rather than leaving dead applications inflating an "in progress"
number for months.

What it buys, beyond a list:

- **Applied jobs leave the pool** — suppressed, never deleted. The same posting
  never comes back around as new, whichever board it reappears on.
- **It closes the loop with duplicate detection.** A job applied to 45 days ago
  that resurfaces as a fresh posting is a confirmed dead req. Not a guess — a
  dated record. That single fact explains a great many silences.
- **It is the only thing here that gets smarter over time.** After fifty entries
  it can say which lanes actually produce replies and which produce nothing,
  which is the feedback loop that blind volume never provides. Applications sent
  into the dark teach nothing no matter how many there are.
- It is exportable, because the record of what was applied to and when is worth
  more than the tool that produced it.

---

## 10. Sources

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

**25 miles from home is the default radius on every lane**, applied before
anything else. It can be widened per lane, but nothing starts wide.

Distance uses an offline ZIP-centroid table — free, no key, no rate limit,
accurate to a couple of miles, which is all a radius filter needs. The home ZIP
is a setting that never leaves the device, so a move is one field, not a rebuild.

---

## 11. The starter scan list

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

## 12. Pay

The floor is a **setting on the device, never a number in this repo.** A public
repo stating a walk-away figure hands it to the other side of every negotiation
that follows.

The mechanics, which are not secret:

- **Compare against the top of a posted range, not the bottom.** A range whose
  top clears the floor stays in, flagged, because a band starting low is a
  negotiation rather than a rejection. Filtering on the bottom throws away
  jobs that would have paid.
- **Normalise everything to one unit** before comparing — hourly, annual,
  monthly, and weekly all appear, and a floor that only understands one of them
  silently drops the rest.
- **Unlisted pay is included and tagged `no pay listed`, not down-ranked.** It
  is an unknown, not a negative — plenty of them pay well, and pushing them down
  would quietly recreate the filtering-by-invisible-rule problem this app exists
  to solve. Roughly half of postings carry
  no number, and excluding them to enforce a floor removes more good jobs than
  bad ones. A separate toggle hides them for anyone who wants that.
- **No stretch below the floor.** There used to be a configurable step down for
  a job scoring at the very top. There isn't now: the floor is stated as an
  absolute minimum rather than a preference, and a "high-fit override" is
  exactly the mechanism by which an absolute minimum stops being one.

Pay is **both a gate and an axis**, and that is a reversal. It used to be a gate
only, on the reasoning that clearing the floor twice over does not make a job
better. That reasoning was wrong for this search: pay is the first of the
logistics and the logistics outrank everything, so the money has to move the
ranking and not merely open the door. What it must not do is move it
*backwards*, which is what §4 is about.

## 13. How it runs

- Static site on GitHub Pages, phone-first
- A scheduled GitHub Action scans **nightly** and commits results, so the page
  is simply *there* in the morning
- Rules, nets, profile and selections in `localStorage`, exportable as a backup
- Scoring and letters call Claude from the browser with the owner's key
- Every part inspectable in this repo. No service, no account, no ranking that
  can't be read.

---

## 14. Not yet decided

- Whether the paste box parses alert emails on-device or needs a small parser
  service (on-device preferred; some HTML is hostile)
- Whether the applied log should also track referrals and recruiter contacts,
  or stay strictly a record of submitted applications
