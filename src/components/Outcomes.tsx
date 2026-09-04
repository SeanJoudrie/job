import { useState } from 'react'
import type { Applied } from '../types'
import { Chip } from './ui'
import {
  MIN_LEARN,
  MIN_SAMPLE,
  advanced,
  breakdown,
  isSettled,
  median,
  nudges,
  rateOf,
  responseDays,
  runwayOf,
  weekly,
  type Dimension,
  type Rate,
} from '../lib/outcomes'
import { GHOST_DAYS } from '../lib/applied'

/**
 * The one screen that answers "is any of this working".
 *
 * It is deliberately unwilling to say much. Most of what a dashboard like this
 * usually shows — a board with a 40% response rate off five applications, a
 * "best performing" anything — is noise dressed as a finding, and acting on it
 * costs weeks. So a rate appears only past MIN_SAMPLE settled applications, it
 * appears with its interval, and where there is nothing to say the panel says
 * how much more is needed before there will be.
 */

const pct = (x: number) => `${Math.round(x * 100)}%`

const DIMENSIONS: { id: Dimension; label: string; note: string }[] = [
  { id: 'referral', label: 'Referral or cold', note: 'The only channel that has produced an interview so far.' },
  { id: 'source', label: 'Board', note: 'Where it was sent. A board that never answers is a board to stop using.' },
  { id: 'tier', label: 'Industry tier', note: 'A is the target field, E is somewhere he applied anyway.' },
  { id: 'variant', label: 'Resume variant', note: 'Full against stripped. Rejection happens at both ends.' },
  { id: 'letter', label: 'Cover letter', note: 'Whether writing one changed anything.' },
  { id: 'daysLive', label: 'Age of the posting', note: 'A req live over a month is usually already filled.' },
  { id: 'sector', label: 'Employer kind', note: '' },
  { id: 'pack', label: 'Pack', note: '' },
  { id: 'industry', label: 'Industry', note: '' },
  { id: 'remote', label: 'Remote or on site', note: '' },
]

export function OutcomesView({ list, savings, burn, now = Date.now() }: {
  list: Applied[]
  savings: number | null
  burn: number
  now?: number
}) {
  const [dim, setDim] = useState<Dimension>('referral')

  const overall = rateOf('all', 'everything', list, now)
  const out = list.filter((e) => !isSettled(e, now)).length
  const days = responseDays(list)
  const mid = median(days)
  const weeks = weekly(list, 8, now)
  const learn = nudges(list, now)
  const runway = runwayOf(savings, burn)

  if (!list.length) {
    return (
      <div className="space-y-2 p-4 text-sm">
        <p className="muted">Nothing logged yet.</p>
        <p className="faint text-xs">
          Tick “I applied” on a job and everything about it is recorded automatically — board, tier, pay, commute,
          which resume went out, whether a letter went with it. Nothing to fill in. Once about {MIN_SAMPLE} of them have
          had time to answer, this page starts saying which of those mattered.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-3 text-sm">
      {runway.say && (
        <section className="rounded border p-3" style={{ borderColor: 'var(--bad)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--bad)' }}>
            {runway.stage === 'take' ? 'Take the job' : runway.stage === 'bridge' ? 'Bridge work now' : 'Review the strategy'}
          </p>
          <p className="mt-1">{runway.say}</p>
          {runway.months !== null && (
            <p className="mt-1 text-xs faint tabular">{runway.months.toFixed(1)} months at the current burn.</p>
          )}
        </section>
      )}

      <section>
        <Headline label="Sent" value={String(overall.sent)} note={`${out} still inside ${GHOST_DAYS} days`} />
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Headline
            label="Answered"
            value={overall.rate === null ? `${overall.heard}` : pct(overall.rate)}
            note={overall.rate === null ? `of ${overall.settled} settled` : `${overall.heard} of ${overall.settled} settled`}
          />
          <Headline label="Interviews" value={String(list.filter(advanced).length)} note="from any source" />
          <Headline label="Reply took" value={mid === null ? '—' : `${Math.round(mid)}d`} note={mid === null ? 'nothing back yet' : `median of ${days.length}`} />
        </div>
        {overall.interval && (
          <p className="mt-1 text-[11px] faint tabular">
            Somewhere between {pct(overall.interval[0])} and {pct(overall.interval[1])}, at this sample size.
          </p>
        )}
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide faint">Last eight weeks</h2>
        <div className="mt-2 flex items-end gap-1" style={{ height: 48 }}>
          {weeks.map((w) => {
            const max = Math.max(1, ...weeks.map((x) => x.sent))
            return (
              <div key={w.week} className="flex flex-1 flex-col items-center justify-end gap-1">
                <span className="w-full rounded-t" style={{ height: `${(w.sent / max) * 40}px`, background: w.sent ? 'var(--accent)' : 'var(--line)', minHeight: 2 }} />
                <span className="text-[10px] faint tabular">{w.sent}</span>
              </div>
            )
          })}
        </div>
        <p className="text-[10px] faint">week beginning {weeks[0]?.week} → {weeks.at(-1)?.week}</p>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide faint">Answer rate by</h2>
        <div className="mt-1 flex flex-wrap gap-1">
          {DIMENSIONS.map((d) => (
            <button
              key={d.id}
              onClick={() => setDim(d.id)}
              aria-current={dim === d.id}
              className="chip"
              style={dim === d.id ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
            >
              {d.label}
            </button>
          ))}
        </div>
        {DIMENSIONS.find((d) => d.id === dim)?.note && (
          <p className="mt-1 text-[11px] faint">{DIMENSIONS.find((d) => d.id === dim)!.note}</p>
        )}
        <ul className="mt-2">
          {breakdown(list, dim, now).map((r) => <RateRow key={r.key} rate={r} />)}
        </ul>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide faint">What the answers say about the weights</h2>
        {!learn.ready ? (
          <p className="mt-1 text-xs muted">
            Not yet. {learn.need > 0
              ? `${learn.need} more applications need to settle before this can say anything that is not a coin flip.`
              : 'It needs answers on both sides — some that came back and some that did not — before a difference means anything.'}
          </p>
        ) : (
          <>
            <p className="mt-1 text-[11px] faint">
              Mean axis score among the {learn.rows[0].n} settled applications that got an answer, against the ones that
              did not. A positive gap is an axis worth more than it is currently given. It is a suggestion — the weights
              are in Settings and nothing here changes them.
            </p>
            <ul className="mt-2">
              {learn.rows.map((r) => (
                <li key={r.axis} className="flex items-center gap-2 border-b line py-1 text-xs">
                  <span className="flex-1">{r.axis}</span>
                  <span className="tabular faint">{r.missed.toFixed(1)} → {r.heard.toFixed(1)}</span>
                  <span className="tabular w-12 text-right" style={{ color: r.diff > 0.3 ? 'var(--good)' : r.diff < -0.3 ? 'var(--bad)' : 'var(--muted)' }}>
                    {r.diff > 0 ? '+' : ''}{r.diff.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <p className="text-[11px] faint">
        A rate is only shown once {MIN_SAMPLE} applications in that bucket have had {GHOST_DAYS} days to answer.
        Anything sent more recently is counted as sent and left out of the fraction — it has not been ignored, it has
        not been answered yet. The weights panel waits for {MIN_LEARN}.
      </p>
    </div>
  )
}

function Headline({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide faint">{label}</p>
      <p className="text-xl font-semibold tabular">{value}</p>
      <p className="text-[11px] faint">{note}</p>
    </div>
  )
}

function RateRow({ rate: r }: { rate: Rate }) {
  return (
    <li className="flex items-center gap-2 border-b line py-1.5 text-xs">
      <span className="min-w-0 flex-1 truncate">{r.label}</span>
      {r.advanced > 0 && <Chip tone="good">{r.advanced} interviewed</Chip>}
      <span className="tabular faint">{r.heard}/{r.settled}</span>
      <span className="tabular w-28 text-right">
        {r.rate === null ? (
          <span className="faint">{r.sent} sent · too few</span>
        ) : (
          <>
            <span style={{ color: 'var(--ink)' }}>{pct(r.rate)}</span>
            {r.interval && <span className="faint"> ({pct(r.interval[0])}–{pct(r.interval[1])})</span>}
          </>
        )}
      </span>
    </li>
  )
}

