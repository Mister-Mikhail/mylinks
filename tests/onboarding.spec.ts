import { expect, test, type Page } from '@playwright/test'

const id = '00000000-0000-4000-8000-000000000091'
const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp: 2100000000, role: 'authenticated' })).toString('base64url')}.signature`
async function mockWizard(page: Page) {
  await page.addInitScript(({ id, token }) => localStorage.setItem('sb-loykiawbqdkitndqkegk-auth-token', JSON.stringify({ access_token: token, refresh_token: 'test-refresh', expires_at: 2100000000, expires_in: 3600, token_type: 'bearer', user: { id, email: 'test@example.com', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-10-13T00:00:00Z' } })), { id, token })
  const state: { profile: Record<string, unknown>; submitted?: Record<string, unknown>; contacts: unknown[]; uploads: number } = {
    profile: { id, handle: 'draft-abc', display_name: '', bio: '', avatar_url: null, avatar_path: null, avatar_shape: 'round', avatar_size: 'medium', avatar_scale: 28, background_preset: 'midnight', card_preset: 'glass', is_published: false, onboarding_completed: false, onboarding_progress: {}, created_at: '2026-10-13T00:00:00Z', updated_at: '2026-10-13T00:00:00Z' }, contacts: [], uploads: 0,
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
      if (body.payload.contact.value) state.contacts = [{ ...body.payload.contact, id: 'contact-test', profile_id: id, position: 0 }]
      return route.fulfill({ contentType: 'application/json', body: 'null' })
    }
    const data = name === 'profiles' ? state.profile : name === 'profile_contacts' ? state.contacts : name === 'temporary_account_session' ? { is_temporary: false } : name === 'staff_role' ? null : name === 'is_handle_available' ? body.candidate !== 'taken.name' : []
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  })
  let image: Buffer | undefined
  await page.route('**/storage/v1/**', route => {
    const request = route.request()
    if (request.method() === 'GET' && image) return route.fulfill({ contentType: 'image/webp', body: image })
    if (request.url().includes('/object/sign/')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ signedURL: '/object/sign/avatars/test.webp?token=test' }) })
    if (request.method() === 'POST') { state.uploads++; const body = request.postDataBuffer()!; const start = body.indexOf(Buffer.from('RIFF')); image = body.subarray(start, start + body.readUInt32LE(start + 4) + 8) }
    return route.fulfill({ contentType: 'application/json', body: '{"Key":"avatars/test.webp"}' })
  })
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64') }))
  await page.goto('/')
  return state
}
async function identity(page: Page) {
  await page.getByLabel('Укажите свое имя', { exact: true }).fill('Анна Мария')
  await page.getByLabel('Придумайте user name', { exact: true }).fill('anna.petrova')
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await expect(page.getByRole('heading', { name: 'Расскажите кратко о себе' })).toBeVisible()
}

test('five-step flow saves short links and phone and restores progress', async ({ page }, info) => {
  const state = await mockWizard(page); await identity(page)
  await page.getByLabel('Описание', { exact: true }).fill('Дизайнер и автор')
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await page.reload()
  await expect(page.getByRole('heading', { name: /^Добавьте несколько/ })).toBeVisible()
  await page.getByRole('button', { name: 'Добавить ссылку' }).click()
  await page.getByRole('combobox', { name: 'Площадка' }).selectOption('vk')
  await page.getByRole('textbox', { name: 'Описание ссылки' }).fill('Мой VK')
  await page.getByRole('textbox', { name: 'Имя пользователя или ID' }).fill('id12345')
  await page.getByRole('button', { name: 'Добавить ссылку' }).click()
  await page.getByRole('combobox', { name: 'Площадка' }).nth(1).selectOption('whatsapp')
  await page.getByRole('textbox', { name: 'Номер WhatsApp' }).fill('+7abc 999 ру000 00 00')
  await expect(page.getByRole('textbox', { name: 'Номер WhatsApp' })).toHaveValue('+79990000000')
  await expect(page.getByText('В номере допустимы только цифры.', { exact: false })).toBeVisible()
  await page.getByRole('textbox', { name: 'Номер WhatsApp' }).fill('79990000000')
  await expect(page.locator('fieldset.onboarding-link')).toHaveCount(2)
  await page.screenshot({ path: `/tmp/wizard-links-${info.project.name}.png`, fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await page.getByRole('textbox', { name: 'Значение контакта' }).fill('7абв9990000000')
  await expect(page.getByRole('textbox', { name: 'Значение контакта' })).toHaveValue('+79990000000')
  await page.getByRole('textbox', { name: 'Значение контакта' }).fill('123')
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await expect(page.getByRole('alert')).toContainText('Проверьте контакт')
  await page.getByRole('textbox', { name: 'Значение контакта' }).fill('79990000000')
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await expect(page.locator('.onboarding-live-preview')).toContainText('Анна Мария')
  await expect(page.locator('.onboarding-live-preview')).toContainText('+79990000000')
  await expect(page.locator('.onboarding-live-preview')).toContainText('Мой VK')
  await page.getByRole('button', { name: 'Готово' }).click()
  expect(state.submitted).toMatchObject({ handle: 'anna.petrova', display_name: 'Анна Мария', bio: 'Дизайнер и автор', contact: { kind: 'phone', value: '+79990000000', is_visible: true }, links: [{ url: 'https://vk.com/id12345' }, { url: 'https://wa.me/79990000000' }] })
  await expect(page.getByRole('textbox', { name: 'Значение контакта' })).toHaveValue('+79990000000')
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Значение контакта' })).toHaveValue('+79990000000')
})

test('identity rejects repeated separators, digits and occupied handles', async ({ page }) => {
  await mockWizard(page)
  const name = page.getByLabel('Укажите свое имя', { exact: true }), handle = page.getByLabel('Придумайте user name', { exact: true })
  await name.fill('Анна?(*438-5204587'); await expect(name).toHaveValue('Анна')
  await expect(page.getByText('В имени допустимы только буквы', { exact: false })).toBeVisible()
  await name.fill('Анна Мария')
  for (const invalid of ['...', '___', 'anna..name', 'anna__name', 'anna.name_more', '.anna', 'anna.']) {
    await handle.fill(invalid); await page.getByRole('button', { name: 'Продолжить' }).click()
    await expect(handle).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('heading', { name: 'Давайте познакомимся' })).toBeVisible()
  }
  await handle.fill('taken.name'); await page.getByRole('button', { name: 'Продолжить' }).click()
  await expect(page.getByRole('alert')).toContainText('уже занят')
  await handle.fill('anna_name'); await page.getByRole('button', { name: 'Продолжить' }).click()
  await expect(page.getByRole('heading', { name: 'Расскажите кратко о себе' })).toBeVisible()
})

test('wizard avatar crop and shape persist into final preview', async ({ page }, info) => {
  const state = await mockWizard(page); await identity(page)
  const png = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 160; const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#749f94'; ctx.fillRect(0, 0, 240, 160); return canvas.toDataURL('image/png').split(',')[1] })
  await page.locator('input[type=file]').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  await expect(page.getByRole('button', { name: 'Продолжить' })).toBeDisabled()
  await page.getByRole('button', { name: 'Квадрат', exact: true }).click()
  await page.getByLabel('Размер аватара', { exact: true }).fill('65')
  await page.getByLabel('Масштаб фото', { exact: true }).fill('1.5')
  await page.getByRole('group', { name: /Положение фото/ }).press('ArrowRight')
  await page.getByRole('button', { name: 'Применить фото' }).click()
  await expect(page.getByRole('button', { name: 'Продолжить' })).toBeEnabled()
  await expect(page.locator('.onboarding-live-preview .avatar img')).toHaveJSProperty('naturalWidth', 107)
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await page.getByRole('button', { name: 'Добавлю позже' }).click()
  await page.getByRole('button', { name: 'Пропустить', exact: true }).click()
  await page.getByRole('button', { name: 'Туман', exact: true }).click()
  await expect(page.locator('.onboarding-live-preview .avatar')).toHaveClass(/avatar--square/)
  await page.screenshot({ path: `/tmp/wizard-preview-${info.project.name}.png`, fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.getByRole('button', { name: 'Готово' }).click()
  expect(state.uploads).toBe(1)
  expect(state.submitted).toMatchObject({ avatar_shape: 'square', avatar_scale: 65, background_preset: 'mist' })
})

test('address selection saves coordinates and email rejects invalid formats', async ({ page }) => {
  const state = await mockWizard(page); await identity(page)
  await page.getByRole('button', { name: 'Продолжить' }).click(); await page.getByRole('button', { name: 'Добавлю позже' }).click()
  await page.getByRole('combobox', { name: 'Тип контакта' }).selectOption('email')
  await page.getByRole('textbox', { name: 'Значение контакта' }).fill('почтаanna..name@example.com')
  await expect(page.getByRole('textbox', { name: 'Значение контакта' })).toHaveValue('anna..name@example.com')
  await page.getByRole('button', { name: 'Продолжить' }).click(); await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('combobox', { name: 'Тип контакта' }).selectOption('address')
  await page.route('https://photon.komoot.io/api/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: [{ geometry: { coordinates: [37.61, 55.75] }, properties: { name: 'Тестовый адрес', city: 'Москва' } }] }) }))
  await page.getByRole('textbox', { name: 'Значение контакта' }).fill('Москва')
  await page.getByRole('button', { name: 'Найти адрес на карте' }).click()
  await page.getByRole('button', { name: 'Тестовый адрес, Москва' }).click()
  await expect(page.getByText('Точка выбрана:', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Продолжить' }).click(); await page.getByRole('button', { name: 'Готово' }).click()
  expect(state.submitted).toMatchObject({ contact: { value: 'Тестовый адрес, Москва', latitude: 55.75, longitude: 37.61 } })
})

test('self deletion requires exact confirmation and can retry a server failure', async ({ page }) => {
  await mockWizard(page)
  let requests = 0
  await page.route('**/functions/v1/delete-own-account', route => { requests++; expect(route.request().postDataJSON()).toEqual({ confirmation: 'УДАЛИТЬ' }); return route.fulfill({ status: requests === 1 ? 500 : 200, contentType: 'application/json', body: JSON.stringify(requests === 1 ? { error: 'Повторите попытку удаления.' } : { deleted: true }) }) })
  await page.getByRole('button', { name: 'Удалить мой профиль' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Удалить навсегда' })).toBeDisabled()
  await dialog.getByRole('textbox').fill('УДАЛИТЬ')
  await dialog.getByRole('button', { name: 'Удалить навсегда' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Повторите')
  await dialog.getByRole('button', { name: 'Удалить навсегда' }).click()
  await expect(page.getByRole('heading', { name: /Одна ссылка/ })).toBeVisible()
  expect(requests).toBe(2)
})

test('confirmation link waits for an explicit click', async ({ page }) => {
  let verifications = 0
  await page.route('**/auth/v1/verify**', route => { verifications++; return route.fulfill({ status: 400, contentType: 'application/json', body: '{"msg":"Invalid token"}' }) })
  await page.goto('/auth/confirmed#token_hash=example-hash&type=email')
  await expect(page.getByRole('button', { name: 'Подтвердить email' })).toBeVisible(); expect(verifications).toBe(0)
  await page.getByRole('button', { name: 'Подтвердить email' }).click(); await expect.poll(() => verifications).toBe(1)
})
