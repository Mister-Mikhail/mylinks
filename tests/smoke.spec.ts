import { expect, test } from '@playwright/test'

test('landing presents the registration flow', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /Одна ссылка/i })).toBeVisible()

  await page.getByRole('button', { name: 'Создать профиль' }).first().click()
  await expect(page.getByRole('heading', { name: 'Создайте страницу' })).toBeVisible()

  const nameInput = page.getByPlaceholder('Михаил')
  await nameInput.fill('Михаил?(*438-5204587')
  await expect(nameInput).toHaveValue('Михаил')
  await expect(page.getByRole('alert')).toContainText('Цифры и знаки')

  const handleInput = page.getByPlaceholder('mikhail')
  await handleInput.fill('mikhail.name_01')
  await expect(handleInput).toHaveValue('mikhail.name_01')
  await handleInput.fill('mikhail_name.02')
  await expect(handleInput).toHaveValue('mikhail_name.02')

  const passwordInput = page.getByPlaceholder('Минимум 6 символов')
  await expect(passwordInput).toHaveAttribute('type', 'password')
  await expect(passwordInput).toHaveAttribute('autocomplete', 'off')
  await page.getByRole('button', { name: 'Показать пароль' }).click()
  await expect(passwordInput).toHaveAttribute('type', 'text')
})

test('landing stays usable at narrow viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Mobile-only assertion')
  await page.goto('/')

  await expect(page.getByRole('button', { name: /Создать мастер‑ссылку/i })).toBeVisible()
  await expect(page.locator('.hero__phone')).toBeVisible()
})

test('registration checks the address and preserves the chosen identity', async ({ page }) => {
  let submitted: Record<string, unknown> | undefined
  await page.route('**/rest/v1/rpc/is_handle_available', route => {
    const { candidate } = route.request().postDataJSON()
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(candidate !== 'taken.name_01') })
  })
  await page.route('**/auth/v1/signup**', route => {
    submitted = route.request().postDataJSON()
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      user: { id: '00000000-0000-4000-8000-000000000091', identities: [{ id: 'one' }] }, session: null,
    }) })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Создать профиль' }).first().click()
  await page.getByPlaceholder('Михаил').fill('Анна Мария')
  await page.getByPlaceholder('you@example.com').fill('anna@example.com')
  await page.getByPlaceholder('Минимум 6 символов').fill('example-password')
  await page.getByPlaceholder('mikhail').fill('taken.name_01')
  await expect(page.getByRole('status')).toHaveText('Адрес уже занят')
  await page.getByRole('button', { name: 'Создать профиль' }).last().click()
  await expect(page.getByText('Адрес уже занят. Выберите другой.')).toBeVisible()
  expect(submitted).toBeUndefined()
  await page.getByPlaceholder('mikhail').fill('anna.name_01')
  await expect(page.getByRole('status')).toHaveText('Адрес свободен')
  await page.getByRole('button', { name: 'Создать профиль' }).last().click()
  await expect.poll(() => submitted).toMatchObject({
    email: 'anna@example.com',
    data: { handle: 'anna.name_01', display_name: 'Анна Мария', handle_strict: true },
  })
  await expect(page.getByText(/Проверьте почту и подтвердите адрес/)).toBeVisible()
})
