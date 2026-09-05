import { describe, expect, it } from 'vitest'
import { CLINICAL_CREDENTIAL, INSTITUTIONAL_BOOST, industryFor, industryOf, isCreativeFunction, isFrontline, TIER_A, type Posting } from '../industry'
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
  // Data analysis, not IT support. Support was moved to 4.5 when the two case
  // files were reconciled, which put it under the 5.5 ceiling — so it stopped
  // exercising this rule at all and the test would have passed while the
  // discount did nothing. The example has to be a role the ceiling still bites.
  it('discounts a technical role at a software company', () => {
    expect(w({ title: 'Data Analyst' })).toBe(7)
    expect(w({ title: 'Data Analyst', sector: 'tech' })).toBe(5.5)
  })
  it('lifts the same role at a university without pretending it is something else', () => {
    // Lifted by exactly the institutional boost and no further — a university
    // does not turn an analyst's post into an administrative one.
    expect(w({ title: 'Data Analyst', sector: 'university' })).toBe(7 + INSTITUTIONAL_BOOST)
  })
  it('does not lift IT support past the bottom of the range, now that it is a fallback', () => {
    // 4.5 + the boost is still under social services at 5.
    expect(w({ title: 'IT Support Specialist', sector: 'university' })).toBe(4.5 + INSTITUTIONAL_BOOST)
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

describe('a biotech is not a hospital', () => {
  // The board list files these under sector 'health', and matching the sector
  // handed a bench-science role a tier it had not earned.
  it('scores the hospital systems as hospital administration', () => {
    expect(id({ title: 'Patient Access Representative', company: 'Beth Israel Lahey Health', sector: 'health' })).toBe('hospitals_health_admin')
    expect(id({ title: 'Administrative Coordinator II', company: 'Tufts Medicine', sector: 'health' })).toBe('hospitals_health_admin')
    expect(id({ title: 'Unit Secretary', company: 'Boston Medical Center', sector: 'health' })).toBe('hospitals_health_admin')
  })
  it('does not hand the same tier to a biotech', () => {
    for (const company of ['Ginkgo Bioworks', 'Alnylam', 'Benchling', 'Butterfly Network']) {
      expect(id({ title: 'Senior Engineer III, ADME', company, sector: 'health' }), company).not.toBe('hospitals_health_admin')
    }
  })
})

describe('physicians, which sorting by money put at the top of the list', () => {
  // "\bsurgeon\b" cannot match "Neurosurgeon" — the boundary needs a non-word
  // character before it and there is an 'o'. Same shape as "\barchive\b" never
  // matching "Archives". Seven physician posts led the money sort because of it.
  const CLINICAL = [
    'Neurosurgeon',
    'Division Chief - Thoracic Surgery',
    'Chair of Dermatology',
    'Gastroenterologist- Winchester',
    'Medical Director, Inflammatory Bowel Disease Center',
    'Cardiologist',
    'Staff Radiologist',
  ]
  for (const title of CLINICAL) {
    it(`${title} is excluded`, () => {
      expect(industryOf(p({ title, company: 'Beth Israel Lahey Health', sector: 'health' }), JULY).excluded).toBe(true)
    })
  }

  it('and the coordinator who books the theatre still is not', () => {
    for (const title of ['Surgical Services Coordinator - Orthopedics', 'Administrative Coordinator II - Neurosurgery', 'Medical Records Clerk']) {
      expect(industryOf(p({ title, company: 'Beth Israel Lahey Health', sector: 'health' }), JULY).excluded, title).toBe(false)
    }
  })
})

describe('the top of an organisation', () => {
  it('excludes the roles that are not available five years in', () => {
    for (const title of [
      'President Beth Israel Deaconess Needham Hospital',
      'Senior Vice President and Chief Operating Officer',
      'Executive Vice President and Provost',
      'Chief Financial Officer',
      'Dean of the College of Arts and Sciences',
    ]) {
      expect(industryOf(p({ title }), JULY).excluded, title).toBe(true)
    }
  })

  it('and keeps the jobs that merely contain the same words', () => {
    // Anchored to the start of the title: "Assistant to the President" and
    // "Executive Assistant" are both jobs he wants.
    for (const title of [
      'Assistant to the President',
      'Executive Assistant to the Dean',
      'Staff Assistant, Office of the Provost',
      'Assistant Director of Student Affairs',
      'Program Director',
    ]) {
      expect(industryOf(p({ title }), JULY).excluded, title).toBe(false)
    }
  })
})

describe('nurses and therapists, whatever the title wraps them in', () => {
  it('excludes them', () => {
    for (const t of ['Clinical Nurse Manager - Labor and Delivery', 'Nurse Navigator', 'Expressive Arts Therapist and Licensed Clinician', 'Registered Nurse - ICU'])
      expect(industryOf(p({ title: t }), JULY).excluded, t).toBe(true)
  })
  it('and still keeps the administrative jobs beside them', () => {
    // "\bnurse\b" cannot match "Nursing", which is what keeps these in.
    for (const t of ['Assistant Director, Nursing Programs', 'Nursing Administrative Coordinator', 'Unit Secretary'])
      expect(industryOf(p({ title: t }), JULY).excluded, t).toBe(false)
  })
})

/**
 * IT support: kept, and moved down.
 *
 * The two case files contradict each other here — the first says apply anyway
 * at entry and support tier, the second calls IT a career track to stay out of.
 * He settled it: they stay in the pool and stop competing at the top. So this
 * has to fail both ways — if the weight climbs back up, and if the roles stop
 * classifying at all.
 */
describe('IT support is a fallback, not a target', () => {
  it('still classifies rather than falling off the table', () => {
    for (const title of [
      'Service Desk Analyst', 'Help Desk Technician', 'Desktop Support Specialist',
      'Systems Administrator II', 'Network Administrator', 'Network Technician', 'IT Specialist',
    ]) {
      expect(id({ title })).toBe('it_helpdesk_support')
      expect(industryOf(p({ title }), JULY).excluded).toBe(false)
    }
  })

  it('scores below the acceptable middle, so it does not lead the list', () => {
    const weight = w({ title: 'Service Desk Analyst' })
    expect(weight).toBeLessThan(5)
    expect(weight).toBeGreaterThan(0)
    // Below social services, which is the bottom of the range he would take.
    expect(weight).toBeLessThan(w({ title: 'Case Manager' }))
  })

  it('is not in Tier A', () => {
    expect(TIER_A.has('it_helpdesk_support')).toBe(false)
  })

  it('leaves data and analysis where they were — that is not the helpdesk track', () => {
    expect(id({ title: 'Data Analyst' })).toBe('data_analysis')
    expect(w({ title: 'Data Analyst' })).toBe(7)
  })
})

/**
 * The clinical job whose title hides it.
 *
 * "Administrative Clinical Supervisor Per Diem" at Beth Israel Lahey has no
 * clinical word in its title, so a title-only exclusion never saw it. Its
 * requirements are a BSN, a Massachusetts RN licence and three years of
 * nursing. It reached the ninety-fifth percentile and read "1 met · 0 soft ·
 * 0 hard", because the only requirement anything could parse was the word
 * "Bachelor's".
 */
const NURSING_SUPERVISOR = `
Bachelor's degree from an accredited school of nursing. M.S.N. with nursing
management experience and/or clinical specialists preparation.
Current licensure from the Massachusetts Board of Registration in Nursing.
Three years of progressive nursing experience, preferably including supervisory experience.
`

describe('a clinical job that does not say so in its title', () => {
  it('is excluded on what its requirements demand', () => {
    const out = industryOf(p({ title: 'Administrative Clinical Supervisor Per Diem', company: 'Beth Israel Lahey Health', body: NURSING_SUPERVISOR, sector: 'health' }))
    expect(out.excluded).toBe(true)
    expect(out.weight).toBe(0)
  })

  it('catches the licence demanded of the reader', () => {
    for (const body of [
      'Must hold a current, active and unencumbered Registered Nurse license.',
      'Current licensure from the Massachusetts Board of Registration in Nursing.',
      'BSN required.',
      'Valid license as a registered nurse in Massachusetts.',
    ]) {
      expect(CLINICAL_CREDENTIAL.test(body)).toBe(true)
    }
  })

  /**
   * The far more expensive mistake, in the other direction. Hospital postings
   * mention nurses constantly, and matching that prose would delete hospital
   * administration — 433 jobs, one of the better categories on the list. It
   * currently loses 18 of them, which is the 4% that genuinely are nursing.
   */
  it('does not touch an administrative job that merely mentions nurses', () => {
    for (const body of [
      'Works closely with nursing staff and supports the nursing units.',
      'Schedules appointments for physicians and nurses across three clinics.',
      'Reports to the Director of Nursing.',
    ]) {
      expect(CLINICAL_CREDENTIAL.test(body)).toBe(false)
    }
  })

  it('reads a school of nursing as a qualification, never as a department', () => {
    // "Academic Coach, School of Nursing" is a support job at a nursing school.
    expect(CLINICAL_CREDENTIAL.test('Academic Coach in the School of Nursing supporting student success.')).toBe(false)
    expect(CLINICAL_CREDENTIAL.test("Bachelor's degree from an accredited school of nursing.")).toBe(true)
  })

  it('leaves a patient services job alone', () => {
    const out = industryOf(p({
      title: 'Patient Services Representative',
      company: 'Beth Israel Lahey Health',
      body: 'Greets patients, schedules appointments, verifies insurance. High school diploma required.',
      sector: 'health',
    }))
    expect(out.excluded).toBe(false)
  })
})
