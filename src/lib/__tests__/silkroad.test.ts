import { describe, expect, it } from 'vitest'
import { silkRoadPayHint } from '../../../scripts/sources'

describe('Boston University publishes its band as two labelled figures', () => {
  // Every string here is lifted from a live BU posting. Without the rejoin,
  // parsePay reads only the minimum — so a job paying $24 to $27 was compared
  // against the $25 floor on its $24 and the whole employer fell out.
  it('rejoins an hourly band', () => {
    const body = 'Salary Grade Grade 46 Expected Hiring Range Minimum $24.00 Expected Hiring Range Maximum $27.00 The salary of the finalist'
    expect(silkRoadPayHint(body)).toBe('Pay range: $24 - $27 per hour')
  })

  it('rejoins an annual band, and knows it is annual from its size alone', () => {
    const body = 'Expected Hiring Range Minimum $45,000.00 Expected Hiring Range Maximum $55,000.00'
    expect(silkRoadPayHint(body)).toBe('Pay range: $45000 - $55000 per year')
  })

  it('says nothing when the unit is genuinely ambiguous', () => {
    // "Salary Grade 24 ... $2,091.00 to $2,808.00" with no unit on the page.
    // Monthly is $34k a year and biweekly is $73k. A wrong number is worse than
    // none, so this reads as "no pay listed".
    expect(silkRoadPayHint('Salary Grade Grade 24 Expected Hiring Range Minimum $2,091.00 Expected Hiring Range Maximum $2,808.00')).toBe('')
  })

  it('says nothing when the page carries no range at all', () => {
    expect(silkRoadPayHint('Administrative Coordinator. Boston, MA, United States.')).toBe('')
    expect(silkRoadPayHint('Expected Hiring Range Minimum $24.00')).toBe('')
  })
})
