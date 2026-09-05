import type { Job } from '../types'

/**
 * The industry table, straight out of the case file.
 *
 * Every weight below is quoted, not invented: the numbers are the ones written
 * down in section 4 of the candidate case file, and Tier E is an exclusion
 * list rather than a low score. Where this file makes a judgement the case
 * file does not, it says so in a comment — those are the only places worth
 * arguing with.
 *
 * The point of the table is stated in the case file itself: "every industry
 * scored 8+ is either a mission-driven institution or creative/media work.
 * Institutional employers and creative functions should be boosted even where
 * the specific role title is generic." That is why an employer can carry a
 * classification on its own. An Administrative Assistant post at a college is
 * higher-education administration; the same post at nobody in particular is
 * not.
 */

export type Posting = {
  title: string
  company: string
  body: string
  sector?: Job['sector']
  families?: string[]
}

export type Industry = {
  id: string
  label: string
  /** 0–10, after the seasonal rule. 0 means excluded outright. */
  weight: number
  why: string
  /** Tier E, or zeroed by the winter rule. */
  excluded: boolean
}

type Def = {
  id: string
  label: string
  weight: number
  /** Tier E — filtered out entirely, regardless of pay. */
  exclude?: true
  /** Outdoor work: zero from November to March. Cold is a hard constraint, not a preference. */
  outdoor?: true
  /** Beats every other match rather than competing with them. */
  demote?: true
  /** Matched against the job title. */
  title?: RegExp
  /** Matched against the employer's name ONLY — never the body. */
  employer?: RegExp
  /** Employer kinds that imply this industry on their own. */
  sector?: Job['sector'][]
  /** A title or employer match only counts if this appears in the body too. */
  confirm?: RegExp
  /** …and never counts if this appears in the title. */
  unless?: RegExp
  /** For the cases a regex cannot express. */
  when?: (p: Posting) => boolean
}

/**
 * Roles needing a clinical licence or certification he does not hold.
 *
 * One list, used twice: the scan skips these before spending a description
 * request on them, and the table excludes them from scoring. It used to be two
 * lists in two files, and they drifted — the scan's copy had no entry for a
 * surgical technologist, so "Surgical Tech, 36 hours/week" was fetched, scored,
 * and reached the top twenty of a list for someone with no certification.
 *
 * Certification counts, not just licensure. A pharmacy technician registers
 * with the state and a medical assistant certifies; both are as closed to him
 * today as a nursing licence is.
 */
export const LICENSED_CLINICAL =
  new RegExp(
    [
      // Nursing and allied health.
      '\\b(?:nurse|rn|lpn|np|nursing assistant|certified nursing|cna|crna|pa-c|licsw|licensed clinician|therapist)\\b',
      '\\b(?:pharmacist|pharmacy tech\\w*|physical therap(?:ist|y)|occupational therapist|speech pathologist|respiratory therapist)\\b',
      '\\b(?:sonograph\\w*|ultrasound tech\\w*|(?:mri|ct) tech\\w*|echo tech\\w*|surg(?:ical|ery) tech\\w*|patient care tech\\w*)\\b',
      '\\b(?:medical assistant|perfusionist|phlebotom\\w*|midwife|dentist|dental hygienist|optometrist|dietitian|veterinary tech\\w*)\\b',
      // Physicians. NOT prefixed with a word boundary: "\\bsurgeon\\b" cannot match
      // "Neurosurgeon", the same way "\\barchive\\b" could never match "Archives".
      // Sorting the list by money put seven physician posts at the top of it.
      'surgeon\\b',
      '\\b(?:physician|resident physician|hospitalist|internist|pediatrician|psychiatrist|clinical psychologist)\\b',
      '(?:gastroenterolog|dermatolog|dermatiti|hepatolog|endoscop|cardiolog|neurolog|oncolog|anesthesiolog|radiolog|patholog|urolog|endocrinolog|rheumatolog|nephrolog|pulmonolog|hematolog|ophthalmolog|otolaryngolog|obstetric|gynecolog|anesthesi|neonatolog|perinatolog|intensivist|physiatr|allergist)\\w*',
      '\\b(?:body imager|imaging physician|attending)\\b',
      // Titles that only ever sit above a clinical department.
      '\\b(?:medical director|division chief|chief medical officer|chair of)\\b',
    ].join('|'),
    'i',
  )

/**
 * Credentials that only a clinician holds, written the way a posting demands
 * them of the candidate rather than the way prose mentions a colleague.
 */
export const CLINICAL_CREDENTIAL = new RegExp(
  [
    // Named qualifications. These are never incidental.
    '\\bboard of registration in nursing\\b',
    // Only as a qualification, never as a department name. "Academic Coach,
    // School of Nursing" is a support job at a nursing school, not a nursing
    // job, and excluding it would be the same error in the other direction.
    '\\b(?:degree|graduat\\w*|diploma)\\b[^.]{0,50}\\b(?:school|college) of nursing\\b',
    '\\b(?:b\\.?s\\.?n|m\\.?s\\.?n|a\\.?d\\.?n)\\.?\\b',
    // A licence demanded of the reader, with a clinical profession beside it.
    '\\b(?:current|active|valid|unrestricted|must (?:have|hold|possess|be)|maintains?)\\b[^.]{0,70}\\blicens\\w*[^.]{0,70}\\b(?:nurs\\w*|pharmac\\w*|physical therap\\w*|occupational therap\\w*|respiratory\\w*|social work\\w*|radiolog\\w*)\\b',
    '\\blicens\\w*[^.]{0,40}\\b(?:registered nurse|practical nurse|nurse practitioner)\\b',
    // The same demand written the other way round: "Must hold a current,
    // active and unencumbered Registered Nurse license." Postings use both
    // orders, and the first version only read one of them. The specific
    // credential is required rather than the bare word "nursing", so that
    // "works with nursing staff, must have a valid driver's license" cannot
    // match across the clause.
    '\\b(?:current|active|valid|unencumbered|must (?:hold|have|possess|be)|maintains?)\\b[^.]{0,70}\\b(?:registered nurse|licensed practical nurse|nurse practitioner|\\brn\\b)\\b[^.]{0,40}\\blicens\\w*',
  ].join('|'),
  'i',
)

/**
 * TIER E — excluded. Order matters only in that exclusions are checked first;
 * within the group any match is enough.
 */
const EXCLUDED: Def[] = [
  {
    id: 'sales_any',
    label: 'sales',
    weight: 0,
    exclude: true,
    // The family classifier already resolves "Account Manager" against the body.
    when: (p) => !!p.families?.includes('sales'),
    title: /\b(?:sales|account executive|business development|commission|quota)\b/i,
  },
  {
    id: 'insurance_any',
    label: 'insurance',
    weight: 0,
    exclude: true,
    // "Ethical objection, absolute." Sales, claims, or adjacent.
    title:
      /\b(?:insurance|underwrit(?:er|ing)|actuar(?:y|ial|ies)|reinsurance|claims? (?:adjuster|adjustor|examiner|processor|specialist|representative|analyst|adjudicator)|policy (?:services|administration))\b/i,
    // Matched on the employer's name. Never on the body: almost every posting
    // in the country mentions health insurance in its benefits paragraph.
    employer:
      /\b(?:insurance|liberty mutual|mass ?mutual|arbella|plymouth rock|the hanover|geico|allstate|travelers|john hancock|metlife|aflac|unum|chubb)\b/i,
  },
  {
    id: 'gambling',
    label: 'gambling',
    weight: 0,
    exclude: true,
    title: /\b(?:casino|sportsbook|wagering|gambling|lotter(?:y|ies)|table games|slot (?:attendant|technician))\b/i,
    employer: /\b(?:casino|encore boston|mohegan|foxwoods|draftkings|fanduel|bally'?s|penn entertainment)\b/i,
  },
  {
    id: 'telemarketing',
    label: 'telemarketing',
    weight: 0,
    exclude: true,
    title: /\b(?:telemarket\w*|telesales|appointment setter|outbound (?:caller|calling|sales))\b/i,
  },
  {
    id: 'collections',
    label: 'debt collections',
    weight: 0,
    exclude: true,
    // "Collections Specialist" is also a museum title, and museums are Tier A.
    // The debt language in the body is what separates the two.
    title: /\b(?:collections? (?:agent|representative|specialist|officer|analyst|clerk)|debt collect\w*|recovery (?:agent|specialist))\b/i,
    confirm: /\b(?:debt|delinquen\w*|past[- ]due|receivable|creditor|charge[- ]?off|collection agency)\b/i,
  },
  {
    id: 'emergency_management_dispatch',
    label: 'emergency management & dispatch',
    weight: 0,
    exclude: true,
    title:
      /\b(?:emergency (?:management|preparedness|communications|dispatch\w*|medical technician)|911|9-1-1|public safety dispatch\w*|telecommunicator|\beoc\b|\bemt\b|paramedic)\b/i,
  },
  {
    id: 'emergency_management_dispatch',
    label: 'emergency dispatch',
    weight: 0,
    exclude: true,
    // The case file asks for "dispatcher (non-emergency)" by name, so the two
    // kinds of dispatcher have to be told apart rather than lumped.
    title: /\bdispatch(?:er)?\b/i,
    confirm: /\b(?:police|fire|ems|ambulance|911|emergency response)\b/i,
  },
  {
    id: 'police_fire',
    label: 'police & fire',
    weight: 0,
    exclude: true,
    title:
      /\b(?:police|law enforcement|patrol officer|deputy sheriff|constable|firefighter|fire (?:captain|lieutenant|inspector|alarm operator)|state trooper|public safety officer)\b/i,
    employer: /\b(?:police department|sheriff|fire department)\b/i,
  },
  {
    id: 'corrections_probation',
    label: 'corrections & probation',
    weight: 0,
    exclude: true,
    // \bprobation\b cannot match "probate", which is Tier C court work.
    title: /\b(?:correction(?:s|al)|probation|parole|inmate|detention officer|house of correction)\b/i,
  },
  {
    id: 'culinary_kitchens',
    label: 'kitchens',
    weight: 0,
    exclude: true,
    // Scoped to the kitchen itself. A Dining Services Coordinator at a college
    // is higher-education administration and stays in; a line cook does not.
    // The case file values free meals, so dining-adjacent is not the target.
    title:
      /\b(?:chef|sous|line cook|prep cook|cook\b|kitchen (?:staff|assistant|manager|steward|worker)|culinary|dishwasher|baker\b|barista|catering (?:assistant|attendant|staff)|food (?:service|prep) (?:worker|associate|attendant|aide)|(?:banquet|dining|food|restaurant) server|busser|hostess|restaurant host)\b/i,
  },
  {
    id: 'food_production',
    label: 'food production',
    weight: 0,
    exclude: true,
    title: /\b(?:food (?:production|manufactur\w*|safety technician)|bakery production|butcher|meat (?:cutter|packer)|commissary)\b/i,
  },
  {
    id: 'mbta_transit',
    label: 'transit operations',
    weight: 0,
    exclude: true,
    title: /\b(?:bus (?:operator|driver)|train (?:operator|conductor)|transit (?:operator|supervisor|ambassador|police)|streetcar|motorperson|light rail)\b/i,
    employer: /\b(?:mbta|massachusetts bay transportation|transit authority)\b/i,
  },
  {
    id: 'utilities',
    label: 'utilities',
    weight: 0,
    exclude: true,
    title:
      /\b(?:lineworker|line worker|lineman|gas (?:technician|fitter|service worker)|meter reader|utility (?:worker|technician|locator)|(?:water|wastewater) treatment operator|substation)\b/i,
    employer: /\b(?:eversource|national grid|unitil|nstar|water district|light department)\b/i,
  },
  {
    id: 'union_apprenticeships',
    label: 'trade apprenticeships',
    weight: 0,
    exclude: true,
    // Reversing an earlier recommendation of mine: the case file excludes the
    // trades outright, so a paid trade apprenticeship is no longer a route.
    title: /\bapprentice(?:ship)?\b/i,
    confirm: /\b(?:local \d+|\bibew\b|union|journey(?:man|worker)|sheet metal|pipefitt\w*|electrical|plumbing|carpenter)\b/i,
  },
  {
    id: 'carpentry_construction',
    label: 'construction',
    weight: 0,
    exclude: true,
    title:
      /\b(?:carpenter|carpentry|construction (?:laborer|worker|superintendent|manager|foreman)|mason(?:ry)?|drywall|roofer|framer|concrete finisher|general laborer|ironworker|glazier)\b/i,
  },
  {
    id: 'hvac_electrical_plumbing',
    label: 'HVAC, electrical & plumbing',
    weight: 0,
    exclude: true,
    // "Stationary engineer" is deliberately absent — at a hospital that is a
    // facilities job, which the case file scores 6.5.
    title: /\b(?:hvac|electrician|plumber|plumbing|pipefitter|steamfitter|refrigeration tech\w*|boiler (?:operator|technician))\b/i,
  },
  {
    id: 'manufacturing_assembly',
    label: 'manufacturing & assembly',
    weight: 0,
    exclude: true,
    // Engineers are not assemblers; "Manufacturing Engineer" is not matched.
    // "Production Assistant" is a media title and is not matched either.
    title:
      /\b(?:assembler|assembly (?:operator|technician|associate|line)|machine operator|machinist|cnc\b|production (?:associate|operator|technician|worker)|manufacturing (?:associate|technician|operator)|fabricator|welder|solderer)\b/i,
  },
  {
    id: 'executive',
    label: 'executive leadership',
    weight: 0,
    exclude: true,
    /*
     * The top of an organisation, and not a job available to someone five years
     * in. Score already pushed these down; sorting the list by money ignores
     * score, and the first screen filled with a hospital president, a Senior
     * Vice President & COO and an Executive Vice President & Provost.
     *
     * Anchored to the start of the title on purpose. "Assistant to the
     * President" and "Executive Assistant to the Dean" are jobs he wants, and
     * both contain a word on this list.
     */
    title: /^\s*(?:(?:senior|executive)\s+)?vice president\b|^\s*president\b|^\s*chief\s+\w+\s+officer\b|^\s*(?:ceo|cfo|coo|cto|cio|provost|chancellor|general counsel)\b|^\s*(?:assistant |associate )?dean\b/i,
  },
  { id: 'clinical_licensed', label: 'licensed clinical', weight: 0, exclude: true, title: LICENSED_CLINICAL },
  {
    /**
     * The clinical job whose title hides it.
     *
     * "Administrative Clinical Supervisor Per Diem" at Beth Israel contains no
     * clinical word at all, so a title-only exclusion never saw it. Its
     * requirements are a BSN, a Massachusetts RN licence and three years of
     * nursing. It ranked ninety-fifth percentile.
     *
     * The body is read, but only for phrases that can be nothing else. A loose
     * check would be far worse than this bug: hospital job descriptions say
     * "nurse" constantly — "works closely with nursing staff", "supports the
     * nursing units" — and matching those would delete hospital administration
     * entirely, which is one of the better categories on the list. "School of
     * nursing", "BSN" and "Board of Registration in Nursing" appear when the
     * candidate must be a nurse and essentially never otherwise.
     */
    id: 'clinical_by_requirement',
    label: 'licensed clinical',
    weight: 0,
    exclude: true,
    when: (p) => CLINICAL_CREDENTIAL.test(p.body),
  },
]

/** Beats everything: the role is out of reach for a reason the tiers do not capture. */
const DEMOTED: Def[] = [
  {
    id: 'academic_teaching',
    label: 'teaching faculty',
    weight: 3,
    demote: true,
    // Not excluded — a Teaching Assistant post is sometimes administrative —
    // but a professorship is not a job he can take, and the university
    // employer boost would otherwise rank it at nine.
    title: /\b(?:professor|faculty|lecturer|instructor|adjunct|post-?doctoral|post-?doc|teaching fellow|clinical (?:fellow|instructor|professor))\b/i,
  },
]

/** Tiers A–D. Highest weight wins; an employer match counts as much as a title. */
const TIERS: Def[] = [
  // ── Tier A (8+) ────────────────────────────────────────────────────────────
  {
    id: 'higher_education_admin',
    label: 'higher education administration',
    weight: 9,
    sector: ['university'],
    employer: /\b(?:universit(?:y|ies)|college|institute of technology|school of \w+|conservatory)\b/i,
  },
  {
    id: 'museums_cultural_institutions',
    label: 'museums & cultural institutions',
    weight: 8.5,
    employer:
      /\b(?:museum|gallery|aquarium|zoo\b|botanical|arboretum|planetarium|historic(?:al)? societ\w*|heritage|cultural (?:center|council)|symphony|orchestra|theatre|opera|ballet)\b/i,
    title:
      /\b(?:curator\w*|collections (?:manager|assistant|technician|registrar)|exhibit\w*|docent|gallery (?:assistant|attendant)|visitor (?:services|experience))\b/i,
  },
  {
    id: 'media_creative_production',
    label: 'media & creative production',
    weight: 8.5,
    employer: /\b(?:media|broadcast\w*|radio|television|studios?|productions?|public media|wgbh|gbh\b|wbur|globe)\b/i,
    title:
      /\b(?:producer|production (?:assistant|coordinator)|broadcast\w*|studio (?:manager|coordinator|assistant)|creative services|multimedia|photograph(?:er|y)|videograph\w*|audio engineer|sound (?:engineer|technician))\b/i,
  },
  {
    id: 'publishing_editorial',
    label: 'publishing & editorial',
    weight: 8.5,
    title: /\b(?:editor|editorial|copy ?edit\w*|proofread\w*|copywriter|content writer|technical writer|publications?|manuscript)\b/i,
    employer: /\b(?:press\b|publishing|publisher|journal)\b/i,
  },
  {
    id: 'graphic_design',
    label: 'graphic design',
    weight: 8.5,
    // Deliberately not a bare "designer": that is a Product Designer at a
    // software company or a Mechanical Designer at a defence one.
    title: /\b(?:graphic design\w*|visual design\w*|brand design\w*|art director|production artist|desktop publish\w*|marketing designer|communications designer)\b/i,
  },
  {
    id: 'video_content_production',
    label: 'video & content production',
    weight: 8.5,
    title: /\b(?:video (?:producer|editor|specialist|coordinator|production)|motion graphics|film\b|cinematograph\w*|content (?:producer|creator)|podcast|livestream)\b/i,
  },
  {
    id: 'archives_records_management',
    label: 'archives & records',
    weight: 8.5,
    title:
      /\b(?:archiv(?:e|es|ist|al)|records (?:manage\w*|clerk|specialist|coordinator|analyst|technician|assistant|retention)|document (?:control|management)|information governance|foia\b|public records|digitization|special collections)\b/i,
  },
  {
    id: 'marketing_operations_nonsales',
    label: 'marketing operations',
    weight: 8.5,
    // Marketing, with the commission half removed. The families classifier has
    // already resolved the ambiguous titles against the body.
    //
    // The engineering guard is repeated here rather than left to roles.ts,
    // which now carries the same rule: family lists are computed at scan time
    // and stored in the index, so for one deploy after that fix the pool still
    // holds indexes that call a Principal RF Communications Engineer marketing.
    when: (p) => !!p.families?.includes('marketing') && !p.families?.includes('sales'),
    unless: /\b(?:engineer|engineering|rf\b|radio ?frequency|antenna|waveform|satellite|firmware|hardware|network(?:ing)?|protocol|signals?|technician)\b/i,
  },
  {
    id: 'k12_school_district_nonteaching',
    label: 'K-12 district, non-teaching',
    weight: 8,
    employer: /\b(?:public schools?|school district|school committee|charter school|regional school)\b/i,
    title: /\b(?:school (?:secretary|clerk|registrar)|paraprofessional|classroom aide|student information)\b/i,
  },
  {
    id: 'municipal_town_government',
    label: 'municipal government',
    weight: 8,
    employer: /(?:^|\b)(?:town|city) of\b|\b(?:municipal|town hall|department of public works|dpw)\b/i,
  },
  {
    id: 'state_agency',
    label: 'state agency',
    weight: 8,
    employer:
      /\b(?:commonwealth of massachusetts|mass(?:achusetts)? (?:department|office|commission|division)|executive office of|massdot|dcamm|state of [a-z]+)\b/i,
  },
  {
    id: 'federal_agency',
    label: 'federal agency',
    weight: 8,
    // NOT from the case file. Federal civil service is absent from the table,
    // and it is the one gap where leaving a job unclassified would be plainly
    // wrong: veterans' preference applies, the commission lands in 2027, and
    // it is a mission-driven institution by the table's own stated pattern.
    // Scored alongside state agencies. Argue with this one first.
    sector: ['gov'],
  },
  {
    id: 'event_production_av',
    label: 'events & AV',
    weight: 8,
    title:
      /\b(?:event (?:coordinator|manager|specialist|assistant|producer|services|operations)|audio ?visual|av (?:technician|specialist|coordinator)|conference services|meeting (?:planner|services)|stagehand|lighting (?:technician|designer)|technical director)\b/i,
  },

  // ── Tier B (7–7.9) ─────────────────────────────────────────────────────────
  {
    id: 'faith_based_nonprofits',
    label: 'faith-based nonprofit',
    weight: 7.9,
    employer:
      /\b(?:church|parish|diocese|archdiocese|ministr(?:y|ies)|synagogue|temple\b|catholic|jewish|christian|ymca|ywca|salvation army|lutheran|methodist|episcopal|baptist)\b/i,
  },
  {
    id: 'legal_assistant_paralegal',
    label: 'legal support',
    weight: 7.8,
    title:
      /\b(?:paralegal|legal (?:assistant|secretary|coordinator|specialist|analyst)|litigation (?:support|assistant)|docket|contracts? (?:administrator|coordinator|specialist)|compliance (?:coordinator|specialist|analyst))\b/i,
  },
  {
    id: 'hr_recruiting_coordination',
    label: 'HR & recruiting coordination',
    weight: 7.8,
    title:
      /\b(?:human resources|hr (?:coordinator|assistant|generalist|specialist|associate)|recruit(?:er|ing|ment)|talent acquisition|onboarding|benefits (?:coordinator|administrator|specialist)|payroll|people operations|employee relations)\b/i,
  },
  {
    id: 'conservation_land_trusts',
    label: 'conservation & land trusts',
    weight: 7.2,
    employer: /\b(?:land trust|conservation|audubon|trustees of reservations|sierra club|nature conservancy|watershed|greenway|appalachian mountain club)\b/i,
    title: /\b(?:conservation|land (?:steward\w*|protection|manager)|stewardship|naturalist|ecolog\w*|sustainability)\b/i,
  },
  {
    id: 'state_parks_dcr',
    label: 'parks & recreation',
    weight: 7.2,
    outdoor: true,
    title: /\b(?:park (?:ranger|interpreter|manager|supervisor|attendant)|ranger\b|trail (?:crew|worker|steward)|forestry|forester|wildlife)\b/i,
    employer: /\b(?:department of conservation and recreation|dcr\b|state park|national park)\b/i,
  },
  {
    id: 'environmental_field_work',
    label: 'environmental field work',
    weight: 7.2,
    outdoor: true,
    title:
      /\b(?:environmental (?:technician|scientist|specialist|monitor)|field (?:technician|crew|assistant|surveyor)|sampling technician|wetland|remediation|geotechnical)\b/i,
  },
  { id: 'veterans_services', label: 'veterans services', weight: 7, when: (p) => !!p.families?.includes('veterans') },
  {
    id: 'software_development',
    label: 'software development',
    weight: 7,
    title: /\b(?:software (?:engineer|developer)|full[- ]?stack|back[- ]?end|front[- ]?end|web developer|programmer|application developer)\b/i,
  },
  {
    /**
     * Kept, and moved down.
     *
     * The first case file said to apply to these anyway — entry-level and
     * support-tier only. The second calls IT a career track to stay out of.
     * Both were his, and he settled it: they stay in the pool and stop
     * competing at the top. A fallback, not a target.
     *
     * 4.5 rather than 7. Measured on the pool at the time: eight postings
     * classify here and one of them sat at #69 of 2,902. It does not now, and
     * it is still one lane tap away. Below the tech-employer ceiling of 5.5, so
     * that rule no longer binds on these — the demotion is doing the work.
     */
    id: 'it_helpdesk_support',
    label: 'IT support & helpdesk',
    weight: 4.5,
    title:
      /\b(?:help ?desk|it support|desktop support|technical support|service desk|it (?:technician|specialist|analyst|associate)|systems? (?:administrator|technician)|network (?:administrator|technician|engineer|operations)|field service (?:technician|engineer)|end user (?:support|computing)|tier [12] support)\b/i,
  },
  {
    id: 'qa_testing',
    label: 'QA & testing',
    weight: 7,
    title: /\b(?:qa\b|quality assurance|test (?:engineer|analyst|technician|specialist)|software tester|quality (?:technician|specialist|coordinator))\b/i,
  },
  {
    id: 'data_analysis',
    label: 'data & analysis',
    weight: 7,
    title:
      /\b(?:data (?:analyst|specialist|coordinator|entry|technician|steward)|business analyst|reporting analyst|analytics|business intelligence|research analyst|junior analyst)\b/i,
  },

  // ── Tier C (6–6.9) ─────────────────────────────────────────────────────────
  {
    id: 'courts_judicial_admin',
    label: 'courts & judicial administration',
    weight: 6.5,
    title: /\b(?:court (?:officer|clerk|assistant|monitor|reporter)|judicial|clerk magistrate|trial court|probate)\b/i,
    employer: /\b(?:trial court|superior court|district court|judiciary)\b/i,
  },
  {
    id: 'public_library',
    label: 'library',
    weight: 6.5,
    title: /\b(?:librar(?:y|ian|ies)|circulation (?:assistant|desk|supervisor)|reference (?:librarian|assistant)|cataloging|shelver)\b/i,
    employer: /\blibrary\b/i,
  },
  {
    id: 'hospitals_health_admin',
    label: 'hospital administration',
    weight: 6.5,
    // Matched on the employer's NAME, not on `sector: ['health']`. The board
    // list files Ginkgo Bioworks, Alnylam, Benchling, Amwell and Butterfly
    // Network under health, and a biotech bench-science role was collecting
    // 6.5 for being hospital administration, which it is not.
    employer: /\b(?:hospital|health|healthcare|medical cent(?:er|re)|medicine|clinic|infirmary)\b/i,
    title:
      /\b(?:patient (?:access|services|registration|coordinator|navigator)|medical (?:records|secretary|receptionist|billing)|health information|admissions coordinator|unit (?:secretary|coordinator))\b/i,
  },
  {
    id: 'facilities_maintenance',
    label: 'facilities & maintenance',
    weight: 6.5,
    title:
      /\b(?:facilities|maintenance (?:technician|worker|mechanic|assistant|supervisor|coordinator)|building (?:services|engineer|attendant)|plant operations|general maintenance|stationary engineer|locksmith)\b/i,
  },
  {
    id: 'custodial',
    label: 'custodial',
    weight: 6.5,
    title: /\b(?:custodian|custodial|janitor\w*|housekeep\w*|environmental services|cleaner|porter\b|floor (?:tech|care))\b/i,
  },
  {
    id: 'groundskeeping_landscaping',
    label: 'groundskeeping & landscaping',
    weight: 6.5,
    outdoor: true,
    title: /\b(?:groundskeep\w*|grounds (?:worker|crew|keeper)|landscap\w*|lawn|arborist|tree (?:climber|worker|crew)|horticultur\w*|gardener|greenskeeper)\b/i,
  },
  {
    id: 'warehouse_distribution',
    label: 'warehouse & distribution',
    weight: 6,
    title:
      /\b(?:warehouse|distribution (?:center|associate)|fulfillment|inventory|receiving|shipping|stock(?:room|er)?|material handler|picker|packer|forklift|order (?:picker|selector)|logistics (?:coordinator|associate|specialist)|supply chain)\b/i,
  },
  { id: 'postal_service', label: 'postal & mail', weight: 6, title: /\b(?:postal|usps\b|mail (?:carrier|handler|clerk|processor)|mailroom)\b/i },

  // ── Tier D (5–5.9) ─────────────────────────────────────────────────────────
  {
    id: 'hospitality_hotel_ops',
    label: 'hotel operations',
    weight: 5.7,
    employer: /\b(?:hotel|resort|inn\b|marriott|hilton|hyatt|omni|four seasons)\b/i,
    title: /\b(?:guest services|front office|concierge|night audit|hospitality|rooms? controller)\b/i,
  },
  {
    id: 'moving_delivery',
    label: 'moving & delivery',
    weight: 5.5,
    // A bare "delivery" made "Learning Operations & Delivery Specialist" a
    // courier. The word means the transport sense only next to a transport one.
    title: /\b(?:driver\b|delivery (?:driver|associate|professional|specialist)?\s*(?:route|van|truck)|package delivery|courier|mover\b|route (?:associate|driver)|cdl\b|shuttle)\b/i,
  },
  {
    id: 'social_services_case_mgmt',
    label: 'social services',
    weight: 5,
    title:
      /\b(?:case (?:manager|worker|coordinator)|social (?:worker|services)|human services|residential (?:counselor|advisor)|direct (?:support|care)|behavioral health (?:technician|associate)|recovery (?:coach|specialist)|outreach worker)\b/i,
  },
]

/** November through March. The months outdoor work is off the table. */
const WINTER = new Set([10, 11, 0, 1, 2])

/**
 * Roles the case file's technical note says are a poor fit at a software
 * employer specifically: "Poor fit: software companies where he'd be measured
 * against career engineers." The same title at a college or a hospital is a
 * strong fit, so the discount belongs to the employer, not the title.
 */
const TECHNICAL = new Set(['software_development', 'it_helpdesk_support', 'qa_testing', 'data_analysis'])
const TECH_EMPLOYER_CEILING = 5.5

/** Evidence about what the ROLE is: its title, or a rule the title cannot express. */
const roleEvidence = (def: Def, p: Posting) => (def.when?.(p) ?? false) || (def.title?.test(p.title) ?? false)
/** Evidence about who the EMPLOYER is: its name, or the kind of place it is. */
const employerEvidence = (def: Def, p: Posting) =>
  (def.employer?.test(p.company) ?? false) || (def.sector ? def.sector.includes(p.sector as Job['sector']) : false)

const admissible = (def: Def, p: Posting): boolean => {
  if (def.unless?.test(p.title)) return false
  if (def.confirm && !def.confirm.test(p.body)) return false
  return true
}

const matches = (def: Def, p: Posting): boolean =>
  (roleEvidence(def, p) || employerEvidence(def, p)) && admissible(def, p)

/**
 * How far a Tier A employer can lift a role that already has a tier of its own.
 *
 * The case file asks for the lift — "institutional employers and creative
 * functions should be boosted even where the specific role title is generic" —
 * and the operative word is generic. Taking the higher of the two outright
 * made "Recycling Services Driver" at Harvard a nine, ranking it above the
 * university's own administrative posts. An institution improves a job; it does
 * not turn a driving job into an administrative one.
 */
export const INSTITUTIONAL_BOOST = 1.5

/**
 * Classify a posting. `now` is a parameter because the seasonal rule depends on
 * the month, and a rule that only fires in February is a rule nobody can test.
 */
export function industryOf(p: Posting, now: Date = new Date()): Industry {
  for (const def of EXCLUDED) if (matches(def, p)) return resolve(def, p.sector, now)
  for (const def of DEMOTED) if (matches(def, p)) return resolve(def, p.sector, now)

  let byRole: Def | null = null
  let byEmployer: Def | null = null
  for (const def of TIERS) {
    if (!admissible(def, p)) continue
    if (roleEvidence(def, p) && (!byRole || def.weight > byRole.weight)) byRole = def
    if (employerEvidence(def, p) && (!byEmployer || def.weight > byEmployer.weight)) byEmployer = def
  }

  // Nothing about the role itself: this is where the employer speaks for it,
  // and an administrative post at a college is higher-education administration.
  if (!byRole) return byEmployer ? resolve(byEmployer, p.sector, now) : UNCLASSIFIED

  const base = resolve(byRole, p.sector, now)
  if (base.excluded || !byEmployer) return base

  const ceiling = resolve(byEmployer, p.sector, now).weight
  if (ceiling <= base.weight) return base
  return {
    ...base,
    weight: Math.min(ceiling, base.weight + INSTITUTIONAL_BOOST),
    why: `${byRole.label} at ${byEmployer.label}`,
  }
}

/** Everything the table can return, for the lane that filters on it. */
export const TIER_A = new Set(TIERS.filter((d) => d.weight >= 8).map((d) => d.id))

const BY_ID = new Map<string, Def>()
for (const d of [...EXCLUDED, ...DEMOTED, ...TIERS]) if (!BY_ID.has(d.id)) BY_ID.set(d.id, d)

const UNCLASSIFIED: Industry = { id: 'unclassified', label: 'unclassified', weight: 5, why: 'nothing in the table matched', excluded: false }

/** Turn a table entry into a verdict, applying the season and the employer discount. */
function resolve(def: Def, sector: Job['sector'] | undefined, now: Date): Industry {
  if (def.exclude) return { id: def.id, label: def.label, weight: 0, why: `${def.label} — excluded outright`, excluded: true }
  if (def.demote) return { id: def.id, label: def.label, weight: def.weight, why: `${def.label} — out of reach`, excluded: false }
  if (def.outdoor && WINTER.has(now.getMonth())) {
    return { id: def.id, label: def.label, weight: 0, why: `${def.label} — outdoor work, November to March`, excluded: true }
  }
  if (sector === 'tech' && TECHNICAL.has(def.id) && def.weight > TECH_EMPLOYER_CEILING) {
    return {
      id: def.id,
      label: def.label,
      weight: TECH_EMPLOYER_CEILING,
      why: `${def.label} at a software employer — measured against career engineers`,
      excluded: false,
    }
  }
  return { id: def.id, label: def.label, weight: def.weight, why: def.label, excluded: false }
}

const postingOf = (job: Job): Posting => ({
  title: job.title,
  company: job.company,
  body: job.descText || job.preview || '',
  sector: job.sector,
  families: job.families,
})

/**
 * The industry of a job already in the index.
 *
 * Classification runs at scan time against the full description and the id is
 * stored, the same way requirement gap counts are: the index keeps only a
 * 280-character preview, and the body evidence that separates a museum's
 * Collections Specialist from a debt collector is not in it. Only the id is
 * stored — the weight is resolved here, because the seasonal rule depends on
 * today's date and a scan from October must not still be paying out 6.5 for
 * groundskeeping in January.
 */
/**
 * Memoised, and it has to be.
 *
 * The lane counts across the top of the app run all eighteen lanes over the
 * whole pool on every change — that is thirty-odd thousand classifications, and
 * each one is sixty regexes against a title, a company and a preview. Unmemoised
 * it is seconds of work on a phone every time a checkbox moves. Keyed on the
 * job object, so a hydrated copy carrying a full description is correctly a
 * different entry, and carrying the month so the seasonal rule cannot go stale
 * in a tab left open across the end of October.
 */
const memo = new WeakMap<Job, { month: number; out: Industry }>()

export function industryFor(job: Job, now: Date = new Date()): Industry {
  const month = now.getMonth()
  const hit = memo.get(job)
  if (hit && hit.month === month) return hit.out
  const out = classify(job, now)
  memo.set(job, { month, out })
  return out
}

function classify(job: Job, now: Date): Industry {
  // Exclusions are re-checked live rather than trusted from the index. Almost
  // all of their evidence is in the title, which the index carries in full, and
  // an exclusion added after a scan has to apply now — not tomorrow morning.
  // The scan's clinical list and the table's had drifted, so "Surgical Tech, 36
  // hours/week" was already stored as hospital administration and sat in the
  // top twenty until the next scan would have caught it.
  const live = postingOf(job)
  for (const def of EXCLUDED) if (matches(def, live)) return resolve(def, live.sector, now)

  const stored = job.industry?.id
  if (!stored) return industryOf(postingOf(job), now)
  if (stored === UNCLASSIFIED.id) return UNCLASSIFIED
  const def = BY_ID.get(stored)
  // The table changed since the scan. Classifying from the preview is worse
  // than classifying from the body, and far better than reporting a weight for
  // an entry that no longer exists.
  if (!def) return industryOf(postingOf(job), now)
  return resolve(def, job.sector, now)
}

/**
 * Retail and front-line customer service. Allowed only above $30/hr, per the
 * hard-exclusion list — which is a pay rule, not an industry, so it lives here
 * as a predicate and is enforced by its own visible lane rule.
 *
 * "Front desk" is deliberately absent: the case file asks for front desk
 * (non-retail) by name in its list of prioritised titles. A university front
 * desk is a wanted job; the standing-still problem it shares with retail is
 * the posture axis's business, not this one's.
 */
const FRONTLINE =
  /\b(?:retail|cashier|sales floor|store (?:associate|clerk|team)|customer service (?:representative|associate|agent|specialist|advisor)|call c(?:enter|entre)|\bcsr\b|greeter|teller|guest (?:service|experience) (?:associate|representative))\b/i

export const isFrontline = (job: Job): boolean => FRONTLINE.test(job.title)

/**
 * Creative functions, for the crossover search the case file flags as never
 * run: "Tier A industry + creative function. He writes well, has shipped four
 * applications, and has never applied to this category."
 */
const CREATIVE =
  /\b(?:communications?|marketing|content|media|social media|creative|graphic|design(?:er)?|editor|editorial|writer|copywriter|producer|production|video|photo\w*|multimedia|brand|digital|public relations|outreach|engagement|publications?|storytelling|curat\w*|exhibit\w*)\b/i

export const isCreativeFunction = (job: Job): boolean => CREATIVE.test(job.title)
