// Public favicon proxy for link cards: GET /functions/v1/favicon?domain=example.com
// Finds the icon the site itself declares (<link rel="icon">, apple-touch-icon, SVG),
// falls back to /favicon.ico and to the main domain, and returns the image bytes.
// No Google/DuckDuckGo involved. Browsers cache the answer for a week.
// Public on purpose (verify_jwt=false): <img> tags cannot send auth headers; the function
// only fetches public pages/images of a validated hostname and caps every download.

const UA = 'Mozilla/5.0 (compatible; mylinks.bar-favicon/1.0; +https://mylinks.bar)'
const MAX_HTML = 400 * 1024
const MAX_ICON = 512 * 1024
const TIMEOUT = 5000
const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'msk', 'spb'])
const memory = new Map<string, { body: Uint8Array; type: string; at: number }>()

const headers = (type: string, maxAge: number) => ({
  'Content-Type': type,
  'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}`,
  'Access-Control-Allow-Origin': '*',
  'X-Content-Type-Options': 'nosniff',
  // SVG icons must never run scripts if someone opens the URL directly.
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
})

const validHost = (host: string) =>
  /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) && !/^(localhost|.*\.local|.*\.internal)$/.test(host)

const mainDomain = (host: string) => {
  const labels = host.split('.')
  if (labels.length <= 2) return host
  return labels.slice(SECOND_LEVEL.has(labels[labels.length - 2]) ? -3 : -2).join('.')
}

async function fetchLimited(url: string, limit: number, accept: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT)
  try {
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': UA, Accept: accept } })
    if (!response.ok || !response.body) return null
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > limit) { await reader.cancel(); if (accept.startsWith('text')) break; return null }
      chunks.push(value)
    }
    const body = new Uint8Array(size > limit ? chunks.reduce((n, c) => n + c.length, 0) : size)
    let offset = 0
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length }
    return { body, type: response.headers.get('content-type') ?? '', url: response.url || url }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

interface Candidate { href: string; score: number }

function declaredIcons(html: string, base: string): Candidate[] {
  const result: Candidate[] = []
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attr = (name: string) => tag.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find((v) => v !== undefined) ?? ''
    const rel = attr('rel').toLowerCase()
    if (!rel.includes('icon') || rel.includes('mask-icon')) continue
    const href = attr('href')
    if (!href) continue
    let absolute: string
    try { absolute = new URL(href.replace(/&amp;/g, '&'), base).href } catch { continue }
    const sizes = attr('sizes').toLowerCase()
    const size = sizes === 'any' ? 256 : Math.max(0, ...sizes.split(/\s+/).map((s) => parseInt(s, 10) || 0))
    const type = attr('type').toLowerCase()
    let score = size || (rel.includes('apple-touch-icon') ? 180 : 32)
    if (type.includes('svg') || /\.svg(\?|$)/i.test(absolute)) score = 300
    if (score > 512) score = 200 // huge splash-like icons are slow; still fine as a fallback
    result.push({ href: absolute, score })
  }
  return result.sort((a, b) => b.score - a.score)
}

const looksLikeImage = (type: string, url: string, body: Uint8Array) => {
  if (body.length < 50) return false
  if (type.startsWith('image/')) return true
  if (/\.(ico|png|svg|jpe?g|gif|webp)(\?|$)/i.test(url) && !type.includes('html')) return true
  const head = new TextDecoder().decode(body.subarray(0, 120)).trimStart()
  return head.startsWith('<svg') || head.startsWith('<?xml')
}

const imageType = (type: string, url: string, body: Uint8Array) => {
  if (type.startsWith('image/')) return type.split(';')[0]
  if (/\.svg(\?|$)/i.test(url) || new TextDecoder().decode(body.subarray(0, 120)).includes('<svg')) return 'image/svg+xml'
  if (/\.png(\?|$)/i.test(url)) return 'image/png'
  return 'image/x-icon'
}

async function iconFor(host: string, rasterOnly = false) {
  const candidates: Candidate[] = []
  const page = await fetchLimited(`https://${host}/`, MAX_HTML, 'text/html,application/xhtml+xml')
    ?? await fetchLimited(`https://www.${host}/`, MAX_HTML, 'text/html,application/xhtml+xml')
  if (page && page.type.includes('html')) candidates.push(...declaredIcons(new TextDecoder().decode(page.body), page.url))
  const origin = page ? new URL(page.url).origin : `https://${host}`
  candidates.push({ href: `${origin}/apple-touch-icon.png`, score: 1 }, { href: `${origin}/favicon.ico`, score: 0 })
  const seen = new Set<string>()
  for (const { href } of candidates) {
    if (seen.has(href) || seen.size >= 6) continue
    seen.add(href)
    if (!/^https?:/i.test(href)) continue
    const icon = await fetchLimited(href, MAX_ICON, 'image/avif,image/webp,image/svg+xml,image/*,*/*;q=0.8')
    if (icon && looksLikeImage(icon.type, icon.url, icon.body)) {
      const type = imageType(icon.type, icon.url, icon.body)
      if (rasterOnly && (type.includes('svg') || type.includes('icon'))) continue
      return { body: icon.body, type }
    }
  }
  return null
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET' } })
  const params = new URL(request.url).searchParams
  const host = (params.get('domain') ?? '').trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '')
  const rasterOnly = params.get('raster') === '1'
  if (!validHost(host)) return new Response('bad domain', { status: 400, headers: headers('text/plain', 3600) })

  const cached = memory.get(`${host}:${rasterOnly}`)
  if (cached && Date.now() - cached.at < 6 * 3600_000) return new Response(cached.body, { headers: headers(cached.type, 604800) })

  let icon = await iconFor(host, rasterOnly)
  const parent = mainDomain(host)
  if (!icon && parent !== host) icon = await iconFor(parent, rasterOnly)
  if (!icon) return new Response('not found', { status: 404, headers: headers('text/plain', 86400) })

  if (memory.size > 500) memory.clear()
  memory.set(`${host}:${rasterOnly}`, { ...icon, at: Date.now() })
  return new Response(icon.body, { headers: headers(icon.type, 604800) })
})
