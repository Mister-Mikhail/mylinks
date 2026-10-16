import { expect, test } from '@playwright/test'

const id = '00000000-0000-4000-8000-000000000091'
const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp: 2100000000, role: 'authenticated' })).toString('base64url')}.signature`
const user = { id, email: 'member@example.com', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-10-13T00:00:00Z' }
const session = { access_token: token, refresh_token: 'refresh-test', expires_at: 2100000000, expires_in: 3600, token_type: 'bearer', user }

test('request uses email only, shows the same answer, and waits 60 seconds before resend', async ({ page }) => {
  const requested: string[] = []
  await page.route('**/auth/v1/recover**', route => {
    const body = route.request().postDataJSON()
    requested.push(body.email)
    expect(new URL(route.request().url()).searchParams.get('redirect_to')).toBe('https://mylinks.bar/auth/reset')
    return route.fulfill({ contentType: 'application/json', body: '{}' })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Войти', exact: true }).first().click()
  await page.getByRole('link', { name: 'Забыли пароль?' }).click()
  await expect(page.getByRole('heading', { name: 'Восстановление пароля' })).toBeVisible()
  await expect(page.locator('input')).toHaveCount(1)
  await page.getByLabel('Email').fill('member@example.com')
  await page.getByRole('button', { name: 'Отправить ссылку' }).click()
  const answer = await page.locator('.private-access-card > p').textContent()
  expect(answer).toBe('Если адрес зарегистрирован, мы отправили письмо.')
  await expect(page.getByRole('button', { name: /Повторить через/ })).toBeDisabled()
  await page.goto('/auth/forgot-password')
  await page.getByLabel('Email').fill('unknown@example.com')
  await page.getByRole('button', { name: 'Отправить ссылку' }).click()
  await expect(page.locator('.private-access-card > p')).toHaveText(answer!)
  expect(requested).toEqual(['member@example.com', 'unknown@example.com'])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('429 explains retry limit', async ({ page }) => {
  await page.route('**/auth/v1/recover**', route => route.fulfill({ status: 429, contentType: 'application/json', body: '{"msg":"rate limit"}' }))
  await page.goto('/auth/forgot-password')
  await page.getByLabel('Email').fill('member@example.com')
  await page.getByRole('button', { name: 'Отправить ссылку' }).click()
  await expect(page.getByRole('alert')).toContainText('Слишком много запросов')
  await expect(page.getByRole('button', { name: /Повторить через/ })).toBeDisabled()
})

test('recovery token verifies in JS, updates password and signs out other sessions', async ({ page }) => {
  let verified = 0, updates = 0, signOuts = 0
  await page.route('**/auth/v1/verify**', route => {
    verified++
    expect(route.request().postDataJSON()).toMatchObject({ token_hash: 'recovery-token', type: 'recovery' })
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(session) })
  })
  await page.route('**/auth/v1/user**', route => {
    if (route.request().method() === 'PUT') { updates++; expect(route.request().postDataJSON()).toEqual({ password: 'new-password' }) }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(user) })
  })
  await page.route('**/auth/v1/logout**', route => { signOuts++; expect(new URL(route.request().url()).searchParams.get('scope')).toBe('others'); return route.fulfill({ status: 204 }) })
  await page.goto('/auth/reset#token_hash=recovery-token&type=recovery')
  await expect(page.getByRole('heading', { name: 'Новый пароль' })).toBeVisible()
  expect(page.url()).not.toContain('recovery-token')
  await page.getByLabel('Новый пароль').fill('new-password')
  await page.getByLabel('Повторите пароль').fill('different')
  await page.getByRole('button', { name: 'Сохранить пароль' }).click()
  await expect(page.getByRole('alert')).toContainText('Пароли не совпадают')
  await page.getByLabel('Повторите пароль').fill('new-password')
  await page.getByRole('button', { name: 'Сохранить пароль' }).click()
  await expect(page.getByRole('heading', { name: 'Пароль изменён' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Перейти в кабинет' })).toBeVisible()
  expect({ verified, updates, signOuts }).toEqual({ verified: 1, updates: 1, signOuts: 1 })
})

test('expired and absent tokens offer a new email', async ({ page }) => {
  await page.route('**/auth/v1/verify**', route => route.fulfill({ status: 400, contentType: 'application/json', body: '{"msg":"expired"}' }))
  await page.goto('/auth/reset#token_hash=expired&type=recovery')
  await expect(page.getByText('Ссылка истекла или недействительна.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Отправить новое письмо' })).toBeVisible()
  await page.goto('/auth/reset')
  await expect(page.getByText('Ссылка истекла или недействительна.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Сохранить пароль' })).toHaveCount(0)
})
