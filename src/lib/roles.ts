/**
 * What kind of job this actually is.
 *
 * Excluding by keyword does not work. A rule that removes "sales" removes
 * almost nothing, because the postings are titled Account Executive, Business
 * Development Representative, Territory Manager and Client Partner.
 *
 * Titles alone do not work either, and this is where naive versions fail:
 * "Account Manager" is a quota-carrying sales job at one company and a
 * customer-success job at another. Ambiguous titles are therefore resolved
 * against the body — quota, commission, pipeline, prospecting — rather than
 * guessed from the title.
 *
 * Every list here is meant to be read and edited by the person using it.
 * Nothing is ever excluded by a rule that cannot be opened.
 */

export type Family = {
  id: string
  label: string
  /** unambiguous titles — these are the family whatever the body says */
  titles: RegExp
  /** titles that could go either way, resolved by `tell` */
  ambiguous?: RegExp
  /** body evidence that settles an ambiguous title */
  tell?: RegExp
  /** a title that looks like the family and is not */
  not?: RegExp
  kind: 'exclude' | 'boost'
}

export const FAMILIES: Family[] = [
  {
    id: 'sales',
    label: 'commission sales',
    kind: 'exclude',
    // A bare "sales" anywhere in the title counts. "Retail Sales Enablement
    // Manager" slipped through a list of specific job titles, and a job with
    // the word in its heading is exactly what this family exists to remove.
    titles:
      /\bsales\b|\baccount executive\b|\bae\b|\bbusiness development\b|\bbdr\b|\bsdr\b|\bterritory (?:manager|sales)\b|\bnew business\b|\bcloser\b/i,
    ambiguous: /\b(?:account manager|client partner|relationship manager|account director|partnerships? manager|revenue associate)\b/i,
    tell: /\b(?:quota|commission|\bote\b|pipeline|prospect(?:ing)?|cold call|book of business|upsell|cross-?sell|close deals|hunting|net new|sales cycle)\b/i,
  },
  {
    id: 'enforcement',
    label: 'rule enforcement',
    kind: 'exclude',
    titles: /\b(?:security (?:guard|officer)|loss prevention|compliance officer|parking (?:enforcement|attendant)|code enforcement|corrections officer)\b/i,
  },
  {
    id: 'coordinator',
    label: 'coordination',
    kind: 'boost',
    // Twenty-six of the forty-five titles the case file asks to prioritise had
    // no family at all, and most of them belong here: Executive Assistant,
    // Office Manager, Records Clerk, Data Entry Clerk, Patient Access
    // Representative. They were in the pool and invisible to the lane built
    // for them.
    //
    // "Assistant" is qualified rather than bare on purpose. A bare one collects
    // Assistant Professor, Assistant Coach and Assistant Director, which are
    // three different jobs and none of them this one.
    titles:
      /\b(?:coordinator|scheduler|liaison|administrator|administrative|(?:administrative|executive|office|program|department|staff|admin|clerical) assistant|office (?:manager|assistant)|secretary|receptionist|front desk|clerk\b|data entry|intake (?:specialist|coordinator|worker)|patient access|records (?:clerk|management|specialist|technician)|mailroom)\b/i,
  },
  {
    id: 'operations',
    label: 'operations',
    kind: 'boost',
    // Custodial, grounds and maintenance are operations work, and the profile
    // takes them at proper pay. They also sit on the good side of the posture
    // rule — moving all day — which is precisely why they belong in a lane.
    titles:
      /\b(?:operations|ops\b|facilities|logistics|warehouse lead|site lead|shift (?:lead|supervisor)|custodian|custodial|janitor\w*|housekeep\w*|groundskeep\w*|grounds (?:worker|crew)|landscap\w*|maintenance (?:technician|worker|mechanic|assistant)|production support|project controls|business operations|patient transport)\b/i,
  },
  { id: 'hr', label: 'people & HR', kind: 'boost', titles: /\b(?:human resources|\bhr\b|people (?:operations|business partner|partner)|talent acquisition|recruit(?:er|ing|ment) coordinator|onboarding|benefits (?:coordinator|administrator|specialist)|payroll|employee relations)\b/i },
  { id: 'program', label: 'program & project', kind: 'boost', titles: /\b(?:program manager|project (?:manager|coordinator|specialist)|\bpmo\b|program (?:specialist|associate|assistant))\b/i },
  { id: 'analyst', label: 'analysis', kind: 'boost', titles: /\b(?:analyst|analysis|intelligence|research(?:er)?|investigat(?:or|ions)|data (?:analyst|specialist))\b/i },
  { id: 'student', label: 'student services', kind: 'boost', titles: /\b(?:student (?:affairs|services|success|life)|academic (?:advisor|coordinator)|registrar|admissions|residence life|dean of students)\b/i },
  { id: 'technical', label: 'technical', kind: 'boost', titles: /\b(?:support engineer|solutions? (?:engineer|architect|consultant)|technical (?:support|account|program)|implementation|\bqa\b|quality assurance|software|developer|engineer|it support|help ?desk|desktop support|service desk|systems? administrator|audio ?visual|\bav\b tech\w*)\b/i },

  // The areas named as genuine pulls rather than inferred from the resume.
  {
    id: 'marketing',
    label: 'marketing & communications',
    kind: 'boost',
    titles: /\b(?:marketing|communications?|social media|content (?:manager|specialist|coordinator|strategist)|brand|public relations|\bpr\b|digital (?:marketing|media)|copywriter|outreach|engagement)\b/i,
    // "Communications" is the word radios use. A Principal RF Communications
    // Engineer at Draper and a Mission Software Engineer, Communications at
    // Anduril both landed in marketing, and from there in a lane built for
    // people who write for a living.
    not: /\b(?:engineer|engineering|rf\b|radio ?frequency|antenna|waveform|satellite|firmware|hardware|network(?:ing)?|protocol|signals?|systems? engineer|technician)\b/i,
  },
  { id: 'education', label: 'higher education', kind: 'boost', titles: /\b(?:student (?:affairs|services|success|life|activities|involvement)|academic (?:advisor|affairs|coordinator|services)|registrar|admissions|financial aid|residence (?:life|hall)|dean|campus|enrollment|orientation|alumni|faculty (?:support|affairs)|bursar|provost)\b/i },
  { id: 'mission', label: 'mission & nonprofit', kind: 'boost', titles: /\b(?:nonprofit|non-profit|development (?:officer|associate|coordinator|manager)|fundrais|donor|grants?|volunteer|community (?:outreach|engagement|organiz)|advocacy|case (?:manager|worker)|social services|youth (?:program|development|worker)|mentor|ministry|parish|diocese|chaplain|mission)\b/i },
  { id: 'outdoors', label: 'conservation & outdoors', kind: 'boost', titles: /\b(?:conservation|environmental|park (?:ranger|manager|coordinator)|ranger|land (?:steward|manager|protection)|trail|naturalist|steward(?:ship)?|sustainab|wildlife|ecolog|forestry|watershed|farm|garden|horticultur|outdoor)\b/i },
  { id: 'culture', label: 'libraries, museums & archives', kind: 'boost', // `archiv(?:e|ist|al)` closed with a word boundary, which can never match
  // "Archives" — the boundary falls between 'e' and 's', and both are word
  // characters. Every Archives Assistant in the pool was unclassified. Same
  // shape of bug as the abbreviations that needed their full stops.
  titles: /\b(?:librar(?:y|ian|ies)|archiv\w*|museum|gallery|curator|collections|exhibit|visitor (?:services|experience)|docent|cultural|records manage|special collections|interpretation)\b/i },
  { id: 'publicsafety', label: 'public safety & emergency', kind: 'boost', titles: /\b(?:emergency (?:management|preparedness|services|operations)|\beoc\b|dispatch|911|public safety|disaster|continuity of operations|incident (?:command|management)|response coordinator)\b/i },
  { id: 'logistics', label: 'logistics & warehouse', kind: 'boost', titles: /\b(?:warehouse|fulfillment|inventory|supply chain|shipping|receiving|distribution|forklift|picker|packer|materials? (?:handler|associate|coordinator)|stockroom|courier|dispatcher|fleet|buyer|purchasing|procurement)\b/i },
  // Not jobs. A volunteer listing has no pay to fail a floor and no
  // requirements to fail a gap check, so it sails through every other rule.
  // Apprenticeships are deliberately absent — a paid trade apprenticeship is a
  // real route, not noise.
  { id: 'unpaid', label: 'volunteer & unpaid', kind: 'exclude', titles: /\b(?:volunteer|unpaid|intern(?:ship)?|co-?op student|work[- ]study|shadow(?:ing)?)\b/i },
  // Real boards carry placeholders. Alnylam is currently publishing one called
  // "Mattie Test Job", and it ranked in the top fifteen.
  { id: 'placeholder', label: 'test postings', kind: 'exclude', titles: /\b(?:test job|test posting|do not apply|sample (?:job|posting)|dummy|placeholder|ignore this|xxx)\b/i },

  { id: 'veterans', label: 'veterans services', kind: 'boost', titles: /\b(?:veteran|\bvso\b|military (?:family|liaison|outreach)|transition assistance|\bva\b medical|servicemember)\b/i },
]

/**
 * "Autonomous" is deliberately absent. It matched 117 of 421 real postings on
 * the first run — every autonomous vehicle and autonomy-stack job at the
 * defence companies, which are exactly the roles worth surfacing. A product
 * category is not a working style.
 */
const SOLO = /\b(?:independent contributor|individual contributor role|self-?directed|works? independently with (?:minimal|little|no) supervision|lone worker|minimal supervision)\b/i

export function classifyFamilies(title: string, body: string, company = ''): string[] {
  const out = new Set<string>()
  for (const f of FAMILIES) {
    if (f.not?.test(title)) continue
    if (f.titles.test(title)) {
      out.add(f.id)
      continue
    }
    // An ambiguous title only joins the family if the body backs it up.
    if (f.ambiguous?.test(title) && f.tell?.test(body)) out.add(f.id)
  }
  // A body that is all quota talk is a sales job whatever it calls itself.
  const sales = FAMILIES[0]
  if (!out.has('sales') && sales.tell) {
    const hits = body.match(new RegExp(sales.tell.source, 'gi'))?.length ?? 0
    if (hits >= 3) out.add('sales')
  }
  if (SOLO.test(body)) out.add('solo')

  // Veterans work is rarely in the title — it is in who the employer is, or in
  // a federal posting's hiring path, which is a scored advantage rather than a
  // line someone might notice.
  if (/\bveteran/i.test(company) || /\bhiring paths:[^.]*\bveterans\b/i.test(body)) out.add('veterans')
  return [...out]
}

export const familyById = (id: string) => FAMILIES.find((f) => f.id === id)
