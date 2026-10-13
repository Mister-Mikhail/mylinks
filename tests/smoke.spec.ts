import { expect, test } from '@playwright/test'

test('landing presents the registration flow', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /Одна ссылка/i })).toBeVisible()

  await page.getByRole('button', { name: 'Создать профиль' }).first().click()
  await expect(page.getByRole('heading', { name: 'Создайте страницу' })).toBeVisible()

  await expect(page.locator('.auth-form input')).toHaveCount(2)
  await expect(page.getByText('Имя на странице', { exact: true })).toHaveCount(0)

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

test('registration asks only for email and password and then awaits confirmation', async ({ page }) => {
  let submitted: Record<string, unknown> | undefined
  await page.route('**/auth/v1/signup**', route => {
    submitted = route.request().postDataJSON()
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      user: { id: '00000000-0000-4000-8000-000000000091', identities: [{ id: 'one' }] }, session: null,
    }) })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Создать профиль' }).first().click()
  await page.getByPlaceholder('you@example.com').fill('anna@example.com')
  await page.getByPlaceholder('Минимум 6 символов').fill('example-password')
  await page.getByRole('button', { name: 'Создать профиль' }).last().click()
  await expect.poll(() => submitted).toMatchObject({ email: 'anna@example.com', data: { onboarding_version: 2 } })
  expect((submitted?.data as Record<string, unknown>).handle).toBeUndefined()
  expect((submitted?.data as Record<string, unknown>).display_name).toBeUndefined()
  await expect(page.getByText(/Проверьте почту и подтвердите адрес/)).toBeVisible()
  await expect(page.getByText('Укажите свое имя', { exact: true })).toHaveCount(0)
})
