import { safeFetch, validHost } from './safe-fetch.ts'
import { getDomain } from 'npm:tldts@7.0.22'
// Public favicon proxy for link cards: GET /functions/v1/favicon?domain=example.com
// Finds the icon the site itself declares (<link rel="icon">, apple-touch-icon, SVG),
// falls back to /favicon.ico and to the main domain, and returns the image bytes.
// No Google/DuckDuckGo involved. Browsers cache the answer for a week.
// Public on purpose (verify_jwt=false): <img> tags cannot send auth headers; the function
// only fetches public pages/images of a validated hostname and caps every download.

const UA = 'Mozilla/5.0 (compatible; mylinks.bar-favicon/1.0; +https://mylinks.bar)'
const MAX_HTML = 400 * 1024
const MAX_ICON = 512 * 1024
const TIMEOUT = 2400
const misses = new Map<string, {at:number;count:number}>()
const memory = new Map<string, { body: Uint8Array; type: string; at: number }>()

const headers = (type: string, maxAge: number) => ({
  'Content-Type': type,
  'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}`,
  'Access-Control-Allow-Origin': '*',
  'X-Content-Type-Options': 'nosniff',
  // SVG icons must never run scripts if someone opens the URL directly.
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
})

const mainDomain = (host: string) => getDomain(host, { allowPrivateDomains: true }) || host
const fetchLimited = (url: string, limit: number, accept: string, deadline: number) => safeFetch(url, limit, accept, UA, Math.max(1, Math.min(TIMEOUT, deadline - Date.now())))

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

async function iconFor(host: string, deadline: number, rasterOnly = false) {
  const seen = new Set<string>()
  type Icon = {body:Uint8Array;type:string}
  const first = (jobs: Promise<Icon|null>[]) => new Promise<Icon|null>(resolve=>{
    if(!jobs.length){resolve(null);return}
    let pending=jobs.length
    for(const job of jobs)void job.then(value=>{if(value)resolve(value);if(--pending===0)resolve(null)})
  })
  const candidate = async (href:string):Promise<Icon|null> => {
    if(seen.has(href)||seen.size>=12||Date.now()>=deadline)return null
    seen.add(href)
    const icon=await fetchLimited(href,MAX_ICON,'image/svg+xml,image/*,*/*;q=0.8',deadline)
    if(!icon||!looksLikeImage(icon.type,icon.url,icon.body))return null
    const type=imageType(icon.type,icon.url,icon.body)
    if(rasterOnly&&(type.includes('svg')||type.includes('icon')))return null
    return {body:icon.body,type}
  }
  const declared = async (origin:string) => {
    const page=await fetchLimited(origin+'/',MAX_HTML,'text/html,application/xhtml+xml',deadline)
    if(!page||!page.type.includes('html'))return null
    return first(declaredIcons(new TextDecoder().decode(page.body),page.url).slice(0,8).map(({href})=>candidate(href)))
  }
  const origin='https://'+host
  return first([candidate(origin+'/favicon.ico'),candidate(origin+'/apple-touch-icon.png'),declared(origin),declared('https://www.'+host)])
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET' } })
  const params = new URL(request.url).searchParams
  const host = (params.get('domain') ?? '').trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '')
  const rasterOnly = params.get('raster') === '1'
  if (!validHost(host)) return new Response('bad domain', { status: 400, headers: headers('text/plain', 3600) })

  const cached = memory.get(`${host}:${rasterOnly}`)
  if (cached && Date.now() - cached.at < 6 * 3600_000) return new Response(new Uint8Array(cached.body).buffer, { headers: headers(cached.type, 21600) })

  const now = Date.now()
  if (misses.size > 1000) misses.clear()
  const count = misses.get(host)
  if (count && now - count.at < 60000 && count.count >= 12) return new Response('try later', {status: 429, headers: {...headers('text/plain',0),'Retry-After':'60'}})
  misses.set(host, {at: count && now-count.at < 60000 ? count.at : now, count: count && now-count.at < 60000 ? count.count+1 : 1})
  const budget = Math.min(9000, Math.max(100, Number(params.get('budget_ms')) || 9000))
  const deadline = Date.now() + budget
  const parent = mainDomain(host)
  const jobs = [iconFor(host, deadline, rasterOnly), ...(parent !== host ? [iconFor(parent, deadline, rasterOnly)] : [])]
  let timer: ReturnType<typeof setTimeout> | undefined
  const found = new Promise<Awaited<ReturnType<typeof iconFor>>>(resolve=>{let pending=jobs.length;for(const job of jobs)void job.then(icon=>{if(icon)resolve(icon);if(--pending===0)resolve(null)})})
  const icon = await Promise.race([found,new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),budget)})]).finally(()=>clearTimeout(timer))
  if (!icon) return new Response('not found', { status: 404, headers: headers('text/plain', 86400) })

  if (memory.size > 500) memory.clear()
  memory.set(`${host}:${rasterOnly}`, { ...icon, at: Date.now() })
  return new Response(new Uint8Array(icon.body).buffer, { headers: headers(icon.type, 21600) })
})
