import type { Pack, PackId } from './packs'

/**
 * The resume and the letter, per pack.
 *
 * Written as one dataset with eight lenses rather than eight documents. Eight
 * separate files drift: a job gets added, seven copies keep the old version,
 * and the one that goes out is whichever was edited last. Here every fact is
 * stated once and each pack chooses which of them to lead with.
 *
 * Contact details are NOT here. They live in Settings, on the device, and are
 * injected when the document renders — this repository is public, and an
 * address and phone number in it is a different kind of exposure from a list
 * of job postings.
 */

export type Contact = {
  name: string
  city: string
  email: string
  phone: string
  /** Anything else worth a line: a portfolio, LinkedIn, a GitHub. */
  links: string
}

/** Dates live in Settings too, because getting one wrong is worse than leaving it out. */
export type Dates = { verizon: string; snhu: string; guard: string; firstJob: string }

export const DEFAULT_DATES: Dates = {
  verizon: '2023 – 2025',
  snhu: '2021 – 2023',
  guard: '2024 – present',
  firstJob: '2020 – 2021',
}

type Bullet = {
  text: string
  /** Packs this bullet is written for. Omitted means every pack gets it. */
  packs?: PackId[]
}

type Role = {
  title: string
  /** Variant B drops the seniority. "Senior Account Manager II" reads as flight risk. */
  strippedTitle?: string
  org: string
  dateKey: keyof Dates
  bullets: Bullet[]
}

const EXPERIENCE: Role[] = [
  {
    title: 'Senior Account Manager II, Business',
    strippedTitle: 'Account Manager',
    org: 'Verizon Wireless',
    dateKey: 'verizon',
    bullets: [
      { text: 'Grew business-segment revenue 4.5x year over year, rebuilding an underperforming location’s pipeline from the ground up.' },
      { text: 'Managed a portfolio of business accounts end to end — onboarding, billing questions, renewals, escalations — with nothing tracked anywhere but a system I kept myself.' },
      { text: 'Wrote and maintained the account documentation the rest of the location worked from.', packs: ['office', 'creative', 'public'] },
      { text: 'Resolved escalated customer disputes in person, including from people who arrived angry.', packs: ['health', 'public', 'mission', 'operations'] },
      { text: 'Ran daily reconciliation of orders, credits and inventory against the system of record.', packs: ['health', 'technical', 'office', 'operations'] },
    ],
  },
  {
    title: 'Operations Supervisor, Office of Student Involvement',
    strippedTitle: 'Operations Supervisor',
    org: 'Southern New Hampshire University',
    dateKey: 'snhu',
    bullets: [
      { text: 'Ran front-desk operations for a student-facing office: coverage schedules, walk-ins, phones, and the paperwork behind all of it.' },
      { text: 'Supervised and scheduled work-study staff, including covering the desk myself when a shift fell through.' },
      { text: 'Coordinated events from booking through setup, staffing and teardown — workshops, orientation sessions and conferences.', packs: ['education', 'creative', 'mission', 'public'] },
      { text: 'Tracked departmental spend and reconciled it against allocations.', packs: ['education', 'office', 'public', 'health'] },
      { text: 'Maintained student records and rosters, and knew what could and could not be released to whom.', packs: ['education', 'health', 'public'] },
      { text: 'Set up and troubleshot room technology for presentations and hybrid sessions.', packs: ['technical', 'creative'] },
    ],
  },
  {
    title: 'Officer Candidate · Platoon Guide · Unit SHARP Representative',
    strippedTitle: 'Soldier · Platoon Guide',
    org: 'Massachusetts Army National Guard',
    dateKey: 'guard',
    bullets: [
      { text: 'Selected as Platoon Guide — senior peer leader over a 58-soldier platoon within a 220-person company.' },
      { text: 'Unit SHARP representative: first point of contact for reports, delivered prevention training to the company, and maintained records and reporting to standard.', packs: ['education', 'mission', 'health', 'public', 'office'] },
      { text: 'Barracks operations representative — accountability, inventory, inspection readiness and the records behind them.', packs: ['operations', 'office', 'public', 'health'] },
      { text: 'Officer Candidate School pipeline; commissions as 2LT and holds a security clearance from approximately August 2027.', packs: ['public', 'technical'] },
      { text: 'One weekend a month plus annual training. Drill dates are known well in advance. USERRA applies.', packs: ['operations', 'health'] },
    ],
  },
  {
    title: 'Operations & Customer Service',
    org: '«earlier employer — fill this in»',
    dateKey: 'firstJob',
    bullets: [
      { text: 'Hired to sanitise surfaces and within months was running the front desk, opening customer accounts, training new hires and supervising a team of five.', packs: ['operations', 'office', 'health', 'mission'] },
      { text: 'Cleared overgrown grounds, handled opening and closing, and kept the site presentable through the season.', packs: ['operations'] },
    ],
  },
]

const EDUCATION = {
  degree: 'B.A. Psychology, minor in Business Analytics',
  school: 'Southern New Hampshire University',
  detail: 'GPA 3.7 · President’s List 2021–2023',
  /** Variant B drops this: the honour society is one of the three things reading as flight risk. */
  honours: 'Order of Omega honour society',
}

const LEADERSHIP = [
  'Head Senator, Budget & Finance — Student Government Association',
  'Vice President — Phi Delta Theta',
  'Vice President — Math Club',
]

/** Variant B drops these entirely. */
const CERTIFICATES = [
  'Yale University — Financial Markets (with Honors), Connected Leadership, Narrative Economics, American Contract Law, The Global Financial Crisis',
  'IBM — Project Management, Data Analytics',
  'Google — Digital Marketing',
]

const SOFTWARE =
  'Four shipped applications, self-taught with AI-assisted tooling: Skein (link analysis, timeline and schematic mapping), Palisade (10,000-row enterprise data grid), Globalio, Flexyn.'

/** The line under the name. The one piece genuinely rewritten per pack. */
const SUMMARY: Record<PackId, string> = {
  education:
    'Five years of operations and coordination, two of them inside a university student-affairs office — front desk, scheduling, student staff, events and departmental budgets. Psychology degree, President’s List, and a record of being the person a process runs through.',
  health:
    'Five years of administrative and operations work built on scheduling, records and reconciliation. Comfortable being the first point of contact on a difficult day, comfortable with compliance and documentation, and looking for a defined weekday schedule I can hold for years.',
  office:
    'Five years of coordination and operations across university, retail and business settings. Calendars, records, budgets, correspondence and the systems underneath them. I read an organisation’s processes quickly and work inside them rather than around them.',
  public:
    'Five years of records, compliance and public-facing coordination — university administration, business account management, and a military role built on accountability and reporting to standard. Used to bureaucracy, and genuinely untroubled by it.',
  creative:
    'Operations and coordination background with a writing habit: account documentation, prevention training, event programmes, and four shipped software products written and designed end to end. I write clearly and I finish things.',
  technical:
    'Operations coordinator who has shipped four working applications self-taught, and who has been the most technically capable person in every non-technical building I have worked in. Looking for support, QA or analysis work where that is the useful shape.',
  mission:
    'Five years of coordination and direct service, including two as a university student-affairs supervisor and a current role as my unit’s sexual harassment and assault prevention representative. Comfortable with difficult conversations and with the records that have to follow them.',
  operations:
    'Five years of hands-on operations work — warehouse-adjacent logistics, facilities, front-desk coverage and team supervision. Reliable, physically capable, clean driving record, own transport, and available to start immediately.',
}

export type ResumeSection = { heading: string; lines: string[] }
export type Resume = {
  summary: string
  roles: { title: string; org: string; dates: string; bullets: string[] }[]
  sections: ResumeSection[]
}

const BULLET_CAP = 4

export function resumeFor(pack: Pack, dates: Dates): Resume {
  const stripped = pack.variant === 'stripped'
  const roles = EXPERIENCE.map((r) => ({
    title: stripped ? (r.strippedTitle ?? r.title) : r.title,
    org: r.org,
    dates: dates[r.dateKey],
    bullets: r.bullets
      .filter((b) => !b.packs || b.packs.includes(pack.id))
      .map((b) => b.text)
      .slice(0, BULLET_CAP),
  })).filter((r) => r.bullets.length > 0)

  const sections: ResumeSection[] = [
    {
      heading: 'Education',
      lines: [
        `${EDUCATION.degree} — ${EDUCATION.school}`,
        stripped ? EDUCATION.detail.split(' · ')[0] : `${EDUCATION.detail} · ${EDUCATION.honours}`,
      ],
    },
  ]
  if (!stripped) sections.push({ heading: 'Leadership', lines: LEADERSHIP })
  if (!stripped) sections.push({ heading: 'Certifications', lines: CERTIFICATES })
  if (pack.id === 'technical' || pack.id === 'creative') sections.push({ heading: 'Software', lines: [SOFTWARE] })
  sections.push({
    heading: 'Also',
    lines: stripped
      ? ['Clean driving record and reliable transport · available immediately · US citizen']
      : ['US citizen · security clearance eligible, expected 2027 · clean driving record · available immediately'],
  })

  return { summary: SUMMARY[pack.id], roles, sections }
}

/**
 * The letter, per pack.
 *
 * Two blanks and no more, both marked with guillemets so they are impossible to
 * miss and impossible to send by accident. A letter with more blanks than that
 * is not a pre-made letter, it is homework.
 */
const LETTERS: Record<PackId, string> = {
  education: `I have done this work. For two years I was an operations supervisor in Southern New Hampshire University’s Office of Student Involvement — front desk coverage, scheduling, supervising work-study staff, running events, and keeping the paperwork behind all of it straight. «ORGANISATION» is a larger version of the same problem and I would be glad to be back in it.

Two things I want to speak to directly. Supervising student staff is coordination rather than oversight: building a schedule that actually holds, knowing who is reliable for a nine o’clock, and covering the desk yourself when someone does not turn up. And departmental budgets — I sat as Head Senator on Student Government’s Budget and Finance committee, where allocations were argued line by line and reconciled afterwards. Purchase orders and expense reconciliation are familiar ground, not something I would be learning on your time.

Most recently I spent 28 months at Verizon managing business accounts, where I grew the location’s business-segment revenue 4.5 times year over year. That was a sales role and I am deliberately moving out of one. What it gave me was a book of work large enough that only a real system kept it straight.

I hold a B.A. in Psychology with a minor in Business Analytics, a 3.7 GPA and three years on the President’s List. I am available immediately.`,

  health: `I would like to be considered for the «ROLE» position at «ORGANISATION».

I have five years of administrative and operations work, most of it managing a schedule for people whose time was the scarce resource — screening who genuinely needed a meeting, moving things when the day changed, and keeping the calendar honest so nobody arrived to a conflict. I have prepared committee materials, taken and distributed minutes, and written correspondence that went out over someone else’s name and had to sound like them.

I am comfortable being the first point of contact on a difficult day. In my Guard unit I am the sexual harassment and assault prevention representative, which means being the person someone walks up to with something serious, knowing exactly what I am and am not permitted to do with what I am told, and keeping records to standard afterwards. That is a different subject from patient-facing work and the same discipline.

Excel, Outlook, Word and PowerPoint are daily tools rather than listed skills: tracking, reconciling, and pulling numbers from several places into one report somebody can act on.

I live in Wakefield, a weekday schedule is exactly what I want, and I am available to start immediately.`,

  office: `I would like to be considered for the «ROLE» position at «ORGANISATION».

Five years of coordination work, and the through-line is that I am the person a process runs through. At Southern New Hampshire University I ran front-desk operations for a student-facing office — coverage, scheduling, supervising student staff, events, and reconciling departmental spend. At Verizon I managed a portfolio of business accounts end to end for 28 months and grew the location’s business-segment revenue 4.5 times year over year.

What I am good at is reading how an organisation actually works and then working inside it rather than around it. I pick up a new system in about a week. I keep records because I have been on the wrong end of somebody else not keeping them. And I am comfortable with the parts of a job most people find tedious — forms, filing, reconciliation, the compliance paragraph nobody reads — which I understand is a large part of what this role is.

I hold a B.A. in Psychology with a minor in Business Analytics and certificates in project management and data analytics. I am in Wakefield, I have reliable transport and a clean record, and I am available immediately.`,

  public: `I would like to be considered for the «ROLE» position at «ORGANISATION».

Records, accountability and a public counter are the three things I have spent five years on. In my Guard unit I hold two additional duties on top of my own: sexual harassment and assault prevention representative, and barracks operations representative. Both are records roles. Both are audited. Both mean knowing precisely what may be disclosed, to whom, and on what timeline — and being the person the public side of it walks up to.

Before that I ran front-desk operations for a university student-affairs office: walk-ins, phones, student records, and knowing what could and could not be released. And 28 months at Verizon managing business accounts, where I handled escalated disputes in person, including from people who arrived angry.

I am genuinely untroubled by bureaucracy. A documented process I can learn and follow is the environment I do my best work in, and I would rather have one than not.

I am a U.S. citizen, currently in the Officer Candidate School pipeline, and will hold a security clearance from roughly August 2027 — an asset arriving rather than a gap. Clean driving record, own transport, available immediately.`,

  creative: `I would like to be considered for the «ROLE» position at «ORGANISATION».

I write, and I finish things. Four working software products designed and shipped end to end, self-taught, including the interface copy and the documentation. Before that, the account documentation an entire Verizon location worked from, and prevention training delivered to a 220-person Guard company — material that had to be clear to people who did not want to be in the room.

The operations half is real too. Two years running a university student-affairs office: events from booking through setup, staffing and teardown; room technology; the programme and the signage and the follow-up. Creative work at an institution is mostly logistics wearing a nicer jacket, and I have done the logistics.

Most recently 28 months at Verizon managing business accounts, where I grew business-segment revenue 4.5 times year over year. I am moving out of sales deliberately. What it left me with is the habit of writing for someone who has thirty seconds.

B.A. Psychology, minor in Business Analytics, 3.7 GPA. Portfolio available. I am in Wakefield and available immediately.`,

  technical: `I would like to be considered for the «ROLE» position at «ORGANISATION».

I have shipped four working applications — a link-analysis tool with timeline and schematic mapping, a ten-thousand-row enterprise data grid, and two others — self-taught, using AI-assisted tooling, from empty file to working product. I will not claim to be a career engineer and I am not applying as one. What I am is the person who has been the most technically capable body in every non-technical building I have worked in, and who would rather be doing that on purpose.

The support half is the part I have five years of. Front-desk and phone coverage at a university office, including setting up and troubleshooting room technology under time pressure with an audience waiting. Escalated account problems at Verizon, diagnosed in person. Daily reconciliation between systems that disagreed with each other.

I hold IBM certificates in project management and data analytics and a minor in Business Analytics, and I am comfortable in Excel at the level where it stops being a spreadsheet.

I am in Wakefield, available immediately, and happy to start at the support tier and be measured on what I actually fix.`,

  mission: `I would like to be considered for the «ROLE» position at «ORGANISATION».

I am my Guard unit’s sexual harassment and assault prevention representative. That means being a first point of contact for people disclosing something serious, knowing exactly what I am permitted to do with what I am told, maintaining records and reporting to standard, and delivering prevention training to a 220-person company. It is the work of holding a professional and supportive tone on a difficult day, in a setting where getting it wrong has consequences.

The coordination half I have also done. Two years as an operations supervisor in a university student-affairs office — front desk, scheduling, supervising student staff, events — and a seat as Head Senator on Student Government’s Budget and Finance committee, where I learned to read a funding process from the inside and explain it to people who needed a decision rather than a policy citation.

My degree is in Psychology. That is not a qualification for this work, but it is the reason I chose it.

I am in Wakefield, I have reliable transport and a clean record, and I am available immediately.`,

  operations: `I would like to be considered for the «ROLE» position at «ORGANISATION».

Five years of work, most of it on my feet. I have run front-desk coverage, opened and closed a site, kept grounds clear through a season, handled receiving and inventory, and supervised a team of five. I was hired into one of those jobs to sanitise surfaces and within a few months was doing most of the rest of it, which is roughly how I tend to go.

What I would bring is that I show up. Clean driving record, my own transport, and I live in Wakefield so the commute is not going to become a problem in February. I keep records because somebody has to and I would rather it be done properly. I am fine working alone all day and I am fine with the public when the public is annoyed.

I serve one weekend a month in the Massachusetts Army National Guard. Those dates are known well in advance and I will give you all of them up front.

I am available to start immediately.`,
}

export const letterFor = (pack: Pack): string => LETTERS[pack.id]
