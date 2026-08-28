import type { Job } from '../types'
import { easeScore } from './ease'
import { meetsFloor } from './pay'
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
  | { id: string; enabled: boolean; type: 'distance'; miles: number; includeRemote: boolean }
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
    case 'distance':
      if (job.remote) return rule.includeRemote
      return job.miles !== null && job.miles <= rule.miles
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
    case 'distance':
      return `+ within ${rule.miles} miles${rule.includeRemote ? ' (or remote)' : ''}`
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
  }
}

let seq = 0
const rid = () => `r${Date.now().toString(36)}${seq++}`
/** A rule minus the bookkeeping, distributed over the union so each shape keeps its own fields. */
export type RuleSpec = { [K in Rule['type']]: Omit<Extract<Rule, { type: K }>, 'id' | 'enabled'> }[Rule['type']]
export const mkRule = (spec: RuleSpec): Rule => ({ id: rid(), enabled: true, ...spec }) as Rule

/** The defaults every lane starts from: home radius, the floor, no sales, nothing already applied to. */
const base = (floor: number, miles = 25): Rule[] => [
  mkRule({ type: 'distance', miles, includeRemote: false }),
  mkRule({ type: 'pay', floorHourly: floor, includeUnlisted: true }),
  mkRule({ type: 'family', mode: 'lacks', value: 'sales' }),
  mkRule({ type: 'family', mode: 'lacks', value: 'unpaid' }),
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
 */
export const LANES_VERSION = 2

export function defaultLanes(floor: number): Net[] {
  const fam = (value: string) => mkRule({ type: 'family', mode: 'has', value })
  return [
    // Gettability, not credentials. An earlier version filtered on degree and
    // years and filled with six-figure cleared defence roles, which pass a
    // credentials test and are nothing like an easy hire.
    { id: 'easy', name: 'Easy hire', rules: [...base(floor), mkRule({ type: 'ease', min: 6 })] },
    { id: 'operations', name: 'Operations', rules: [...base(floor), fam('operations')] },
    { id: 'coordination', name: 'Coordination', rules: [...base(floor), fam('coordinator')] },
    { id: 'education', name: 'Higher ed', rules: [...base(floor), fam('education')] },
    { id: 'mission', name: 'Mission', rules: [...base(floor), fam('mission')] },
    { id: 'outdoors', name: 'Outdoors', rules: [...base(floor), fam('outdoors')] },
    { id: 'culture', name: 'Library & museum', rules: [...base(floor), fam('culture')] },
    { id: 'marketing', name: 'Marketing', rules: [...base(floor), fam('marketing')] },
    { id: 'analysis', name: 'Analysis', rules: [...base(floor), fam('analyst')] },
    { id: 'security', name: 'Defense & clearance', rules: [...base(floor), mkRule({ type: 'clearance', allowActiveRequired: false })] },
    { id: 'publicsafety', name: 'Public safety', rules: [...base(floor), fam('publicsafety')] },
    { id: 'veterans', name: 'Veterans', rules: [...base(floor), fam('veterans')] },
    { id: 'technology', name: 'Technology', rules: [...base(floor + 2), fam('technical')] },
    { id: 'logistics', name: 'Logistics', rules: [...base(floor), fam('logistics')] },
    { id: 'everything', name: 'Everything', rules: [mkRule({ type: 'distance', miles: 25, includeRemote: true }), mkRule({ type: 'applied', hide: true })] },
  ]
}
