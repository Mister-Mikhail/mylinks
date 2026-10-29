import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { mockLayout } from './helpers/editor-layout'

test('collapsed link opens, saves changed content and only one item remains expanded @smoke', async ({ page }) => {
 await mockLayout(page)
 await page.getByRole('button', { name: 'Ссылки', exact: true }).click()
 const row = page.locator('.link-editor:not(.contact-editor)').first()
 await expect(row.locator('.link-editor__body')).toHaveCount(0)
 await expect(row.locator('.link-editor__summary')).toHaveAttribute('aria-expanded', 'false')
 await row.locator('.link-editor__summary').click()
 await expect(row.locator('.link-editor__body')).toBeVisible()
 await row.getByLabel('Название ссылки', { exact: true }).fill('Обновлённый сайт')
 await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
 await expect(page.getByText('Изменения сохранены')).toBeVisible()
 await expect(page.locator('.link-editor__summary-copy strong').first()).toHaveText('Обновлённый сайт')
 await expect(page.getByRole('region', { name: 'Порядок на странице' })).toHaveCount(0)
 await page.getByRole('button', { name: 'Оформление', exact: true }).click()
 await expect(page.getByRole('region', { name: 'Порядок на странице' })).toBeVisible()
})

test('removing a link requires confirmation @smoke', async ({ page }) => {
 await mockLayout(page)
 await page.getByRole('button', { name: 'Ссылки', exact: true }).click()
 const row = page.locator('.link-editor:not(.contact-editor)').first()
 await row.locator('.link-editor__summary').click()
 page.once('dialog', dialog => dialog.dismiss())
 await row.getByRole('button', { name: 'Удалить ссылку' }).click()
 await expect(row).toHaveCount(1)
 page.once('dialog', dialog => dialog.accept())
 await row.getByRole('button', { name: 'Удалить ссылку' }).click()
 await expect(page.locator('.link-editor:not(.contact-editor)')).toHaveCount(0)
})

test('background type stays in one row of four equal segments at 320 px @mobile', async ({ page }) => {
 await page.setViewportSize({ width: 320, height: 700 })
 await mockLayout(page)
 const picker = page.getByRole('group', { name: 'Режим фона' })
 const sizes = await picker.locator('button').evaluateAll(nodes => nodes.map(node => {
  const r = node.getBoundingClientRect(); return { top: r.top, width: r.width, left: r.left, right: r.right }
 }))
 expect(sizes).toHaveLength(4)
 expect(Math.max(...sizes.map(r => r.top)) - Math.min(...sizes.map(r => r.top))).toBeLessThan(2)
 expect(Math.max(...sizes.map(r => r.width)) - Math.min(...sizes.map(r => r.width))).toBeLessThan(2)
 expect(sizes[3].right).toBeLessThanOrEqual(320)
 await picker.getByRole('button', { name: 'Изображение' }).click()
 await expect(page.getByRole('button', { name: 'Полночь', exact: true })).toHaveCount(0)
 await expect(page.getByRole('button', { name: 'Загрузить фон' })).toBeVisible()
 await picker.getByRole('button', { name: 'Градиент' }).click()
 await expect(page.getByRole('textbox', { name: 'Цвет: Второй цвет фона' })).toBeVisible()
 await expect(page.getByRole('button', { name: 'Загрузить фон' })).toHaveCount(0)
 await picker.getByRole('button', { name: 'Готовый' }).click()
 await expect(page.getByRole('button', { name: 'Полночь', exact: true })).toBeVisible()
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
})

test('featured image upload and 16:9 crop run from expanded Links item @mobile', async ({ page }) => {
 const { uploads } = await mockLayout(page)
 await page.getByRole('button', { name: 'Ссылки', exact: true }).click()
 const row = page.locator('.link-editor:not(.contact-editor)').first()
 await row.locator('.link-editor__summary').click()
 await row.getByLabel('Вид карточки: Мой сайт').selectOption('featured')
 await expect(row.getByRole('button', { name: 'Загрузить фото' })).toBeVisible()
 await row.locator('input[type=file]').setInputFiles({ name: 'featured.webp', mimeType: 'image/webp', buffer: readFileSync('tests/fixtures/avatar.webp') })
 const crop = page.getByRole('dialog', { name: 'Настройте кадр' })
 await expect(crop).toBeVisible()
 const ratio = await crop.locator('.image-crop-editor__viewport').evaluate(el => { const b = el.getBoundingClientRect(); return b.width / b.height })
 expect(ratio).toBeGreaterThan(1.75)
 expect(ratio).toBeLessThan(1.8)
 await page.getByRole('button', { name: 'Применить' }).click()
 await expect(row.getByRole('button', { name: /Изменить кадр/ }).first()).toBeVisible()
 await expect(row.getByRole('button', { name: 'Удалить фото' })).toBeVisible()
 expect(uploads.length).toBeGreaterThan(0)
})

test('common toolbar, account menu, and responsive widths avoid horizontal overflow @mobile', async ({ page, isMobile }) => {
 await mockLayout(page)
 for (const width of [1280, 768, 390, 320]) {
  await page.setViewportSize({ width, height: 844 })
  await expect(page.getByRole('button', { name: 'Поделиться' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Сохранить' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  if (width < 768) {
   await expect(page.locator('.preview-panel')).toBeHidden()
   await expect(page.getByRole('button', { name: 'Превью', exact: true })).toBeVisible()
   await page.getByRole('button', { name: 'Превью', exact: true }).click()
   await expect(page.getByRole('dialog', { name: 'Предпросмотр страницы' }).locator('.profile-card')).toBeVisible()
   await page.getByRole('button', { name: 'Закрыть' }).click()
  } else await expect(page.locator('.preview-panel')).toBeVisible()
 }
 await page.getByRole('button', { name: 'Статистика', exact: true }).click()
 await expect(page.getByRole('button', { name: 'Сохранить' })).toHaveCount(0)
 if (!isMobile) {
  await page.setViewportSize({ width: 1280, height: 844 })
  await page.locator('.editor-nav__account-button').click()
  await expect(page.getByRole('button', { name: 'Экспорт данных' })).toBeVisible()
 }
})

test('before and after visual baseline of Links and Appearance at 1280 and 390 @full', async ({ page }, info) => {
 await mockLayout(page)
 const local = 'http://127.0.0.1:4173/'
 for (const width of [1280, 390]) {
  await page.setViewportSize({ width, height: 900 })
  for (const version of ['before', 'after'] as const) {
   await page.goto(version === 'before' ? 'https://mylinks.bar/' : local)
   for (const section of ['Ссылки', 'Оформление']) {
    await page.getByRole('button', { name: section, exact: true }).click()
    await expect(page.locator('.editor-panel')).toBeVisible()
    await page.screenshot({ path: info.outputPath(`${version}-${section === 'Ссылки' ? 'links' : 'appearance'}-${width}.png`), fullPage: false })
   }
  }
 }
})
