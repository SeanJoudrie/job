import { useEffect, useMemo, useState } from 'react'
import { JobRow } from './components/JobRow'
import { Chip, Field, input } from './components/ui'
import { isDeadReq, keyOf, loadApplied, markApplied, setStatus, unmarkApplied, withGhosting, exportApplied, type AppliedLog } from './lib/applied'
import { loadDescriptions, loadIndex, type Index } from './lib/data'
import { boardCount } from './lib/dedupe'
import { defaultLanes, describeRule, mkRule, runNet, type Net, type Rule } from './lib/nets'
import { axesFor, AXIS_LABELS, scoreOf, variantFor, type AxisId } from './lib/score'
import { loadSettings, saveSettings, type Settings } from './lib/settings'
import { read, write } from './lib/storage'
import type { Job } from './types'
import { coverLetter, scoreJob, type Verdict } from './lib/claude'

type View = 'pool' | 'applied' | 'dupes' | 'settings'
type Sort = 'fit' | 'commute' | 'pay' | 'newest' | 'title'
const PAGE = 60

export default function App() {
  const [index, setIndex] = useState<Index | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [nets, setNets] = useState<Net[]>(() => read<Net[]>('job.nets.v1', defaultLanes(loadSettings().floorHourly)))
  const [laneId, setLaneId] = useState<string>(() => read<string>('job.lane.v1', 'easy'))
  const [applied, setApplied] = useState<AppliedLog>(() => withGhosting(loadApplied()))
  const [view, setView] = useState<View>('pool')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('fit')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [descs, setDescs] = useState<Record<string, string>>({})
  const [limit, setLimit] = useState(PAGE)
  const [showStack, setShowStack] = useState(false)
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>(() => read('job.verdicts.v1', {}))
  const [letters, setLetters] = useState<Record<string, string>>(() => read('job.letters.v1', {}))
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    loadIndex().then(setIndex).catch((e: Error) => setError(e.message))
  }, [])
  useEffect(() => void write('job.nets.v1', nets), [nets])
  useEffect(() => void write('job.lane.v1', laneId), [laneId])
  useEffect(() => void write('job.verdicts.v1', verdicts), [verdicts])
  useEffect(() => void write('job.letters.v1', letters), [letters])

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
    const withScore = searched.map((j) => ({ j, s: scoreOf(axesFor(j, settings.profile), settings.weights) }))
    const cmp: Record<Sort, (a: (typeof withScore)[0], b: (typeof withScore)[0]) => number> = {
      fit: (a, b) => b.s - a.s,
      commute: (a, b) => (a.j.miles ?? 9e9) - (b.j.miles ?? 9e9),
      pay: (a, b) => payOf(b.j) - payOf(a.j),
      newest: (a, b) => (b.j.postedAt ?? '').localeCompare(a.j.postedAt ?? ''),
      title: (a, b) => a.j.title.localeCompare(b.j.title),
    }
    return [...withScore].sort(cmp[sort]).map((x) => x.j)
  }, [searched, sort, settings])

  useEffect(() => setLimit(PAGE), [laneId, query, sort])

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
        const text = await coverLetter(hydrate(job), variantFor(job), settings.apiKey)
        setLetters((prev) => ({ ...prev, [job.id]: text }))
      } catch (e) {
        setBusy(`Stopped on ${job.title}: ${(e as Error).message}`)
        return
      }
    }
    setBusy(null)
  }

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
            {(['pool', 'applied', 'dupes', 'settings'] as View[]).map((v) => (
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
              </select>
            </div>
            <div className="flex items-center gap-3 px-3 pb-2 text-[11px]">
              <button onClick={() => setShowStack(!showStack)} style={{ color: 'var(--accent)' }}>
                {showStack ? 'hide' : 'show'} the {lane.rules.length} rules
              </button>
              <span className="muted tabular">{sorted.length} showing</span>
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
          <ul>
            {sorted.slice(0, limit).map((job) => (
              <div key={job.id}>
                <JobRow
                  job={hydrate(job)}
                  profile={settings.profile}
                  weights={settings.weights}
                  applied={appliedKeys.has(keyOf(job))}
                  selected={selected.has(job.id)}
                  expanded={expanded.has(job.id)}
                  deadReq={isDeadReq(job, applied)}
                  description={descs[job.id]}
                  query={query}
                  onToggleExpand={() => setExpanded(toggle(expanded, job.id))}
                  onToggleSelect={() => setSelected(toggle(selected, job.id))}
                  onApply={(next) => apply(job, next)}
                />
                {(verdicts[job.id] || letters[job.id]) && (
                  <VerdictBlock verdict={verdicts[job.id]} letter={letters[job.id]} />
                )}
              </div>
            ))}
          </ul>
          {sorted.length === 0 && <Empty lane={lane} steps={steps} />}
          {limit < sorted.length && (
            <button onClick={() => setLimit(limit + PAGE)} className="w-full py-4 text-center text-xs" style={{ color: 'var(--accent)' }}>
              show more ({sorted.length - limit} below)
            </button>
          )}
        </>
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
          onResetLanes={() => setNets(defaultLanes(settings.floorHourly))}
        />
      )}
    </Shell>
  )
}

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
      {lane.rules.map((rule, i) => {
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
            <span className="sr-only">{i}</span>
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
        <Field label="Radius (miles)"><input type="number" value={settings.miles} onChange={(e) => set('miles', Number(e.target.value))} className={input} /></Field>
        <Field label="Years of experience"><input type="number" value={settings.profile.years} onChange={(e) => set('profile', { ...settings.profile, years: Number(e.target.value) })} className={input} /></Field>
        <Field label="Clearance">
          <select value={settings.profile.clearance} onChange={(e) => set('profile', { ...settings.profile, clearance: e.target.value as 'none' | 'obtainable' | 'active' })} className={input}>
            <option value="none">none yet (eligible)</option>
            <option value="active">active</option>
          </select>
        </Field>
      </div>
      <div>
        <p className="mb-1 text-[11px] uppercase tracking-wide faint">Weights — the default weighting is an argument, not a fact</p>
        {(Object.keys(settings.weights) as AxisId[]).map((id) => (
          <label key={id} className="flex items-center gap-2 py-0.5 text-xs">
            <span className="w-32 muted">{AXIS_LABELS[id]}</span>
            <input type="range" min={0} max={4} step={0.5} value={settings.weights[id]} onChange={(e) => set('weights', { ...settings.weights, [id]: Number(e.target.value) })} className="flex-1" />
            <span className="tabular w-6">{settings.weights[id]}</span>
          </label>
        ))}
      </div>
      <button onClick={onResetLanes} className="chip">reset lanes to defaults</button>
      <p className="text-[11px] faint">Build {__BUILD__}</p>
    </div>
  )
}
