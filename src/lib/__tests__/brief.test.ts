import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { gapsFor } from '../requirements'
import type { Requirement } from '../../types'

/**
 * The letter prompt and the resume have to say the same thing.
 *
 * They drifted once and it was not visible from either file. `documents.ts` was
 * rebuilt from the real resume — no minor, eight products — while the brief
 * that writes his cover letters still carried a Business Analytics minor and
 * four applications. Nothing failed; letters would simply have gone out
 * claiming a credential the attached resume did not support, which is the one
 * thing a cover letter must never do.
 *
 * Read as text on purpose. The brief is a prompt string, not a data structure,
 * and asserting on its content is the only way to hold it to the resume.
 */
const brief = readFileSync(new URL('../claude.ts', import.meta.url), 'utf8')
const documents = readFileSync(new URL('../documents.ts', import.meta.url), 'utf8')

describe('the profile the letters are written from', () => {
  /**
   * This test previously asserted the opposite, and was wrong.
   *
   * An earlier resume omitted the minor, so it was stripped from the brief and
   * a test written to keep it out. The federal resume carries it: "Bachelor of
   * Arts, Psychology | Minor: Business Analytics". A test can lock in a
   * mistake as firmly as it locks in a fix, and this one did for a while.
   */
  it('carries the Business Analytics minor, which is on the resume', () => {
    expect(/Business Analytics/i.test(brief)).toBe(true)
  })

  it('counts the shipped work the same way the resume does', () => {
    const inDocs = documents.match(/(\d+|eight) products and (\d+|twelve) standalone builds/i)
    expect(inDocs).not.toBeNull()
    expect(/8 products and 12 standalone\s*\n?\s*builds/i.test(brief)).toBe(true)
    expect(/four shipped applications/i.test(brief)).toBe(false)
  })

  it('still states the things a letter is allowed to assert', () => {
    for (const fact of [/US citizen/i, /USERRA/, /immediately available/i, /4\.5x/]) {
      expect(fact.test(brief)).toBe(true)
    }
  })
})

const req = (text: string, over: Partial<Requirement> = {}): Requirement =>
  ({ text, kind: 'other', hardness: 'hard', ...over })

describe('cards you can hold by next Friday', () => {
  const verdict = (text: string) =>
    gapsFor([req(text)], { years: 5, degree: 'bachelor', clearance: 'none' })[0]

  it('calls a weekend certificate a soft gap, not a wall', () => {
    for (const text of [
      'First Aid/CPR certification required',
      'Must hold OSHA 10 certification',
      'ServSafe food handler card required',
      'Forklift certification required',
    ]) {
      expect(verdict(text).verdict).toBe('soft-gap')
      expect(verdict(text).why).toMatch(/weekend/)
    }
  })

  it('matches a plain driver’s licence, which he holds', () => {
    expect(verdict('Valid driver’s license required').verdict).toBe('matched')
  })

  it('does not call a CDL a weekend', () => {
    for (const text of ['Class B CDL required', 'Valid CDL with hazmat endorsement', 'Commercial driver license required']) {
      expect(verdict(text).verdict).not.toBe('matched')
      expect(verdict(text).why).not.toMatch(/weekend/)
    }
  })

  it('leaves an ordinary skill line alone', () => {
    expect(verdict('Experience with Salesforce').verdict).toBe('unstated')
  })
})
