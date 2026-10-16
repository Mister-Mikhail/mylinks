// One-time backfill after the icon_snapshot_path migration and site release.
// Public RLS excludes private, moderated and hidden links from the scan.
const api = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const site = process.env.SITE_URL || 'https://mylinks.bar'
if (!api || !key) throw new Error('Supabase URL and publishable key required')
const paths = new Set()
for (let offset = 0; ; offset += 500) {
  const response = await fetch(`${api}/rest/v1/profile_links?select=icon_snapshot_path,profiles!inner(handle,is_published)&is_visible=eq.true&profiles.is_published=eq.true&limit=500&offset=${offset}`, {
    headers: { apikey: key },
  })
  if (!response.ok) throw new Error(`Icon migration must be applied first (${response.status})`)
  const rows = await response.json()
  for (const row of rows) if (/^\/link-icon\/[a-f0-9-]{36}\/[a-f0-9]{12}\.png$/.test(row.icon_snapshot_path) && /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/.test(row.profiles?.handle ?? '')) paths.add(row.icon_snapshot_path.replace('/link-icon/', `/link-icon/${row.profiles.handle}/`))
  if (rows.length < 500) break
}
let index = 0
let ready = 0
let unavailable = 0
const urls = [...paths]
await Promise.all(Array.from({ length: 4 }, async () => {
  while (index < urls.length) {
    const path = urls[index++]
    try {
      const response = await fetch(new URL(path, site), { signal: AbortSignal.timeout(20000) })
      if (response.ok && response.headers.get('content-type')?.includes('image/png')) ready++
      else unavailable++
      await response.arrayBuffer()
    } catch { unavailable++ }
  }
}))
console.log(`Icon snapshots: ${ready} ready, ${unavailable} unavailable`)
