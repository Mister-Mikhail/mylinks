import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'

export async function mockLayout(page: Page, failUpload = false, displayName = 'Тестовый профиль', options: {profile?:Record<string,unknown>; links?:Record<string,unknown>[]; contacts?:Record<string,unknown>[]} = {}) {
  const id = '00000000-0000-4000-8000-000000000001'
  const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp: 2100000000, role: 'authenticated' })).toString('base64url')}.signature`
  await page.addInitScript(({ id, token }) => localStorage.setItem('sb-loykiawbqdkitndqkegk-auth-token', JSON.stringify({ access_token: token, refresh_token: 'test-refresh', expires_at: 2100000000, expires_in: 3600, token_type: 'bearer', user: { id, email: 'test@example.com', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2025-01-01T00:00:00Z' } })), { id, token })
  let profile = { id, handle: 'sample-user', display_name: displayName, bio: 'Мои проекты', avatar_url: null, avatar_path: null, avatar_shape: 'round', avatar_size: 'medium', avatar_scale: 28, background_preset: 'midnight', card_preset: 'glass', is_published: true, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z', ...options.profile }
  let links: Record<string, unknown>[] = options.links ?? [{ id: 'link-test', profile_id: id, label: 'Мой сайт', url: 'https://example.com', icon_key: 'website', position: 0, is_visible: true, is_sensitive: false }]
  const patches: Record<string, unknown>[] = []
  const uploads: Buffer[] = []
  let savedImage: Buffer | null = null
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  const preview = readFileSync('tests/fixtures/avatar.webp').toString('base64')
  const delivery = readFileSync('tests/fixtures/avatar-delivery.webp').toString('base64')
  const master = readFileSync('tests/fixtures/avatar-master.webp').toString('base64')
  await page.route('**/profile-image-process.php', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ mime: 'image/webp', data: preview }),
  }))
  await page.route('**/avatar-process.php', route => {
    const data = route.request().postDataBuffer()?.toString('latin1') || ''
    if (data.includes('prepare')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ token: 'abcdef0123456789abcdef0123456789', kind: 'image', preview: `data:image/webp;base64,${preview}`, width: 64, height: 64 }) })
    if (data.includes('discard')) return route.fulfill({ contentType: 'application/json', body: '{"discarded":true}' })
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ kind: 'image', delivery: { mime: 'image/webp', data: delivery }, master: { mime: 'image/webp', data: master }, poster: null }) })
  })
  await page.route('**/rest/v1/**', async route => {
    const request = route.request()
    const name = new URL(request.url()).pathname.split('/').pop()
    if (name === 'staff_role') return route.fulfill({ contentType: 'application/json', body: 'null' })
    if (name === 'profiles' && request.method() === 'PATCH') {
      const patch = request.postDataJSON()
      patches.push(patch); profile = { ...profile, ...patch }
      return route.fulfill({ status: 204 })
    }
    if (name === 'profile_links' && request.method() === 'POST') { links = request.postDataJSON(); return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(links) }) }
    const data = name === 'profiles' ? profile : name === 'profile_links' ? links : name === 'profile_contacts' ? options.contacts ?? [] : []
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  })
  await page.route('**/storage/v1/**', async route => {
    const req = route.request()
    if (req.method() === 'GET' && savedImage) return route.fulfill({ contentType: 'image/webp', body: savedImage })
    if (req.url().includes('/object/sign/')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ signedURL: '/object/sign/avatars/test.webp?token=test' }) })
    if (req.method() === 'POST') {
      const body = req.postDataBuffer()!
      uploads.push(body)
      const start = body.indexOf(Buffer.from('RIFF'))
      savedImage = body.subarray(start, start + body.readUInt32LE(start + 4) + 8)
      await new Promise(resolve => setTimeout(resolve, 200))
      if (failUpload) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Upload failed' }) })
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ Key: 'avatars/test.webp' }) })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Оформление', exact: true }).click()
  return { patches, uploads, pageErrors }
}

