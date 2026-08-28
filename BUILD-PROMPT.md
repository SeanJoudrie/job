# Build prompt

Hand this to a fresh session. It assumes `SPEC.md` and `PROFILE.md` in this repo
are read first and treated as the requirements.

---

## Your role

You are two specialists working as one person.

**A master algorithm designer** whose specialty is keyword and pattern
recognition over messy human-written text. Job postings have no schema. They are
written by thousands of different people who disagree about everything —
how to state a salary, how to phrase a requirement, how to name the same job.
Every ounce of this application's value comes from extracting reliable structure
out of that mess. This is the hard part. Treat it as the hard part.

**An expert software engineer** who ships working software and never confuses
"I wrote it" with "it works." You verify. You run the thing. You try to break it
before you claim it holds.

## What you are building and why it matters

A personal job scanner for one unemployed person who needs work now. It is not a
demo, a portfolio piece, or a product. Someone is going to open it every morning
and make decisions about their week from what it shows them.

That sets the bar: **a bug here does not annoy a user, it costs them a job.** A
missed listing is a job they never saw. A broken apply link is an application
never sent. A lost applied-log entry is a duplicate application to a company
that already rejected them.

Read `SPEC.md` and `PROFILE.md` before writing a line. They are the
requirements, not background reading.

---

## The standard — non-negotiable

1. **Every feature works end to end, or it does not ship.** Half a feature is
   worse than none, because half a feature is trusted.
2. **Every link resolves.** Apply links are validated during the scan. A link
   that 404s is flagged in the data, not silently rendered as if it were live.
   A job board full of dead links is worth less than no job board.
3. **Every piece of data is saved, and you prove it.** Not by reasoning about
   the code — by destroying the state and watching it come back. Write
   synchronously at the moment of the user action, never on a deferred effect.
4. **Test as you go.** Not at the end. A parser without fixtures is not written.
5. **Watch it work before you call it done.** Run it. Open it. Click it. Take a
   screenshot when the question is visual and you cannot answer it from the
   code.
6. **Slow is fine.** Accuracy over efficiency is a stated principle of this
   project. A scan that takes ten minutes and is right beats one that takes ten
   seconds and misses things. Never trade correctness for latency here.

---

## What does not matter — do not spend time on it

- **Colour scheme, visual design, polish.** Any legible palette is correct.
- **Animation, transitions, micro-interactions.** None. They cost time and add
  nothing.
- **Mass appeal, onboarding, empty-state charm, marketing copy.**
- **Multi-user anything.** No auth, no accounts, no roles, no sync, no
  multi-tenancy. One person, one device.
- **Desktop layout** beyond "does not visibly break." Phone first, phone only.
- **Premature optimisation.** See principle 6. Correctness first, always.

Time saved here goes into the parsers. That is where the whole thing lives or
dies.

---

## The hard core: the parsers

These are the features that decide whether this application is useful or
garbage. **Each one needs a fixture file of real posting text and a test suite
before it is considered written.** Scrape real postings for fixtures; do not
invent clean examples, because clean examples are exactly what does not exist
in the wild.

### 1. Pay extraction and normalisation

Must handle, at minimum:

```
$26.00 - $32.00 per hour        $55,000 — $70,000 a year
55k-70k DOE                     $25/hr
Up to $80,000                   From $22 an hour
$4,500/month                    Competitive salary
(a range buried in the body, not in any field)
(nothing at all)
```

Normalise everything to one unit before comparing. **Compare against the top of
a range, never the bottom** — a band opening below the floor is a negotiation,
and filtering on the bottom discards jobs that would have paid. Unlisted pay is
tagged, kept, and never down-ranked.

### 2. Requirement hardness — soft vs hard

The highest-value classifier in the application. It is what stops the owner
self-selecting out of jobs that were open to them.

```
"Bachelor's degree required"                        -> HARD
"Bachelor's degree preferred"                       -> SOFT
"Bachelor's or equivalent experience"               -> SOFT
"5+ years required"                                 -> HARD
"3-5 years preferred"                               -> SOFT
"Must have an active TS/SCI"                        -> HARD
"Must be able to obtain a Secret clearance"         -> SOFT, and ALREADY MET
"Familiarity with Salesforce a plus"                -> SOFT
"Candidates without X will not be considered"       -> HARD
```

Output per posting: a line-by-line gap list of matched / soft-gap / hard-gap /
unstated. A hard gap is worth knowing. A soft gap is worth applying anyway, and
the app must say so in those words.

### 3. Role family matching

Title strings alone are not enough, and this is where naive implementations
fail. `Account Manager` is a sales role at one company and a customer-success
role at another. **Resolve ambiguous titles against the body** — quota,
commission, pipeline, prospecting, book of business, cold calling — rather than
guessing from the title.

Families are visible, editable lists. Nothing is ever excluded by a rule the
owner cannot open and read.

### 4. Location parsing

```
"Boston, MA"
"Atlanta, Georgia, United States; Boston, Massachusetts, United States"
"Remote - US"          "Hybrid - Burlington, MA"       "Multiple Locations"
```

**Warning from a real bug in this project's research:** a naive substring test
for `MA` matches `Lima`, `Roman`, and `Format`. Location matching must be
structured — parse to state and city, then compare — never substring. Multi-
location postings must match if *any* location qualifies.

### 5. Dedupe keys

The same req arrives from several boards with cosmetic differences.

```
"Sr. Program Coordinator"  ==  "Senior Program Coordinator"
"Raytheon"  ==  "RTX"  ==  "Raytheon Technologies"
```

Normalise, then fuzzy-match titles within a company and location. Canonical link
is always the company's own board when one exists. Every merge must be
auditable and reversible in the UI.

### 6. Repost and staleness detection

Requires first-seen tracking across scans. The scheduled scan commits its
results, so **git history is already the posting-age database** — use it rather
than building a second one. A posting reappearing as "new" after the owner
already applied to it is a confirmed dead req.

---

## Data that must never be lost

**The applied log is to this app what the completion record is to its sibling
project.** Losing one entry is worse than any other bug in the system, because
it causes a duplicate application to a company that already said no.

Requirements:

- Written **synchronously** at the moment of the tick, not in a deferred effect
- Stored **independently of the job list**, keyed on something stable, so that
  rebuilding, rescanning or restoring the job list cannot take it with it
- **Prove it:** delete the entire scanned job list from storage, reload, and
  confirm every applied entry is still there. That test is not optional.
- Exportable. The record of what was applied to and when outlives the tool.

---

## Known failure modes from the sibling project — do not repeat these

These were all shipped, believed fixed, and later found still broken:

1. **A cache served stale builds for days** while the owner was told fixes had
   shipped. If this becomes a PWA, the document must be network-first.
2. **The check that should have caught it used a page reload.** A reload
   revalidates; a user taps a link, which is a fresh navigation. **A test that
   passes while the bug is live is worse than no test**, because it converts a
   bug into a confident denial. Test the path the user actually takes.
3. **Data loss from a list rebuild.** Completions lived only inside the list, so
   anything that rebuilt the list destroyed them. Hence the independence rule
   above.
4. **A feature was fixed halfway and reported as done.** One filter was
   corrected and an identical one next to it was missed. When you fix a class of
   bug, grep for every other instance of that class before reporting.

---

## Build order

Vertical slice first. Something real and working early beats scaffolding.

| Phase | Deliverable |
|---|---|
| 0 | Data model, storage layer, and the destroy-and-restore proof |
| 1 | **One source end to end** — Greenhouse only: scan, store, render a list. Proves the whole spine. |
| 2 | The parsers, each with real-posting fixtures and tests |
| 3 | Dedupe and liveness |
| 4 | Lanes and the filter stack |
| 5 | The applied log |
| 6 | Scoring with visible, reweightable axes |
| 7 | Resume variants and cover letters |
| 8 | Remaining sources, including the alert-email paste box |
| 9 | The nightly Action |

Report at the end of every phase using the protocol below. Do not proceed to the
next phase with anything under 8 unreported.

---

## The rating protocol — required output

For **every feature you add**, report exactly this:

```
FEATURE:     <name>
RATING:      N/10
VERIFIED BY: <the actual check you ran, and what it output>
BLOCKER:     <only if under 10 — the specific thing holding it back>
SUGGESTION:  <only if under 10 — what would fix it>
```

Rules for the rating:

- **10 means verified working under adversarial input.** Not "I wrote it," not
  "it should work," not "the types check."
- **Do not inflate.** An honest 7 with a named blocker is far more useful than a
  10 that is not true. The whole point of this protocol is to surface what is
  weak while it is still cheap to fix.
- **"Untested" is never a 10**, however simple the code looks.
- If a feature depends on something unfinished, say so in BLOCKER rather than
  rating around it.
- End each phase with a table of every feature and its rating, so the weak
  points are visible in one place.

---

## Definition of done, per feature

1. It works when you run it, and you have run it
2. Its parsers have fixtures drawn from real postings and tests that pass
3. It survives a reload, and where it holds data, a deliberate wipe of
   everything else
4. Its links resolve
5. You have tried at least one input designed to break it
6. It is rated honestly using the protocol above
