# Job search — the configuration

What the scanner is set to. Every number here is in the code, and the code
points back here; if the two ever disagree the code is what runs, so fix the
code.

The sensitive half of the source document — medical detail, weight, which
employers have turned him down — is deliberately not in this repo. It changed
what the rules are, not what they say.

---

## 1. Logistics outrank industry

**Roughly 60% logistics, 40% the job itself.** A Tier C role at $28/hr twenty
minutes away beats a Tier A role at $21/hr in Boston.

| | |
|---|---|
| Pay floor | **$25/hr** (~$52k/yr). Absolute minimum, not a preference. |
| Commute | **30 minutes by car.** Anywhere reachable by commuter rail or the T. |
| Ideal hours | Strict 9–5, or an early shift, 6am–2pm |
| Acceptable | Occasional late nights |
| Unacceptable | Regular late nights, overnight shifts |
| Employment type | Full-time, temp-to-hire and contract all welcome |
| Benefits | Covered by TRICARE. Health benefits are **not** weighted. $28/hr without beats $22/hr with. Free meals and tuition remission are real money. |
| Home | Wakefield, MA |

`src/lib/commute.ts` turns straight-line miles into drive minutes, because the
gazetteer gives one and the constraint is the other. Wakefield to Boston is 10.3
miles direct and about 26 minutes, and the model is checked against that. The
25-mile radius it replaced admitted a fifty-minute drive as though it were a
commute.

## 2. Hard exclusions

Out entirely, whatever the pay. `src/lib/industry.ts`, Tier E.

- Sales of any kind, any commission component
- Insurance — sales, claims, or adjacent
- Gambling, telemarketing, collections
- Police, fire, corrections, probation, emergency management and 911 dispatch
- Transit operations, utilities, the trades and trade apprenticeships
- Kitchens, food production, manufacturing and assembly lines
- Nursing and clinical roles — no licence
- Roles requiring a clearance **already held** (his lands around Aug 2027)
- Outdoor work November to March
- Retail and front-line customer service **unless $30/hr or more**

Two of these reverse earlier decisions in this repo: there was a Public safety
lane, and trade apprenticeships were deliberately left in as "a real route, not
noise". Both are gone.

The exclusions are lane rules, not invisible filters — they appear in the stack
with a count, and switching one off brings its jobs back. A Tier E job still
cannot rank above 3, so switching the rule off shows you the jobs without
recommending them.

## 3. Posture — weighted heavily

**Either seated all day or moving all day. Standing still in one place is the
worst case.** This rules out most retail, greeter and host work, and rules *in*
both desk work and warehouse work.

Postings state this more often than they state anything else useful, because the
physical-requirements paragraph is a legal habit. `src/lib/posture.ts` reads
that paragraph first and the title second.

The trap: nearly every warehouse posting says "stand for long periods" and then
says "walk, lift and move about" in the next clause. Reading the first half
alone would zero out an entire acceptable tier, so a standing signal only counts
against a job when there is no walking beside it.

## 4. Work style

- **Repetition is fine indefinitely, provided the system is coherent.** What is
  not tolerable is improvised, undocumented, constantly-changing process. The
  repetition was never the problem.
- Comfortable with cleaning and custodial work at proper pay; with hostile or
  difficult members of the public; with bureaucracy, forms, records and
  compliance; with working alone all day if the pay is good.
- Lean rather than strong. Physical work yes, wrecking his back no.
- Prefers heat to cold. 100°F is fine.

## 5. Industry weights

`INDUSTRY_WEIGHT` in `src/lib/industry.ts`. Tier A is 8+, Tier E is 0.

| Tier | |
|---|---|
| **A** | higher education administration **9** · museums & cultural institutions, media & creative production, publishing & editorial, graphic design, video & content production, archives & records, marketing operations **8.5** · K-12 non-teaching, municipal, state agency, events & AV **8** |
| **B** | faith-based nonprofits 7.9 · legal support, HR & recruiting coordination 7.8 · conservation & land trusts, parks, environmental field work 7.2 · veterans services, software development, IT support, QA, data analysis 7 |
| **C** | courts, libraries, hospital administration, facilities, custodial, groundskeeping 6.5 · warehouse & distribution, postal 6 |
| **D** | hotel operations 5.7 · moving & delivery 5.5 · social services 5 |
| **E** | everything in section 2, at 0 |

Three rules sit on top of the table:

- **The institutional boost.** Every industry above 8 is either a mission-driven
  institution or creative work, and none of them is private-sector commercial.
  So an institution lifts a generic title: an Administrative Assistant post at a
  college is higher-education administration and scores 9. It lifts a role that
  already has a tier of its own by at most **1.5** — taking the higher of the
  two outright made "Recycling Services Driver" at Harvard a nine, ranking it
  above the university's own administrative posts.
- **The software-employer discount.** IT support, QA, junior analysis and
  technical support are among the strongest options available *at
  non-technology employers*, where he would be the most technically capable
  person in the building. At a software company he is measured against career
  engineers, so the same titles are capped at 5.5 there.
- **The season.** Outdoor field work — groundskeeping, parks, environmental
  survey — is 6.5 or 7.2 from April to October and **0** from November to March.
  The weight is resolved when it is read, not when it is scanned, so a scan from
  October is not still paying out for groundskeeping in January.

**Federal agencies are scored at 8**, alongside state agencies. That is the one
number here the source document does not give. Federal civil service is absent
from its table, veterans' preference applies, and by the table's own stated
pattern it is a mission-driven institution. Argue with this one first.

## 6. Search

The lanes are built from the table: Crossover, Coordination, Operations, Higher
ed & schools, Creative & media, Library & museum, Records & archives,
Government, Legal & HR, Health admin, IT & data, Warehouse & logistics,
Facilities & custodial, Mission, Outdoors, Sponsors a clearance — plus Easy hire
and Everything.

**Crossover** is the search flagged as never having been run: a Tier A employer
and a job that involves writing or making something. "Communications coordinator
university", "media assistant museum", "content producer nonprofit", "marketing
coordinator college". He writes well and has never applied to this category.

Parsing rules that have not changed and should not:

- **Do not filter on hard requirements.** Scan for "preferred", "or equivalent
  experience", "willing to train". Reading a job description as a spec sheet is
  how he self-selects out of jobs he would get.
- Deprioritise postings reposted more than 30 days old — likely dead reqs.
- Surface roles buried by algorithmic ranking. That is the whole point.

## 7. Two resumes

Rejected at both ends: ghosted by professional roles, and rejected as
overqualified by hourly ones. `variantFor` picks on the industry tier.

- **Variant A — full.** Tier A and B. Leads with the Verizon result — 28 months,
  business-segment revenue 4.5x — then SNHU Student Involvement, Platoon Guide,
  the degree, the certificates.
- **Variant B — stripped.** Tier C and D. No honour society, no Yale
  certificates, no "Senior Account Manager II" title; Verizon reframed as plain
  work history. Reliability, physical capability, service, clean record,
  immediate availability. Those three credentials read as flight risk and are
  costing him offers.

## 8. Service

Massachusetts Army National Guard, Officer Candidate. One weekend a month plus
annual training; **drill dates are known well in advance but do not fall on a
fixed recurring calendar date.** USERRA applies, and a letter should say so
proactively rather than defensively.

Commissions as 2LT around August 2027 and will hold a clearance then. "Must be
able to obtain a clearance" is **already met** — that is a pending asset, not an
absence, and it is the single largest advantage on the resume.

## 9. Experience gap

Software, IT and data: interest 10, formal experience low. These are **not**
filtered out — they are tagged apply-anyway, entry-level and support-tier only.
Four shipped applications built with AI-assisted tools; no traditional language
fluency. No first aid, CPR, OSHA or forklift certification, so postings that say
"preferred, will train" are worth flagging.

## 10. Still open

- The board list is 40 employers and 64% of it is defence and software, which
  the table scores low. Every Tier A employer worth adding — the MFA, the
  Gardner, Mass Audubon, the Globe, Tufts, MIT, BU, the city and state — is
  behind iCIMS, Paylocity, Taleo or NEOGOV, none of which publish a board that
  can be read without an account. Berklee, Bentley and GBH were reachable and
  are in. Library & museum, Records & archives, Government and Outdoors are
  therefore near-empty lanes: correct rules with nothing to point at.
- USAJOBS still needs its two repository secrets. Until they are set there are
  no federal jobs at all, which is most of what Government would hold.
- The commute axis barely discriminates. Almost every posting in the pool
  resolves to "Boston, MA" and therefore to the same 10.3 miles, so the axis
  works as a filter and does almost nothing as a ranking signal.
