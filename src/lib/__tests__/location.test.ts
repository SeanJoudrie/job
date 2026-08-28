import { describe, expect, it } from 'vitest'
import { HOME, isRemote, nearestMiles, parseLocations } from '../location'

const at = (s: string) => parseLocations(s)
const first = (s: string) => at(s)[0]

describe('the substring trap', () => {
  // The bug this project actually hit: testing for "MA" inside the string.
  it('does not read Lima, Ohio as Massachusetts', () => {
    expect(first('Lima, OH').state).toBe('OH')
  })
  it('does not read Roman or Format as a state', () => {
    expect(first('Roman Forest, TX').state).toBe('TX')
  })
  it('will not take a two-letter fragment out of a word', () => {
    expect(first('Normal, IL').state).toBe('IL')
  })
})

describe('the formats boards use', () => {
  it('city, state code', () => {
    expect(first('Boston, MA')).toMatchObject({ city: 'Boston', state: 'MA' })
  })
  it('city, full state name, country', () => {
    expect(first('Boston, Massachusetts, United States')).toMatchObject({ city: 'Boston', state: 'MA' })
  })
  it('a hyphenated hybrid prefix', () => {
    const l = first('Hybrid - Burlington, MA')
    expect(l).toMatchObject({ city: 'Burlington', state: 'MA', hybrid: true })
  })
  it('remote with a region', () => {
    expect(first('Remote - US')).toMatchObject({ remote: true })
  })
  it('two-word state names', () => {
    expect(first('Nashua, New Hampshire')).toMatchObject({ city: 'Nashua', state: 'NH' })
  })
  it('an unparseable field yields nothing rather than a wrong guess', () => {
    expect(at('Multiple Locations')[0].state).toBeUndefined()
  })
  it('an empty field', () => expect(at('')).toHaveLength(0))
})

describe('multi-location postings', () => {
  const ANDURIL = 'Atlanta, Georgia, United States; Boston, Massachusetts, United States'

  it('splits into every location named', () => {
    expect(at(ANDURIL)).toHaveLength(2)
  })

  it('counts as its nearest location, so a Boston job is a Boston job', () => {
    const miles = nearestMiles(at(ANDURIL))
    expect(miles).not.toBeNull()
    expect(miles!).toBeLessThan(15)
  })
})

describe('distance from home', () => {
  const near = (s: string) => nearestMiles(at(s))

  it('measures real towns correctly', () => {
    expect(near('Wakefield, MA')!).toBeLessThan(2)
    expect(near('Burlington, MA')!).toBeLessThan(10)
    expect(near('Boston, MA')!).toBeLessThan(13)
    expect(near('Bedford, MA')!).toBeLessThan(13)
  })

  it('puts Nashua just outside a 25 mile radius, which is the honest answer', () => {
    expect(near('Nashua, NH')!).toBeGreaterThan(25)
    expect(near('Nashua, NH')!).toBeLessThan(30)
  })

  it('falls back to a state centroid when the town is unknown, so it still sorts as far', () => {
    expect(near('Some Town Nobody Has Heard Of, TX')!).toBeGreaterThan(1000)
  })

  it('home is where it says it is', () => {
    expect(HOME[0]).toBeCloseTo(42.5, 1)
  })
})

describe('remote detection', () => {
  it('a purely remote posting', () => expect(isRemote(at('Remote'))).toBe(true))
  it('a remote posting anchored to a city is not purely remote', () => {
    expect(isRemote(at('Remote - Boston, MA'))).toBe(false)
  })
  it('an onsite posting', () => expect(isRemote(at('Boston, MA'))).toBe(false))
})
