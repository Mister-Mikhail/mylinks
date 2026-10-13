import { expect, test, type Page } from '@playwright/test'

const ownerId = '5dd4c734-c65c-43d5-8b58-d9c5a2b4e9b8'
const targetId = 'd9e584dd-6def-4b52-a16c-8a9214cb3c37'
const target = { id: targetId, handle: 'vasiliy', display_name: 'Василий', email: 'test@example.com', bio: 'Фотограф', created_at: '2026-09-22T10:00:00Z', last_sign_in_at: null, email_confirmed_at: '2026-09-22T10:01:00Z', role: 'user', is_published: true, restriction_reason: null, link_count: 1 }

async function mockStaff(page: Page, role: 'admin' | 'moderator' | null) {
  const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: ownerId, exp: 2100000000, role: 'authenticated', session_id: 'test-session' })).toString('base64url')}.signature`
  await page.addInitScript(({ token, ownerId }) => {
    localStorage.setItem('sb-loykiawbqdkitndqkegk-auth-token', JSON.stringify({ access_token: token, refresh_token: 'test-refresh', expires_at: 2100000000, expires_in: 3600, token_type: 'bearer', user: { id: ownerId, email: 'owner@example.com', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-09-22T00:00:00Z' } }))
  }, { token, ownerId })
  const calls: { name: string; body: Record<string, unknown> }[] = []
  await page.route('**/rest/v1/rpc/*', async route => {
    const name = route.request().url().split('/').pop()!
    const body = route.request().postDataJSON() || {}
    calls.push({ name, body })
    const data: Record<string, unknown> = {
      staff_role: role,
      staff_users: { total: body.q && !'vasiliy Василий test@example.com'.includes(body.q) ? 0 : 1, users: body.q && !'vasiliy Василий test@example.com'.includes(body.q) ? [] : [target], stats: { total: 2, today: 0, week: 1, restricted: 0 } },
      staff_detail: { user: target, profile: target, links: [{ id: 'link-test', label: 'Сайт', url: 'https://example.com', is_visible: true, restriction_reason: null }] },
      staff_history: { total: 0, events: [] }, staff_change: null,
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data[name]) })
  })
  return calls
}

test('anonymous staff entry offers existing-account sign-in', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Вход для сотрудников' })).toBeVisible()
  await expect(page.getByLabel('Пароль', { exact: true })).toHaveAttribute('type', 'password')
  await page.getByRole('button', { name: 'Показать пароль' }).click()
  await expect(page.getByLabel('Пароль', { exact: true })).toHaveAttribute('type', 'text')
  await expect(page.getByText('Создать бесплатно', { exact: false })).toHaveCount(0)
})

test('ordinary account cannot open staff data', async ({ page }) => {
  const calls = await mockStaff(page, null)
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Доступ закрыт' })).toBeVisible()
  expect(calls.filter(call => call.name === 'staff_users')).toHaveLength(0)
})

test('administrator searches users and confirms moderation with a reason', async ({ page }) => {
  const calls = await mockStaff(page, 'admin')
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Пользователи', exact: true })).toBeVisible()
  await page.getByPlaceholder('Email, имя или @username').fill('vasiliy')
  await expect.poll(() => calls.some(call => call.name === 'staff_users' && call.body.q === 'vasiliy')).toBeTruthy()
  await page.getByRole('button', { name: 'Подробнее: vasiliy' }).click()
  await expect(page.getByRole('heading', { name: 'Василий' })).toBeVisible()
  await page.getByRole('button', { name: 'Ограничить публикацию' }).click()
  await expect(page.getByRole('button', { name: 'Подтвердить' })).toBeDisabled()
  await page.getByLabel('Причина').fill('Нарушение правил')
  await page.getByRole('button', { name: 'Подтвердить' }).click()
  await expect.poll(() => calls.some(call => call.name === 'staff_change' && call.body.target === targetId && call.body.action === 'restrict_profile' && call.body.reason === 'Нарушение правил')).toBeTruthy()
})

test('moderator has no role-assignment control and mobile does not overflow', async ({ page }) => {
  await mockStaff(page, 'moderator')
  await page.goto('/admin/users/' + targetId)
  await expect(page.getByRole('heading', { name: 'Василий' })).toBeVisible()
  await expect(page.getByLabel('Роль пользователя')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
})

test('administrator must confirm the exact handle before account deletion', async ({ page }) => {
  await mockStaff(page, 'admin')
  let deletion: Record<string, unknown> | null = null
  await page.route('**/functions/v1/admin-delete-user', route => {
    deletion = route.request().postDataJSON()
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ deleted: true }) })
  })
  await page.goto('/admin/users/' + targetId)
  await page.getByRole('button', { name: 'Удалить пользователя' }).click()
  const dialog = page.getByRole('dialog', { name: 'Удалить пользователя' })
  await expect(dialog).toContainText('без возможности восстановления')
  await dialog.getByLabel('Введите адрес страницы @vasiliy').fill('vasilii')
  await dialog.getByLabel('Причина').fill('Запрос на удаление')
  await expect(dialog.getByRole('button', { name: 'Удалить аккаунт' })).toBeDisabled()
  await dialog.getByLabel('Введите адрес страницы @vasiliy').fill('vasiliy')
  await dialog.getByRole('button', { name: 'Удалить аккаунт' }).click()
  await expect.poll(() => deletion).toMatchObject({ target_id: targetId, expected_handle: 'vasiliy', reason: 'Запрос на удаление' })
  await expect(page).toHaveURL(/\/admin$/)
})

test('moderator cannot access the delete action', async ({ page }) => {
  await mockStaff(page, 'moderator')
  await page.goto('/admin/users/' + targetId)
  await expect(page.getByRole('button', { name: 'Удалить пользователя' })).toHaveCount(0)
})
