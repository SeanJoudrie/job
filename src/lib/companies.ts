/**
 * The scan list. Seeded toward what the profile and the postcode actually point
 * at rather than a generic top-200, and meant to be edited.
 *
 * Coverage here is deliberate rather than broad: these boards are the direct
 * apply path and they carry a job days before an aggregator does.
 */
export type Board = { ats: 'greenhouse' | 'lever' | 'ashby'; token: string; name: string; tag: string }

export const BOARDS: Board[] = [
  // Defence tech — service is an asset here, and most sponsor clearances
  // rather than demanding one up front.
  { ats: 'greenhouse', token: 'andurilindustries', name: 'Anduril', tag: 'defense' },
  { ats: 'lever', token: 'shieldai', name: 'Shield AI', tag: 'defense' },
  { ats: 'lever', token: 'palantir', name: 'Palantir', tag: 'defense' },
  { ats: 'greenhouse', token: 'vannevarlabs', name: 'Vannevar Labs', tag: 'defense' },
  { ats: 'greenhouse', token: 'scaleai', name: 'Scale AI', tag: 'defense' },
  { ats: 'ashby', token: 'primer', name: 'Primer', tag: 'defense' },

  // Boston area — operations and coordination roles, not only engineering.
  { ats: 'greenhouse', token: 'klaviyo', name: 'Klaviyo', tag: 'boston' },
  { ats: 'greenhouse', token: 'datadog', name: 'Datadog', tag: 'boston' },
  { ats: 'greenhouse', token: 'toast', name: 'Toast', tag: 'boston' },
  { ats: 'greenhouse', token: 'cargurus', name: 'CarGurus', tag: 'boston' },
  { ats: 'greenhouse', token: 'formlabs', name: 'Formlabs', tag: 'boston' },
  { ats: 'greenhouse', token: 'markforged', name: 'Markforged', tag: 'boston' },
  { ats: 'greenhouse', token: 'veracode', name: 'Veracode', tag: 'boston' },
  { ats: 'greenhouse', token: 'ginkgobioworks', name: 'Ginkgo Bioworks', tag: 'boston' },
  { ats: 'greenhouse', token: 'amwell', name: 'Amwell', tag: 'boston' },
  { ats: 'greenhouse', token: 'butterflynetwork', name: 'Butterfly Network', tag: 'boston' },
  { ats: 'ashby', token: 'whoop', name: 'WHOOP', tag: 'boston' },
  { ats: 'ashby', token: 'circle', name: 'Circle', tag: 'boston' },

  // National employers that post Boston roles.
  { ats: 'greenhouse', token: 'mongodb', name: 'MongoDB', tag: 'national' },
  { ats: 'greenhouse', token: 'cloudflare', name: 'Cloudflare', tag: 'national' },
  { ats: 'greenhouse', token: 'okta', name: 'Okta', tag: 'national' },
  { ats: 'greenhouse', token: 'asana', name: 'Asana', tag: 'national' },
]
