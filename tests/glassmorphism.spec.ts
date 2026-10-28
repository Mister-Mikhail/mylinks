import { expect, test } from '@playwright/test'

const id = '00000000-0000-4000-8000-000000000001'
const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp: 2100000000, role: 'authenticated' })).toString('base64url')}.signature`
const profile = { id, handle: 'glass-test', display_name: 'Тест', bio: 'Тестовый профиль', avatar_url: null, avatar_path: null, avatar_shape: 'round', avatar_size: 'medium', avatar_scale: 28, background_preset: 'midnight', card_preset: 'glass', is_published: true, created_at: '', updated_at: '' }

test('glass treatment covers landing and authentication but not public profile routes @smoke @mobile', async ({ page, isMobile }) => {
  await page.goto('/')
  await expect(page.locator('.glass-app')).toHaveCount(1)
  await expect(page.locator('.landing-shell')).toHaveCSS('background-image', /radial-gradient/)
  await expect(page.locator('.landing-nav')).toHaveCSS('backdrop-filter', /blur/)
  await page.getByRole('button', { name: 'У меня уже есть профиль' }).click()
  await expect(page.locator('.auth-dialog')).toHaveCSS('backdrop-filter', /blur/)
  await page.goto('/auth/forgot-password')
  await expect(page.locator('.private-access-card')).toHaveCSS('backdrop-filter', /blur/)
  if (isMobile) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.goto('/glass-public-check')
  await expect(page.locator('.glass-app')).toHaveCount(0)
})

test('glass editor panels retain a separate unmodified user profile preview @smoke @mobile', async ({ page, isMobile }) => {
  await page.addInitScript(({ id, token }) => localStorage.setItem('sb-loykiawbqdkitndqkegk-auth-token', JSON.stringify({
    access_token: token, refresh_token: 'test', expires_at: 2100000000,
    expires_in: 3600, token_type: 'bearer',
    user: { id, email: 'test@example.com', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '' },
  })), { id, token })
  await page.route('**/rest/v1/**', route => {
    const table = new URL(route.request().url()).pathname.split('/').pop()
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(table === 'profiles' ? profile : table === 'staff_role' ? null : []) })
  })
  await page.goto('/')
  await expect(page.locator('.glass-app .dashboard-shell')).toBeVisible()
  await expect(page.locator('.settings-card').first()).toHaveCSS('backdrop-filter', /blur/)
  const preview = page.locator('.preview-panel .profile-card')
  await expect(preview).toBeVisible()
  await expect(preview).toHaveClass(/theme-midnight/)
  await expect(preview).not.toHaveClass(/glass-app/)
  await page.getByRole('button', { name: 'Оформление', exact: true }).click()
  await expect(page.locator('.settings-card').first()).toHaveCSS('backdrop-filter', /blur/)
  await expect(page.locator('.preview-panel .profile-card')).toHaveClass(/theme-midnight/)
  if (isMobile) {
    const panel = await page.locator('.preview-panel').boundingBox()
    expect(panel).not.toBeNull()
    expect(panel!.y).toBeGreaterThanOrEqual(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth))
  }
})
