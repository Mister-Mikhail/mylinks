import { test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

// Captures every screen for the design file in Figma. Runs only with DESIGN_SCREENS=1:
//   DESIGN_SCREENS=1 npx playwright test tests/design-screens.spec.ts
// Images land in design-screens/<NN>-<screen>--<desktop|mobile>.png
test.skip(!process.env.DESIGN_SCREENS, 'design screenshots are generated on request')

const OUT = 'design-screens'
const id = '00000000-0000-4000-8000-000000000001'
const authKey = 'sb-loykiawbqdkitndqkegk-auth-token'
const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp: 2100000000, role: 'authenticated' })).toString('base64url')}.signature`
const user = { id, email: 'anna@example.com', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2025-01-01T00:00:00Z' }
const session = { access_token: token, refresh_token: 'demo-refresh', expires_at: 2100000000, expires_in: 3600, token_type: 'bearer', user }

const profile = {
  id, handle: 'anna', display_name: 'Анна Соколова', bio: 'Фотограф и дизайнер. Снимаю людей, города и свет.',
  avatar_url: null, avatar_path: `${id}/avatar.png`, avatar_shape: 'round', avatar_size: 'medium', avatar_scale: 32,
  background_preset: 'midnight', card_preset: 'glass', is_published: true,
  created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z',
}
const link = (n: number, label: string, url: string, icon_key: string, is_sensitive = false) =>
  ({ id: `link-${n}`, profile_id: id, label, url, icon_key, position: n, is_visible: true, is_sensitive, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' })
const links = [
  link(0, 'Instagram', 'https://instagram.com/anna.photo', 'instagram'),
  link(1, 'Telegram-канал', 'https://t.me/anna_photo', 'telegram'),
  link(2, 'YouTube', 'https://youtube.com/@annaphoto', 'youtube'),
  link(3, 'Портфолио', 'https://www.behance.net/anna', 'link'),
  link(4, 'Написать в WhatsApp', 'https://wa.me/79990000000', 'whatsapp'),
  link(5, 'VK', 'https://vk.com/anna.photo', 'vk'),
  link(6, 'Закрытый канал', 'https://onlyfans.com/anna', 'onlyfans', true),
]
const contact = (n: number, kind: string, label: string, value: string) =>
  ({ id: `contact-${n}`, profile_id: id, kind, label, value, position: n, is_visible: true, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' })
const contacts = [
  contact(0, 'phone', 'Запись на съёмку', '+7 999 000-00-00'),
  contact(1, 'address', 'Студия', 'Москва, Большая Очаковская улица, 47А'),
  contact(2, 'email', 'Почта', 'anna@example.com'),
]

/** A 512×512 warm-to-violet gradient PNG used as the demo avatar (no browser needed). */
function avatarPng() {
  const size = 512
  const rows = Buffer.alloc((size * 3 + 1) * size)
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1)
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * size)
      rows[row + 1 + x * 3] = Math.round(246 + (122 - 246) * t)
      rows[row + 2 + x * 3] = Math.round(194 + (79 - 194) * t)
      rows[row + 3 + x * 3] = Math.round(139 + (214 - 139) * t)
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf: Buffer) => {
    let c = 0xffffffff
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'ascii')
    const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0)
    return Buffer.concat([head, data, tail])
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])
}

const AVATAR = avatarPng()

async function mockBackend(page: Page, options: { signedIn?: boolean; published?: boolean; staff?: boolean } = {}) {
  const state = { profile: { ...profile, is_published: options.published ?? true } }
  if (options.signedIn) await page.addInitScript(({ authKey, session }) => localStorage.setItem(authKey, JSON.stringify(session)), { authKey, session })
  await page.route('**/auth/v1/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(route.request().url().includes('/user') ? user : session) }))
  await page.route('**/rest/v1/**', async route => {
    const request = route.request()
    const name = new URL(request.url()).pathname.split('/').pop()
    const authenticated = Boolean(options.signedIn) && request.headers()['authorization'] === `Bearer ${token}`
    if (name === 'staff_role') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(options.staff ? 'admin' : null) })
    if (request.method() !== 'GET') return route.fulfill({ status: 204 })
    const otherHandle = request.url().includes('handle=eq.') && !request.url().includes(`handle=eq.${profile.handle}`)
    const visible = !otherHandle && (state.profile.is_published || authenticated)
    const data = name === 'profiles' ? (visible ? state.profile : null)
      : name === 'profile_links' ? (visible ? links : [])
      : name === 'profile_contacts' ? (visible ? contacts : [])
      : []
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  })
  await page.route('**/storage/v1/**', async route => {
    const request = route.request()
    if (request.url().includes('/object/sign/') && request.method() === 'POST') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ signedURL: `/object/sign/avatars/${id}/avatar.png?token=demo` }) })
    }
    return route.fulfill({ contentType: 'image/png', body: AVATAR })
  })
}

async function shot(page: Page, name: string, fullPage = true) {
  mkdirSync(OUT, { recursive: true })
  const device = test.info().project.name.includes('mobile') ? 'mobile' : 'desktop'
  await page.evaluate(() => document.fonts.ready)
  await page.waitForLoadState('networkidle').catch(() => undefined)
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/${name}--${device}.png`, fullPage })
}

test('01 landing, 02 sign-in, 03 registration', async ({ page }) => {
  await mockBackend(page)
  await page.goto('/')
  await page.getByRole('heading', { name: /Одна ссылка/i }).waitFor()
  await shot(page, '01-landing')
  await page.getByRole('button', { name: 'У меня уже есть профиль' }).click()
  await page.getByRole('heading', { name: 'Войдите в редактор' }).waitFor()
  await shot(page, '02-sign-in', false)
  await page.getByRole('button', { name: /Нет профиля/ }).click()
  await page.getByRole('heading', { name: 'Создайте мастер‑ссылку' }).waitFor()
  await shot(page, '03-registration', false)
})

test('04 editor links, 05 appearance, 06 avatar crop', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.goto('/')
  await page.getByRole('heading', { name: 'Ссылки и контакты' }).waitFor()
  await shot(page, '04-editor-links')
  await page.getByRole('button', { name: 'Оформление', exact: true }).click()
  await page.getByRole('heading', { name: 'Оформление', level: 1 }).waitFor()
  await shot(page, '05-editor-appearance')
  await page.locator('input[type=file]').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: AVATAR })
  await page.getByRole('heading', { name: 'Настройте кадр' }).waitFor()
  await shot(page, '06-editor-avatar-crop', false)
})

test('07 public profile, 08 adult warning, 09 not published', async ({ page }) => {
  await mockBackend(page)
  await page.goto('/anna')
  await page.getByRole('heading', { name: profile.display_name }).waitFor()
  await shot(page, '07-public-profile')
  await page.getByRole('link', { name: /Закрытый канал/ }).click()
  await page.getByRole('heading', { name: 'Возможен контент для взрослых' }).waitFor()
  await shot(page, '08-adult-warning', false)
  await page.goto('/nobody')
  await page.getByRole('heading', { name: 'Страница не опубликована' }).waitFor()
  await shot(page, '09-not-published', false)
})

test('10 email confirmation', async ({ page }) => {
  await mockBackend(page)
  await page.goto('/auth/confirmed#error_code=otp_expired')
  await page.getByRole('heading', { name: /Ссылка уже недействительна|Подтверждаем почту/ }).waitFor()
  await shot(page, '10-email-confirmation', false)
})

test('11 admin panel', async ({ page }) => {
  await mockBackend(page, { signedIn: true, staff: true })
  await page.goto('/admin')
  await page.waitForTimeout(1500)
  await shot(page, '11-admin')
})
