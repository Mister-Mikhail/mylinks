import { expect, test, type Page } from '@playwright/test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import jsQR from 'jsqr'
const { PNG } = createRequire(import.meta.url)('pngjs')

const id = '00000000-0000-4000-8000-000000000001'
const handle = 'sample-user'
const authKey = 'sb-loykiawbqdkitndqkegk-auth-token'
const cacheKey = `mylinks:page:${handle}`
const user = { id, email: 'test@example.com', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2025-01-01T00:00:00Z' }
const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp: 2100000000, role: 'authenticated' })).toString('base64url')}.signature`
const session = { access_token: token, refresh_token: 'test-refresh', expires_at: 2100000000, expires_in: 3600, token_type: 'bearer', user }
const profile = { id, handle, display_name: 'Проверяемый профиль', bio: 'Мои проекты', avatar_url: null, avatar_path: null as string | null, avatar_master_path: null as string | null, avatar_poster_path: null as string | null, avatar_media: 'image' as 'image' | 'video', avatar_shape: 'round', avatar_size: 'medium', avatar_scale: 28, background_preset: 'midnight', card_preset: 'glass', is_published: true, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' }

async function mock(page: Page, options: { owner?: boolean; published?: boolean; expired?: boolean; avatar?: boolean; cachedPrivate?: boolean } = {}) {
  const state = { profile: { ...profile, is_published: options.published ?? true, avatar_path: options.avatar ? `${id}/avatar.webp` : null }, profileRequests: [] as string[], signs: [] as string[] }
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  if (options.owner) await page.addInitScript(({ authKey, session, expired }) => {
    localStorage.setItem(authKey, JSON.stringify(expired ? { ...session, expires_at: 1 } : session))
  }, { authKey, session, expired: options.expired })
  if (options.cachedPrivate) await page.addInitScript(({ cacheKey, profile }) => {
    localStorage.setItem(cacheKey, JSON.stringify({ avatarSignedAt: Date.now(), data: { profile: { ...profile, is_published: false, display_name: 'Секрет из кэша' }, links: [], contacts: [] } }))
  }, { cacheKey, profile })
  await page.route('**/auth/v1/**', async route => {
    if (options.expired && route.request().url().includes('/token')) await new Promise(resolve => setTimeout(resolve, 3500))
    const data = route.request().url().includes('/logout') ? {} : route.request().url().includes('/user') ? user : session
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) }).catch(() => {})
  })
  await page.route('**/rest/v1/**', async route => {
    const request = route.request()
    const name = new URL(request.url()).pathname.split('/').pop()
    const authenticated = request.headers()['authorization'] === `Bearer ${token}`
    if (name === 'profiles') state.profileRequests.push(authenticated ? 'owner' : 'anonymous')
    const data = name === 'profiles' ? (state.profile.is_published || authenticated ? state.profile : null)
      : name === 'profile_links' ? [{ id: 'link-test', profile_id: id, label: 'Мой сайт', url: 'https://example.com', icon_key: 'website', position: 0, is_visible: true, is_sensitive: false }]
      : name === 'staff_role' ? null : []
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  })
  await page.route('**/storage/v1/**', async route => {
    if (route.request().method() === 'POST') {
      const path = new URL(route.request().url()).pathname
      state.signs.push(path)
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ signedURL: `/object/sign/avatars/${state.profile.avatar_path}?token=fixture` }) })
    } else await route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfZkAAAAASUVORK5CYII=', 'base64') })
  })
  return { state, errors }
}

test('public profile renders without waiting for a slow session refresh', async ({ page }) => {
  const { state, errors } = await mock(page, { owner: true, expired: true })
  await page.goto(`/${handle}`)
  await expect(page.getByRole('heading', { name: profile.display_name })).toBeVisible({ timeout: 2000 })
  // React StrictMode repeats effects in the development server used by these tests.
  expect(state.profileRequests.length).toBeGreaterThan(0)
  expect(state.profileRequests.every(client => client === 'anonymous')).toBeTruthy()
  await expect(page.getByRole('link', { name: /Мой сайт/ })).toBeVisible()
  expect(errors).toEqual([])
})

test('copying the address under the name gives a clean canonical URL', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await mock(page)
  await page.goto(`/${handle}?v=older-preview-token`)
  await page.getByRole('button', { name: 'Скопировать ссылку на профиль' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`https://mylinks.bar/${handle}`)
})

test('anonymous visitors never see a cached unpublished profile', async ({ page }) => {
  await mock(page, { published: false, cachedPrivate: true })
  await page.goto(`/${handle}`)
  await expect(page.getByText('Секрет из кэша')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Страница не опубликована' })).toBeVisible()
  expect(await page.evaluate(key => localStorage.getItem(key), cacheKey)).toBeNull()
})

test('owner can see a private page, which disappears immediately on sign-out', async ({ page }) => {
  const { state } = await mock(page, { owner: true, published: false })
  await page.goto(`/${handle}`)
  await expect(page.getByRole('heading', { name: profile.display_name })).toBeVisible()
  expect(state.profileRequests[0]).toBe('anonymous')
  expect(state.profileRequests).toContain('owner')
  expect(await page.evaluate(key => localStorage.getItem(key), cacheKey)).toBeNull()
  await page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase.ts')
    await supabase.auth.signOut()
  })
  await expect(page.getByRole('heading', { name: 'Страница не опубликована' })).toBeVisible()
  await expect(page.getByRole('heading', { name: profile.display_name })).toHaveCount(0)
})

test('published profile uses stable avatar URLs without signing on repeat visits', async ({ page }) => {
  const { state } = await mock(page, { avatar: true })
  await page.goto(`/${handle}`)
  await expect(page.getByRole('heading', { name: profile.display_name })).toBeVisible()
  const first = await page.locator('.avatar img').getAttribute('src')
  const requests = state.profileRequests.length
  const signs = state.signs.length
  await page.reload()
  await expect.poll(() => state.profileRequests.length).toBeGreaterThan(requests)
  await expect(page.locator('.avatar img')).toHaveAttribute('src', first!)
  expect(state.signs).toHaveLength(signs)
  state.profile.avatar_path = `${id}/new-avatar.webp`
  await page.reload()
  await expect(page.locator('.avatar img')).toHaveAttribute('src', /\/avatar\/sample-user\/[a-f0-9]{8}-560\.webp/)
  expect(await page.locator('.avatar img').getAttribute('src')).not.toBe(first)
  expect(state.signs).toHaveLength(0)
})

test('initial HTML renders immediately and never calls favicon or signed storage URLs', async ({ page }) => {
  const { state, errors } = await mock(page, { avatar: true })
  state.profile.avatar_master_path = `${id}/master.webp`
  let forbidden = 0
  page.on('request', request => { if (/\/functions\/v1\/favicon|\/storage\/v1\/object\/sign/.test(request.url())) forbidden++ })
  await page.route(`**/${handle}`, async route => {
    const response = await route.fetch()
    const html = await response.text()
    const initial = { profile: state.profile, links: [{ id:'link-1', profile_id:id, label:'Первый проект', url:'https://example.com', icon_key:'website', icon_snapshot_path:'/link-icon/sample-user/00000000-0000-4000-8000-000000000002/123456789abc.png', position:0, is_visible:true }], contacts: [] }
    await route.fulfill({ response, body: html.replace('</head>', `<script type="application/json" id="initial-profile">${JSON.stringify(initial)}</script></head>`) })
  })
  await page.route('**/rest/v1/profiles?**', async route => { await new Promise(resolve => setTimeout(resolve, 2500)); await route.fallback() })
  await page.goto(`/${handle}`)
  await expect(page.getByRole('heading', { name: profile.display_name })).toBeVisible({ timeout: 1500 })
  await expect(page.getByRole('link', { name: /Первый проект/ })).toBeVisible()
  await expect(page.getByLabel('Загрузка профиля')).toHaveCount(0)
  await expect(page.locator('.avatar img')).toHaveAttribute('srcset', /-560\.webp 560w, .*?-1000\.webp 1000w/)
  expect(forbidden).toBe(0)
  expect(errors).toEqual([])
})

test('video avatar switches 560/1000 on a DPR 3 device when its box changes', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 }))
  const { state } = await mock(page, { avatar: true })
  state.profile.avatar_master_path = `${id}/master.mp4`
  state.profile.avatar_path = `${id}/delivery.mp4`
  state.profile.avatar_media = 'video'
  await page.route(`**/${handle}`, async route => {
    const response = await route.fetch()
    const html = await response.text()
    const initial = { profile: { ...state.profile, avatar_media: 'video' }, links: [], contacts: [] }
    await route.fulfill({ response, body: html.replace('</head>', `<script type="application/json" id="initial-profile">${JSON.stringify(initial)}</script></head>`) })
  })
  await page.route('**/avatar/**', async route => { await route.fulfill({ status: 200, contentType: 'video/mp4', body: readFileSync('tests/fixtures/avatar-delivery.mp4') }) })
  await page.goto(`/${handle}`)
  const avatar = page.locator('.profile-card__identity > .avatar')
  await avatar.evaluate(node => { (node as HTMLElement).style.width = '400px' })
  await expect(page.locator('.avatar video')).toHaveAttribute('src', /-1000\.mp4/)
  await avatar.evaluate(node => { (node as HTMLElement).style.width = '40px' })
  await expect(page.locator('.avatar video')).toHaveAttribute('src', /-560\.mp4/)
})

test('session refresh does not reload the public page or replace it with a spinner', async ({ page }) => {
  const { state } = await mock(page, { owner: true })
  await page.goto(`/${handle}`)
  await expect(page.getByRole('button', { name: 'Личный кабинет' })).toBeVisible()
  const requests = state.profileRequests.length
  await page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase.ts')
    await supabase.auth.refreshSession()
  })
  await expect(page.getByRole('heading', { name: profile.display_name })).toBeVisible()
  await expect(page.getByLabel('Загрузка профиля')).toHaveCount(0)
  expect(state.profileRequests).toHaveLength(requests)
})

test('editor and public profile buttons preserve navigation', async ({ page }) => {
  await mock(page, { owner: true })
  await page.goto('/')
  await page.getByRole('button', { name: 'Открыть страницу', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/${handle}$`))
  await page.getByRole('button', { name: 'Личный кабинет' }).click()
  await expect(page.getByRole('button', { name: 'Оформление', exact: true })).toBeVisible()
})

test('published QR and share tools appear below contacts without leaking hidden values', async ({ page }) => {
  const { state } = await mock(page)
  Object.assign(state.profile, { show_qr: true })
  await page.route('**/rest/v1/profile_contacts*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify([
    { id: 'shown', profile_id: id, kind: 'email', label: 'Почта', value: 'shown@example.com', position: 0, is_visible: true },
    { id: 'hidden', profile_id: id, kind: 'phone', label: 'Телефон', value: '+79990000000', position: 1, is_visible: false },
  ]) }))
  await page.goto(`/${handle}`)
  const qr = page.locator('.profile-share__qr img')
  await expect(qr).toBeVisible()
  const image = (await qr.getAttribute('src'))!.split(',')[1]
  const png = PNG.sync.read(Buffer.from(image, 'base64'))
  expect(jsQR(new Uint8ClampedArray(png.data),png.width,png.height,{inversionAttempts:'attemptBoth'})?.data).toBe(`https://mylinks.bar/${handle}`)
  const pending=page.waitForEvent('download')
  await page.getByRole('button',{name:'Сохранить контакт'}).click()
  const download=await pending, chunks:Buffer[]=[]
  for await(const chunk of (await download.createReadStream())!) chunks.push(chunk)
  const vcard=Buffer.concat(chunks).toString()
  expect(vcard).toContain('shown@example.com')
  expect(vcard).not.toContain('+79990000000')
  expect(download.suggestedFilename()).toMatch(/\.vcf$/)
  await page.getByRole('button',{name:'Действия с QR-кодом'}).click()
  await expect(page.getByRole('button',{name:'Сохранить QR-код'})).toBeVisible()
  await expect(page.locator('.profile-share__overlay')).toHaveCSS('opacity','1')
  await page.waitForTimeout(800)
  await expect(page.getByRole('button',{name:'Сохранить QR-код'})).toBeVisible()
  await expect(page.getByRole('button',{name:'Скопировать ссылку',exact:true})).toBeVisible()
  const shareAvailable=await page.evaluate(()=>matchMedia('(hover: none) and (pointer: coarse)').matches&&typeof navigator.share==='function')
  await expect(page.getByRole('button',{name:'Поделиться страницей'})).toHaveCount(shareAvailable?1:0)
  if (!shareAvailable) {
    await page.waitForTimeout(900)
    await expect(page.getByRole('button',{name:'Скопировать ссылку',exact:true})).toBeVisible()
  }
  await page.mouse.move(0,0)
  await expect(page.getByRole('button',{name:'Скопировать ссылку',exact:true})).toHaveCount(0,{timeout:2500})
  await page.getByRole('button',{name:'Действия с QR-кодом'}).click()
  await page.getByRole('button',{name:'Скопировать ссылку',exact:true}).click()
  await expect(page.getByRole('status')).toContainText('Ссылка скопирована')
})

test('brand icons require a matching hostname, not text embedded in another domain', async ({ page }) => {
  await mock(page)
  await page.route('**/functions/v1/favicon**', route => route.fulfill({ status: 404, body: '' }))
  await page.route('**/rest/v1/profile_links*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify([
    { id: 'spoof', profile_id: id, label: 'Чужой сайт', url: 'https://instagram.com.evil.example/page', icon_key: 'link', position: 0, is_visible: true, is_sensitive: false },
    { id: 'official', profile_id: id, label: 'Instagram', url: 'https://instagram.com/creator', icon_key: 'link', position: 1, is_visible: true, is_sensitive: false },
  ]) }))
  await page.goto(`/${handle}`)
  const links = page.locator('.profile-card__links .profile-link')
  await expect(links).toHaveCount(2)
  await expect(links.first().locator('img.link-icon__brand')).toHaveCount(0)
  await expect(links.last().locator('img.link-icon__brand')).toHaveAttribute('src', '/icons/platforms/instagram.png')
})

