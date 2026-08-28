import { describe, expect, it } from 'vitest'
import type { Job } from '../../types'
import { DEFAULT_PACK, PACKS, packFor } from '../packs'
import { DEFAULT_DATES, letterFor, resumeFor } from '../documents'
import { TIER_A } from '../industry'

const job = (over: Partial<Job> = {}): Job => ({
  id: 'j', source: 'greenhouse', sector: 'tech', company: 'Acme', title: 'Program Coordinator',
  url: 'https://x/1', descText: '', locations: [], miles: 5, remote: false, pay: null,
  requirements: [], families: [], postedAt: null, firstSeen: '2026-08-01', lastSeen: '2026-08-28',
  scans: 1, reposts: 0, alsoOn: [], linkOk: true, ...over,
})
const JULY = new Date('2026-07-15T12:00:00Z')

describe('every job lands in exactly one pack', () => {
  it('maps the industries it is meant to', () => {
    expect(packFor(job({ sector: 'university', company: 'Berklee', title: 'Office Assistant' }), JULY).id).toBe('education')
    expect(packFor(job({ sector: 'health', company: 'Tufts Medicine', title: 'Patient Access Representative' }), JULY).id).toBe('health')
    expect(packFor(job({ title: 'Records Clerk' }), JULY).id).toBe('public')
    expect(packFor(job({ title: 'Video Producer' }), JULY).id).toBe('creative')
    expect(packFor(job({ title: 'Help Desk Technician' }), JULY).id).toBe('technical')
    expect(packFor(job({ title: 'Custodian' }), JULY).id).toBe('operations')
    expect(packFor(job({ title: 'Case Manager' }), JULY).id).toBe('mission')
  })

  it('sends anything unclassified to the administrative pitch, which is what it usually is', () => {
    expect(packFor(job({ title: 'Widget Wrangler' }), JULY)).toBe(DEFAULT_PACK)
    expect(DEFAULT_PACK.id).toBe('office')
  })

  it('claims no industry twice — a job with two packs has no right answer', () => {
    const seen = new Set<string>()
    for (const p of PACKS) for (const i of p.industries) {
      expect(seen.has(i), `${i} is claimed by more than one pack`).toBe(false)
      seen.add(i)
    }
  })

  it('covers every Tier A industry, which is where the good jobs are', () => {
    const claimed = new Set(PACKS.flatMap((p) => p.industries))
    for (const id of TIER_A) expect(claimed.has(id), id).toBe(true)
  })
})

describe('the documents', () => {
  it('writes a resume and a letter for all eight packs', () => {
    for (const pack of PACKS) {
      const r = resumeFor(pack, DEFAULT_DATES)
      expect(r.summary.length, pack.id).toBeGreaterThan(80)
      expect(r.roles.length, pack.id).toBeGreaterThan(1)
      for (const role of r.roles) expect(role.bullets.length, `${pack.id}/${role.title}`).toBeGreaterThan(0)
      expect(letterFor(pack).length, pack.id).toBeGreaterThan(600)
    }
  })

  it('gives each pack a different pitch rather than one resume eight times', () => {
    const summaries = new Set(PACKS.map((p) => resumeFor(p, DEFAULT_DATES).summary))
    expect(summaries.size).toBe(PACKS.length)
    const letters = new Set(PACKS.map((p) => letterFor(p)))
    expect(letters.size).toBe(PACKS.length)
  })

  it('strips the three credentials that read as flight risk from the hourly variant', () => {
    // Documented: ghosted by professional roles, rejected as overqualified by
    // hourly ones. The honour society, the certificates and the "Senior Account
    // Manager II" title are the three named as costing him offers.
    const hourly = PACKS.find((p) => p.variant === 'stripped')!
    const text = JSON.stringify(resumeFor(hourly, DEFAULT_DATES))
    expect(text).not.toMatch(/Order of Omega/)
    expect(text).not.toMatch(/Yale/)
    expect(text).not.toMatch(/Senior Account Manager II/)
    // …and keeps them everywhere else.
    const professional = JSON.stringify(resumeFor(PACKS.find((p) => p.id === 'education')!, DEFAULT_DATES))
    expect(professional).toMatch(/Order of Omega/)
    expect(professional).toMatch(/Senior Account Manager II/)
  })

  it('leaves at most two blanks in a letter, both marked', () => {
    // A pre-made letter with a dozen blanks is not pre-made, it is homework.
    for (const pack of PACKS) {
      const blanks = letterFor(pack).match(/«[^»]*»/g) ?? []
      expect(blanks.length, pack.id).toBeLessThanOrEqual(2)
    }
  })

  it('never claims the clearance is already held', () => {
    // It lands around August 2027, and it is a real asset — "must be able to
    // obtain a clearance" is already met. Saying it is IN HAND is a lie that
    // gets found out at exactly the wrong moment, so every mention has to carry
    // a future marker in the same sentence.
    const FUTURE = /\b(?:will|eligible|expected|expects|obtain|2027|pipeline|arriving)\b/i
    for (const pack of PACKS) {
      const text = JSON.stringify(resumeFor(pack, DEFAULT_DATES)) + '\n' + letterFor(pack)
      const sentences = text.split(/(?<=[.!?])\s+|\\n/)
      for (const sentence of sentences) {
        if (!/clearance/i.test(sentence)) continue
        expect(FUTURE.test(sentence), `${pack.id}: "${sentence.trim().slice(0, 90)}"`).toBe(true)
      }
    }
  })
})
