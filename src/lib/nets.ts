import type { Job } from '../types'
import { withinCommute } from './commute'
import { easeScore } from './ease'
import { industryFor, isCreativeFunction, isFrontline } from './industry'
import { meetsFloor, topHourly } from './pay'
import { DEGREE_RANK } from './requirements'

/**
 * The funnel, built by hand.
 *
 * Every rule is a value the person using this wrote, in a list they can read,
 * reorder and switch off. Nothing filters invisibly, and the count after each
 * rule is kept so it is always obvious what a rule is costing. A rule that
 * quietly removes three hundred good jobs should be visible as exactly that.
 */

export type Rule =
  | { id: string; enabled: boolean; type: 'text'; mode: 'has' | 'lacks'; field: 'title' | 'body' | 'both'; value: string }
  | { id: string; enabled: boolean; type: 'family'; mode: 'has' | 'lacks'; value: string }
  | { id: string; enabled: boolean; type: 'commute'; maxMinutes: number; includeRemote: boolean }
  | { id: string; enabled: boolean; type: 'pay'; floorHourly: number; includeUnlisted: boolean }
  | { id: string; enabled: boolean; type: 'posted'; days: number }
  | { id: string; enabled: boolean; type: 'degree'; max: 'highschool' | 'associate' | 'bachelor' | 'master' | 'doctorate' }
  | { id: string; enabled: boolean; type: 'years'; max: number }
  | { id: string; enabled: boolean; type: 'clearance'; allowActiveRequired: boolean }
  | { id: string; enabled: boolean; type: 'remote'; mode: 'exclude' | 'only' }
  | { id: string; enabled: boolean; type: 'company'; mode: 'has' | 'lacks'; value: string }
  | { id: string; enabled: boolean; type: 'applied'; hide: boolean }
  | { id: string; enabled: boolean; type: 'ease'; min: number }
  | { id: string; enabled: boolean; type: 'sector'; mode: 'has' | 'lacks'; value: string }
  /** The case-file industry table. `ids` narrows to named industries; `min` sets a tier floor. */
  | { id: string; enabled: boolean; type: 'industry'; min: number; ids?: string[] }
  /** Retail and front-line customer service, allowed only above this rate. */
  | { id: string; enabled: boolean; type: 'frontline'; minHourly: number }
  /** Communications, media, editorial, design — the crossover search. */
  | { id: string; enabled: boolean; type: 'creative' }
  /** Employers whose board pays for study. A fact about the employer; see lib/perks.ts. */
  | { id: string; enabled: boolean; type: 'tuition' }

export type Net = { id: string; name: string; rules: Rule[] }

const hay = (job: Job, field: 'title' | 'body' | 'both') =>
  (field === 'title' ? job.title : field === 'body' ? job.descText || job.preview || '' : `${job.title}\n${job.descText || job.preview || ''}`).toLowerCase()

const days = (iso: string | null) => (iso ? (Date.now() - Date.parse(iso)) / 86_400_000 : Infinity)

export function passes(job: Job, rule: Rule, appliedKeys: Set<string>, keyOf: (j: Job) => string): boolean {
  switch (rule.type) {
    case 'text': {
      const found = rule.value ? hay(job, rule.field).includes(rule.value.toLowerCase()) : false
      return rule.mode === 'has' ? found : !found
    }
    case 'family': {
      const has = job.families.includes(rule.value)
      return rule.mode === 'has' ? has : !has
    }
    case 'commute':
      if (job.remote) return rule.includeRemote
      return withinCommute(job, rule.maxMinutes)
    case 'pay': {
      const verdict = meetsFloor(job.pay, rule.floorHourly)
      // Unlisted pay is an unknown, not a failure. Excluding it to enforce a
      // floor removes more good jobs than bad ones.
      return verdict === 'pass' || (verdict === 'unknown' && rule.includeUnlisted)
    }
    case 'posted':
      return days(job.postedAt ?? job.firstSeen) <= rule.days
    case 'degree':
      // Only HARD education requirements can exclude. A preference is a door.
      return !job.requirements.some((r) => r.hardness === 'hard' && r.degree && DEGREE_RANK[r.degree] > DEGREE_RANK[rule.max])
    case 'years':
      return !job.requirements.some((r) => r.hardness === 'hard' && r.years !== undefined && r.years > rule.max)
    case 'clearance':
      if (rule.allowActiveRequired) return true
      return !job.requirements.some((r) => r.kind === 'clearance' && r.clearance === 'active' && r.hardness === 'hard')
    case 'remote':
      return rule.mode === 'only' ? job.remote : !job.remote
    case 'company': {
      const match = job.company.toLowerCase().includes(rule.value.toLowerCase())
      return rule.mode === 'has' ? match : !match
    }
    case 'applied':
      return rule.hide ? !appliedKeys.has(keyOf(job)) : true
    case 'ease':
      return easeScore(job) >= rule.min
    case 'sector':
      return rule.mode === 'has' ? job.sector === rule.value : job.sector !== rule.value
    case 'industry': {
      const ind = industryFor(job)
      if (rule.ids) return rule.ids.includes(ind.id)
      return ind.weight >= rule.min
    }
    case 'frontline': {
      // Unknown pay cannot clear a floor it never stated. Everywhere else an
      // unstated salary is treated as an unknown rather than a failure, and
      // that is right — but retail is the one category the case file names as
      // a problem, and the whole point of the rule is the confirmed number.
      if (!isFrontline(job)) return true
      const top = topHourly(job.pay)
      return top !== null && top >= rule.minHourly
    }
    case 'creative':
      return isCreativeFunction(job)
    case 'tuition':
      return job.tuition === true
  }
}

export type Step = { rule: Rule; before: number; after: number }
export type NetResult = { jobs: Job[]; steps: Step[] }

/** Runs the stack in order and keeps the count after each rule. */
export function runNet(jobs: Job[], net: Net, appliedKeys: Set<string>, keyOf: (j: Job) => string): NetResult {
  const steps: Step[] = []
  let current = jobs
  for (const rule of net.rules) {
    if (!rule.enabled) continue
    const before = current.length
    current = current.filter((j) => passes(j, rule, appliedKeys, keyOf))
    steps.push({ rule, before, after: current.length })
  }
  return { jobs: current, steps }
}

export function describeRule(rule: Rule): string {
  switch (rule.type) {
    case 'text':
      return `${rule.mode === 'has' ? '+' : '−'} ${rule.field} contains "${rule.value}"`
    case 'family':
      return `${rule.mode === 'has' ? '+' : '−'} role family: ${rule.value}`
    case 'commute':
      return `+ within ${rule.maxMinutes} min of home${rule.includeRemote ? ' (or remote)' : ''}`
    case 'pay':
      return `+ pay ≥ $${rule.floorHourly}/hr${rule.includeUnlisted ? ' (incl. unlisted)' : ''}`
    case 'posted':
      return `+ posted in the last ${rule.days} days`
    case 'degree':
      return `− requires above a ${rule.max}'s degree`
    case 'years':
      return `− hard requirement over ${rule.max} years`
    case 'clearance':
      return rule.allowActiveRequired ? '+ any clearance requirement' : '− requires a clearance already held'
    case 'remote':
      return rule.mode === 'only' ? '+ remote only' : '− fully remote'
    case 'company':
      return `${rule.mode === 'has' ? '+' : '−'} company contains "${rule.value}"`
    case 'applied':
      return rule.hide ? '− already applied' : '+ including applied'
    case 'ease':
      return `+ realistically gettable (${rule.min}+/10)`
    case 'sector':
      return `${rule.mode === 'has' ? '+' : '−'} ${rule.value} employers`
    case 'industry':
      if (rule.ids) return `+ ${rule.ids.map(labelOf).join(', ')}`
      return rule.min <= 1 ? '− excluded industries (Tier E)' : `+ Tier A industries only (${rule.min}+)`
    case 'frontline':
      return `− retail & front-line service under $${rule.minHourly}/hr`
    case 'creative':
      return '+ communications, media, editorial or design'
    case 'tuition':
      return '+ employers who pay for study'
  }
}

/** Industry ids read badly in a rule list. "archives_records_management" is not English. */
const labelOf = (id: string) => id.replace(/_/g, ' ')

let seq = 0
const rid = () => `r${Date.now().toString(36)}${seq++}`
/** A rule minus the bookkeeping, distributed over the union so each shape keeps its own fields. */
export type RuleSpec = { [K in Rule['type']]: Omit<Extract<Rule, { type: K }>, 'id' | 'enabled'> }[Rule['type']]
export const mkRule = (spec: RuleSpec): Rule => ({ id: rid(), enabled: true, ...spec }) as Rule

/**
 * The defaults every lane starts from.
 *
 * The order is the order the case file puts them in: logistics first, because
 * they outrank everything, then the exclusions that hold regardless of pay.
 */
const base = (floor: number, maxMinutes = 30): Rule[] => [
  mkRule({ type: 'commute', maxMinutes, includeRemote: false }),
  mkRule({ type: 'pay', floorHourly: floor, includeUnlisted: true }),
  // Tier E: insurance, gambling, telemarketing, collections, police and fire,
  // corrections, dispatch, transit, utilities, the trades, kitchens, food
  // production and assembly lines. Every one of them is in the table at zero.
  mkRule({ type: 'industry', min: 0.5 }),
  mkRule({ type: 'frontline', minHourly: 30 }),
  mkRule({ type: 'family', mode: 'lacks', value: 'unpaid' }),
  mkRule({ type: 'family', mode: 'lacks', value: 'placeholder' }),
  mkRule({ type: 'remote', mode: 'exclude' }),
  mkRule({ type: 'applied', hide: true }),
]

/**
 * Lanes, not one list. A wide net is right when employment is the goal, but as
 * a single ranked column the bridge job and the career job compete for the same
 * row and both lose.
 */
/**
 * Bumped whenever the shipped lane set changes meaningfully.
 *
 * Saved lanes live on the device, so without this a phone that opened the app
 * once keeps its old set forever and never sees a new one — the same trap that
 * left the sibling project showing placeholder data for days. On a bump the
 * shipped lanes replace the stored ones. Custom rules are lost, which is a real
 * cost, and still far better than silently never receiving the new lanes.
 *
 * 3: rebuilt on the case file — commute in minutes, the industry table, the
 * front-line pay rule, and the crossover search that had never been run.
 */
/**
 * v4 adds the tuition lane. A stored v3 set would never show it — the saved
 * value beats the shipped default, which is exactly the trap this number exists
 * for and has already caught twice.
 */
export const LANES_VERSION = 4

/**
 * The rules the Top list ranks within.
 *
 * It cannot reuse the Everything lane: that one deliberately carries only a
 * radius so nothing is hidden from a manual search, and Top was consequently
 * ranking jobs paying below the floor. Top is a recommendation, so it obeys
 * the same baseline every lane does.
 */
export const topBaseline = (floor: number, maxMinutes = 30): Net => ({ id: 'top', name: 'Top', rules: base(floor, maxMinutes) })

export function defaultLanes(floor: number, maxMinutes = 30): Net[] {
  const b = () => base(floor, maxMinutes)
  const fam = (value: string) => mkRule({ type: 'family', mode: 'has', value })
  const ind = (...ids: string[]) => mkRule({ type: 'industry', min: 0.5, ids })
  return [
    // Gettability, not credentials. An earlier version filtered on degree and
    // years and filled with six-figure cleared defence roles, which pass a
    // credentials test and are nothing like an easy hire.
    { id: 'easy', name: 'Easy hire', rules: [...b(), mkRule({ type: 'ease', min: 6 })] },
    // The one the case file singles out as never having been tried: a Tier A
    // institution and a job that involves writing or making something.
    { id: 'crossover', name: 'Crossover', rules: [...b(), mkRule({ type: 'industry', min: 8 }), mkRule({ type: 'creative' })] },
    // A degree paid for is worth more than the gap between $27 and $32 an hour,
    // and it is not in the score on purpose — see lib/perks.ts. A lane is how
    // he sees it without the model double-counting the employer.
    { id: 'tuition', name: 'Tuition paid', rules: [...b(), mkRule({ type: 'tuition' })] },
    { id: 'coordination', name: 'Coordination', rules: [...b(), fam('coordinator')] },
    { id: 'operations', name: 'Operations', rules: [...b(), fam('operations')] },
    { id: 'education', name: 'Higher ed & schools', rules: [...b(), ind('higher_education_admin', 'k12_school_district_nonteaching')] },
    {
      id: 'creative',
      name: 'Creative & media',
      rules: [
        ...b(),
        ind('media_creative_production', 'publishing_editorial', 'graphic_design', 'video_content_production', 'event_production_av', 'marketing_operations_nonsales'),
      ],
    },
    { id: 'culture', name: 'Library & museum', rules: [...b(), ind('museums_cultural_institutions', 'public_library')] },
    { id: 'records', name: 'Records & archives', rules: [...b(), ind('archives_records_management')] },
    { id: 'government', name: 'Government', rules: [...b(), ind('municipal_town_government', 'state_agency', 'federal_agency', 'courts_judicial_admin')] },
    { id: 'legalhr', name: 'Legal & HR', rules: [...b(), ind('legal_assistant_paralegal', 'hr_recruiting_coordination')] },
    { id: 'health', name: 'Health admin', rules: [...b(), ind('hospitals_health_admin')] },
    // Section 7: "apply anyway, entry-level and support-tier only."
    { id: 'technical', name: 'IT & data', rules: [...b(), ind('it_helpdesk_support', 'qa_testing', 'data_analysis', 'software_development')] },
    { id: 'logistics', name: 'Warehouse & logistics', rules: [...b(), ind('warehouse_distribution', 'postal_service', 'moving_delivery')] },
    { id: 'facilities', name: 'Facilities & custodial', rules: [...b(), ind('facilities_maintenance', 'custodial')] },
    { id: 'mission', name: 'Mission', rules: [...b(), ind('faith_based_nonprofits', 'social_services_case_mgmt', 'conservation_land_trusts', 'veterans_services')] },
    // Empty from November to March, on purpose. The Empty panel names the rule
    // that emptied it, so it reads as a season rather than a bug.
    { id: 'outdoors', name: 'Outdoors', rules: [...b(), ind('state_parks_dcr', 'environmental_field_work', 'groundskeeping_landscaping')] },
    // Not a clearance he holds — one an employer will sponsor. That is already
    // met, and it is the single largest advantage on the resume.
    { id: 'security', name: 'Sponsors a clearance', rules: [...b(), mkRule({ type: 'clearance', allowActiveRequired: false })] },
    { id: 'everything', name: 'Everything', rules: [mkRule({ type: 'commute', maxMinutes: maxMinutes * 2, includeRemote: true }), mkRule({ type: 'applied', hide: true })] },
  ]
}
