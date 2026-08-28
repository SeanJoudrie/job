import type { Job } from '../types'

/**
 * The index is small and loads at once; descriptions are 8.5 MB in total and
 * load only when something actually needs one. Chunked so opening a job pulls
 * roughly a sixteenth of the set rather than all of it.
 */

const BASE = import.meta.env.BASE_URL
export type Index = { generatedAt: string; count: number; chunks: number; jobs: Job[] }

export async function loadIndex(): Promise<Index> {
  const res = await fetch(`${BASE}data/jobs.json`, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`could not load the job index (${res.status})`)
  return (await res.json()) as Index
}

const chunkOf = (id: string, chunks: number) => {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h) % chunks
}

const cache = new Map<number, Promise<Record<string, string>>>()

export function loadDescriptions(ids: string[], chunks: number): Promise<Record<string, string>> {
  const wanted = new Set(ids.map((id) => chunkOf(id, chunks)))
  const parts = [...wanted].map((n) => {
    let p = cache.get(n)
    if (!p) {
      p = fetch(`${BASE}data/desc-${String(n).padStart(2, '0')}.json`)
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({}))
      cache.set(n, p)
    }
    return p
  })
  return Promise.all(parts).then((all) => Object.assign({}, ...all) as Record<string, string>)
}
