import { useState } from 'react'
import type { Job } from '../types'
import { commuteOf } from '../lib/commute'
import type { Match } from '../lib/match'
import { packFor } from '../lib/packs'
import { boardCount } from '../lib/dedupe'
import { formatPay } from '../lib/pay'
import { gapsFor, type Profile } from '../lib/requirements'
import { defaultCtx, LOGISTICS, rank, type Ctx, type Weights } from '../lib/score'
import { Bar, Chip } from './ui'

const VERDICT_TONE = { matched: 'good', 'soft-gap': 'warn', 'hard-gap': 'bad', unstated: 'plain' } as const
const VERDICT_LABEL = { matched: 'met', 'soft-gap': 'soft', 'hard-gap': 'hard', unstated: '—' } as const

/**
 * When a search matched something the row does not already show, show what it
 * matched on. Otherwise a row appears in the results with no visible reason,
 * which reads as the search misfiring — and this app does not do invisible.
 *
 * `showCompany` is the whole subtlety. Grouped — which is the default — the
 * employer is in the group header and not on the row, so suppressing a match
 * because "it is in the company" hides the only reason that row is there. It
 * took federal postings to surface it: searching "engineer" pulled in the Army
 * Corps of Engineers and Naval Facilities Engineering, and three rows came back
 * with the word nowhere on them. Ungrouped the old behaviour was right, which
 * is why this was invisible for as long as the pool had no employer with a
 * common search word in its name.
 */
export function snippet(job: Job, query: string, showCompany = true): string | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  // Only stay quiet about text the row itself puts on screen.
  const shown = showCompany ? `${job.title} ${job.company}` : job.title
  if (shown.toLowerCase().includes(q)) return null
  if (!showCompany && job.company.toLowerCase().includes(q)) return job.company
  const text = job.descText || job.preview || ''
  const at = text.toLowerCase().indexOf(q)
  if (at < 0) return null
  const from = Math.max(0, at - 45)
  return `${from > 0 ? '…' : ''}${text.slice(from, at + q.length + 55).replace(/\s+/g, ' ').trim()}…`
}

export function JobRow({
  job, profile, weights, ctx = defaultCtx(), matchOf, applied, selected, expanded, deadReq, onToggleExpand, onToggleSelect, onApply, onDoc, description, query = '', showCompany = true,
}: {
  job: Job
  profile: Profile
  weights: Weights
  ctx?: Ctx
  /** Where this job sits among everything in range, on a scale of ten. */
  matchOf?: Match
  applied: boolean
  selected: boolean
  expanded: boolean
  deadReq: boolean
  onToggleExpand: () => void
  onToggleSelect: () => void
  onApply: (next: boolean) => void
  /** Open the resume or letter written for this job's pack. */
  onDoc?: (kind: 'resume' | 'letter') => void
  description?: string
  query?: string
  /** Off when the list is grouped by employer — the group header already says it. */
  showCompany?: boolean
}) {
  const [showAll, setShowAll] = useState(false)
  const [showDocs, setShowDocs] = useState(false)
  const { axes, gettable: ease, industry, logistics, fit, score, exact } = rank(job, profile, weights, ctx)
  const commute = commuteOf(job)
  const placing = matchOf ? matchOf(exact) : score
  const gaps = gapsFor(job.requirements, profile)
  const shown = showAll ? gaps : gaps.filter((g) => g.verdict !== 'unstated').slice(0, 8)
  const boards = boardCount(job)
  const match = snippet(job, query, showCompany)

  return (
    <li className="border-b line">
      <div className="flex items-start gap-2 px-3 py-2.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select ${job.title} at ${job.company}`}
          className="mt-1 h-4 w-4 shrink-0"
        />
        <button type="button" onClick={onToggleExpand} className="min-w-0 flex-1 text-left" aria-expanded={expanded}>
          <div className="flex items-baseline gap-2">
            {/*
              The percentile, not the raw score. The score is an average of
              eleven axes and averages cluster: over the real pool it runs 4.0
              to 7.7 with more than half of everything between 6 and 7, so two
              jobs a hundred places apart both read "6.8". The raw figure is
              still shown when the row is opened, beside the axes that explain
              it — this is the one that ranks.
            */}
            <span className="tabular text-sm font-semibold" style={{ color: placing >= 8 ? 'var(--good)' : placing >= 5 ? 'var(--ink)' : 'var(--muted)' }}>
              {placing.toFixed(1)}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{job.title}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs muted">
            {showCompany && (
              <>
                <span>{job.company}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <span>
              {job.remote
                ? 'remote'
                : commute.minutes !== null
                  ? `${commute.minutes} min${commute.rail ? ' · rail' : ''}`
                  : commute.rail
                    ? 'rail'
                    : 'location unclear'}
            </span>
            <span aria-hidden>·</span>
            <span style={{ color: job.pay ? undefined : 'var(--faint)' }}>{formatPay(job.pay)}</span>
            {applied && <Chip tone="accent">applied</Chip>}
            {deadReq && <Chip tone="bad">likely dead req</Chip>}
            {job.reposts > 0 && !deadReq && <Chip tone="warn">reposted {job.reposts}×</Chip>}
            {job.linkOk === false && <Chip tone="bad">dead link</Chip>}
            {boards > 1 && <Chip>on {boards} boards</Chip>}
            {/* Not scored — see lib/perks.ts. Shown because it is the thing
                that decides between a $27 job here and a $32 job elsewhere. */}
            {job.tuition && <Chip tone="good">tuition paid</Chip>}
            {industry.id !== 'unclassified' && (
              <Chip tone={industry.excluded ? 'bad' : industry.weight >= 8 ? 'good' : 'plain'}>{industry.label}</Chip>
            )}
          </div>
          {match && <p className="mt-1 text-[11px] faint italic">{match}</p>}
        </button>
      </div>

      {expanded && (
        <div className="space-y-3 px-3 pb-4 pl-9">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5 text-[11px] muted">
              <span className="w-24 shrink-0">Gettable</span>
              <Bar value={ease.score} />
              <span className="tabular w-5">{ease.score}</span>
              <span className="faint">{ease.why.join(', ') || 'nothing either way'}</span>
            </span>
            <span className="w-full text-[11px] faint">
              {matchOf ? `better than ${(placing * 10).toFixed(0)}% of what is in range · ` : ''}
              logistics {logistics.toFixed(1)} · overall fit {fit.toFixed(1)}
              {score < fit && ` · scaled to ${score.toFixed(1)} by how winnable it is`}
            </span>
            {axes.map((a) => (
              <span
                key={a.id}
                className="flex items-center gap-1.5 text-[11px] muted"
                title={LOGISTICS.includes(a.id) ? 'logistics — 60% of the fit' : 'the job itself — 40%'}
              >
                <span className="w-24 shrink-0">{a.label}</span>
                <Bar value={a.score} />
                <span className="tabular w-5">{a.score}</span>
                <span className="faint">{a.why}</span>
              </span>
            ))}
          </div>

          {shown.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wide faint">Requirements</div>
              <ul className="space-y-1">
                {shown.map((g, i) => (
                  <li key={i} className="flex gap-2 text-xs">
                    <span className="w-9 shrink-0 text-[10px]" style={{ color: `var(--${VERDICT_TONE[g.verdict] === 'plain' ? 'faint' : VERDICT_TONE[g.verdict]})` }}>
                      {VERDICT_LABEL[g.verdict]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="muted">{g.requirement.text.replace(/^[•\-\s]+/, '').slice(0, 180)}</span>
                      {g.verdict !== 'unstated' && <span className="faint"> — {g.why}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              {gaps.length > shown.length && (
                <button type="button" onClick={() => setShowAll(true)} className="mt-1 text-[11px]" style={{ color: 'var(--accent)' }}>
                  show all {gaps.length}
                </button>
              )}
            </div>
          )}

          {description && (
            <details>
              <summary className="cursor-pointer text-[11px] uppercase tracking-wide faint">Full posting</summary>
              <p className="mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap text-xs muted">{description}</p>
            </details>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <a href={job.url} target="_blank" rel="noreferrer" className="text-xs font-medium">
              open the posting ↗
            </a>
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={applied} onChange={(e) => onApply(e.target.checked)} className="h-4 w-4" />
              I applied
            </label>
            {/*
              The point of the whole thing: the posting is open in one tab and
              the right resume is one press away in the other. Pre-made per
              pack, so there is nothing to wait for and no key to buy.
            */}
            {onDoc && (
              <span className="relative">
                <button
                  type="button"
                  onClick={() => setShowDocs(!showDocs)}
                  aria-expanded={showDocs}
                  aria-label="My documents for this kind of job"
                  className="chip"
                  style={showDocs ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
                >
                  ⋯ my documents
                </button>
                {showDocs && (
                  <span className="ml-2 inline-flex items-center gap-3 text-xs">
                    <span className="faint text-[11px]">{packFor(job, ctx.now).name}:</span>
                    <button type="button" onClick={() => onDoc('resume')} style={{ color: 'var(--accent)' }}>resume ↗</button>
                    <button type="button" onClick={() => onDoc('letter')} style={{ color: 'var(--accent)' }}>cover letter ↗</button>
                  </span>
                )}
              </span>
            )}
            {job.alsoOn.length > 0 && (
              <details className="text-[11px] faint">
                <summary className="cursor-pointer">also on {job.alsoOn.length} other board{job.alsoOn.length > 1 ? 's' : ''}</summary>
                <ul className="mt-1 space-y-0.5">
                  {job.alsoOn.map((o) => (
                    <li key={o.url}>
                      <a href={o.url} target="_blank" rel="noreferrer">{o.source}</a>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
      )}
    </li>
  )
}
