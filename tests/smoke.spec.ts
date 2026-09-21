import { expect, test } from '@playwright/test'

test('landing presents the private MVP and registration flow', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /Одна ссылка/i })).toBeVisible()
  await expect(page.getByText('Пока доступно только вам')).toBeVisible()

  await page.getByRole('button', { name: 'Создать профиль' }).first().click()
  await expect(page.getByRole('heading', { name: 'Создайте мастер‑ссылку' })).toBeVisible()

  const handleInput = page.getByPlaceholder('mikhail')
  await handleInput.fill('Mikhail Studio!')
  await expect(handleInput).toHaveValue('mikhail-studio')
})

test('landing stays usable at narrow viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Mobile-only assertion')
  await page.goto('/')

  await expect(page.getByRole('button', { name: /Создать мастер‑ссылку/i })).toBeVisible()
  await expect(page.locator('.hero__phone')).toBeVisible()
})
