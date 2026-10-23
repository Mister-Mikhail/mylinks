import { expect, test, type Page } from '@playwright/test'
import { mockWizard } from './helpers/wizard'
import { gif, shortVideo, longVideo } from './helpers/media'

const id = '00000000-0000-4000-8000-000000000091'
const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp: 2100000000, role: 'authenticated' })).toString('base64url')}.signature`
const user = { id, email: 'test@example.com', email_confirmed_at: '2026-10-14T12:00:00Z', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-10-13T00:00:00Z' }
const session = { access_token: token, refresh_token: 'test-refresh', expires_at: 2100000000, expires_in: 3600, token_type: 'bearer', user }
async function signup(page: Page) {
  await page.route('**/auth/v1/signup**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...user, identities: [{ id: 'one' }], email_confirmed_at: null }) }))
  await page.getByRole('button', { name: 'Создать профиль' }).first().click()
  await page.getByPlaceholder('you@example.com').fill(user.email)
  await page.getByPlaceholder('Минимум 6 символов').fill('example-password')
  await page.getByRole('button', { name: 'Создать профиль' }).last().click()
  await expect(page.getByText('Откройте ссылку из письма.', { exact: false })).toBeVisible()
}

test('confirming in another tab automatically opens the wizard in both tabs', async ({ page, context }) => {
  await mockWizard(page, false)
  await page.route('**/auth/v1/token**', route => route.fulfill({ status: 400, contentType: 'application/json', body: '{"code":"email_not_confirmed","msg":"Email not confirmed"}' }))
  await signup(page)
  const confirmation = await context.newPage()
  await confirmation.clock.install()
  await mockWizard(confirmation, false)
  let requests = 0
  await confirmation.route('**/auth/v1/verify**', async route => {
    // Initial session setup needs its timers. Freeze only after the app reaches verification.
    await confirmation.clock.pauseAt(new Date(Date.now() + 1000))
    requests++
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(session) })
  })
  await confirmation.goto('/auth/confirmed#token_hash=confirmation-test&type=email')
  await expect(confirmation.getByRole('heading', { name: 'Почта подтверждена' })).toBeVisible()
  await expect(confirmation.getByRole('button', { name: 'Подтвердить email' })).toHaveCount(0)
  await confirmation.clock.fastForward(1200)
  await expect(confirmation.getByRole('heading', { name: 'Давайте познакомимся' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Давайте познакомимся' })).toBeVisible()
  expect(requests).toBe(1)
})

test('original form resumes after confirmation on another device and password login still works @smoke', async ({ page }) => {
  await mockWizard(page, false)
  let confirmedElsewhere = false, attempts = 0
  await page.route('**/auth/v1/token**', route => {
    attempts++
    expect(route.request().postDataJSON()).toMatchObject({ email: user.email, password: 'example-password' })
    return route.fulfill({ status: confirmedElsewhere ? 200 : 400, contentType: 'application/json', body: JSON.stringify(confirmedElsewhere ? session : { code: 'email_not_confirmed', msg: 'Email not confirmed' }) })
  })
  await signup(page)
  confirmedElsewhere = true
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('heading', { name: 'Давайте познакомимся' })).toBeVisible()
  expect(attempts).toBeGreaterThan(0)
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('example-password')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: 'У меня уже есть профиль', exact: true }).click()
  await page.getByPlaceholder('Email или логин страницы').fill(user.email)
  await page.getByPlaceholder('Ваш пароль').fill('example-password')
  await page.getByRole('button', { name: 'Войти', exact: true }).last().click()
  await expect(page.getByRole('heading', { name: 'Давайте познакомимся' })).toBeVisible()
})

async function avatarStep(page: Page) {
  const state = await mockWizard(page)
  await page.getByLabel('Укажите свое имя', { exact: true }).fill('Анна')
  await page.getByLabel('Придумайте user name', { exact: true }).fill('anna.page')
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await expect(page.locator('.avatar-settings__preview')).toHaveText('')
  return state
}

for (const media of [{ name: 'motion.gif', mime: 'image/gif', data: gif, kind: 'gif' }, { name: 'motion.webm', mime: 'video/webm', data: shortVideo, kind: 'video' }]) {
  test(`${media.kind} keeps animation, crop and poster after saving and reload`, async ({ page }) => {
    const state = await avatarStep(page)
    await page.locator('input[type=file]').setInputFiles({ name: media.name, mimeType: media.mime, buffer: Buffer.from(media.data, 'base64') })
    const dialog = page.getByRole('dialog', { name: 'Настройте кадр' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Применить фото' })).toBeEnabled()
    await page.getByLabel('Масштаб фото', { exact: true }).fill('0.75')
    await page.getByLabel('Наклон аватара').fill('18')
    await page.getByRole('group', { name: /Положение фото/ }).press('ArrowDown')
    await dialog.getByRole('button', { name: 'Применить фото' }).click()
    await expect(dialog).toHaveCount(0)
    expect(state.uploads).toBe(3)
    expect(state.profile).toMatchObject({ avatar_media: 'video', avatar_crop: { rotation: 18 } })
    expect(state.profile.avatar_path).toMatch(/\.mp4$/)
    expect(state.profile.avatar_master_path).toMatch(/master-.*\.mp4$/)
    expect(state.profile.avatar_poster_path).toMatch(/poster-.*\.webp$/)
    await page.reload()
    const video = page.locator('.avatar-settings__preview video')
    await expect(video).toBeVisible()
    await expect(video).toHaveJSProperty('muted', true)
    await expect(video).toHaveJSProperty('loop', true)
    await expect(video).toHaveJSProperty('paused', false)
    await page.getByRole('button', { name: 'Продолжить' }).click()
    await page.getByRole('button', { name: 'Добавлю позже' }).click()
    await page.getByRole('button', { name: 'Пропустить', exact: true }).click()
    await page.getByRole('button', { name: 'Готово' }).click()
    await expect(page).toHaveURL(/\/anna.page$/)
    await expect(page.getByRole('button', { name: 'Личный кабинет' })).toBeVisible()
    await expect(page.locator('.profile-card .avatar video')).toBeVisible()
  })
}

test('oversized files are rejected but a longer MOV opens for a ten-second excerpt', async ({ page }) => {
  const state = await avatarStep(page)
  await page.locator('input[type=file]').evaluate((element: HTMLInputElement) => {
    const files = new DataTransfer()
    files.items.add(new File([new Uint8Array(50 * 1024 * 1024 + 1)], 'big.gif', { type: 'image/gif' }))
    element.files = files.files
    element.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await expect(page.getByText('Размер исходного файла не должен превышать 50 МБ.')).toBeVisible()
  await page.locator('input[type=file]').setInputFiles({ name: 'iphone.mov', mimeType: 'video/quicktime', buffer: Buffer.from(longVideo, 'base64') })
  await expect(page.getByRole('dialog', { name: 'Настройте кадр' })).toBeVisible()
  expect(state.uploads).toBe(0)
})

test('a photo larger than 5 MB is cropped before upload', async ({ page }) => {
  const state = await avatarStep(page)
  await page.locator('input[type=file]').evaluate((element: HTMLInputElement) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1200
    const context = canvas.getContext('2d')!
    context.fillStyle = '#728ca5'
    context.fillRect(0, 0, 1200, 1200)
    const raw = atob(canvas.toDataURL('image/jpeg', .94).split(',')[1])
    const data = Uint8Array.from(raw, character => character.charCodeAt(0))
    const files = new DataTransfer()
    files.items.add(new File([data, new Uint8Array(6 * 1024 * 1024)], 'camera.jpg', { type: 'image/jpeg' }))
    element.files = files.files
    element.dispatchEvent(new Event('change', { bubbles: true }))
  })
  const dialog = page.getByRole('dialog', { name: 'Настройте кадр' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Применить фото' }).click()
  await expect(dialog).toHaveCount(0)
  expect(state.uploads).toBe(2)
  expect(state.profile.avatar_path).toMatch(/\.webp$/)
  expect(state.profile.avatar_master_path).toMatch(/master-.*\.webp$/)
})

test('cancel keeps the editor usable when server rendering takes too long', async ({ page }) => {
  const state = await avatarStep(page)
  await page.locator('input[type=file]').setInputFiles({ name: 'motion.gif', mimeType: 'image/gif', buffer: Buffer.from(gif, 'base64') })
  const dialog = page.getByRole('dialog', { name: 'Настройте кадр' })
  await expect(dialog).toBeVisible()
  await page.route('**/avatar-process.php', async route => {
    if (!route.request().postData()?.includes('render')) return route.fallback()
    await new Promise(resolve => setTimeout(resolve, 1800))
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Время обработки истекло."}' }).catch(() => undefined)
  })
  await dialog.getByRole('button', { name: 'Применить фото' }).click()
  await expect(dialog.getByText('Обрабатываем…')).toBeVisible()
  await dialog.getByRole('button', { name: 'Отмена' }).click()
  await expect(dialog).toHaveCount(0)
  expect(state.uploads).toBe(0)
  await page.locator('input[type=file]').setInputFiles({ name: 'motion.gif', mimeType: 'image/gif', buffer: Buffer.from(gif, 'base64') })
  await expect(dialog).toBeVisible()
})
