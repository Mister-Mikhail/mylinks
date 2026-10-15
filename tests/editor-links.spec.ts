import { expect, test } from '@playwright/test'

const id = '00000000-0000-4000-8000-000000000001'
const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp: 2100000000, role: 'authenticated' })).toString('base64url')}.signature`
const profile = { id, handle: 'sample-user', display_name: 'Тестовый профиль', bio: '', avatar_url: null, avatar_path: null, avatar_shape: 'round', avatar_size: 'medium', avatar_scale: 28, background_preset: 'midnight', card_preset: 'glass', is_published: true, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' }
const links = Array.from({ length: 6 }, (_, n) => ({ id: `link-${n}`, profile_id: id, label: `Ссылка ${n + 1}`, url: `https://example${n}.com`, icon_key: 'link', position: n, is_visible: true, is_sensitive: false }))

test('a new link appears at the top, focused and visible', async ({ page }) => {
  await page.addInitScript(({ id, token }) => localStorage.setItem('sb-loykiawbqdkitndqkegk-auth-token', JSON.stringify({ access_token: token, refresh_token: 'test-refresh', expires_at: 2100000000, expires_in: 3600, token_type: 'bearer', user: { id, email: 'test@example.com', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2025-01-01T00:00:00Z' } })), { id, token })
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()
    const data = name === 'profiles' ? profile : name === 'profile_links' ? links : name === 'staff_role' ? null : []
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  })
  await page.route('**/functions/v1/favicon**', (route) => route.fulfill({ status: 404, body: '' }))
  await page.goto('/')
  await expect(page.locator('.link-editor')).toHaveCount(6)

  await page.locator('.settings-card').filter({ hasText: 'Ссылки' }).getByRole('button', { name: 'Добавить' }).click()

  const cards = page.locator('.link-editor:not(.contact-editor)')
  await expect(cards).toHaveCount(7)
  const first = cards.first()
  await expect(first.getByLabel('Название ссылки', { exact: true })).toHaveValue('')
  await expect(first.getByLabel('Адрес ссылки')).toBeFocused()
  await expect(first).toBeInViewport()
  await expect(cards.nth(1).getByLabel('Название ссылки', { exact: true })).toHaveValue('Ссылка 1')
})

test('master link is copied with a single icon button', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.addInitScript(({ id, token }) => localStorage.setItem('sb-loykiawbqdkitndqkegk-auth-token', JSON.stringify({ access_token: token, refresh_token: 'test-refresh', expires_at: 2100000000, expires_in: 3600, token_type: 'bearer', user: { id, email: 'test@example.com', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2025-01-01T00:00:00Z' } })), { id, token })
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()
    const data = name === 'profiles' ? profile : name === 'staff_role' ? null : []
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  })
  await page.goto('/')
  const button = page.getByRole('button', { name: 'Скопировать мастер‑ссылку' })
  await expect(button).toHaveText('')
  await button.click()
  await expect(page.getByRole('button', { name: 'Мастер‑ссылка скопирована' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/sample-user$/)
})

test('links editor shows a live pinned preview on small phones', async ({ page }) => {
  await page.addInitScript(({ id, token }) => localStorage.setItem('sb-loykiawbqdkitndqkegk-auth-token', JSON.stringify({ access_token: token, refresh_token: 'test-refresh', expires_at: 2100000000, expires_in: 3600, token_type: 'bearer', user: { id, email: 'test@example.com', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2025-01-01T00:00:00Z' } })), { id, token })
  await page.route('**/rest/v1/**', route => {
    const name = new URL(route.request().url()).pathname.split('/').pop()
    const data = name === 'profiles' ? profile : name === 'profile_links' ? links : name === 'staff_role' ? null : []
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  })
  await page.route('**/functions/v1/favicon**', route => route.fulfill({ status: 404, body: '' }))
  await page.goto('/')
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport)
    const panel = page.locator('.preview-panel')
    await expect(panel).toBeVisible()
    const initial = (await panel.boundingBox())!
    await page.locator('.editor-panel').evaluate(el => { el.scrollTop = el.scrollHeight })
    expect((await panel.boundingBox())!.y).toBe(initial.y)
    expect(initial.y + initial.height).toBeLessThan(viewport.height - 64)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  }
  await page.setViewportSize({ width: 320, height: 568 })
  await page.getByLabel('Отображаемое имя', { exact: true }).fill('Новое имя')
  await expect(page.locator('.preview-panel h1')).toHaveText('Новое имя')
  await page.locator('.link-editor:not(.contact-editor)').first().getByLabel('Название ссылки', { exact: true }).fill('Новая ссылка')
  await expect(page.locator('.preview-panel .profile-link').first()).toContainText('Новая ссылка')
})

