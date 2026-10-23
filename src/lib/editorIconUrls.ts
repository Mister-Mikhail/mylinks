import { supabase } from './supabase'
import { hostnameOf } from './favicons'

const cache = new Map<string, { url: string; expires: number }>()
const waiting = new Map<string, Array<(url: string | null) => void>>()
let scheduled = false
async function flush() {
  scheduled = false
  const batch = [...waiting.entries()].slice(0, 40)
  batch.forEach(([host]) => waiting.delete(host))
  try {
    const { data } = await supabase!.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new Error('Owner session required')
    const response = await fetch('/site-icon.php', { method: 'POST', credentials: 'same-origin', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ domains: batch.map(([host]) => host) }) })
    if (!response.ok) throw new Error('Icon authorization unavailable')
    const result = await response.json() as { urls: Record<string, string>; expires: number }
    for (const [host, callbacks] of batch) {
      const path = result.urls?.[host]
      const parsed = typeof path === 'string' && path.startsWith('/site-icon.php?') ? new URL(path, location.origin) : null
      const url = parsed?.origin === location.origin && parsed.searchParams.get('domain') === host && result.expires > Date.now() / 1000 ? path : null
      if (url) cache.set(host, { url, expires: result.expires })
      callbacks.forEach(done => done(url))
    }
  } catch { batch.forEach(([, callbacks]) => callbacks.forEach(done => done(null))) }
  if (waiting.size && !scheduled) { scheduled = true; setTimeout(() => void flush(), 0) }
}
export function editorIconUrl(value: string): Promise<string | null> {
  const host = hostnameOf(value)
  if (!host) return Promise.resolve(null)
  const saved = cache.get(host)
  if (saved && saved.expires > Date.now() / 1000 + 30) return Promise.resolve(saved.url)
  return new Promise(resolve => {
    waiting.set(host, [...(waiting.get(host) || []), resolve])
    if (!scheduled) { scheduled = true; setTimeout(() => void flush(), 0) }
  })
}
