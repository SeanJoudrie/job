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


/**
 * The Workday location code, which reads backwards.
 *
 * RTX writes "US-MA-WOBURN-WB2 ~ 225 Presidential Way". Split on the hyphens
 * and US falls out as noise, leaving the state ahead of the city rather than
 * behind it — so every posting resolved to the Massachusetts centroid at 29.4
 * miles. Woburn is nine minutes away and Pittsfield is two hours; both read the
 * same, and under a 30-minute limit both were deleted.
 */
describe('a state written before its city', () => {
  it('reads the city that follows the state', () => {
    const [loc] = parseLocations('US-MA-WOBURN-WB2 ~ 225 Presidential Way ~ GODDARD BLDG')
    expect(loc.state).toBe('MA')
    expect(loc.city?.toLowerCase()).toBe('woburn')
    expect(loc.miles).toBeLessThan(10)
  })

  it('separates two of them that used to read identically', () => {
    const woburn = parseLocations('US-MA-WOBURN-WB2')[0].miles!
    const pittsfield = parseLocations('US-MA-PITTSFIELD-1')[0].miles!
    expect(pittsfield).toBeGreaterThan(woburn + 50)
  })

  it('refuses a building number as a city', () => {
    const [loc] = parseLocations('US-MA-TEWKSBURY-322')
    expect(loc.city?.toLowerCase()).toBe('tewksbury')
    // A code whose city segment is not a place falls back to the state, which
    // is honest — it does not invent a point for "9999".
    const [none] = parseLocations('US-MA-9999-1')
    const [bare] = parseLocations('Massachusetts')
    expect(none.state).toBe('MA')
    expect(none.miles).toBe(bare.miles)
  })

  it('still prefers the city in front when there is one', () => {
    // "Bedford, MA, Boston" must resolve to Bedford, not to the trailing token.
    const [loc] = parseLocations('Bedford, MA, Boston')
    expect(loc.city).toBe('Bedford')
  })

  it('leaves an ordinary posting exactly as it was', () => {
    const [loc] = parseLocations('Boston, MA')
    expect(loc.city).toBe('Boston')
    expect(loc.state).toBe('MA')
  })
})
