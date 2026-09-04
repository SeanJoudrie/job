import { describe, expect, it } from 'vitest'
import type { Job } from '../../types'
import { easeOf } from '../ease'
import { IMPOSSIBLE } from '../score'
import { classifyFamilies } from '../roles'

let n = 0
const job = (over: Partial<Job> = {}): Job => ({
  id: `j${n++}`, source: 'greenhouse', sector: 'tech', company: 'Acme', title: 'Coordinator',
  url: 'https://x/1', descText: '', locations: [], miles: 10, remote: false, pay: null,
  requirements: [], families: [], postedAt: '2026-08-20', firstSeen: '2026-08-20',
  lastSeen: '2026-08-28', scans: 1, reposts: 0, alsoOn: [], linkOk: true, ...over,
})

describe('the complaint that produced this module', () => {
  // Reported: everything from Anduril was filling the "Easy hire" lane. It
  // passed a degree-and-years filter, which measured the wrong thing entirely.
  const anduril = job({
    sector: 'defense',
    company: 'Anduril',
    title: 'Field Operations Trainer',
    pay: { min: 99000, max: 130000, period: 'year', raw: '' },
    requirements: [{ text: 'Active Secret clearance', kind: 'clearance', hardness: 'hard', clearance: 'active' }],
    descText: 'You will complete a technical assessment and a panel interview.',
  })

  it('scores a six-figure cleared defence role as hard to get', () => {
    expect(easeOf(anduril).score).toBeLessThanOrEqual(2)
  })

  it('and says why, in plain terms', () => {
    const why = easeOf(anduril).why.join(' ')
    expect(why).toMatch(/defense employer/)
    expect(why).toMatch(/six figures/)
    expect(why).toMatch(/clearance already held/)
  })

  it('while a warehouse job that trains you scores high', () => {
    const warehouse = job({
      sector: 'health',
      title: 'Warehouse Associate',
      pay: { min: 26, max: 29, period: 'hour', raw: '' },
      descText: 'Hiring immediately. No experience necessary, we will train. Multiple openings.',
    })
    expect(easeOf(warehouse).score).toBeGreaterThanOrEqual(8)
  })

  it('and the gap between them is not subtle', () => {
    const easy = job({ sector: 'university', title: 'Office Assistant', pay: { min: 25, max: 28, period: 'hour', raw: '' }, descText: 'Hiring immediately, will train.' })
    expect(easeOf(easy).score - easeOf(anduril).score).toBeGreaterThanOrEqual(6)
  })
})

describe('the individual signals', () => {
  it('a senior title is harder', () => {
    expect(easeOf(job({ title: 'Senior Director of Operations' })).score).toBeLessThan(easeOf(job({ title: 'Operations Assistant' })).score)
  })
  it('a university posts a shorter process than a defence contractor', () => {
    expect(easeOf(job({ sector: 'university' })).score).toBeGreaterThan(easeOf(job({ sector: 'defense' })).score)
  })
  it('a multi-round interview costs it', () => {
    expect(easeOf(job({ descText: 'Includes a take-home exercise and a final round panel.' })).score)
      .toBeLessThan(easeOf(job({ descText: 'Apply online.' })).score)
  })
  it('a wall of hard requirements costs it', () => {
    const many = job({ requirements: Array.from({ length: 8 }, () => ({ text: 'x', kind: 'other' as const, hardness: 'hard' as const })) })
    expect(easeOf(many).score).toBeLessThan(easeOf(job()).score)
  })
  it('stays inside 0 and 10 whatever is thrown at it, without piling up at the ends', () => {
    const worst = job({ sector: 'defense', title: 'Senior Principal Architect', pay: { min: 300000, max: 400000, period: 'year', raw: '' },
      descText: 'take-home, panel interview, hiring committee',
      requirements: Array.from({ length: 12 }, () => ({ text: 'x', kind: 'other' as const, hardness: 'hard' as const })) })
    // Clamping used to pin a quarter of the real pool to exactly 0, which made
    // a senior cleared defence role indistinguishable from an ordinary
    // competitive one. The curve keeps the ordering without the pile-up.
    expect(easeOf(worst).score).toBeGreaterThan(0)
    expect(easeOf(worst).score).toBeLessThan(1)
  })
})

describe('postings that are not jobs', () => {
  it('a volunteer listing is excluded by family, since nothing else would catch it', () => {
    // Seen in the real pool: "Volunteer at The Trustees" passed every rule,
    // because it has no pay to fail a floor and no requirements to fail a gap.
    expect(classifyFamilies('Volunteer at The Trustees', '')).toContain('unpaid')
    expect(classifyFamilies('Marketing Intern', '')).toContain('unpaid')
  })
  it('but a paid apprenticeship is a real route and stays', () => {
    expect(classifyFamilies('HVAC Apprentice', '')).not.toContain('unpaid')
  })
})

describe('roles that need a licence nobody here holds', () => {
  it('skips them at the source, so a hospital scan does not cost thousands of requests', async () => {
    const { isLicensedClinical } = await import('../../../scripts/sources')
    for (const t of ['Registered Nurse - ICU', 'Nurse Practitioner, Cardiology', 'Physical Therapist (Outpatient)', 'Staff Pharmacist'])
      expect(isLicensedClinical(t)).toBe(true)
  })
  it('counts certification, not only licensure', async () => {
    // "Surgical Tech, 36 hours/week, day shift" reached the top twenty of a
    // list for someone who holds no certification, because the scan's copy of
    // this list and the scoring table's copy had drifted apart. One list now.
    const { isLicensedClinical } = await import('../../../scripts/sources')
    for (const t of ['Surgical Tech, 36 hours/week', 'Surgical Technologist - Labor & Delivery', 'Data Entry Pharmacy Technician Mail Order',
      'Medical Assistant - Float Pool', 'Certified Nursing Assistant', 'Patient Care Technician', 'MRI Technologist'])
      expect(isLicensedClinical(t), t).toBe(true)
  })
  it('but keeps the hospital jobs that are actually open to him', async () => {
    const { isLicensedClinical } = await import('../../../scripts/sources')
    for (const t of ['Patient Access Representative', 'Program Coordinator', 'Food Service Aide', 'Unit Secretary', 'Medical Records Clerk',
      // The coordinator who books the theatre is not the technologist in it.
      'Surgical Services Coordinator - Orthopedics', 'Medical Administrative Assistant', 'Assistant Director, Nursing Programs'])
      expect(isLicensedClinical(t), t).toBe(false)
  })
})

/**
 * A federal grade above the standards is a screen-out, not a long shot.
 *
 * It lives here rather than on the reachability axis for a measured reason:
 * as an extra hard gap it moved a GS-14 by about a sixth of a point while its
 * $126k–$197k band scored full marks on pay, and the thing stayed at number
 * eleven. As a winnability penalty it left the top thirty entirely — GS-11 and
 * above went from six of the top thirty to none, and the federal jobs that
 * remain are the ones he can actually be found qualified for.
 */
describe('a federal grade beyond the standards', () => {
  const fed = (over: Partial<Job> = {}): Job =>
    job({ company: 'Internal Revenue Service', sector: 'gov', title: 'Management and Program Analyst', ...over })

  it('costs a job that is advertised above GS-9', () => {
    const high = easeOf(fed({ gsGrade: 14 })).score
    const plain = easeOf(fed()).score
    expect(high).toBeLessThan(plain)
    expect(easeOf(fed({ gsGrade: 14 })).why.join(' ')).toMatch(/GS-14/)
  })

  it('leaves a reachable grade completely alone', () => {
    expect(easeOf(fed({ gsGrade: 7 })).score).toBe(easeOf(fed()).score)
    expect(easeOf(fed({ gsGrade: 9 })).score).toBe(easeOf(fed()).score)
  })

  it('compounds with the pay penalty, because the money is why it is competed', () => {
    const pay = { min: 126_000, max: 197_000, period: 'year' as const, raw: '$126,000 - $197,000' }
    const plain = easeOf(fed()).score
    const rich = easeOf(fed({ pay })).score
    const both = easeOf(fed({ gsGrade: 14, pay })).score
    expect(both).toBeLessThan(rich)
    expect(both).toBeLessThan(plain / 2)
    // Down-ranked, not deleted. It stays above the impossible floor on purpose:
    // below it, topJobs drops the job from the list altogether, and a long shot
    // he might still choose to take is not the same as one he cannot take.
    expect(both).toBeGreaterThan(IMPOSSIBLE)
  })

  it('does not touch anything that is not on the schedule', () => {
    const uni = job({ company: 'Northeastern', sector: 'university', title: 'Administrative Coordinator' })
    expect(uni.gsGrade).toBeUndefined()
    expect(easeOf(uni).why.join(' ')).not.toMatch(/GS-/)
  })
})
