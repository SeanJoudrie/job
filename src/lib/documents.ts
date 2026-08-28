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

/** Dates are editable, but these are the real ones off the 2026 resume. */
export type Dates = { guard: string; verizon: string; snhu: string; walgreens: string; mgfitness: string }

export const DEFAULT_DATES: Dates = {
  guard: 'Oct 2025 – present',
  verizon: 'May 2023 – Sept 2025',
  snhu: 'Oct 2021 – Apr 2023',
  walgreens: 'Aug 2022 – May 2023',
  mgfitness: 'Aug 2020 – Sept 2022',
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
  where: string
  dateKey: keyof Dates
  /** Packs where this role should open the resume instead of sitting in date order. */
  lead?: PackId[]
  bullets: Bullet[]
}

const EXPERIENCE: Role[] = [
  {
    title: 'Officer Candidate (E4) · Platoon Guide · Unit SHARP Representative',
    strippedTitle: 'Soldier (E4) · Platoon Guide',
    org: 'U.S. Army National Guard',
    where: '',
    dateKey: 'guard',
    lead: ['public', 'mission'],
    bullets: [
      { text: 'Completed Basic Combat Training; currently in the Officer Candidate School pipeline to commission as a Second Lieutenant.' },
      { text: 'Served as Platoon Guide — the senior peer leadership position — responsible for accountability and daily coordination of the platoon.' },
      { text: 'Unit SHARP and barracks-operations representative: enforced compliance standards, maintained accountability records, and mediated conflicts.' },
      { text: 'First point of contact for sensitive reports, working to a defined disclosure and reporting standard.', packs: ['mission', 'health', 'public', 'education'] },
      { text: 'One weekend a month plus annual training; drill dates are known well in advance and USERRA applies.', packs: ['operations', 'health'] },
    ],
  },
  {
    title: 'Senior Account Manager II, Business',
    strippedTitle: 'Account Manager',
    org: 'Verizon Wireless',
    where: 'Nashua, NH',
    dateKey: 'verizon',
    bullets: [
      { text: 'Rebuilt the pipeline at an underperforming location by auditing every account for plan optimisation and converting cost reductions into upgrades, growing business-segment revenue 4.5x year over year.' },
      { text: 'Managed a B2B account portfolio end to end in Salesforce, tracking KPIs and resolving billing and service issues.' },
      { text: 'Negotiated renewals and contract terms directly with business customers.', packs: ['office', 'public', 'creative', 'technical'] },
      { text: 'Resolved escalated billing and service disputes in person, including with customers who arrived angry.', packs: ['health', 'mission', 'operations', 'public'] },
    ],
  },
  {
    title: 'OSI Supervisor (Operations), Office of Student Affairs',
    strippedTitle: 'Operations Supervisor',
    org: 'Southern New Hampshire University',
    where: 'Manchester, NH',
    dateKey: 'snhu',
    lead: ['education', 'office', 'creative'],
    bullets: [
      { text: 'Coordinated campus-wide operations: event logistics, departmental budgets, vendor and client services, fleet scheduling, and the campus food pantry.' },
      { text: 'Maintained records and reporting across concurrent programmes while completing a full-time degree.' },
      { text: 'Ran event logistics end to end — booking, setup, staffing, teardown — for workshops, orientation and campus-wide programming.', packs: ['education', 'creative', 'mission'] },
      { text: 'Held departmental budgets and reconciled spend against allocations.', packs: ['education', 'office', 'public', 'health'] },
    ],
  },
  {
    title: 'Shift Lead',
    org: 'Walgreens',
    where: 'Melrose, MA',
    dateKey: 'walgreens',
    lead: ['operations'],
    bullets: [
      { text: 'Cash handling and financial reporting, inventory control, staff scheduling and training, and regulatory compliance.' },
      { text: 'Held this alongside the university operations role and a full-time degree.', packs: ['operations', 'office', 'health'] },
    ],
  },
  {
    title: 'Manager',
    org: 'MG Fitness',
    where: 'Wakefield, MA',
    dateKey: 'mgfitness',
    bullets: [
      { text: 'Oversaw club operations, staff training, financial reporting, and health and safety compliance.' },
      { text: 'Started on sanitation during COVID and grew into running the floor, opening member accounts, training new hires and supervising a team of five.', packs: ['operations', 'office', 'mission'] },
      { text: 'Handled opening and closing, grounds upkeep and equipment maintenance across a full site.', packs: ['operations'] },
    ],
  },
]

const EDUCATION = {
  degree: 'B.A. Psychology — April 2023',
  school: 'Southern New Hampshire University',
  detail: 'GPA 3.7 · President’s List 2021–2023',
  /** Variant B drops this: the honour society is one of the three things reading as flight risk. */
  honours: 'Order of Omega Honor Society',
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

const SOFTWARE = [
  'Self-taught developer. 8 products and 12 standalone builds shipped since May 2026, spanning data analysis and visualisation, enterprise interfaces, real-time 3D and GPU rendering, and full production applications.',
  'Skein — link-analysis and spatial-temporal fusion board: network chart, timeline scrubber and schematic map, cross-linked so selecting an entity or time window updates every view. Built without graph or mapping libraries.',
  'Palisade — enterprise data grid handling 10,000 records: virtualisation, keyboard navigation, range copy/paste, sort, filter, undo-redo and CSV export.',
  'Globalio — live geography game, 50+ modes across 197 countries; every player worldwide gets an identical daily challenge from a deterministic seed, with no backend.',
  'Real-time 3D and GPU rendering — six builds rendering 50,000–80,000 GPU points from scientific datasets, animated in vertex shaders.',
  'Flexyn (co-founder, 2026) — fitness application built with one collaborator: 5,000-exercise database, row-level access control on every table. Private beta.',
]

const SKILLS =
  'Operations & logistics · Program coordination · Budgeting & financial reporting · Records management & compliance · Project management · Salesforce / CRM · Excel · Data analysis · Vendor coordination · Team leadership'

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
    'Operations and coordination background with a writing habit: prevention training, event programmes, account documentation, and eight shipped software products written and designed end to end. I write clearly and I finish things.',
  technical:
    'Operations coordinator who has shipped eight products and twelve standalone builds self-taught since May, and who has been the most technically capable person in every non-technical building I have worked in. Looking for support, QA or analysis work where that is the useful shape.',
  mission:
    'Five years of coordination and direct service, including two as a university student-affairs supervisor and a current role as my unit’s sexual harassment and assault prevention representative. Comfortable with difficult conversations and with the records that have to follow them.',
  operations:
    'Five years of hands-on operations work — warehouse-adjacent logistics, facilities, front-desk coverage and team supervision. Reliable, physically capable, clean driving record, own transport, and available to start immediately.',
}

export type ResumeSection = { heading: string; lines: string[] }
export type Resume = {
  summary: string
  roles: { title: string; org: string; where: string; dates: string; bullets: string[] }[]
  sections: ResumeSection[]
}

const BULLET_CAP = 4

export function resumeFor(pack: Pack, dates: Dates): Resume {
  const stripped = pack.variant === 'stripped'
  // Reverse chronological, except where a pack names a role to open with. A
  // higher-education application should not lead with basic training, and a
  // warehouse one should not lead with a B2B account portfolio.
  const ordered = [...EXPERIENCE].sort((a, b) => Number(b.lead?.includes(pack.id) ?? false) - Number(a.lead?.includes(pack.id) ?? false))
  const roles = ordered.map((r) => ({
    title: stripped ? (r.strippedTitle ?? r.title) : r.title,
    org: r.org,
    where: r.where,
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
  // The software portfolio is the lead section where it is the point, a short
  // note where it is a curiosity, and absent from the hourly resume entirely.
  if (pack.id === 'technical') sections.splice(0, 0, { heading: 'Technical projects', lines: SOFTWARE })
  else if (pack.id === 'creative') sections.push({ heading: 'Technical projects', lines: SOFTWARE.slice(0, 3) })
  else if (!stripped) sections.push({ heading: 'Technical projects', lines: [SOFTWARE[0]] })
  if (!stripped) sections.push({ heading: 'Skills', lines: [SKILLS] })
  sections.push({
    heading: 'Also',
    lines: stripped
      ? ['Clean driving record and reliable transport · available immediately · U.S. citizen']
      : ['U.S. citizen · eligible for DoD Secret / Top Secret, expected 2027 · clean driving record · available immediately'],
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
  education: `I have done this work. For eighteen months I was the operations supervisor in Southern New Hampshire University’s Office of Student Affairs, coordinating campus-wide operations — event logistics, departmental budgets, vendor and client services, fleet scheduling and the campus food pantry — while completing a full-time degree. «ORGANISATION» is a larger version of the same problem and I would be glad to be back in it.

Two things I want to speak to directly. Coordinating student-facing operations is not oversight but scheduling that actually holds — knowing who is reliable for a nine o’clock and covering the desk yourself when someone does not turn up. And departmental budgets: I held them at SNHU and sat as Head Senator on Student Government’s Budget and Finance committee, where allocations were argued line by line and reconciled afterwards. Purchase orders and expense reconciliation are familiar ground, not something I would be learning on your time.

Most recently I spent 28 months at Verizon managing business accounts, where I grew the location’s business-segment revenue 4.5 times year over year. That was a sales role and I am deliberately moving out of one. What it gave me was a book of work large enough that only a real system kept it straight.

I hold a B.A. in Psychology from SNHU with a 3.7 GPA and three years on the President’s List. I am in Wakefield and available immediately.`,

  health: `I would like to be considered for the «ROLE» position at «ORGANISATION».

I have five years of administrative and operations work, most of it managing a schedule for people whose time was the scarce resource — screening who genuinely needed a meeting, moving things when the day changed, and keeping the calendar honest so nobody arrived to a conflict. I have prepared committee materials, taken and distributed minutes, and written correspondence that went out over someone else’s name and had to sound like them.

I am comfortable being the first point of contact on a difficult day. In my Guard unit I am the sexual harassment and assault prevention representative, which means being the person someone walks up to with something serious, knowing exactly what I am and am not permitted to do with what I am told, and keeping records to standard afterwards. That is a different subject from patient-facing work and the same discipline.

Excel, Outlook, Word and PowerPoint are daily tools rather than listed skills: tracking, reconciling, and pulling numbers from several places into one report somebody can act on.

I live in Wakefield, a weekday schedule is exactly what I want, and I am available to start immediately.`,

  office: `I would like to be considered for the «ROLE» position at «ORGANISATION».

Five years of coordination work, and the through-line is that I am the person a process runs through. At Southern New Hampshire University I coordinated campus-wide operations — event logistics, departmental budgets, vendor services and fleet scheduling — while finishing a full-time degree and holding a shift-lead job at the same time. At Verizon I managed a B2B account portfolio end to end in Salesforce for 28 months and grew the location’s business-segment revenue 4.5 times year over year.

What I am good at is reading how an organisation actually works and then working inside it rather than around it. I pick up a new system in about a week. I keep records because I have been on the wrong end of somebody else not keeping them. And I am comfortable with the parts of a job most people find tedious — forms, filing, reconciliation, the compliance paragraph nobody reads — which I understand is a large part of what this role is.

I hold a B.A. in Psychology and IBM certificates in project management and data analytics. I am in Wakefield, I have reliable transport and a clean record, and I am available immediately.`,

  public: `I would like to be considered for the «ROLE» position at «ORGANISATION».

Records, accountability and a public counter are the three things I have spent five years on. In my Guard unit I hold two additional duties on top of my own: sexual harassment and assault prevention representative, and barracks operations representative. Both are records roles. Both are audited. Both mean knowing precisely what may be disclosed, to whom, and on what timeline — and being the person the public side of it walks up to.

Before that I ran front-desk operations for a university student-affairs office: walk-ins, phones, student records, and knowing what could and could not be released. And 28 months at Verizon managing business accounts, where I handled escalated disputes in person, including from people who arrived angry.

I am genuinely untroubled by bureaucracy. A documented process I can learn and follow is the environment I do my best work in, and I would rather have one than not.

I am a U.S. citizen, currently in the Officer Candidate School pipeline, and will hold a security clearance from roughly August 2027 — an asset arriving rather than a gap. Clean driving record, own transport, available immediately.`,

  creative: `I would like to be considered for the «ROLE» position at «ORGANISATION».

I write, and I finish things. Eight products and twelve standalone builds shipped since May, self-taught, designed end to end including the interface copy and the documentation. Before that, prevention training delivered to a Guard company — material that had to be clear to people who did not want to be in the room — and account documentation a whole Verizon location worked from.

The operations half is real too. Eighteen months running operations for a university student-affairs office: events from booking through setup, staffing and teardown, plus vendor coordination and the budget behind them. Creative work at an institution is mostly logistics wearing a nicer jacket, and I have done the logistics.

Most recently 28 months at Verizon managing business accounts, where I grew business-segment revenue 4.5 times year over year. I am moving out of sales deliberately. What it left me with is the habit of writing for someone who has thirty seconds.

B.A. Psychology, 3.7 GPA. Portfolio at seanjoudrie.github.io/SeanJoudrie. I am in Wakefield and available immediately.`,

  technical: `I would like to be considered for the «ROLE» position at «ORGANISATION».

I have shipped eight products and twelve standalone builds since May, self-taught, from empty file to working product: a link-analysis board with a timeline scrubber and schematic map built without graph or mapping libraries, a ten-thousand-row enterprise data grid with virtualisation and undo-redo, a live geography game with no backend, and six real-time GPU rendering builds. I will not claim to be a career engineer and I am not applying as one. What I am is the person who has been the most technically capable body in every non-technical building I have worked in, and who would rather be doing that on purpose.

The support half is the part I have five years of. Campus operations at a university office, including room technology under time pressure with an audience waiting. Escalated billing and service problems at Verizon, diagnosed in person and tracked in Salesforce. Daily reconciliation between systems that disagreed with each other.

I hold IBM certificates in project management and data analytics, and I am comfortable in Excel at the level where it stops being a spreadsheet. Portfolio at seanjoudrie.github.io/SeanJoudrie.

I am in Wakefield, available immediately, and happy to start at the support tier and be measured on what I actually fix.`,

  mission: `I would like to be considered for the «ROLE» position at «ORGANISATION».

I am my Guard unit’s sexual harassment and assault prevention representative. That means being a first point of contact for people disclosing something serious, knowing exactly what I am permitted to do with what I am told, maintaining records and reporting to standard, and delivering prevention training to a 220-person company. It is the work of holding a professional and supportive tone on a difficult day, in a setting where getting it wrong has consequences.

The coordination half I have also done. Eighteen months as operations supervisor in a university student-affairs office — event logistics, departmental budgets, vendor services, and the campus food pantry — and a seat as Head Senator on Student Government’s Budget and Finance committee, where I learned to read a funding process from the inside and explain it to people who needed a decision rather than a policy citation.

My degree is in Psychology. That is not a qualification for this work, but it is the reason I chose it.

I am in Wakefield, I have reliable transport and a clean record, and I am available immediately.`,

  operations: `I would like to be considered for the «ROLE» position at «ORGANISATION».

Five years of work, most of it on my feet. I managed a fitness club in Wakefield for two years — opening and closing, inventory, equipment and grounds upkeep, health and safety compliance, and a team of five. I was hired there on sanitation during COVID and within a few months was running the floor, which is roughly how I tend to go. After that I was a shift lead at Walgreens in Melrose: cash handling, inventory control, scheduling and training, held alongside a university operations job and a full-time degree.

What I would bring is that I show up. Clean driving record, my own transport, and I live in Wakefield so the commute is not going to become a problem in February. I keep records because somebody has to and I would rather it be done properly. I am fine working alone all day and I am fine with the public when the public is annoyed.

I serve one weekend a month in the Massachusetts Army National Guard. Those dates are known well in advance and I will give you all of them up front.

I am available to start immediately.`,
}

export const letterFor = (pack: Pack): string => LETTERS[pack.id]
