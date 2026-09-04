import { read, write } from './storage'

/**
 * The people, which is the part that has actually worked.
 *
 * Roughly six thousand portal applications have produced no offer. Every
 * interview came from a person passing something along. If that is true then
 * the count this app has been putting at the top of the screen — applications
 * sent — has been measuring the channel that does not work, and measuring the
 * wrong thing is not neutral: it is what he optimises against on a bad day when
 * he wants a number to go up.
 *
 * So this is deliberately not an address book. An address book tells you who
 * you know. This tells you who is owed a message, and how far behind the week
 * is, because those are the two things that change behaviour.
 */

const KEY = 'job.contacts.v1'

export type Stage = 'new' | 'reached out' | 'replied' | 'met' | 'referred' | 'cold'

/** In order. Every step forward is a step down this list. */
export const STAGES: Stage[] = ['new', 'reached out', 'replied', 'met', 'referred', 'cold']

export type How = 'linkedin' | 'email' | 'in person' | 'guard' | 'alumni' | 'introduced' | 'other'
export const HOWS: How[] = ['linkedin', 'email', 'in person', 'guard', 'alumni', 'introduced', 'other']

export type Person = {
  id: string
  name: string
  org: string
  role: string
  how: How
  /** When they were added — this is what the weekly target counts. */
  at: string
  /** Last time a message actually went out. Drives the follow-up list. */
  lastTouch: string | null
  stage: Stage
  note: string
}

/**
 * Ten new people a week.
 *
 * Not a suggestion and not an average — a target, shown against the week's
 * actual count wherever the application count is shown, because the whole
 * point is that it should be the more prominent of the two.
 */
export const WEEKLY_TARGET = 10

/**
 * A week of silence after reaching out is where this fails.
 *
 * Not because anyone is rude — because a single unanswered message feels like a
 * closed door and there is no list saying otherwise. Seven days puts them back
 * on the screen once, which is the entire mechanism.
 */
export const FOLLOW_UP_DAYS = 7

export function loadContacts(): Person[] {
  const raw = read<unknown[]>(KEY, [])
  if (!Array.isArray(raw)) return []
  return raw.filter((p): p is Person => !!p && typeof p === 'object' && typeof (p as Person).id === 'string' && typeof (p as Person).name === 'string')
}

export const saveContacts = (list: Person[]) => write(KEY, list)

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `p${Date.now()}${Math.random().toString(36).slice(2, 8)}`

export function addContact(list: Person[], fields: Partial<Person> & { name: string }, at = new Date().toISOString()): Person[] {
  const next = [
    { id: newId(), org: '', role: '', how: 'linkedin' as How, at, lastTouch: null, stage: 'new' as Stage, note: '', ...fields },
    ...list,
  ]
  saveContacts(next)
  return next
}

export function updateContact(list: Person[], id: string, patch: Partial<Person>): Person[] {
  const next = list.map((p) => (p.id === id ? { ...p, ...patch } : p))
  saveContacts(next)
  return next
}

export function removeContact(list: Person[], id: string): Person[] {
  const next = list.filter((p) => p.id !== id)
  saveContacts(next)
  return next
}

/**
 * Marking a message sent moves them along and stamps the clock in one action.
 *
 * Two separate controls for "I messaged them" and "they are now at reached out"
 * is two chances to do half of it, and a half-updated contact is one that
 * silently drops off the follow-up list.
 */
export function touch(list: Person[], id: string, at = new Date().toISOString()): Person[] {
  const stage = list.find((p) => p.id === id)?.stage ?? 'new'
  // Only `new` advances. Someone already at `replied` who gets another message
  // has not gone backwards to `reached out`.
  return updateContact(list, id, { lastTouch: at, stage: stage === 'new' ? 'reached out' : stage })
}

/** Monday-anchored, so this week can be compared to last week. */
export function weekStart(at: number): string {
  const d = new Date(at)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

export const addedThisWeek = (list: Person[], now = Date.now()) =>
  list.filter((p) => weekStart(Date.parse(p.at)) === weekStart(now)).length

/**
 * Who is owed a message.
 *
 * Reached out, no answer, a week gone. Anyone who replied is off the list —
 * the conversation is live and a reminder to chase it would be wrong. Anyone
 * marked cold is off it too, once, deliberately.
 */
export function dueFollowUp(list: Person[], now = Date.now()): Person[] {
  return list
    .filter((p) => {
      if (p.stage === 'cold' || p.stage === 'replied' || p.stage === 'met' || p.stage === 'referred') return false
      const since = p.lastTouch ?? p.at
      return (now - Date.parse(since)) / 86_400_000 >= FOLLOW_UP_DAYS
    })
    .sort((a, b) => Date.parse(a.lastTouch ?? a.at) - Date.parse(b.lastTouch ?? b.at))
}

export type NetworkStats = { total: number; week: number; target: number; answered: number; referred: number; due: number }

export function statsOf(list: Person[], now = Date.now()): NetworkStats {
  return {
    total: list.length,
    week: addedThisWeek(list, now),
    target: WEEKLY_TARGET,
    answered: list.filter((p) => p.stage === 'replied' || p.stage === 'met' || p.stage === 'referred').length,
    referred: list.filter((p) => p.stage === 'referred').length,
    due: dueFollowUp(list, now).length,
  }
}

export const exportContacts = (list: Person[]) =>
  JSON.stringify({ exportedAt: new Date().toISOString(), contacts: list }, null, 2)
