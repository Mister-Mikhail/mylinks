import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const id = '00000000-0000-4000-8000-000000000091'
const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp: 2100000000, role: 'authenticated' })).toString('base64url')}.signature`
export async function mockWizard(page: Page, seedSession = true) {
  if (seedSession) await page.addInitScript(({ id, token }) => localStorage.setItem('sb-loykiawbqdkitndqkegk-auth-token', JSON.stringify({ access_token: token, refresh_token: 'test-refresh', expires_at: 2100000000, expires_in: 3600, token_type: 'bearer', user: { id, email: 'test@example.com', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-10-13T00:00:00Z' } })), { id, token })
  const state: { profile: Record<string, unknown>; submitted?: Record<string, unknown>; contacts: unknown[]; links: unknown[]; uploads: number } = {
    profile: { id, handle: 'draft-abc', display_name: '', bio: '', avatar_url: null, avatar_path: null, avatar_shape: 'round', avatar_size: 'medium', avatar_scale: 28, background_preset: 'midnight', card_preset: 'glass', is_published: false, onboarding_completed: false, onboarding_progress: {}, created_at: '2026-10-13T00:00:00Z', updated_at: '2026-10-13T00:00:00Z' }, contacts: [], links: [], uploads: 0,
  }
  await page.route('**/rest/v1/**', route => {
    const request = route.request(), name = new URL(request.url()).pathname.split('/').pop()
    const body = request.method() === 'GET' ? {} : request.postDataJSON()
    if (name === 'profiles' && request.method() === 'PATCH') { state.profile = { ...state.profile, ...body }; return route.fulfill({ status: 204 }) }
    if (name === 'save_onboarding_identity') {
      if (body.profile_handle === 'taken.name') return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'User name некорректен или уже занят.' }) })
      state.profile = { ...state.profile, display_name: body.profile_name, handle: body.profile_handle }
      return route.fulfill({ contentType: 'application/json', body: 'null' })
    }
    if (name === 'complete_onboarding') {
      state.submitted = body.payload; state.profile = { ...state.profile, ...body.payload, onboarding_completed: true, onboarding_progress: {} }
      state.links = body.payload.links.map((link: Record<string, unknown>, position: number) => ({ ...link, id: `link-${position}`, profile_id: id, position, is_visible: true }))
      if (body.payload.contact.value) state.contacts = [{ ...body.payload.contact, id: 'contact-test', profile_id: id, position: 0 }]
      return route.fulfill({ contentType: 'application/json', body: 'null' })
    }
    const data = name === 'profiles' ? state.profile : name === 'profile_contacts' ? state.contacts : name === 'profile_links' ? state.links : name === 'temporary_account_session' ? { is_temporary: false } : name === 'staff_role' ? null : name === 'is_handle_available' ? body.candidate !== 'taken.name' : []
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  })
  const stored = new Map<string, { body: Buffer; type: string }>()
  let sourceKind: 'image' | 'video' | 'gif' = 'image'
  const still = readFileSync('tests/fixtures/avatar.webp').toString('base64')
  const deliveryImage = readFileSync('tests/fixtures/avatar-delivery.webp').toString('base64')
  const masterImage = readFileSync('tests/fixtures/avatar-master.webp').toString('base64')
  const deliveryVideo = readFileSync('tests/fixtures/avatar-delivery.mp4').toString('base64')
  const masterVideo = readFileSync('tests/fixtures/avatar-master.mp4').toString('base64')
  await page.route('**/avatar-process.php', route => {
    const data = route.request().postDataBuffer()?.toString('latin1') || ''
    if (data.includes('prepare')) {
      sourceKind = data.includes('motion.gif') ? 'gif' : /motion\.webm|long\.webm|iphone\.mov/.test(data) ? 'video' : 'image'
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        token: 'abcdef0123456789abcdef0123456789', kind: sourceKind,
        preview: `data:image/webp;base64,${still}`, width: 64, height: 64,
      }) })
    }
    const animated = sourceKind !== 'image'
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      kind: animated ? 'video' : 'image',
      delivery: { mime: animated ? 'video/mp4' : 'image/webp', data: animated ? deliveryVideo : deliveryImage },
      master: { mime: animated ? 'video/mp4' : 'image/webp', data: animated ? masterVideo : masterImage },
      poster: animated ? { mime: 'image/webp', data: deliveryImage } : null,
    }) })
  })
  await page.route('**/storage/v1/**', route => {
    const request = route.request(), url = new URL(request.url())
    const path = decodeURIComponent(url.pathname.split('/avatars/')[1] || '')
    if (request.method() === 'GET') {
      const file = stored.get(path)
      return file ? route.fulfill({ contentType: file.type, body: file.body }) : route.fulfill({ status: 404 })
    }
    if (url.pathname.includes('/object/sign/')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ signedURL: `/object/sign/avatars/${path}?token=test` }) })
    if (request.method() === 'POST') {
      state.uploads++
      const body = request.postDataBuffer()!, fileHeader = body.indexOf(Buffer.from('filename=')), start = body.indexOf(Buffer.from('\r\n\r\n'), fileHeader) + 4
      const type = body.subarray(fileHeader, start).toString().match(/Content-Type: ([^\r]+)/i)?.[1] || 'application/octet-stream'
      stored.set(path, { body: body.subarray(start, body.lastIndexOf(Buffer.from('\r\n--'))), type })
    }
    return route.fulfill({ contentType: 'application/json', body: '{"Key":"avatars/test.webp"}' })
  })
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64') }))
  await page.goto('/')
  return state
}
