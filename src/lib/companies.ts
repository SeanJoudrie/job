/**
 * The scan list. Seeded toward what the profile and the postcode point at
 * rather than a generic top-200, and meant to be edited.
 *
 * `sector` is not decoration: it feeds how gettable a job is judged to be. A
 * defence-tech company and a university administration office can post the same
 * title and run completely different hiring processes.
 */
export type Sector = 'defense' | 'tech' | 'university' | 'health' | 'nonprofit' | 'gov'

/** Split per ATS rather than lumped, so `Extract<Board, { ats: 'workable' }>` resolves. */
/**
 * `region` is the fallback for employers who name a facility rather than a
 * place — Beth Israel Lahey posts "Anna Jaques Hospital", which resolves to
 * nowhere, so 2,000 jobs fell out of the radius. A regional employer's job is
 * in that region even when the field does not say a city.
 */
type Common = { token: string; name: string; sector: Sector; region?: string }
export type Board =
  | ({ ats: 'greenhouse' } & Common)
  | ({ ats: 'lever' } & Common)
  | ({ ats: 'ashby' } & Common)
  | ({ ats: 'workable' } & Common)
  | ({ ats: 'silkroad' } & Common)
  | ({ ats: 'smartrecruiters' } & Common)
  /**
   * `search` narrows a national board server-side.
   *
   * RTX posts 4,525 jobs and Leidos 2,000, almost none of them in range, and
   * the location filter only runs after every page has been pulled — a hundred
   * requests each to keep forty. Workday's own searchText cuts RTX to 61 and
   * Leidos to 39 in one call. The cost is that it matches text as well as
   * place, so a posting whose location field says "3 Locations" is missed even
   * when one of the three is here. That trade is worth it for an employer
   * whose board is national; it would be wrong for a local one, which is why
   * it is opt-in per board rather than applied to all of them.
   */
  | ({ ats: 'workday'; wd: number; site: string; search?: string } & Common)

export const BOARDS: Board[] = [
  // Defence tech — service is an asset, and most sponsor a clearance rather
  // than demanding one up front. Competitive to get into.
  { ats: 'greenhouse', token: 'andurilindustries', name: 'Anduril', sector: 'defense' },
  { ats: 'lever', token: 'shieldai', name: 'Shield AI', sector: 'defense' },
  { ats: 'lever', token: 'palantir', name: 'Palantir', sector: 'defense' },
  { ats: 'greenhouse', token: 'vannevarlabs', name: 'Vannevar Labs', sector: 'defense' },
  { ats: 'greenhouse', token: 'scaleai', name: 'Scale AI', sector: 'defense' },
  { ats: 'ashby', token: 'primer', name: 'Primer', sector: 'defense' },
  { ats: 'workday', token: 'draper', wd: 5, site: 'Draper_Careers', name: 'Draper', sector: 'defense' },
  // The primes. National boards, narrowed to the state before they are pulled.
  // Their Massachusetts sites are the ones in range: Woburn, Cambridge,
  // Andover and Tewksbury for RTX, Bedford for Leidos.
  { ats: 'workday', token: 'globalhr', wd: 5, site: 'REC_RTX_Ext_Gateway', search: 'Massachusetts', name: 'RTX', sector: 'defense' },
  { ats: 'workday', token: 'leidos', wd: 5, site: 'External', search: 'Massachusetts', name: 'Leidos', sector: 'defense' },

  // Higher education — student affairs, admissions, campus operations. Done
  // before and enjoyed, and the closest structural fit on the whole list.
  { ats: 'workday', token: 'northeastern', wd: 1, site: 'Careers', name: 'Northeastern', sector: 'university' },
  { ats: 'workday', token: 'brandeis', wd: 5, site: 'jobs', name: 'Brandeis', sector: 'university' },
  { ats: 'workday', token: 'babson', wd: 1, site: 'Staff', name: 'Babson', sector: 'university' },
  { ats: 'workday', token: 'suffolk', wd: 1, site: 'External', name: 'Suffolk University', sector: 'university' },
  { ats: 'smartrecruiters', token: 'harvarduniversity', name: 'Harvard University', sector: 'university', region: 'Cambridge, MA' },
  { ats: 'workday', token: 'berklee', wd: 1, site: 'BerkleeCareers', name: 'Berklee', sector: 'university', region: 'Boston, MA' },
  { ats: 'workday', token: 'bentley', wd: 503, site: 'staff', name: 'Bentley University', sector: 'university', region: 'Waltham, MA' },
  { ats: 'workday', token: 'emerson', wd: 5, site: 'emerson_college_staff', name: 'Emerson College', sector: 'university', region: 'Boston, MA' },
  { ats: 'workday', token: 'simmons', wd: 504, site: 'simmons-careers', name: 'Simmons University', sector: 'university', region: 'Boston, MA' },
  { ats: 'workday', token: 'wit', wd: 1, site: 'wit', name: 'Wentworth Institute', sector: 'university', region: 'Boston, MA' },
  { ats: 'workday', token: 'wellesley', wd: 1, site: 'wellesley-staff', name: 'Wellesley College', sector: 'university', region: 'Wellesley, MA' },
  { ats: 'workday', token: 'endicott', wd: 1, site: 'endicott', name: 'Endicott College', sector: 'university', region: 'Beverly, MA' },
  // The largest employer in range that publishes a board readable without a
  // browser. Tufts is on iCIMS and MIT on a JavaScript app; neither returns a
  // posting to anything but Chrome.
  { ats: 'silkroad', token: 'BU', name: 'Boston University', sector: 'university', region: 'Boston, MA' },

  // Health systems — the largest employers in the region and full of
  // coordination, scheduling, records and operations work that is not clinical.
  { ats: 'workday', token: 'bilh', wd: 1, site: 'External', name: 'Beth Israel Lahey Health', sector: 'health', region: 'Boston, MA' },
  { ats: 'workday', token: 'tuftsmedicine', wd: 1, site: 'jobs', name: 'Tufts Medicine', sector: 'health', region: 'Boston, MA' },
  { ats: 'smartrecruiters', token: 'bostonmedicalcenter', name: 'Boston Medical Center', sector: 'health' },
  { ats: 'smartrecruiters', token: 'alnylam', name: 'Alnylam', sector: 'health' },

  // Public media. Small board, and the whole of it is Tier A creative work at a
  // mission-driven institution — the crossover the case file says has never
  // been searched. Most of the rest of that category (the MFA, the Gardner,
  // Mass Audubon, the Globe, Tufts) is behind iCIMS, Paylocity or Taleo, none
  // of which publish a board anyone can read without an account.
  { ats: 'workday', token: 'publicmedia', wd: 1, site: 'WGBH_Careers', name: 'GBH', sector: 'nonprofit', region: 'Boston, MA' },

  // Conservation and mission work.
  { ats: 'workable', token: 'thetrustees', name: 'The Trustees of Reservations', sector: 'nonprofit' },
  { ats: 'lever', token: 'sierraclub', name: 'Sierra Club', sector: 'nonprofit' },

  // Boston-area employers — operations and coordination roles, not only engineering.
  { ats: 'greenhouse', token: 'klaviyo', name: 'Klaviyo', sector: 'tech' },
  { ats: 'greenhouse', token: 'datadog', name: 'Datadog', sector: 'tech' },
  { ats: 'greenhouse', token: 'toast', name: 'Toast', sector: 'tech' },
  { ats: 'greenhouse', token: 'cargurus', name: 'CarGurus', sector: 'tech' },
  { ats: 'greenhouse', token: 'formlabs', name: 'Formlabs', sector: 'tech' },
  { ats: 'greenhouse', token: 'markforged', name: 'Markforged', sector: 'tech' },
  { ats: 'greenhouse', token: 'veracode', name: 'Veracode', sector: 'tech' },
  { ats: 'greenhouse', token: 'ginkgobioworks', name: 'Ginkgo Bioworks', sector: 'health' },
  { ats: 'greenhouse', token: 'amwell', name: 'Amwell', sector: 'health' },
  { ats: 'greenhouse', token: 'butterflynetwork', name: 'Butterfly Network', sector: 'health' },
  { ats: 'ashby', token: 'whoop', name: 'WHOOP', sector: 'tech' },
  { ats: 'ashby', token: 'circle', name: 'Circle', sector: 'tech' },
  { ats: 'greenhouse', token: 'mongodb', name: 'MongoDB', sector: 'tech' },
  { ats: 'greenhouse', token: 'cloudflare', name: 'Cloudflare', sector: 'tech' },
  { ats: 'greenhouse', token: 'okta', name: 'Okta', sector: 'tech' },
  { ats: 'greenhouse', token: 'asana', name: 'Asana', sector: 'tech' },
  { ats: 'greenhouse', token: 'tulip', name: 'Tulip', sector: 'tech' },
  { ats: 'greenhouse', token: 'starburst', name: 'Starburst', sector: 'tech' },
  { ats: 'ashby', token: 'benchling', name: 'Benchling', sector: 'tech' },
  { ats: 'ashby', token: 'wistia', name: 'Wistia', sector: 'tech' },
  { ats: 'lever', token: 'jumpcloud', name: 'JumpCloud', sector: 'tech' },

  // Retail and consumer — warehouse, fulfilment, stores and support. The
  // bridging tier, and the one that hires fastest.
  { ats: 'workday', token: 'newbalance', wd: 1, site: 'Careers', name: 'New Balance', sector: 'tech' },
  { ats: 'workday', token: 'chewy', wd: 5, site: 'External', name: 'Chewy', sector: 'tech' },
  { ats: 'workable', token: 'reebok', name: 'Reebok', sector: 'tech' },
]
