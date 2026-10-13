import { expect, test } from '@playwright/test'

const id = '00000000-0000-4000-8000-000000000091'
const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp: 2100000000, role: 'authenticated' })).toString('base64url')}.signature`
const profile = {
  id, handle: 'sample-user', display_name: 'Новый автор', bio: '',
  avatar_url: null, avatar_path: null, avatar_shape: 'round', avatar_size: 'medium', avatar_scale: 28,
  background_preset: 'midnight', card_preset: 'glass', is_published: false,
  onboarding_completed: false, onboarding_progress: {},
  created_at: '2026-10-13T00:00:00Z', updated_at: '2026-10-13T00:00:00Z',
}

test('onboarding accepts short social names and previews the finished page', async ({ page }) => {
  await page.addInitScript(({ id, token }) => localStorage.setItem('sb-loykiawbqdkitndqkegk-auth-token', JSON.stringify({
    access_token: token, refresh_token: 'test-refresh', expires_at: 2100000000, expires_in: 3600,
    token_type: 'bearer', user: { id, email: 'test@example.com', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-10-13T00:00:00Z' },
  })), { id, token })
  let submitted: Record<string, unknown> | undefined
  await page.route('**/rest/v1/**', route => {
    const name = new URL(route.request().url()).pathname.split('/').pop()
    if (name === 'complete_onboarding') {
      submitted = route.request().postDataJSON().payload
      return route.fulfill({ contentType: 'application/json', body: 'null' })
    }
    const data = name === 'profiles' ? profile : name === 'temporary_account_session' ? { is_temporary: false } : name === 'staff_role' ? null : []
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  })
  await page.goto('/')
  await page.getByPlaceholder('your.name_01').fill('author.name_01')
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await page.getByRole('button', { name: 'Добавить ссылку' }).click()
  await page.getByRole('combobox', { name: 'Площадка' }).selectOption('vk')
  await page.getByRole('textbox', { name: 'Название ссылки' }).fill('Мой VK')
  await page.getByRole('textbox', { name: 'Имя пользователя или ID' }).fill('id12345')
  await page.getByRole('button', { name: 'Добавить ссылку' }).click()
  await page.getByRole('combobox', { name: 'Площадка' }).nth(1).selectOption('whatsapp')
  await page.getByRole('textbox', { name: 'Название ссылки' }).nth(1).fill('Написать мне')
  await page.getByRole('textbox', { name: 'Номер WhatsApp' }).fill('+7 999 000 00 00')
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await page.getByRole('button', { name: 'Пропустить' }).click()
  await expect(page.locator('.onboarding-live-preview')).toContainText('Новый автор')
  await expect(page.locator('.onboarding-live-preview')).toContainText('Мой VK')
  await page.getByRole('button', { name: 'Готово' }).click()
  await expect.poll(() => submitted).toMatchObject({
    handle: 'author.name_01',
    links: [
      { url: 'https://vk.com/id12345' },
      { url: 'https://wa.me/79990000000' },
    ],
  })
})

test('confirmation link waits for an explicit click', async ({ page }) => {
  let verifications = 0
  await page.route('**/auth/v1/verify**', route => {
    verifications += 1
    return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ msg: 'Invalid token' }) })
  })
  await page.goto('/auth/confirmed#token_hash=example-hash&type=email')
  await expect(page.getByRole('button', { name: 'Подтвердить email' })).toBeVisible()
  expect(verifications).toBe(0)
  await page.getByRole('button', { name: 'Подтвердить email' }).click()
  await expect.poll(() => verifications).toBe(1)
})
