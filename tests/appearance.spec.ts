import { chooseFont, chooseFromSelect } from './helpers/fonts'
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { FONT_OPTIONS } from '../src/lib/typography'

export async function mockAppearance(page: Page, failUpload = false, displayName = 'Тестовый профиль') {
  const id = '00000000-0000-4000-8000-000000000001'
  const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp: 2100000000, role: 'authenticated' })).toString('base64url')}.signature`
  await page.addInitScript(({ id, token }) => localStorage.setItem('sb-loykiawbqdkitndqkegk-auth-token', JSON.stringify({ access_token: token, refresh_token: 'test-refresh', expires_at: 2100000000, expires_in: 3600, token_type: 'bearer', user: { id, email: 'test@example.com', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2025-01-01T00:00:00Z' } })), { id, token })
  let profile = { id, handle: 'sample-user', display_name: displayName, bio: 'Мои проекты', avatar_url: null, avatar_path: null, avatar_shape: 'round', avatar_size: 'medium', avatar_scale: 28, background_preset: 'midnight', card_preset: 'glass', is_published: true, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' }
  let links: Record<string, unknown>[] = [{ id: 'link-test', profile_id: id, label: 'Мой сайт', url: 'https://example.com', icon_key: 'website', position: 0, is_visible: true, is_sensitive: false }]
  const patches: Record<string, unknown>[] = []
  const uploads: Buffer[] = []
  let savedImage: Buffer | null = null
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  const preview = readFileSync('tests/fixtures/avatar.webp').toString('base64')
  const delivery = readFileSync('tests/fixtures/avatar-delivery.webp').toString('base64')
  const master = readFileSync('tests/fixtures/avatar-master.webp').toString('base64')
  await page.route('**/avatar-process.php', route => {
    const data = route.request().postDataBuffer()?.toString('latin1') || ''
    if (data.includes('prepare')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ token: 'abcdef0123456789abcdef0123456789', kind: 'image', preview: `data:image/webp;base64,${preview}`, width: 64, height: 64 }) })
    if (data.includes('discard')) return route.fulfill({ contentType: 'application/json', body: '{"discarded":true}' })
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ kind: 'image', delivery: { mime: 'image/webp', data: delivery }, master: { mime: 'image/webp', data: master }, poster: null }) })
  })
  await page.route('**/rest/v1/**', async route => {
    const request = route.request()
    const name = new URL(request.url()).pathname.split('/').pop()
    if (name === 'staff_role') return route.fulfill({ contentType: 'application/json', body: 'null' })
    if (name === 'profiles' && request.method() === 'PATCH') {
      const patch = request.postDataJSON()
      patches.push(patch); profile = { ...profile, ...patch }
      return route.fulfill({ status: 204 })
    }
    if (name === 'profile_links' && request.method() === 'POST') { links = request.postDataJSON(); return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(links) }) }
    const data = name === 'profiles' ? profile : name === 'profile_links' ? links : []
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  })
  await page.route('**/storage/v1/**', async route => {
    const req = route.request()
    if (req.method() === 'GET' && savedImage) return route.fulfill({ contentType: 'image/webp', body: savedImage })
    if (req.url().includes('/object/sign/')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ signedURL: '/object/sign/avatars/test.webp?token=test' }) })
    if (req.method() === 'POST') {
      const body = req.postDataBuffer()!
      uploads.push(body)
      const start = body.indexOf(Buffer.from('RIFF'))
      savedImage = body.subarray(start, start + body.readUInt32LE(start + 4) + 8)
      await new Promise(resolve => setTimeout(resolve, 200))
      if (failUpload) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Upload failed' }) })
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ Key: 'avatars/test.webp' }) })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Оформление', exact: true }).click()
  return { patches, uploads, pageErrors }
}

async function selectPhoto(page: Page) {
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 160
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#ef4444'; ctx.fillRect(0, 0, 160, 160); ctx.fillStyle = '#22c55e'; ctx.fillRect(160, 0, 160, 160)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await page.locator('input[type=file]').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  await expect(page.getByRole('heading', { name: 'Настройте кадр' })).toBeVisible()
}

test('appearance changes are visible in place and survive saving @smoke', async ({ page }) => {
  const { patches, pageErrors } = await mockAppearance(page)
  await page.screenshot({ path: `/tmp/appearance-default-${test.info().project.name}.png` })
  const preview = page.locator('.preview-panel .profile-card')
  await expect(preview).toBeVisible()
  await page.getByRole('button', { name: 'Туман', exact: true }).click()
  await page.getByRole('button', { name: 'Контур', exact: true }).click()
  await page.getByRole('button', { name: 'Квадрат', exact: true }).click()
  await page.getByLabel('Размер аватара', { exact: true }).fill('65')
  await expect(preview).toHaveClass(/theme-mist/)
  await expect(preview.locator('.profile-link').first()).toHaveClass(/card-outline/)
  await expect(preview.locator('.avatar')).toHaveClass(/avatar--square/)
  const before = await preview.boundingBox()
  await page.locator('.editor-panel').evaluate(el => { el.scrollTop = el.scrollHeight })
  if (test.info().project.name.includes('mobile')) {
    const after = await preview.boundingBox()
    expect(after!.y).toBe(before!.y)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  }
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Изменения сохранены')).toBeVisible()
  expect(patches.at(-1)).toMatchObject({ background_preset: 'mist', card_preset: 'outline', avatar_shape: 'square', avatar_scale: 65 })
  await page.reload(); await page.getByRole('button', { name: 'Оформление', exact: true }).click()
  await expect(preview).toHaveClass(/theme-mist/)
  await expect(preview.locator('.avatar')).toHaveClass(/avatar--square/)
  expect(pageErrors).toEqual([])
})

test('nine templates preview real content, apply without touching links and undo', async ({ page }) => {
  const { patches, pageErrors } = await mockAppearance(page)
  const preview = page.locator('.preview-panel .profile-card')
  await page.getByRole('button', { name: 'Выбрать шаблон' }).click()
  await expect(page.locator('.template-tile')).toHaveCount(9)
  await page.getByRole('button', { name: 'Творческие', exact: true }).click()
  await expect(page.locator('.template-tile')).toHaveCount(3)
  await page.locator('.template-tile').filter({ hasText: 'Студия' }).click()
  await expect(page.locator('.template-gallery__detail')).toContainText('Тестовый профиль')
  await page.getByRole('button', { name: 'Применить «Студия»' }).click()
  await expect(preview).toHaveClass(/theme-cobalt/)
  await expect(preview.locator('.profile-link').first()).toHaveClass(/card-solid/)
  await expect(preview).toContainText('Мой сайт')
  await page.getByRole('button', { name: 'Отменить применение' }).click()
  await expect(preview).toHaveClass(/theme-midnight/)
  await page.getByRole('button', { name: 'Выбрать шаблон' }).click()
  await page.locator('.template-tile').filter({ hasText: 'Студия' }).click()
  await page.getByRole('button', { name: 'Применить «Студия»' }).click()
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Изменения сохранены')).toBeVisible()
  expect(patches.at(-1)).toMatchObject({ background_preset: 'cobalt', card_preset: 'solid', name_font: 'lobster', card_radius: 21 })
  await page.reload()
  await page.getByRole('button', { name: 'Оформление', exact: true }).click()
  await expect(preview).toHaveClass(/theme-cobalt/)
  expect(pageErrors).toEqual([])
})

test('custom gradient and bounded card controls persist without changing the old preset', async ({ page }) => {
  const { patches, pageErrors } = await mockAppearance(page)
  const preview = page.locator('.preview-panel .profile-card')
  await page.getByRole('button', { name: 'Градиент', exact: true }).click()
  await page.getByLabel('Цвет: Основной цвет фона', { exact: true }).fill('#e4dbcd')
  await page.getByLabel('Цвет: Второй цвет фона', { exact: true }).fill('#afc5d4')
  await page.getByText('Дополнительные настройки карточек').click()
  await page.getByLabel('Внутренний отступ карточек').fill('20')
  await page.getByLabel('Толщина рамки карточек').fill('2')
  await page.getByLabel('Плотность подложки карточек').fill('80')
  await expect(preview).toHaveClass(/theme-mist/)
  await expect(preview).toHaveCSS('background-image', /linear-gradient/)
  await expect(preview.locator('.profile-link').first()).toHaveCSS('border-top-width', '2px')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Изменения сохранены')).toBeVisible()
  expect(patches.at(-1)).toMatchObject({ background_preset: 'midnight', background_style: 'gradient', background_primary: '#e4dbcd', background_secondary: '#afc5d4', card_padding: 20, card_border_width: 2, card_opacity: 80 })
  await page.reload(); await page.getByRole('button', { name: 'Оформление', exact: true }).click()
  await expect(preview).toHaveCSS('background-image', /linear-gradient/)
  await page.getByRole('button', { name: 'Готовый', exact: true }).click()
  await page.getByRole('button', { name: 'Полночь', exact: true }).click()
  await expect(preview).toHaveClass(/theme-midnight/)
  expect(pageErrors).toEqual([])
})

test('a link can override its card style while keeping the same link id', async ({ page }) => {
  const { pageErrors } = await mockAppearance(page)
  const sent: Array<Record<string, unknown>> = []
  page.on('request', request => {
    if (request.url().includes('/profile_links') && request.method() === 'POST') {
      const body = request.postDataJSON()
      if (Array.isArray(body)) sent.push(...body)
    }
  })
  await page.getByRole('button', { name: 'Оформление', exact: true }).click()
  await page.locator('.preview-panel .profile-link').first().click()
  await page.getByLabel(/Стиль этой карточки/).selectOption('solid')
  await page.getByLabel(/Скругление этой карточки/).selectOption('21')
  const link = page.locator('.preview-panel .profile-link').first()
  await expect(link).toHaveClass(/card-solid/)
  await expect(link).toHaveCSS('border-radius', '21px')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Изменения сохранены')).toBeVisible()
  expect(sent).toContainEqual(expect.objectContaining({ id: 'link-test', card_preset_override: 'solid', card_radius_override: 21 }))
  expect(pageErrors).toEqual([])
})

test('font changed in Appearance survives reload and appears on the profile page', async ({ page }) => {
  const { patches } = await mockAppearance(page)
  await chooseFont(page, 'Имя', 'georgia')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Изменения сохранены')).toBeVisible()
  expect(patches.at(-1)).toMatchObject({ name_font: 'georgia' })
  await page.reload()
  await page.getByRole('button', { name: 'Оформление', exact: true }).click()
  await expect(page.getByLabel('Шрифт: Имя', { exact: true })).toHaveValue('georgia')
  await page.goto('/sample-user')
  await expect(page.locator('.public-preview-page h1')).toHaveCSS('font-family', /Georgia/)
})

test('representative font choices persist after reload for Cyrillic and Latin text', async ({ page }) => {
  test.setTimeout(120_000)
  await mockAppearance(page, false, 'Кириллица Latin')
  const font = page.getByLabel('Шрифт: Имя', { exact: true })
  for (const option of FONT_OPTIONS.filter(font => ['georgia', 'caveat'].includes(font.value))) {
    await chooseFromSelect(font,option.value)
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(page.getByText('Изменения сохранены')).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: 'Оформление', exact: true }).click()
    await expect(page.getByLabel('Шрифт: Имя', { exact: true })).toHaveValue(option.value)
    await expect(page.locator('.preview-panel h1')).toHaveCSS('font-family', new RegExp(option.family.split(',')[0].replaceAll("'", '')))
    await expect(page.locator('.preview-panel h1')).toHaveText('Кириллица Latin')
    const family = option.family.split(',')[0].replaceAll("'", '').trim()
    const loaded = await page.evaluate(async family => {
      const faces = await document.fonts.load(`400 21px "${family}"`, 'Кириллица Latin')
      return faces.filter(face => face.status === 'loaded').length
    }, family)
    expect(loaded, `${option.value}: both Cyrillic and Latin subsets load`).toBeGreaterThanOrEqual(2)
  }
})

test('per-card padding, border and opacity survive reload without changing the old default', async ({ page }) => {
  await mockAppearance(page)
  const card = page.locator('.preview-panel .profile-link').first()
  await expect(card).toHaveCSS('padding-left', '12px')
  await card.click()
  await page.getByText('Дополнительные настройки', { exact: true }).last().click()
  await page.getByLabel('Отступ этой карточки').fill('20')
  await page.getByLabel('Толщина рамки этой карточки').fill('2')
  await page.getByLabel('Плотность подложки этой карточки').fill('80')
  await expect(card).toHaveCSS('padding-left', '20px')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Изменения сохранены')).toBeVisible()
  await page.reload()
  await page.goto('/sample-user')
  await expect(page.locator('.public-preview-page .profile-link').first()).toHaveCSS('padding-left', '20px')
})

test('public cards remain tappable at 320px and honor reduced motion @mobile', async ({ page }) => {
  await mockAppearance(page)
  await page.setViewportSize({ width: 320, height: 640 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/sample-user')
  const card = page.locator('.public-preview-page .profile-link').first()
  const box = await card.boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(44)
  const duration = await card.evaluate(node => parseFloat(getComputedStyle(node).transitionDuration))
  expect(duration).toBeLessThanOrEqual(0.001)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
})

test('inline crop supports positioning, zoom and cancelling without uploading', async ({ page }) => {
  const { uploads, pageErrors } = await mockAppearance(page)
  await selectPhoto(page)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeDisabled()
  const previewImage = page.locator('.preview-panel .avatar img')
  await expect(previewImage).toHaveAttribute('src', /^data:image\/webp;base64,/)
  await page.getByLabel('Масштаб фото', { exact: true }).fill('2')
  const viewport = page.locator('.avatar-cropper__viewport')
  await viewport.scrollIntoViewIfNeeded()
  const box = (await viewport.boundingBox())!
  const initialLeft = await previewImage.evaluate(el => (el as HTMLElement).style.left)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 10, { steps: 4 })
  await page.mouse.up()
  await expect.poll(() => previewImage.evaluate(el => (el as HTMLElement).style.left)).not.toBe(initialLeft)
  if (test.info().project.name.includes('mobile')) {
    const header = (await page.locator('.dashboard-topbar').boundingBox())!
    expect(header.y).toBe(0)
  }
  await page.screenshot({ path: `/tmp/appearance-crop-${test.info().project.name}.png` })
  await expect(page.locator('.preview-panel')).toBeVisible()
  await page.getByRole('button', { name: 'Отмена', exact: true }).click()
  await expect(viewport).toHaveCount(0)
  await expect(previewImage).toHaveCount(0)
  expect(uploads).toHaveLength(0)
  expect(pageErrors).toEqual([])
})

test('crop applies a real image and preserves settings changed during upload', async ({ page }) => {
  const { patches, uploads, pageErrors } = await mockAppearance(page)
  await selectPhoto(page)
  await page.getByLabel('Масштаб фото', { exact: true }).fill('1.5')
  await page.getByRole('button', { name: 'Применить фото' }).click()
  await page.getByRole('button', { name: 'Кобальт', exact: true }).click()
  await expect(page.getByText('Аватар обновлён')).toBeVisible()
  await expect(page.locator('.preview-panel .profile-card')).toHaveClass(/theme-cobalt/)
  expect(uploads).toHaveLength(2)
  expect(uploads[0].includes(Buffer.from('WEBP'))).toBeTruthy()
  expect(patches[0]).toHaveProperty('avatar_path')
  expect(pageErrors).toEqual([])
  await expect(page.locator('.avatar-cropper__viewport')).toHaveCount(0)
  await expect(page.locator('.preview-panel .avatar img')).toHaveAttribute('srcset', /560w, .*1000w/)
  expect(await page.locator('.preview-panel .avatar img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Изменить кадр' }).click()
  await expect(page.getByRole('heading', { name: 'Настройте кадр' })).toBeVisible()
  await page.getByRole('button', { name: 'Отмена', exact: true }).click()
  expect(uploads).toHaveLength(2)
})


test('failed upload keeps crop editable and does not change stored avatar', async ({ page }) => {
  const { patches } = await mockAppearance(page, true)
  await selectPhoto(page)
  await page.getByRole('button', { name: 'Применить фото' }).click()
  await expect(page.getByText('Не удалось сохранить фото. Попробуйте ещё раз.')).toBeVisible()
  await expect(page.locator('.avatar-cropper__viewport')).toBeVisible()
  await expect(page.getByLabel('Масштаб фото', { exact: true })).toBeEnabled()
  expect(patches).toHaveLength(0)
  await page.getByRole('button', { name: 'Отмена', exact: true }).click()
})

test('mobile appearance uses a full-height preview dialog and no pinned strip @mobile', async ({ page }) => {
 await mockAppearance(page)
 for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
  await page.setViewportSize(viewport)
  await expect(page.locator('.preview-panel')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Превью', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Превью', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Предпросмотр страницы' })
  await expect(modal.locator('.profile-card')).toBeVisible()
  const rect=(await modal.boundingBox())!
  expect(rect.height).toBeGreaterThanOrEqual(viewport.height - 1)
  await modal.getByRole('button', { name: 'Закрыть' }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible()
 }
})


test('default card text maintains accessible contrast across themes, presets and minimum opacity @full', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockAppearance(page)
  await page.getByText('Дополнительные настройки карточек').click()
  await page.getByLabel('Плотность подложки карточек').fill('60')
  const themes = [
    { label: 'Полночь', stops: ['#152234', '#0b101a', '#111421'] },
    { label: 'Туман', stops: ['#e7e3dc', '#d6dce0', '#c7d4da'] },
    { label: 'Кобальт', stops: ['#193c6d', '#102948', '#091725'] },
  ]
  const presets = ['Стекло', 'Плотные', 'Контур']
  const rgb = (hex: string) => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16))
  const luminance = (values: number[]) => {
    const linear = values.map(channel => {
      const value = channel / 255
      return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
    })
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
  }
  const contrast = (foreground: number[], background: number[]) => {
    const [higher, lower] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
    return (higher + 0.05) / (lower + 0.05)
  }
  for (const theme of themes) {
    await page.getByRole('button', { name: theme.label, exact: true }).click()
    await expect(page.locator('.preview-panel .profile-card')).toHaveClass(new RegExp(`theme-${({ 'Полночь': 'midnight', 'Туман': 'mist', 'Кобальт': 'cobalt' } as Record<string, string>)[theme.label]}`))
    for (const preset of presets) {
      await page.getByRole('button', { name: preset, exact: true }).click()
      await expect(page.locator('.preview-panel .profile-link').first()).toHaveClass(new RegExp(`card-${({ 'Стекло': 'glass', 'Плотные': 'solid', 'Контур': 'outline' } as Record<string, string>)[preset]}`))
      // Class changes can precede the next painted computed-color update.
      // Wait for the actual contrast requirement; a persistent failure still fails.
      await expect(async () => {
        const styles = await page.locator('.preview-panel .profile-link').first().evaluate(element => {
          const card = getComputedStyle(element)
          const label = getComputedStyle(element.querySelector('.profile-link__label')!)
          const rgba = (color: string) => {
            const canvas = document.createElement('canvas')
            canvas.width = canvas.height = 1
            const context = canvas.getContext('2d')!
            context.fillStyle = color
            context.fillRect(0, 0, 1, 1)
            return Array.from(context.getImageData(0, 0, 1, 1).data)
          }
          return { background: rgba(card.backgroundColor), foreground: rgba(label.color) }
        })
        const bg = styles.background
        const fg = styles.foreground
        const alpha = bg[3] / 255
        for (const stop of theme.stops) {
          const backing = rgb(stop)
          const composited = backing.map((channel, i) => bg[i] * alpha + channel * (1 - alpha))
          expect(contrast(fg, composited), `${theme.label} / ${preset} over ${stop}; fg=${fg.join(',')} bg=${bg.join(',')}`).toBeGreaterThanOrEqual(4.5)
        }
      }).toPass({ timeout: 5000 })
    }
  }
})


test('capture typography and card preset visual matrix for desktop and mobile review @full', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await mockAppearance(page, false, 'Кириллица Latin')
  const control = page.getByLabel('Шрифт: Имя', { exact: true })
  const card = page.locator('.preview-panel .profile-card')
  for (const font of FONT_OPTIONS) {
    await chooseFromSelect(control,font.value)
    await expect(page.locator('.preview-panel h1')).toHaveCSS('font-family', new RegExp(font.family.split(',')[0].replaceAll("'", '')))
    await page.evaluate(() => document.fonts.ready.then(() => true))
    await card.screenshot({ path: testInfo.outputPath(`font-${font.value}.png`) })
  }
  await chooseFromSelect(control,'manrope')
  await expect(page.locator('.preview-panel h1')).toHaveCSS('font-family', /Manrope/)
  for (const theme of ['Полночь', 'Туман', 'Кобальт']) {
    await page.getByRole('button', { name: theme, exact: true }).click()
    await expect(card).toHaveClass(new RegExp(`theme-${({ 'Полночь': 'midnight', 'Туман': 'mist', 'Кобальт': 'cobalt' } as Record<string, string>)[theme]}`))
    for (const preset of ['Стекло', 'Плотные', 'Контур']) {
      await page.getByRole('button', { name: preset, exact: true }).click()
      await expect(card.locator('.profile-link').first()).toHaveClass(new RegExp(`card-${({ 'Стекло': 'glass', 'Плотные': 'solid', 'Контур': 'outline' } as Record<string, string>)[preset]}`))
      await card.screenshot({ path: testInfo.outputPath(`card-${theme}-${preset}.png`) })
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})


test('global link font preserves overrides and new links inherit it', async ({ page }) => {
  await mockAppearance(page)
  const sent: Array<Record<string, unknown>> = []
  page.on('request', request => {
    if (request.url().includes('/profile_links') && request.method() === 'POST') {
      const body = request.postDataJSON()
      if (Array.isArray(body)) sent.push(...body)
    }
  })
  await page.locator('.preview-panel .profile-link').first().click()
  await chooseFont(page, 'Название ссылки', 'georgia')
  await chooseFont(page, 'Текст ссылок', 'oswald')
  await expect(page.locator('.preview-panel .profile-link__label').first()).toHaveCSS('font-family', /Georgia/)
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Изменения сохранены')).toBeVisible()
  expect(sent.at(-1)).toMatchObject({ label_font: 'georgia' })
  await page.reload()
  await page.getByRole('button', { name: 'Оформление', exact: true }).click()
  await expect(page.getByLabel('Шрифт: Текст ссылок')).toHaveValue('oswald')
  await expect(page.locator('.preview-panel .profile-link__label').first()).toHaveCSS('font-family', /Georgia/)
  await page.locator('.preview-panel .profile-link').first().click()
  await page.getByRole('button', { name: 'Как у всех' }).click()
  await expect(page.locator('.preview-panel .profile-link__label').first()).toHaveCSS('font-family', /Oswald/)
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Изменения сохранены')).toBeVisible()
  expect(sent.at(-1)).toMatchObject({ label_font: null, label_font_size: null, label_color: null })
  await page.getByRole('button', { name: 'Ссылки', exact: true }).click()
  await page.getByRole('button', { name: /Добавить/ }).first().click()
  await expect(page.locator('.preview-panel .profile-link__label').first()).toHaveCSS('font-family', /Oswald/)
  await page.goto('/sample-user')
  await expect(page.locator('.public-preview-page .profile-link__label').first()).toHaveCSS('font-family', /Oswald/)
})
