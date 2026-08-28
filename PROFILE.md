# Job search — profile

The half of the spec that is about the person rather than the machine. Kept in
the repo by the owner's explicit decision; the pay floor in §2 is the one line
with a concrete cost, since it is the number on the other side of any
negotiation, and it can be moved to a device-only setting at any time.

`SPEC.md` is how the tool works. This is what it is working from.

---

## 1. Logistics

| | |
|---|---|
| Base | Wakefield, MA 01880 |
| Radius | **25 miles, default on every lane.** Widen per lane, never start wide. |
| Transport | Reliable car, will commute |
| Availability | Now |
| Moving | Apartment move in progress — radius anchor is a setting, change one field |

---

## 2. Money

| | |
|---|---|
| Interviewing at | **$28–34/hr** |
| Default floor | **$26/hr** — the number every lane filters on |
| Absolute floor | **$25/hr**, and only for a job scoring at the very top on fit |
| Obligations | ~$2,000/month must be covered. This is the survival line, **not the wage target.** |

$26/hr is roughly **$54,000/year** or **$4,500/month** at full time. Any posting
in annual, monthly or weekly terms gets normalised to this before comparison.

**Ranges are compared on their top, not their bottom.** A $22–30/hr posting stays
in the list. A band starting under the floor is a negotiation, not a rejection,
and filtering on the bottom throws away jobs that would have paid.

**Postings with no pay listed stay in**, tagged as unknown. About half of all
listings carry no number; excluding them to enforce a floor removes more good
jobs than bad ones.

---

## 3. Service and clearance

- Army National Guard, **Officer Candidate School pipeline through ~August 2027**
- One weekend a month plus annual training
- Needs an employer for whom **USERRA is routine**, not a surprise
- **No clearance currently.** Eligible for DoD Secret / Top Secret. Expected to
  hold one in roughly a year.

Two consequences for the tool:

1. Veteran-friendly, defense-adjacent and federal employers are **weighted
   heavily up** — not as a nice-to-have but as a scoring axis.
2. Clearance is written in every cover letter as **pending, never absent**:
   eligible, in the pipeline, expected within ~12 months. It is an asset
   arriving, and it reads as one when phrased that way.

`Must be able to obtain a Secret clearance` is a requirement **already met.**
That one distinction is worth a large number of jobs inside the radius.

---

## 4. What actually predicts a good fit

The strongest signal is not subject matter. It is whether the role puts you in a
room with **the same people, repeatedly, on a schedule, with a defined task.**

Every strong stretch has happened inside an externally structured container with
consistent human contact. Every bad one has followed that container ending.

So:

- **Recurring in-person contact carries the highest weight of any axis.**
- **Fully remote and solo roles are excluded by default**, regardless of pay or
  title. Not down-ranked — excluded, with the toggle visible so it can be undone
  deliberately rather than drifted into.
- The social contact has to be **embedded in doing something together.** Not
  sales-floor extraversion, not client-facing quota work.

This is also why the Wildcard section keeps the container rule. Without it,
"easy money" surfaces solo overnight work — the worst answer wearing the costume
of the easiest one.

---

## 5. What a resume can't show

- Reads power structures and social systems fast, then operates inside them.
  Selected senior peer leader of a 220-person unit having arrived anonymous.
- De-escalation; gets outcomes all parties can accept. People bring problems.
- Exceptional recall for detail. Genuine intellectual independence. Comfortable
  with ambiguity.
- Enters an unfamiliar environment and is useful inside a week.
- Self-taught full-stack; shipped products with no formal training.

These map onto **program coordinator, operations, liaison, analyst** language
almost directly, and none of them survive a resume skim. They belong in cover
letters, in those terms.

---

## 6. Fields

**Pull toward** — intelligence and analysis (stated goal: MI 35-series) ·
higher education administration · student affairs · operations and coordination ·
program coordination · events and facilities · investigative and research work ·
geopolitics-adjacent · anything where the role is connective tissue between
groups.

**Weight down** — commission-driven sales · pure remote · anything with no team ·
roles where the whole job is enforcing rules on people.

---

## 7. The two-ended rejection problem

Rejected as **overqualified** for hourly work and **under-credentialed** for the
roles above it. Both ends at once, which is why volume alone hasn't worked.

**Two resume variants, picked by posting tier, always overridable:**

| | Full | Stripped |
|---|---|---|
| Used for | professional / career roles | hourly and operations roles |
| Honor society | keep | **remove** |
| Certificate wall (Yale / IBM / Google) | keep | **remove** |
| "Senior Account Manager II" | keep | **retitle** — reads as flight risk |

**Both variants lead with: 28 months at Verizon, business-segment revenue 4.5x.**
This is the strongest line available and it is habitually narrated as a failure.
It leads unless a posting makes it irrelevant. This is a rule, not a preference.

**Both variants carry:** Platoon Guide — selected peer leader, 58 soldiers — and
unit SHARP representative. These are accountability, coordination, compliance,
records and mediation credentials, and they map onto program-coordinator and
operations language directly.

**Apply to soft requirements.** "Preferred", "a plus", "or equivalent
experience", "or related field" are open doors. Self-selecting out of those
loses more jobs than any filter ever will. The tool separates soft gaps from
hard ones and says which is which.

---

## 8. Lanes and their defaults

Wide net on purpose — employment is the goal — but split, so each can be
tightened on its own terms.

| Lane | Floor | Radius | Notes |
|---|---|---|---|
| **Easy hire** | $26 | 25 mi | Speed to hire matters most. Container weighted hardest. |
| **Operations** | $26 | 25 mi | The five-year track. Highest expected hit rate. |
| **Higher ed** | $26 | 25 mi | Already done and enjoyed. Watch academic hiring cycles. |
| **Security** | $26 | 25 mi | `clearable` ON, `active clearance required` OFF. |
| **Technology** | $28 | 25 mi | Skip hard CS-degree gates; portfolio counts here. |
| **Analysis** | $26 | 25 mi, widenable | The direction. Worth applying at bad odds. |
| **Federal** | GS equiv | 25 mi | Veteran preference surfaced, not buried. |

**Bridge vs direction is the real split.** Easy hire / Operations / Higher ed pay
rent this quarter. Security / Analysis / Federal are where the next few years
go. Blending them into one ranked list produces something wrong for both.

---

## 9. What the tool does with all this

1. Scans overnight, commits results, so a fresh pool is waiting each morning
2. Splits it into the lanes above, each with its own count
3. Filters on rules that are visible and switch-off-able
4. Scores on axes that are visible and reweightable — never one opaque number
5. Separates soft requirement gaps from hard ones
6. Flags reposted and stale reqs as likely dead
7. Picks a resume variant by posting tier
8. Writes a cover letter that leads correctly and never invents anything

---

## 10. Still open

- Whether stale postings are hidden or just down-ranked
- Scan cadence — nightly, or twice daily
- Whether "no pay listed" should be down-ranked rather than merely tagged
- Where this file lives long-term: a private repo, or on the phone only
