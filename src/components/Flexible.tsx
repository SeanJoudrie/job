import { useState } from 'react'
import type { Job } from '../types'
import { Chip } from './ui'
import { JobRow } from './JobRow'
import { remoteKind, type RemoteKind } from '../lib/remote'
import { easeScore } from '../lib/ease'
import { packFor, type Pack } from '../lib/packs'
import type { Ctx, Weights } from '../lib/score'
import type { Profile } from '../lib/requirements'
import type { Match } from '../lib/match'

/**
 * Remote and part-time, ranked half on wanting it and half on getting it.
 *
 * The pool's own answer to "remote" is seventy-three software engineering
 * posts, which is not his answer — "as long as it's slightly achievable, I know
 * I'm not the most IT person ever". So the ordering here weights gettability at
 * fifty percent rather than the twenty it carries everywhere else, and the
 * filter below exists because the honest thing when the list is still too
 * technical is to let him say so in one tap.
 */

const FILTERS: { id: 'all' | RemoteKind; label: string }[] = [
  { id: 'all', label: 'everything' },
  { id: 'remote', label: 'fully remote' },
  { id: 'hybrid', label: 'hybrid' },
  { id: 'part-time', label: 'part-time' },
]

export function FlexibleView({ jobs, profile, weights, ctx, matchOf, applied, keyOf, descs, expanded, selected, onToggleExpand, onToggleSelect, onApply, onDoc }: {
  jobs: Job[]
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
  const [filter, setFilter] = useState<'all' | RemoteKind>('all')
  const [plainOnly, setPlainOnly] = useState(false)

  const counts = { remote: 0, hybrid: 0, 'part-time': 0 } as Record<RemoteKind, number>
  for (const j of jobs) {
    const k = remoteKind(j)
    if (k) counts[k]++
  }

  const shown = jobs
    .filter((j) => filter === 'all' || remoteKind(j) === filter)
    // "Even if it's the most boring shit ever" — the point of this toggle is
    // that boring is a feature here, so it hides what needs a career engineer
    // rather than what is dull.
    .filter((j) => !plainOnly || (!j.families.includes('technical') && easeScore(j) >= 5))
    .slice(0, 120)

  return (
    <div>
      <div className="space-y-2 border-b line px-3 py-3 text-xs">
        <p className="muted">
          Remote, hybrid and part-time. Ranked half on fit and half on how gettable it is, rather than the
          usual twenty percent — because the pool’s answer to “remote” is seventy-odd engineering posts and
          that is not the answer you asked for.
        </p>
        <div className="flex flex-wrap gap-1">
          {/* Hybrid is never flagged by any board in this pool, so its chip
              would sit there reading 0 forever. Shown only if it has entries. */}
          {FILTERS.filter((f) => f.id === 'all' || counts[f.id] > 0).map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              aria-current={filter === f.id}
              className="chip"
              style={filter === f.id ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
            >
              {f.label}{' '}
              <span className="tabular faint">
                {f.id === 'all' ? jobs.length : counts[f.id]}
              </span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setPlainOnly(!plainOnly)}
          aria-pressed={plainOnly}
          className="chip"
          style={plainOnly ? { color: 'var(--good)', borderColor: 'var(--good)' } : undefined}
        >
          {plainOnly ? 'showing only the non-technical ones' : 'hide anything that wants a career engineer'}
        </button>
      </div>

      {!shown.length ? (
        <p className="p-4 text-sm muted">Nothing matches that combination today.</p>
      ) : (
        <ul>
          {shown.map((job, i) => (
            <li key={job.id}>
              <div className="flex items-center gap-2 px-3 pt-2">
                <Chip tone={remoteKind(job) === 'remote' ? 'good' : 'plain'}>{remoteKind(job)}</Chip>
              </div>
              <JobRow
                job={descs[job.id] ? { ...job, descText: descs[job.id] } : job}
                profile={profile}
                weights={weights}
                ctx={ctx}
                matchOf={matchOf}
                place={i + 1}
                applied={applied.has(keyOf(job))}
                selected={selected.has(job.id)}
                expanded={expanded.has(job.id)}
                deadReq={false}
                description={descs[job.id]}
                onToggleExpand={() => onToggleExpand(job.id)}
                onToggleSelect={() => onToggleSelect(job.id)}
                onApply={(next) => onApply(job, next)}
                onDoc={(kind: 'resume' | 'letter') => onDoc(packFor(job, ctx.now), kind)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
