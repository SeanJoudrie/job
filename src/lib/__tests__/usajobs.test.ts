import { describe, expect, it } from 'vitest'
import { mapUsaJobs } from '../../../scripts/sources'
import { parsePay } from '../pay'
import { parseLocations } from '../location'
import { parseRequirements, gapsFor, type Profile } from '../requirements'
import { classifyFamilies } from '../roles'

const SEAN: Profile = { years: 5, degree: 'bachelor', clearance: 'none' }

/** The shape USAJOBS actually returns, so the mapping can be checked without a key. */
const item = {
  MatchedObjectId: '830000000',
  MatchedObjectDescriptor: {
    PositionTitle: 'Program Support Assistant',
    PositionURI: 'https://www.usajobs.gov/job/830000000',
    ApplyURI: ['https://www.usajobs.gov/job/830000000/apply'],
    OrganizationName: 'Veterans Health Administration',
    DepartmentName: 'Department of Veterans Affairs',
    PositionLocation: [{ LocationName: 'Bedford, Massachusetts' }],
    QualificationSummary: 'Must be able to obtain a Secret clearance. Bachelor’s degree or equivalent experience.',
    PublicationStartDate: '2026-08-20',
    PositionRemuneration: [{ MinimumRange: '52000', MaximumRange: '68000', RateIntervalCode: 'PA' }],
    UserArea: { Details: { JobSummary: 'Support the program office.', MajorDuties: ['Coordinate schedules', 'Maintain records'] } },
  },
}

describe('federal postings map into the same shape as every other source', () => {
  const [row] = mapUsaJobs([item])

  it('keeps the apply link, not the listing link', () => {
    expect(row.url).toBe('https://www.usajobs.gov/job/830000000/apply')
  })
  it('files it under the agency', () => {
    expect(row.company).toBe('Veterans Health Administration')
    expect(row.sector).toBe('gov')
  })
  it('turns the pay band into something the parser reads', () => {
    expect(parsePay(row.payHint)).toMatchObject({ min: 52000, max: 68000, period: 'year' })
  })
  it('resolves the location to a real commute', () => {
    const [loc] = parseLocations(row.locationRaw)
    expect(loc.state).toBe('MA')
    expect(loc.miles).toBeLessThan(20)
  })
  it('carries the duties and qualifications into the description', () => {
    expect(row.descText).toMatch(/Coordinate schedules/)
    expect(row.descText).toMatch(/Secret clearance/)
  })
  it('and the clearance line reads as already met', () => {
    const gaps = gapsFor(parseRequirements(row.descText), SEAN)
    const clearance = gaps.find((g) => g.requirement.kind === 'clearance')
    expect(clearance?.verdict).toBe('matched')
  })
  it('skips an item with no title rather than emitting a blank row', () => {
    expect(mapUsaJobs([{ MatchedObjectId: 'x', MatchedObjectDescriptor: {} }])).toHaveLength(0)
  })
  it('handles hourly federal roles', () => {
    const hourly = { ...item, MatchedObjectDescriptor: { ...item.MatchedObjectDescriptor,
      PositionRemuneration: [{ MinimumRange: '26.50', MaximumRange: '31.00', RateIntervalCode: 'PH' }] } }
    expect(parsePay(mapUsaJobs([hourly])[0].payHint)).toMatchObject({ min: 26.5, max: 31, period: 'hour' })
  })
})

describe('the fields federal postings actually use', () => {
  // Reading only JobSummary found requirements in 12% of federal postings
  // against 99% everywhere else — the qualifying text lives in Education,
  // Requirements and QualificationSummary instead.
  const rich = {
    MatchedObjectId: '840000001',
    MatchedObjectDescriptor: {
      PositionTitle: 'Program Analyst',
      ApplyURI: ['https://www.usajobs.gov/job/840000001/apply'],
      OrganizationName: 'Veterans Health Administration',
      PositionLocation: [{ LocationName: 'Bedford, Massachusetts' }],
      QualificationSummary: 'One year of specialized experience equivalent to the GS-07 level.',
      PositionRemuneration: [{ MinimumRange: '58000', MaximumRange: '75000', RateIntervalCode: 'PA' }],
      UserArea: {
        Details: {
          JobSummary: 'Support the program office.',
          Education: "A bachelor's degree in a related field is required.",
          Requirements: 'Conditions of Employment: You must be a U.S. Citizen.',
          SecurityClearance: 'Secret',
          HiringPathDisplay: ['Open to the public', 'Veterans'],
        },
      },
    },
  }
  const [row] = mapUsaJobs([rich])

  it('pulls the education requirement out of its own field', () => {
    const degree = parseRequirements(row.descText).find((r) => r.kind === 'education')
    expect(degree?.degree).toBe('bachelor')
  })

  it('states a required clearance as one to obtain, since federal hiring runs the investigation', () => {
    const clearance = parseRequirements(row.descText).find((r) => r.kind === 'clearance')
    expect(clearance?.clearance).toBe('obtainable')
    expect(gapsFor(parseRequirements(row.descText), SEAN).find((g) => g.requirement.kind === 'clearance')?.verdict).toBe('matched')
  })

  it('records the veteran hiring path, which is a scored advantage', () => {
    expect(row.descText).toMatch(/Hiring paths:.*Veterans/)
    expect(classifyFamilies(row.title, row.descText, row.company)).toContain('veterans')
  })

  it('files a VA posting under veterans even when the title says nothing', () => {
    // The title is "Program Analyst"; it is the employer that makes it veterans work.
    expect(classifyFamilies('Program Analyst', '', 'Veterans Health Administration')).toContain('veterans')
  })

  it('does not claim a clearance is needed when the field says otherwise', () => {
    const none = { ...rich, MatchedObjectDescriptor: { ...rich.MatchedObjectDescriptor,
      UserArea: { Details: { ...rich.MatchedObjectDescriptor.UserArea.Details, SecurityClearance: 'Not Required' } } } }
    expect(mapUsaJobs([none])[0].descText).not.toMatch(/must be able to obtain/)
  })
})
