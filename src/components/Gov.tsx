import { useState } from 'react'
import type { Job } from '../types'
import { Chip } from './ui'
import { JobRow } from './JobRow'
import { canApply, isGuardPath, pathWhy } from '../lib/federal'
import { REACHABLE_GRADE } from '../lib/gsgrade'
import type { Ctx, Weights } from '../lib/score'
import type { Profile } from '../lib/requirements'
import type { Match } from '../lib/match'
import { packFor, type Pack } from '../lib/packs'

/**
 * Government on its own, because it does not play by the same rules.
 *
 * Everywhere else in this app a requirement is a claim to be argued with. In
 * federal hiring two of them are not: the hiring path decides whether an
 * application is even accepted, and the grade decides whether HR forwards it.
 * Both are applied by a specialist working from a standard before any hiring
 * manager sees a name, and both were invisible on an ordinary row.
 *
 * So the section leads with what is open to him and keeps the rest behind a
 * toggle rather than deleting it — a closed door he can see is worth more than
 * one he finds again on USAJOBS and applies through anyway.
 */

export type GovEntry = { job: Job }

export function GovView({ entries, profile, weights, ctx, matchOf, applied, keyOf, descs, expanded, selected, onToggleExpand, onToggleSelect, onApply, onDoc }: {
  entries: GovEntry[]
  profile: Profile
  weights: Weights
  ctx: Ctx
  matchOf: Match
  applied: Set<string>
  keyOf: (j: Job) => string
  descs: Record<string, string>
  expanded: Set<string>
  selected: Set<string>
  onToggleExpand: (id: string) => void
  onToggleSelect: (id: string) => void
  onApply: (job: Job, next: boolean) => void
  onDoc: (pack: Pack, kind: 'resume' | 'letter') => void
}) {
  const [showClosed, setShowClosed] = useState(false)

  const open = entries.filter((e) => canApply(e.job.hiringPaths))
  const closed = entries.filter((e) => !canApply(e.job.hiringPaths))
  const guard = open.filter((e) => isGuardPath(e.job.hiringPaths))
  const federal = entries.filter((e) => e.job.sector === 'gov').length
  const local = entries.length - federal
  const shown = showClosed ? [...open, ...closed] : open

  return (
    <div>
      <div className="space-y-2 border-b line px-3 py-3 text-xs">
        <p className="muted">
          Federal, state, county and town. {entries.length} in range — {federal} federal, {local} state and local.
        </p>
        <div className="flex flex-wrap gap-2">
          <Chip tone="good">{open.length} you can apply to</Chip>
          {guard.length > 0 && <Chip tone="good">{guard.length} open to the Guard</Chip>}
          <Chip tone={closed.length ? 'bad' : 'plain'}>{closed.length} closed to outsiders</Chip>
        </div>
        <p className="faint">
          Federal hiring screens twice before a manager reads anything. The hiring path decides whether the
          application is accepted at all — most postings are restricted to current federal employees — and the
          GS grade decides whether it gets forwarded. GS-{REACHABLE_GRADE} is the ceiling reachable from
          outside the service; GS-7 is met on Superior Academic Achievement, which a 3.7 GPA satisfies.
        </p>
        {closed.length > 0 && (
          <button onClick={() => setShowClosed(!showClosed)} className="chip" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>
            {showClosed ? 'hide the ones closed to you' : `show the ${closed.length} closed to you`}
          </button>
        )}
      </div>

      {!shown.length ? (
        <p className="p-4 text-sm muted">
          Nothing in range yet. The federal scan needs USAJOBS credentials set as repository secrets; state and
          local postings come in through the ordinary boards.
        </p>
      ) : (
        <ul>
          {shown.map((e, i) => {
            const eligible = canApply(e.job.hiringPaths)
            return (
              <li key={e.job.id}>
                {!eligible && (
                  <p className="px-3 pt-2 text-[11px]" style={{ color: 'var(--bad)' }}>
                    {pathWhy(e.job.hiringPaths)} — an application would be rejected as ineligible
                  </p>
                )}
                <JobRow
                  job={descs[e.job.id] ? { ...e.job, descText: descs[e.job.id] } : e.job}
                  profile={profile}
                  weights={weights}
                  ctx={ctx}
                  matchOf={matchOf}
                  place={eligible ? i + 1 : undefined}
                  applied={applied.has(keyOf(e.job))}
                  selected={selected.has(e.job.id)}
                  expanded={expanded.has(e.job.id)}
                  deadReq={false}
                  description={descs[e.job.id]}
                  onToggleExpand={() => onToggleExpand(e.job.id)}
                  onToggleSelect={() => onToggleSelect(e.job.id)}
                  onApply={(next) => onApply(e.job, next)}
                  onDoc={(kind: 'resume' | 'letter') => onDoc(packFor(e.job, ctx.now), kind)}
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
