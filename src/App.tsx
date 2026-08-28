import { useEffect, useMemo, useState } from 'react'
import { JobRow } from './components/JobRow'
import { Chip, Field, input } from './components/ui'
import { isDeadReq, keyOf, loadApplied, markApplied, setStatus, unmarkApplied, withGhosting, exportApplied, type AppliedLog } from './lib/applied'
import { loadDescriptions, loadIndex, type Index } from './lib/data'
import { boardCount } from './lib/dedupe'
import { defaultLanes, describeRule, LANES_VERSION, mkRule, runNet, topBaseline, type Net, type Rule } from './lib/nets'
import { AXIS_LABELS, FIT, LOGISTICS, LOGISTICS_SHARE, rank, variantFor, type AxisId, type Ctx } from './lib/score'
import { PER_EMPLOYER, topJobs, type TopEntry } from './lib/top'
import { commuteOf } from './lib/commute'
import { easeScore } from './lib/ease'
import { loadSettings, saveSettings, type Settings } from './lib/settings'
import { read, write } from './lib/storage'
import type { Job } from './types'
import { coverLetter, scoreJob, type Verdict } from './lib/claude'

type View = 'top' | 'pool' | 'applied' | 'dupes' | 'settings'
type Sort = 'fit' | 'commute' | 'pay' | 'newest' | 'title' | 'gettable'
const PAGE = 60

export default function App() {
  const [index, setIndex] = useState<Index | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [nets, setNets] = useState<Net[]>(() => {
    const s = loadSettings()
    return loadNets(s.floorHourly, s.maxMinutes)
  })
  const [laneId, setLaneId] = useState<string>(() => read<string>('job.lane.v1', 'easy'))
  const [applied, setApplied] = useState<AppliedLog>(() => withGhosting(loadApplied()))
  const [view, setView] = useState<View>(() => read<View>('job.view.v1', 'top'))
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('fit')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [descs, setDescs] = useState<Record<string, string>>({})
  const [limit, setLimit] = useState(PAGE)
  const [showStack, setShowStack] = useState(false)
  const [grouped, setGrouped] = useState(() => read('job.grouped.v1', true))
  // Explicit per-employer overrides. A set with a "!name" sentinel for the
  // closed case was too easy to misread.
  const [groupOverrides, setGroupOverrides] = useState<Record<string, boolean>>({})
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>(() => read('job.verdicts.v1', {}))
  const [letters, setLetters] = useState<Record<string, string>>(() => read('job.letters.v1', {}))
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    loadIndex().then(setIndex).catch((e: Error) => setError(e.message))
  }, [])
  useEffect(() => void write('job.nets.v1', { version: LANES_VERSION, nets }), [nets])
  useEffect(() => void write('job.lane.v1', laneId), [laneId])
  useEffect(() => void write('job.grouped.v1', grouped), [grouped])
  useEffect(() => void write('job.view.v1', view), [view])
  useEffect(() => void write('job.verdicts.v1', verdicts), [verdicts])
  useEffect(() => void write('job.letters.v1', letters), [letters])

  /**
   * What the axes need that is not on the job. Rebuilt only when the settings
   * that feed it change — `now` is in here because the seasonal industry rule
   * depends on it, and a fresh Date on every render would rerank the list on
   * every keystroke.
   */
  const ctx: Ctx = useMemo(
    () => ({ floorHourly: settings.floorHourly, maxMinutes: settings.maxMinutes, now: new Date() }),
    [settings.floorHourly, settings.maxMinutes],
  )

  const lane = nets.find((n) => n.id === laneId) ?? nets[0]
  const appliedKeys = useMemo(() => new Set(Object.keys(applied)), [applied])
  const jobs = index?.jobs ?? []

  /** Counts per lane, so the top of the app answers "how much is there for me". */
  const laneCounts = useMemo(() => {
    const out: Record<string, number> = {}
    for (const n of nets) out[n.id] = runNet(jobs, n, appliedKeys, keyOf).jobs.length
    return out
  }, [jobs, nets, appliedKeys])

  const { jobs: filtered, steps } = useMemo(
    () => (lane ? runNet(jobs, lane, appliedKeys, keyOf) : { jobs, steps: [] }),
    [jobs, lane, appliedKeys],
  )

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return filtered
    return filtered.filter((j) => `${j.title} ${j.company} ${j.preview ?? ''}`.toLowerCase().includes(q))
  }, [filtered, query])

  const sorted = useMemo(() => {
    const withScore = searched.map((j) => ({ j, s: rank(j, settings.profile, settings.weights, ctx).score }))
    const cmp: Record<Sort, (a: (typeof withScore)[0], b: (typeof withScore)[0]) => number> = {
      fit: (a, b) => b.s - a.s,
      commute: (a, b) => minutesOf(a.j) - minutesOf(b.j),
      pay: (a, b) => payOf(b.j) - payOf(a.j),
      newest: (a, b) => (b.j.postedAt ?? '').localeCompare(a.j.postedAt ?? ''),
      title: (a, b) => a.j.title.localeCompare(b.j.title),
      gettable: (a, b) => easeScore(b.j) - easeScore(a.j),
    }
    return [...withScore].sort(cmp[sort]).map((x) => x.j)
  }, [searched, sort, settings, ctx])

  useEffect(() => setLimit(PAGE), [laneId, query, sort])
  useEffect(() => setGroupOverrides({}), [laneId, query, sort])

  /**
   * One employer can otherwise own the whole screen — Anduril alone posts 167
   * roles inside the radius. Grouped by company, biggest groups folded shut,
   * so the list shows the range of what is out there rather than one company's
   * hiring plan.
   */
  const groups = useMemo(() => {
    if (!grouped) return null
    const byCompany = new Map<string, Job[]>()
    for (const j of sorted) {
      const bucket = byCompany.get(j.company)
      if (bucket) bucket.push(j)
      else byCompany.set(j.company, [j])
    }
    return [...byCompany.entries()].map(([company, jobs]) => ({
      company,
      jobs,
      best: Math.max(...jobs.map((j) => rank(j, settings.profile, settings.weights, ctx).score)),
    }))
  }, [sorted, grouped, settings, ctx])

  /** Small groups sit open; a big one folds shut so it cannot own the screen. */
  const FOLD_AT = 4
  const isOpen = (company: string, size: number) => groupOverrides[company] ?? size <= FOLD_AT
  const toggleGroup = (company: string, size: number) =>
    setGroupOverrides({ ...groupOverrides, [company]: !isOpen(company, size) })

  // Descriptions load only for what is actually open or chosen.
  const needed = useMemo(() => [...new Set([...expanded, ...selected])], [expanded, selected])
  useEffect(() => {
    const missing = needed.filter((id) => !descs[id])
    if (!missing.length || !index) return
    loadDescriptions(missing, index.chunks).then((got) => setDescs((d) => ({ ...d, ...got })))
  }, [needed, index, descs])

  const hydrate = (j: Job): Job => (descs[j.id] ? { ...j, descText: descs[j.id] } : j)
  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  }

  function apply(job: Job, next: boolean) {
    setApplied(withGhosting(next ? markApplied(job) : unmarkApplied(job)))
  }

  async function runScoring() {
    if (!settings.apiKey) return setBusy('Add an API key in Settings first.')
    const chosen = sorted.filter((j) => selected.has(j.id))
    for (const [i, job] of chosen.entries()) {
      setBusy(`Reading ${i + 1} of ${chosen.length}: ${job.title}`)
      try {
        const v = await scoreJob(hydrate(job), settings.profile, settings.apiKey)
        setVerdicts((prev) => ({ ...prev, [job.id]: v }))
      } catch (e) {
        setBusy(`Stopped on ${job.title}: ${(e as Error).message}`)
        return
      }
    }
    setBusy(null)
  }

  async function writeLetters() {
    if (!settings.apiKey) return setBusy('Add an API key in Settings first.')
    const chosen = sorted.filter((j) => selected.has(j.id))
    for (const [i, job] of chosen.entries()) {
      setBusy(`Writing ${i + 1} of ${chosen.length}: ${job.title}`)
      try {
        const text = await coverLetter(hydrate(job), variantFor(job, ctx.now), settings.apiKey)
        setLetters((prev) => ({ ...prev, [job.id]: text }))
      } catch (e) {
        setBusy(`Stopped on ${job.title}: ${(e as Error).message}`)
        return
      }
    }
    setBusy(null)
  }

  /**
   * The best of everything, across every lane. Held to the same baseline every
   * lane uses — radius, pay floor, no sales, nothing already applied to — then
   * ranked without regard to which lane a job belongs to.
   */
  const best = (() => {
    const pool = runNet(jobs, topBaseline(settings.floorHourly, settings.maxMinutes), appliedKeys, keyOf).jobs
    return topJobs(pool, settings.profile, settings.weights, { limit: 80, ctx })
  })()

  const renderRow = (job: Job) => (
    <div key={job.id}>
      <JobRow
        job={hydrate(job)}
        profile={settings.profile}
        weights={settings.weights}
        ctx={ctx}
        applied={appliedKeys.has(keyOf(job))}
        selected={selected.has(job.id)}
        expanded={expanded.has(job.id)}
        deadReq={isDeadReq(job, applied)}
        description={descs[job.id]}
        query={query}
        showCompany={!grouped}
        onToggleExpand={() => setExpanded(toggle(expanded, job.id))}
        onToggleSelect={() => setSelected(toggle(selected, job.id))}
        onApply={(next) => apply(job, next)}
      />
      {(verdicts[job.id] || letters[job.id]) && <VerdictBlock verdict={verdicts[job.id]} letter={letters[job.id]} />}
    </div>
  )

  if (error) return <Shell><p className="p-4 text-sm" style={{ color: 'var(--bad)' }}>{error}</p></Shell>
  if (!index) return <Shell><p className="p-4 text-sm muted">Loading the pool…</p></Shell>

  const appliedList = Object.values(applied).sort((a, b) => b.at.localeCompare(a.at))
  const dupes = jobs.filter((j) => j.alsoOn.length > 0)

  return (
    <Shell>
      <header className="sticky top-0 z-10 border-b line" style={{ background: 'var(--bg)' }}>
        <div className="flex items-center gap-2 px-3 pt-2">
          <h1 className="text-sm font-semibold">Jobs</h1>
          <span className="text-[11px] faint">{index.count} scanned · {new Date(index.generatedAt).toLocaleDateString()}</span>
          <nav className="ml-auto flex gap-2 text-xs">
            {(['top', 'pool', 'applied', 'dupes', 'settings'] as View[]).map((v) => (
              <button key={v} onClick={() => setView(v)} aria-current={view === v} style={{ color: view === v ? 'var(--accent)' : 'var(--muted)' }}>
                {v === 'dupes' ? `dupes ${dupes.length}` : v === 'applied' ? `applied ${appliedList.length}` : v}
              </button>
            ))}
          </nav>
        </div>

        {view === 'pool' && (
          <>
            <div className="flex gap-1 overflow-x-auto px-3 py-2">
              {nets.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setLaneId(n.id)}
                  aria-current={n.id === laneId}
                  className="chip shrink-0"
                  style={n.id === laneId ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
                >
                  {n.name} <span className="tabular faint">{laneCounts[n.id] ?? 0}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 px-3 pb-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="search this lane"
                aria-label="Search this lane"
                className={input}
              />
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" className="rounded border line bg-transparent px-1.5 py-1.5 text-xs">
                <option value="fit">fit</option>
                <option value="commute">commute</option>
                <option value="pay">pay</option>
                <option value="newest">newest</option>
                <option value="title">title</option>
                <option value="gettable">gettable</option>
              </select>
            </div>
            {/* A starting point, not a permanent fixture: the row gives its
                space back the moment there is a search to read instead. */}
            {!query && (
              <div className="flex gap-1 overflow-x-auto px-3 pb-2">
                {PRIORITY_TITLES.map((t) => (
                  <button key={t} onClick={() => setQuery(t)} className="chip shrink-0 text-[11px]">{t}</button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3 px-3 pb-2 text-[11px]">
              <button onClick={() => setShowStack(!showStack)} style={{ color: 'var(--accent)' }}>
                {showStack ? 'hide' : 'show'} the {lane.rules.length} rules
              </button>
              <span className="muted tabular">{sorted.length} showing</span>
              <button onClick={() => setGrouped(!grouped)} style={{ color: 'var(--accent)' }}>
                {grouped ? 'flat list' : 'group by employer'}
              </button>
              {grouped && Object.keys(groupOverrides).length > 0 && (
                <button onClick={() => setGroupOverrides({})} className="faint">reset groups</button>
              )}
              {selected.size > 0 && (
                <>
                  <span className="muted tabular">{selected.size} selected</span>
                  <button onClick={runScoring} style={{ color: 'var(--accent)' }}>score them →</button>
                  <button onClick={writeLetters} style={{ color: 'var(--accent)' }}>write letters →</button>
                  <button onClick={() => setSelected(new Set())} className="faint">clear</button>
                </>
              )}
            </div>
            {busy && <p className="px-3 pb-2 text-[11px]" style={{ color: 'var(--accent)' }}>{busy}</p>}
            {showStack && <FilterStack lane={lane} steps={steps} total={jobs.length} onChange={(next) => setNets(nets.map((n) => (n.id === lane.id ? next : n)))} />}
          </>
        )}
      </header>

      {view === 'pool' && (
        <>
          {groups ? (
            <ul>
              {groups.slice(0, limit).map(({ company, jobs: rows, best }) => {
                const open = isOpen(company, rows.length)
                return (
                  <li key={company}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(company, rows.length)}
                      aria-expanded={open}
                      aria-label={`${open ? 'Collapse' : 'Expand'} ${company}, ${rows.length} jobs`}
                      className="panel flex w-full items-center gap-2 border-b line px-3 py-2 text-left"
                    >
                      <span aria-hidden className="w-3 faint">{open ? '▾' : '▸'}</span>
                      <span className="flex-1 truncate text-xs font-semibold">{company}</span>
                      <span className="tabular text-[11px] faint">best {best.toFixed(1)}</span>
                      <span className="tabular text-[11px] muted">{rows.length}</span>
                    </button>
                    {open && (
                      <ul>
                        {rows.map((job) => renderRow(job))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <ul>{sorted.slice(0, limit).map((job) => renderRow(job))}</ul>
          )}
          {sorted.length === 0 && <Empty lane={lane} steps={steps} />}
          {groups ? (
            limit < groups.length && (
              <button onClick={() => setLimit(limit + PAGE)} className="w-full py-4 text-center text-xs" style={{ color: 'var(--accent)' }}>
                show more employers ({groups.length - limit} below)
              </button>
            )
          ) : (
            limit < sorted.length && (
              <button onClick={() => setLimit(limit + PAGE)} className="w-full py-4 text-center text-xs" style={{ color: 'var(--accent)' }}>
                show more ({sorted.length - limit} below)
              </button>
            )
          )}
        </>
      )}

      {view === 'top' && (
        <TopView
          entries={best}
          profile={settings.profile}
          weights={settings.weights}
          ctx={ctx}
          applied={appliedKeys}
          descs={descs}
          expanded={expanded}
          selected={selected}
          onToggleExpand={(id) => setExpanded(toggle(expanded, id))}
          onToggleSelect={(id) => setSelected(toggle(selected, id))}
          onApply={apply}
          appliedLog={applied}
        />
      )}

      {view === 'applied' && <AppliedView list={appliedList} onStatus={(k, s) => setApplied(withGhosting(setStatus(k, s)))} log={applied} />}
      {view === 'dupes' && <DupesView jobs={dupes} />}
      {view === 'settings' && (
        <SettingsView
          settings={settings}
          onChange={(next) => {
            setSettings(next)
            saveSettings(next)
          }}
          onResetLanes={() => setNets(defaultLanes(settings.floorHourly, settings.maxMinutes))}
        />
      )}
    </Shell>
  )
}

/** Stored lanes are replaced when the shipped set changes; see LANES_VERSION. */
function loadNets(floor: number, maxMinutes: number): Net[] {
  const stored = read<{ version?: number; nets?: Net[] } | Net[]>('job.nets.v1', [])
  const isCurrent = !Array.isArray(stored) && stored.version === LANES_VERSION && Array.isArray(stored.nets)
  return isCurrent ? (stored as { nets: Net[] }).nets : defaultLanes(floor, maxMinutes)
}

/**
 * The titles worth searching first, in the order the case file lists them.
 * A row of one-tap searches rather than a taxonomy: they cut across the lanes
 * and they are what he would type anyway, on a phone, with one thumb.
 */
const PRIORITY_TITLES = [
  'administrative assistant', 'office assistant', 'program coordinator', 'operations coordinator',
  'program assistant', 'department coordinator', 'scheduler', 'records', 'data entry',
  'patient access', 'front desk', 'facilities coordinator', 'office manager', 'executive assistant',
  'warehouse associate', 'inventory', 'receiving', 'mailroom', 'logistics coordinator',
  'intake specialist', 'library assistant', 'archives', 'communications coordinator',
  'marketing coordinator', 'content coordinator', 'production assistant', 'event coordinator',
  'audio visual', 'it support', 'helpdesk', 'junior analyst', 'qa', 'custodian', 'groundskeeper',
]

/**
 * Sorting by commute means sorting by the drive, not by the crow.
 *
 * A remote job sorts LAST, not first. Treating "no commute" as zero minutes
 * filled the entire first screen of a commute-sorted list with remote postings
 * — the one shape of job the rest of this app is built to push down — and none
 * of them renders a drive time, so the browser check measuring the sort found
 * nothing to measure and passed on an empty array.
 */
const NO_COMMUTE = 9e9
const minutesOf = (j: Job) => commuteOf(j).minutes ?? NO_COMMUTE

const payOf = (j: Job) => {
  if (!j.pay) return -1
  const top = j.pay.max ?? j.pay.min ?? 0
  const mult = { hour: 2080, day: 260, week: 52, month: 12, year: 1 }[j.pay.period]
  return top * mult
}

const Shell = ({ children }: { children: React.ReactNode }) => <main className="mx-auto max-w-2xl pb-24">{children}</main>

function FilterStack({ lane, steps, total, onChange }: { lane: Net; steps: { rule: Rule; before: number; after: number }[]; total: number; onChange: (n: Net) => void }) {
  const [word, setWord] = useState('')
  const stepOf = (id: string) => steps.find((s) => s.rule.id === id)
  const update = (rules: Rule[]) => onChange({ ...lane, rules })
  return (
    <div className="panel border-t line px-3 py-2 text-[11px]">
      <div className="flex justify-between py-0.5 faint">
        <span>everything in the pool</span>
        <span className="tabular">{total}</span>
      </div>
      {lane.rules.map((rule) => {
        const s = stepOf(rule.id)
        const cost = s ? s.before - s.after : 0
        return (
          <div key={rule.id} className="flex items-center gap-2 py-0.5">
            <input
              type="checkbox"
              checked={rule.enabled}
              onChange={() => update(lane.rules.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)))}
              aria-label={`Enable ${describeRule(rule)}`}
              className="h-3.5 w-3.5"
            />
            <span className="min-w-0 flex-1 truncate" style={{ opacity: rule.enabled ? 1 : 0.4 }}>{describeRule(rule)}</span>
            {cost > 0 && <span className="faint tabular">−{cost}</span>}
            <span className="tabular w-10 text-right">{s ? s.after : '—'}</span>
            <button
              onClick={() => update(lane.rules.filter((r) => r.id !== rule.id))}
              aria-label={`Remove ${describeRule(rule)}`}
              className="faint"
            >
              ×
            </button>
          </div>
        )
      })}
      <form
        className="mt-2 flex gap-1"
        onSubmit={(e) => {
          e.preventDefault()
          if (!word.trim()) return
          update([...lane.rules, mkRule({ type: 'text', mode: 'lacks', field: 'both', value: word.trim() })])
          setWord('')
        }}
      >
        <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="subtract a word…" aria-label="Subtract a word" className={input} />
        <button type="submit" className="chip shrink-0" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>− add</button>
      </form>
    </div>
  )
}

function Empty({ lane, steps }: { lane: Net; steps: { rule: Rule; before: number; after: number }[] }) {
  const worst = [...steps].sort((a, b) => b.before - b.after - (a.before - a.after))[0]
  return (
    <div className="px-4 py-10 text-center text-sm muted">
      <p>Nothing in {lane.name}.</p>
      {worst && worst.before > worst.after && (
        <p className="mt-1 text-xs faint">
          The biggest cut was “{describeRule(worst.rule)}” — it removed {worst.before - worst.after}. Switch it off to see them.
        </p>
      )}
    </div>
  )
}

function VerdictBlock({ verdict, letter }: { verdict?: Verdict; letter?: string }) {
  return (
    <div className="panel border-b line px-3 py-2 pl-9 text-xs">
      {verdict && (
        <>
          <p className="font-medium">
            <span style={{ color: verdict.fit >= 7 ? 'var(--good)' : verdict.fit >= 4 ? 'var(--warn)' : 'var(--bad)' }}>{verdict.fit}/10</span>{' '}
            {verdict.verdict}
          </p>
          <div className="mt-1 space-y-0.5">
            {verdict.matched.map((m, i) => <p key={`m${i}`}><span style={{ color: 'var(--good)' }}>✓</span> {m}</p>)}
            {verdict.missing.map((m, i) => <p key={`x${i}`}><span style={{ color: 'var(--bad)' }}>✗</span> {m}</p>)}
            {verdict.unclear.map((m, i) => <p key={`u${i}`} className="faint">? {m}</p>)}
          </div>
        </>
      )}
      {letter && (
        <details className="mt-2">
          <summary className="cursor-pointer" style={{ color: 'var(--accent)' }}>cover letter</summary>
          <textarea defaultValue={letter} rows={14} className={`${input} mt-1 font-mono text-[11px]`} />
          <button onClick={() => navigator.clipboard?.writeText(letter)} className="mt-1 chip">copy</button>
        </details>
      )}
    </div>
  )
}

function TopView({
  entries, profile, weights, ctx, applied, descs, expanded, selected, onToggleExpand, onToggleSelect, onApply, appliedLog,
}: {
  entries: TopEntry[]
  profile: import('./lib/requirements').Profile
  weights: import('./lib/score').Weights
  ctx: Ctx
  applied: Set<string>
  descs: Record<string, string>
  expanded: Set<string>
  selected: Set<string>
  onToggleExpand: (id: string) => void
  onToggleSelect: (id: string) => void
  onApply: (job: Job, next: boolean) => void
  appliedLog: AppliedLog
}) {
  if (!entries.length) return <p className="p-4 text-sm muted">Nothing yet — the pool is empty or everything is filtered out.</p>
  return (
    <div>
      <p className="px-3 py-2 text-[11px] faint">
        Best across every lane, ranked on fit and how winnable each one is. One entry per role — a job posted
        once per shift appears once — and no employer takes more than {PER_EMPLOYER} places, so the list shows
        the range of what is out there rather than one company&rsquo;s hiring plan.
      </p>
      <ul>
        {entries.map((e) => (
          <li key={e.job.id}>
            <JobRow
              job={descs[e.job.id] ? { ...e.job, descText: descs[e.job.id] } : e.job}
              profile={profile}
              weights={weights}
              ctx={ctx}
              applied={applied.has(keyOf(e.job))}
              selected={selected.has(e.job.id)}
              expanded={expanded.has(e.job.id)}
              deadReq={isDeadReq(e.job, appliedLog)}
              description={descs[e.job.id]}
              onToggleExpand={() => onToggleExpand(e.job.id)}
              onToggleSelect={() => onToggleSelect(e.job.id)}
              onApply={(next) => onApply(e.job, next)}
            />
            {e.variants.length > 0 && (
              <p className="border-b line px-3 pb-2 pl-9 text-[11px] faint">
                same role posted {e.variants.length + 1} times with different shifts
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function AppliedView({ list, onStatus, log }: { list: import('./types').Applied[]; onStatus: (k: string, s: import('./types').Applied['status']) => void; log: AppliedLog }) {
  if (!list.length) return <p className="p-4 text-sm muted">Nothing logged yet. Tick “I applied” on a job and it lands here.</p>
  const counts = list.reduce<Record<string, number>>((a, e) => ({ ...a, [e.status]: (a[e.status] ?? 0) + 1 }), {})
  return (
    <div>
      <div className="flex flex-wrap gap-2 px-3 py-2 text-[11px]">
        {Object.entries(counts).map(([s, n]) => <Chip key={s} tone={s === 'ghosted' ? 'bad' : s === 'applied' ? 'plain' : 'good'}>{s} {n}</Chip>)}
        <button
          onClick={() => {
            const blob = new Blob([exportApplied(log)], { type: 'application/json' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = 'applications.json'
            a.click()
          }}
          className="chip"
          style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}
        >
          export
        </button>
      </div>
      <ul>
        {list.map((e) => (
          <li key={e.key} className="flex items-center gap-2 border-b line px-3 py-2 text-xs">
            <span className="min-w-0 flex-1">
              <a href={e.url} target="_blank" rel="noreferrer" className="font-medium">{e.title}</a>
              <span className="muted"> · {e.company}</span>
              <span className="faint"> · {new Date(e.at).toLocaleDateString()}</span>
            </span>
            <select value={e.status} onChange={(ev) => onStatus(e.key, ev.target.value as import('./types').Applied['status'])} className="rounded border line bg-transparent px-1 py-0.5 text-[11px]">
              {['applied', 'replied', 'interviewing', 'offer', 'rejected', 'ghosted'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </li>
        ))}
      </ul>
    </div>
  )
}

function DupesView({ jobs }: { jobs: Job[] }) {
  if (!jobs.length) return <p className="p-4 text-sm muted">No duplicates merged in this scan.</p>
  return (
    <div>
      <p className="px-3 py-2 text-[11px] faint">
        Every merge is listed so a wrong one is visible. The kept link is always the company’s own board.
      </p>
      <ul>
        {jobs.map((j) => (
          <li key={j.id} className="border-b line px-3 py-2 text-xs">
            <p className="font-medium">{j.title} <span className="muted">· {j.company}</span></p>
            <p className="faint">kept: <a href={j.url} target="_blank" rel="noreferrer">{j.source}</a> · also on {j.alsoOn.map((o) => o.source).join(', ')} · {boardCount(j)} boards</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SettingsView({ settings, onChange, onResetLanes }: { settings: Settings; onChange: (s: Settings) => void; onResetLanes: () => void }) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v })
  return (
    <div className="space-y-4 p-3">
      <Field label="Anthropic API key" hint="Stored on this device only, apart from everything else, so it can never ride along in an export.">
        <input type="password" value={settings.apiKey} onChange={(e) => set('apiKey', e.target.value)} className={input} placeholder="sk-ant-…" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Pay floor ($/hr)"><input type="number" value={settings.floorHourly} onChange={(e) => set('floorHourly', Number(e.target.value))} className={input} /></Field>
        <Field label="Commute (minutes)"><input type="number" value={settings.maxMinutes} onChange={(e) => set('maxMinutes', Number(e.target.value))} className={input} /></Field>
        <Field label="Years of experience"><input type="number" value={settings.profile.years} onChange={(e) => set('profile', { ...settings.profile, years: Number(e.target.value) })} className={input} /></Field>
        <Field label="Clearance">
          <select value={settings.profile.clearance} onChange={(e) => set('profile', { ...settings.profile, clearance: e.target.value as 'none' | 'obtainable' | 'active' })} className={input}>
            <option value="none">none yet (eligible)</option>
            <option value="active">active</option>
          </select>
        </Field>
      </div>
      <div className="space-y-3">
        <p className="text-[11px] faint">
          Logistics carry {Math.round(LOGISTICS_SHARE * 100)}% of the fit and the job itself {Math.round((1 - LOGISTICS_SHARE) * 100)}%.
          Within each group the weighting is an argument, not a fact.
        </p>
        {([['Logistics', LOGISTICS], ['The job itself', FIT]] as const).map(([heading, ids]) => (
          <div key={heading}>
            <p className="mb-1 text-[11px] uppercase tracking-wide faint">{heading}</p>
            {ids.map((id: AxisId) => (
              <label key={id} className="flex items-center gap-2 py-0.5 text-xs">
                <span className="w-32 muted">{AXIS_LABELS[id]}</span>
                <input type="range" min={0} max={4} step={0.5} value={settings.weights[id]} onChange={(e) => set('weights', { ...settings.weights, [id]: Number(e.target.value) })} className="flex-1" />
                <span className="tabular w-6">{settings.weights[id]}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
      <button onClick={onResetLanes} className="chip">reset lanes to defaults</button>
      <p className="text-[11px] faint">Build {__BUILD__}</p>
    </div>
  )
}
