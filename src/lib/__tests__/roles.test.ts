import { describe, expect, it } from 'vitest'
import { classifyFamilies } from '../roles'

const fam = (title: string, body = '') => classifyFamilies(title, body)

describe('sales by title, whatever it is called', () => {
  const titles = [
    'Account Executive',
    'Business Development Representative',
    'Territory Manager',
    'Inside Sales Representative',
    'Enterprise Sales Director',
    'SDR',
  ]
  for (const t of titles) it(`${t} is sales`, () => expect(fam(t)).toContain('sales'))

  it('the word "sales" alone would have missed most of those', () => {
    // The reason families exist rather than a keyword rule.
    const missed = titles.filter((t) => !/sales/i.test(t))
    expect(missed.length).toBeGreaterThanOrEqual(3)
    for (const t of missed) expect(fam(t)).toContain('sales')
  })
})

describe('the ambiguous titles, which is where naive versions break', () => {
  it('Account Manager with quota talk is sales', () => {
    const body = 'You will carry a quota, build pipeline, and close deals in your book of business.'
    expect(fam('Account Manager', body)).toContain('sales')
  })

  it('Account Manager without it is not sales', () => {
    const body = 'You will support existing customers, coordinate onboarding, and work closely with the success team.'
    expect(fam('Account Manager', body)).not.toContain('sales')
  })

  it('Client Partner is judged the same way', () => {
    expect(fam('Client Partner', 'Own the sales cycle, prospecting and net new revenue.')).toContain('sales')
    expect(fam('Client Partner', 'Coordinate delivery across teams.')).not.toContain('sales')
  })
})

describe('a body that is all quota talk is sales whatever the title says', () => {
  it('catches a disguised title', () => {
    const body = 'Manage your pipeline, hit quota, cold call prospects, and grow your book of business with commission upside.'
    expect(fam('Growth Associate', body)).toContain('sales')
  })
  it('but one stray mention is not enough', () => {
    expect(fam('Program Coordinator', 'You will occasionally support the sales cycle.')).not.toContain('sales')
  })
})

describe('the families worth boosting', () => {
  it('coordination', () => expect(fam('Program Coordinator')).toContain('coordinator'))
  it('operations', () => expect(fam('Operations Supervisor')).toContain('operations'))
  it('analysis', () => expect(fam('Intelligence Analyst')).toContain('analyst'))
  it('student services', () => expect(fam('Student Affairs Coordinator')).toContain('student'))
  it('technical', () => expect(fam('Technical Support Engineer')).toContain('technical'))
  it('a job can belong to several', () => {
    const f = fam('Operations Program Manager')
    expect(f).toContain('operations')
    expect(f).toContain('program')
  })
})

describe('the other exclusions', () => {
  it('rule enforcement', () => expect(fam('Security Guard')).toContain('enforcement'))
  it('solo work is read from the body', () => {
    expect(fam('Night Clerk', 'You will work independently with minimal supervision.')).toContain('solo')
  })
})
