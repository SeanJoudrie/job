import { describe, expect, it } from 'vitest'
import { industryFor, industryOf, isCreativeFunction, isFrontline, TIER_A, type Posting } from '../industry'
import type { Job } from '../../types'

const p = (over: Partial<Posting> = {}): Posting => ({ title: '', company: 'Acme', body: '', ...over })
const JULY = new Date('2026-07-15T12:00:00Z')
const JANUARY = new Date('2026-01-15T12:00:00Z')
const w = (over: Partial<Posting>, now = JULY) => industryOf(p(over), now).weight
const id = (over: Partial<Posting>, now = JULY) => industryOf(p(over), now).id

describe('the table returns the case file’s own numbers', () => {
  it('higher education administration is the top of the list', () => {
    expect(w({ title: 'Program Coordinator', sector: 'university' })).toBe(9)
  })
  it('warehouse work is Tier C, not Tier E', () => {
    expect(w({ title: 'Warehouse Associate' })).toBe(6)
  })
  it('social services is the bottom of the acceptable range', () => {
    expect(w({ title: 'Case Manager' })).toBe(5)
  })
  it('anything unrecognised sits in the middle rather than being punished', () => {
    expect(w({ title: 'Widget Wrangler' })).toBe(5)
    expect(id({ title: 'Widget Wrangler' })).toBe('unclassified')
  })
})

describe('the hard exclusions', () => {
  const excluded = [
    ['Insurance Claims Adjuster', 'insurance_any'],
    ['Underwriter', 'insurance_any'],
    ['Casino Floor Supervisor', 'gambling'],
    ['Telemarketing Representative', 'telemarketing'],
    ['Police Officer', 'police_fire'],
    ['Firefighter', 'police_fire'],
    ['911 Telecommunicator', 'emergency_management_dispatch'],
    ['Emergency Management Specialist', 'emergency_management_dispatch'],
    ['Correctional Officer', 'corrections_probation'],
    ['Probation Officer', 'corrections_probation'],
    ['Line Cook', 'culinary_kitchens'],
    ['Dishwasher', 'culinary_kitchens'],
    ['Bus Operator', 'mbta_transit'],
    ['Meter Reader', 'utilities'],
    ['Carpenter', 'carpentry_construction'],
    ['HVAC Technician', 'hvac_electrical_plumbing'],
    ['Electrician', 'hvac_electrical_plumbing'],
    ['Assembly Technician', 'manufacturing_assembly'],
    ['CNC Machinist', 'manufacturing_assembly'],
    ['Registered Nurse', 'clinical_licensed'],
  ] as const

  for (const [title, expected] of excluded) {
    it(`${title} is out`, () => {
      const out = industryOf(p({ title }), JULY)
      expect(out.id).toBe(expected)
      expect(out.weight).toBe(0)
      expect(out.excluded).toBe(true)
    })
  }

  it('an insurer is excluded by its name even when the title is neutral', () => {
    expect(id({ title: 'Office Coordinator', company: 'Liberty Mutual Insurance' })).toBe('insurance_any')
  })

  it('a sales family is excluded however the posting titles itself', () => {
    // classifyFamilies has already resolved "Account Manager" against the body.
    expect(w({ title: 'Account Manager', families: ['sales'] })).toBe(0)
  })
})

describe('exclusions that would cost real jobs if they were sloppy', () => {
  it('quality assurance is not insurance', () => {
    // "assurance" and "insurance" are one letter apart and QA is Tier B.
    expect(id({ title: 'Quality Assurance Analyst' })).toBe('qa_testing')
  })

  it('a museum Collections Specialist is not a debt collector', () => {
    const museum = p({ title: 'Collections Specialist', company: 'Peabody Essex Museum', body: 'Care of the permanent collection and loans.' })
    expect(industryOf(museum, JULY).excluded).toBe(false)
    const debt = p({ title: 'Collections Specialist', body: 'Contact customers regarding past-due and delinquent accounts.' })
    expect(industryOf(debt, JULY).id).toBe('collections')
  })

  it('a fleet dispatcher is logistics; a fire dispatcher is not', () => {
    const fleet = p({ title: 'Dispatcher', body: 'Route drivers and schedule delivery vehicles across the region.' })
    expect(industryOf(fleet, JULY).excluded).toBe(false)
    const fire = p({ title: 'Dispatcher', body: 'Answer emergency calls and dispatch police and fire apparatus.' })
    expect(industryOf(fire, JULY).id).toBe('emergency_management_dispatch')
  })

  it('probate is not probation', () => {
    expect(industryOf(p({ title: 'Probate Clerk' }), JULY).excluded).toBe(false)
    expect(id({ title: 'Probate Clerk' })).toBe('courts_judicial_admin')
  })

  it('a manufacturing engineer is not an assembler', () => {
    expect(industryOf(p({ title: 'Manufacturing Engineer' }), JULY).excluded).toBe(false)
  })

  it('a Production Assistant is media work, not a production line', () => {
    expect(id({ title: 'Production Assistant' })).toBe('media_creative_production')
  })

  it('a Dining Services Coordinator at a college is higher education, not a kitchen', () => {
    expect(id({ title: 'Dining Services Coordinator', company: 'Suffolk University', sector: 'university' })).toBe('higher_education_admin')
  })

  it('a server engineer is not a restaurant server', () => {
    expect(industryOf(p({ title: 'Server Administrator' }), JULY).excluded).toBe(false)
  })

  it('a podcast host is not a restaurant host', () => {
    expect(industryOf(p({ title: 'Podcast Host' }), JULY).excluded).toBe(false)
  })

  it('a facilities job that mentions HVAC in the body is still facilities', () => {
    const j = p({ title: 'Maintenance Technician', body: 'Support HVAC, electrical and plumbing systems across campus.' })
    expect(industryOf(j, JULY).id).toBe('facilities_maintenance')
  })
})

describe('the institutional boost', () => {
  it('lifts a role that has a tier of its own, but only so far', () => {
    // "Recycling Services Driver" at Harvard was a nine, above the university's
    // own administrative posts. An institution improves a job; it does not
    // turn a driving job into an administrative one.
    expect(w({ title: 'Recycling Services Driver' })).toBe(5.5)
    expect(w({ title: 'Recycling Services Driver', company: 'Harvard University', sector: 'university' })).toBe(7)
  })

  it('does not read an RF engineer as a marketing hire', () => {
    // classifyFamilies put "Principal RF Communications Engineer" in the
    // marketing family, and marketing operations is Tier A at 8.5.
    const rf = { title: 'Principal RF Communications Engineer', company: 'Draper', families: ['marketing'] }
    expect(id(rf)).not.toBe('marketing_operations_nonsales')
    expect(id({ title: 'Communications Coordinator', families: ['marketing'] })).toBe('marketing_operations_nonsales')
  })

  // "Institutional employers and creative functions should be boosted even
  // where the specific role title is generic."
  it('lifts a generic title at a Tier A employer', () => {
    expect(w({ title: 'Administrative Assistant', company: 'Berklee', sector: 'university' })).toBe(9)
    expect(w({ title: 'Administrative Assistant' })).toBe(5)
  })

  it('does not lift a professorship, which is not a job he can take', () => {
    expect(id({ title: 'Assistant Professor of Music', company: 'Berklee', sector: 'university' })).toBe('academic_teaching')
    expect(w({ title: 'Assistant Professor of Music', company: 'Berklee', sector: 'university' })).toBe(3)
  })
})

describe('the software-employer discount', () => {
  // "Poor fit: software companies where he'd be measured against career
  // engineers." The same title elsewhere is one of his best options.
  it('discounts a technical role at a software company', () => {
    expect(w({ title: 'IT Support Specialist', sector: 'tech' })).toBe(5.5)
  })
  it('lifts the same role at a university without pretending it is something else', () => {
    // 7 for IT support, lifted by the institution but not all the way to 9 —
    // the university does not make it an administrative post.
    expect(w({ title: 'IT Support Specialist', sector: 'university' })).toBe(8.5)
  })
  it('leaves a non-technical role at a software company alone', () => {
    expect(w({ title: 'Office Coordinator', sector: 'tech' })).toBe(5)
  })
})

describe('the seasonal rule', () => {
  it('groundskeeping is Tier C in July and excluded in January', () => {
    expect(w({ title: 'Groundskeeper' }, JULY)).toBe(6.5)
    expect(w({ title: 'Groundskeeper' }, JANUARY)).toBe(0)
    expect(industryOf(p({ title: 'Groundskeeper' }), JANUARY).why).toMatch(/November to March/)
  })
  it('applies to every outdoor field role, not just landscaping', () => {
    expect(w({ title: 'Park Ranger' }, JULY)).toBe(7.2)
    expect(w({ title: 'Park Ranger' }, JANUARY)).toBe(0)
    expect(w({ title: 'Environmental Field Technician' }, JANUARY)).toBe(0)
  })
  it('leaves indoor work alone in winter', () => {
    expect(w({ title: 'Records Clerk' }, JANUARY)).toBe(8.5)
  })
})

describe('what the index carries', () => {
  const job = (over: Partial<Job> = {}): Job => ({
    id: 'j', source: 'greenhouse', sector: 'tech', company: 'Acme', title: 'Program Coordinator',
    url: 'https://x/1', descText: '', locations: [], miles: 5, remote: false, pay: null,
    requirements: [], families: [], postedAt: null, firstSeen: '2026-08-01', lastSeen: '2026-08-28',
    scans: 1, reposts: 0, alsoOn: [], linkOk: true, ...over,
  })

  it('uses the id stored at scan time, which saw the whole description', () => {
    // The index keeps 280 characters. The debt language that separates a
    // museum's Collections Specialist from a debt collector is not in them.
    const j = job({ title: 'Collections Specialist', industry: { id: 'collections', why: 'debt collections' }, preview: 'Join our team.' })
    expect(industryFor(j, JULY).id).toBe('collections')
    expect(industryFor(j, JULY).excluded).toBe(true)
  })

  it('resolves the weight for today, not for the day of the scan', () => {
    const j = job({ title: 'Groundskeeper', industry: { id: 'groundskeeping_landscaping', why: 'groundskeeping' } })
    expect(industryFor(j, JULY).weight).toBe(6.5)
    expect(industryFor(j, JANUARY).weight).toBe(0)
  })

  it('falls back to the preview when the scan predates the table', () => {
    expect(industryFor(job({ title: 'Records Clerk' }), JULY).id).toBe('archives_records_management')
  })

  it('reclassifies rather than reporting a weight for an entry that no longer exists', () => {
    const j = job({ title: 'Records Clerk', industry: { id: 'industry_that_was_deleted', why: 'gone' } })
    expect(industryFor(j, JULY).id).toBe('archives_records_management')
  })
})

describe('the two predicates the lanes need', () => {
  const job = (title: string): Job => ({
    id: 'j', source: 'greenhouse', sector: 'tech', company: 'Acme', title,
    url: 'https://x/1', descText: '', locations: [], miles: 5, remote: false, pay: null,
    requirements: [], families: [], postedAt: null, firstSeen: '2026-08-01', lastSeen: '2026-08-28',
    scans: 1, reposts: 0, alsoOn: [], linkOk: true,
  })

  it('front-line service is retail and the phones, not a university front desk', () => {
    expect(isFrontline(job('Retail Sales Associate'))).toBe(true)
    expect(isFrontline(job('Customer Service Representative'))).toBe(true)
    // The case file asks for "front desk (non-retail)" by name.
    expect(isFrontline(job('Front Desk Coordinator'))).toBe(false)
    expect(isFrontline(job('Program Coordinator'))).toBe(false)
  })

  it('creative functions are the crossover the case file says was never run', () => {
    for (const t of ['Communications Coordinator', 'Media Assistant', 'Content Producer', 'Marketing Coordinator']) {
      expect(isCreativeFunction(job(t)), t).toBe(true)
    }
    expect(isCreativeFunction(job('Facilities Technician'))).toBe(false)
  })

  it('Tier A is the set the crossover lane narrows to', () => {
    expect(TIER_A.has('higher_education_admin')).toBe(true)
    expect(TIER_A.has('museums_cultural_institutions')).toBe(true)
    expect(TIER_A.has('warehouse_distribution')).toBe(false)
  })
})
