import { beforeEach, describe, expect, it } from 'vitest'
import {
  FOLLOW_UP_DAYS,
  WEEKLY_TARGET,
  addContact,
  addedThisWeek,
  dueFollowUp,
  loadContacts,
  removeContact,
  statsOf,
  touch,
  updateContact,
  weekStart,
  type Person,
} from '../contacts'

beforeEach(() => {
  const data: Record<string, string> = {}
  globalThis.localStorage = {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void delete data[k],
    clear: () => void Object.keys(data).forEach((k) => delete data[k]),
    key: () => null,
    length: 0,
  } as unknown as Storage
})

const NOW = Date.parse('2026-09-04T12:00:00Z') // a Friday
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString()

const person = (over: Partial<Person> = {}): Person => ({
  id: `p${Math.random()}`,
  name: 'Dana Ruiz',
  org: 'Northeastern',
  role: 'Program Manager',
  how: 'linkedin',
  at: daysAgo(1),
  lastTouch: null,
  stage: 'new',
  note: '',
  ...over,
})

describe('adding people', () => {
  it('writes straight through, so a reload keeps them', () => {
    addContact([], { name: 'Dana Ruiz', org: 'Northeastern' })
    expect(loadContacts()).toHaveLength(1)
    expect(loadContacts()[0].name).toBe('Dana Ruiz')
  })

  it('fills in the rest rather than storing a half-object', () => {
    const [p] = addContact([], { name: 'Dana Ruiz' })
    expect(p.stage).toBe('new')
    expect(p.lastTouch).toBeNull()
    expect(p.how).toBe('linkedin')
  })

  it('puts the newest first, because that is the one being typed about', () => {
    const one = addContact([], { name: 'First' })
    const two = addContact(one, { name: 'Second' })
    expect(two.map((p) => p.name)).toEqual(['Second', 'First'])
  })

  it('drops junk out of a corrupt store instead of blanking the list', () => {
    localStorage.setItem('job.contacts.v1', JSON.stringify([{ nope: true }, { id: 'x', name: 'Real' }]))
    expect(loadContacts().map((p) => p.name)).toEqual(['Real'])
  })

  it('survives the store holding something that is not a list at all', () => {
    localStorage.setItem('job.contacts.v1', JSON.stringify({ not: 'an array' }))
    expect(loadContacts()).toEqual([])
  })
})

describe('the weekly target', () => {
  it('counts only people added since Monday', () => {
    const list = [person({ at: daysAgo(1) }), person({ at: daysAgo(3) }), person({ at: daysAgo(10) })]
    // NOW is Friday; Monday was 4 days back.
    expect(addedThisWeek(list, NOW)).toBe(2)
  })

  it('anchors on Monday so one week can be compared to the last', () => {
    expect(weekStart(Date.parse('2026-09-04T12:00:00Z'))).toBe('2026-08-31')
    expect(weekStart(Date.parse('2026-08-30T23:00:00Z'))).toBe('2026-08-24')
  })

  it('is ten', () => {
    expect(WEEKLY_TARGET).toBe(10)
  })
})

describe('who is owed a message', () => {
  it('lists someone reached out to a week ago with no answer', () => {
    const p = person({ stage: 'reached out', lastTouch: daysAgo(FOLLOW_UP_DAYS) })
    expect(dueFollowUp([p], NOW)).toHaveLength(1)
  })

  it('leaves alone anyone messaged this week', () => {
    expect(dueFollowUp([person({ stage: 'reached out', lastTouch: daysAgo(2) })], NOW)).toHaveLength(0)
  })

  it('does not chase a live conversation', () => {
    for (const stage of ['replied', 'met', 'referred'] as const) {
      expect(dueFollowUp([person({ stage, lastTouch: daysAgo(30) })], NOW)).toHaveLength(0)
    }
  })

  it('leaves cold alone once it is called cold', () => {
    expect(dueFollowUp([person({ stage: 'cold', lastTouch: daysAgo(90) })], NOW)).toHaveLength(0)
  })

  it('chases someone added and never messaged at all', () => {
    expect(dueFollowUp([person({ stage: 'new', at: daysAgo(30), lastTouch: null })], NOW)).toHaveLength(1)
  })

  it('puts the longest wait first', () => {
    const list = [
      person({ name: 'Recent', stage: 'reached out', lastTouch: daysAgo(8) }),
      person({ name: 'Ancient', stage: 'reached out', lastTouch: daysAgo(40) }),
    ]
    expect(dueFollowUp(list, NOW).map((p) => p.name)).toEqual(['Ancient', 'Recent'])
  })
})

describe('marking a message sent', () => {
  it('stamps the clock and moves a new contact along in one action', () => {
    const list = [person({ id: 'a', stage: 'new' })]
    const [p] = touch(list, 'a', daysAgo(0))
    expect(p.stage).toBe('reached out')
    expect(p.lastTouch).toBe(daysAgo(0))
  })

  it('does not walk someone who already replied backwards', () => {
    const [p] = touch([person({ id: 'a', stage: 'replied' })], 'a')
    expect(p.stage).toBe('replied')
    expect(p.lastTouch).not.toBeNull()
  })

  it('takes them straight off the follow-up list', () => {
    const list = [person({ id: 'a', stage: 'reached out', lastTouch: daysAgo(30) })]
    expect(dueFollowUp(touch(list, 'a', new Date(NOW).toISOString()), NOW)).toHaveLength(0)
  })
})

describe('editing and removing', () => {
  it('patches one and leaves the rest alone', () => {
    const list = [person({ id: 'a', name: 'A' }), person({ id: 'b', name: 'B' })]
    const next = updateContact(list, 'a', { stage: 'referred' })
    expect(next.find((p) => p.id === 'a')!.stage).toBe('referred')
    expect(next.find((p) => p.id === 'b')!.stage).toBe('new')
  })

  it('removes and persists the removal', () => {
    const list = addContact([], { name: 'Gone' })
    removeContact(list, list[0].id)
    expect(loadContacts()).toEqual([])
  })
})

describe('the numbers at the top', () => {
  it('reports the week against the target, and who is owed a reply', () => {
    const s = statsOf(
      [
        person({ at: daysAgo(1) }),
        person({ at: daysAgo(2), stage: 'replied' }),
        person({ at: daysAgo(40), stage: 'referred' }),
        person({ at: daysAgo(40), stage: 'reached out', lastTouch: daysAgo(20) }),
      ],
      NOW,
    )
    expect(s).toEqual({ total: 4, week: 2, target: WEEKLY_TARGET, answered: 2, referred: 1, due: 1 })
  })
})
