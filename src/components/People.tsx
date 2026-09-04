import { useState } from 'react'
import { Chip, input } from './ui'
import {
  FOLLOW_UP_DAYS,
  HOWS,
  STAGES,
  WEEKLY_TARGET,
  addContact,
  dueFollowUp,
  exportContacts,
  removeContact,
  statsOf,
  touch,
  updateContact,
  type How,
  type Person,
  type Stage,
} from '../lib/contacts'

/**
 * The channel that has actually produced interviews.
 *
 * Everything here is arranged around two numbers: how far into the week's ten
 * he is, and who is owed a message. The list of everyone he knows is below
 * both, because it is the least useful part — an address book does not change
 * what happens next week.
 */

export function WeekBar({ week, due, onClick }: { week: number; due: number; onClick: () => void }) {
  const behind = week < WEEKLY_TARGET
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 text-[11px]" aria-label="People this week">
      <span className="tabular font-semibold" style={{ color: behind ? 'var(--warn)' : 'var(--good)' }}>
        {week}/{WEEKLY_TARGET}
      </span>
      <span className="faint">people this week</span>
      {due > 0 && <span style={{ color: 'var(--accent)' }}>· {due} to chase</span>}
    </button>
  )
}

export function PeopleView({ list, onChange, now = Date.now() }: {
  list: Person[]
  onChange: (next: Person[]) => void
  now?: number
}) {
  const [name, setName] = useState('')
  const [org, setOrg] = useState('')
  const [role, setRole] = useState('')
  const [how, setHow] = useState<How>('linkedin')
  const s = statsOf(list, now)
  const due = dueFollowUp(list, now)
  const behind = Math.max(0, WEEKLY_TARGET - s.week)

  const add = () => {
    if (!name.trim()) return
    onChange(addContact(list, { name: name.trim(), org: org.trim(), role: role.trim(), how }))
    setName('')
    setOrg('')
    setRole('')
  }

  return (
    <div className="space-y-4 p-3 text-sm">
      <section>
        <p className="text-[11px] uppercase tracking-wide faint">This week</p>
        <p className="text-3xl font-semibold tabular" style={{ color: behind ? 'var(--warn)' : 'var(--good)' }}>
          {s.week}<span className="text-lg faint"> / {WEEKLY_TARGET}</span>
        </p>
        <p className="text-xs muted">
          {behind === 0
            ? 'Week is done. Everything past this is extra.'
            : `${behind} more ${behind === 1 ? 'person' : 'people'} to reach this week.`}
        </p>
        <p className="mt-1 text-[11px] faint">
          Six thousand portal applications, no offer. Every interview so far came from someone passing something along.
          This is the number that matters; the application count is the one that has not worked.
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
          <Chip>{s.total} in total</Chip>
          <Chip tone={s.answered ? 'good' : 'plain'}>{s.answered} answered</Chip>
          <Chip tone={s.referred ? 'good' : 'plain'}>{s.referred} referred</Chip>
        </div>
      </section>

      <section className="rounded border line p-3">
        <p className="mb-2 text-[11px] uppercase tracking-wide faint">Add someone</p>
        <div className="space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Name" aria-label="Name" className={input} />
          <div className="grid grid-cols-2 gap-2">
            <input value={org} onChange={(e) => setOrg(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Where" aria-label="Where" className={input} />
            <input value={role} onChange={(e) => setRole(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Their role" aria-label="Their role" className={input} />
          </div>
          <div className="flex gap-2">
            <select value={how} onChange={(e) => setHow(e.target.value as How)} aria-label="How you found them" className={input}>
              {HOWS.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
            <button onClick={add} className="chip shrink-0 px-3" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>add</button>
          </div>
        </div>
      </section>

      {due.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
            Owed a message ({due.length})
          </h2>
          <p className="text-[11px] faint">
            Reached out, nothing back, {FOLLOW_UP_DAYS} days gone. One unanswered message reads like a closed door and
            usually is not one.
          </p>
          <ul className="mt-1">
            {due.map((p) => (
              <li key={p.id} className="flex items-center gap-2 border-b line py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{p.name}</span>
                  {p.org && <span className="muted"> · {p.org}</span>}
                </span>
                <span className="faint tabular">{Math.round((now - Date.parse(p.lastTouch ?? p.at)) / 86_400_000)}d</span>
                <button onClick={() => onChange(touch(list, p.id))} className="chip" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>
                  messaged
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-xs font-semibold uppercase tracking-wide faint">Everyone ({list.length})</h2>
          {list.length > 0 && (
            <button
              onClick={() => {
                const a = document.createElement('a')
                a.href = URL.createObjectURL(new Blob([exportContacts(list)], { type: 'application/json' }))
                a.download = 'contacts.json'
                a.click()
              }}
              className="chip"
              style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}
            >
              export
            </button>
          )}
        </div>
        {!list.length ? (
          <p className="mt-2 text-xs muted">Nobody yet. Ten a week — an alumnus, someone in the unit, anyone already inside a place worth working.</p>
        ) : (
          <ul className="mt-1">
            {list.map((p) => (
              <li key={p.id} className="border-b line py-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{p.name}</span>
                    {p.org && <span className="muted"> · {p.org}</span>}
                    {p.role && <span className="faint"> · {p.role}</span>}
                  </span>
                  <select
                    value={p.stage}
                    onChange={(e) => onChange(updateContact(list, p.id, { stage: e.target.value as Stage }))}
                    aria-label={`Stage of ${p.name}`}
                    className="rounded border line bg-transparent px-1 py-0.5 text-[11px]"
                  >
                    {STAGES.map((st) => <option key={st}>{st}</option>)}
                  </select>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                  <button onClick={() => onChange(touch(list, p.id))} className="chip">messaged today</button>
                  <span className="faint">
                    via {p.how} · added {new Date(p.at).toLocaleDateString()}
                    {p.lastTouch && ` · last message ${new Date(p.lastTouch).toLocaleDateString()}`}
                  </span>
                  <button onClick={() => onChange(removeContact(list, p.id))} className="ml-auto" style={{ color: 'var(--bad)' }} aria-label={`Remove ${p.name}`}>
                    remove
                  </button>
                </div>
                <input
                  defaultValue={p.note}
                  onBlur={(e) => e.target.value !== p.note && onChange(updateContact(list, p.id, { note: e.target.value }))}
                  placeholder="note — what they said, what to ask next"
                  aria-label={`Note on ${p.name}`}
                  className="mt-1 w-full rounded border line bg-transparent px-2 py-1 text-[11px]"
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
