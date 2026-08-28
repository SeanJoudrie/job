import type { ReactNode } from 'react'

export function Chip({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'good' | 'warn' | 'bad' | 'accent' }) {
  const color = { plain: 'var(--muted)', good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)', accent: 'var(--accent)' }[tone]
  return (
    <span className="chip" style={{ color, borderColor: color === 'var(--muted)' ? 'var(--line)' : color }}>
      {children}
    </span>
  )
}

export function Bar({ value, max = 10 }: { value: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const tone = value >= 7 ? 'var(--good)' : value >= 4 ? 'var(--warn)' : 'var(--bad)'
  return (
    <span aria-hidden className="inline-block h-1.5 w-16 rounded-full align-middle" style={{ background: 'var(--line)' }}>
      <span className="block h-1.5 rounded-full" style={{ width: `${pct}%`, background: tone }} />
    </span>
  )
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex items-center gap-2 text-xs"
    >
      <span
        className="inline-block h-4 w-7 rounded-full transition-colors"
        style={{ background: on ? 'var(--accent)' : 'var(--line)' }}
      >
        <span
          className="mt-0.5 block h-3 w-3 rounded-full bg-white transition-transform"
          style={{ transform: on ? 'translateX(15px)' : 'translateX(2px)' }}
        />
      </span>
      {label}
    </button>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] uppercase tracking-wide faint">{label}</span>
      {children}
      {hint && <span className="block text-[11px] faint">{hint}</span>}
    </label>
  )
}

export const input = 'w-full rounded border line bg-transparent px-2 py-1.5 text-sm'
