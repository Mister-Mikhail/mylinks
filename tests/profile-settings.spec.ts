import { expect, test, type Page } from '@playwright/test'
import { FONT_OPTIONS } from '../src/lib/typography'

const id = '00000000-0000-4000-8000-000000000001'
const handle = 'sample-user'
const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp: 2100000000, role: 'authenticated' })).toString('base64url')}.signature`
const profile = { id, handle, display_name: 'Профиль', bio: 'О себе', avatar_url: null, avatar_path: null, avatar_shape: 'round', avatar_size: 'medium', avatar_scale: 28, background_preset: 'midnight', card_preset: 'glass', is_published: true, name_font: 'manrope', name_font_size: 21, bio_font: 'manrope', bio_font_size: 10, handle_font: 'manrope', handle_font_size: 10, created_at: '', updated_at: '' }
const links = [0, 1, 2].map(n => ({ id: `00000000-0000-4000-8000-00000000001${n}`, profile_id: id, label: `Ссылка ${n + 1}`, url: `https://example.com/${n}`, icon_key: 'link', position: n, is_visible: true, is_sensitive: n === 2, label_font: 'manrope', label_font_size: 11 }))

async function mock(page: Page, owner = true, contacts: Record<string, unknown>[] = []) {
  const writes: { table: string; body: Record<string, unknown> | Record<string, unknown>[] }[] = []
  const events: Record<string, unknown>[] = []
  if (owner) await page.addInitScript(({ id, token }) => localStorage.setItem('sb-loykiawbqdkitndqkegk-auth-token', JSON.stringify({ access_token: token, refresh_token: 'test', expires_at: 2100000000, expires_in: 3600, token_type: 'bearer', user: { id, email: 'test@example.com', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '' } })), { id, token })
  await page.route('**/rest/v1/**', route => {
    const table = new URL(route.request().url()).pathname.split('/').pop() ?? ''
    const method = route.request().method()
    if (table === 'record_profile_event') events.push(route.request().postDataJSON())
    else if (method !== 'GET' && table !== 'staff_role' && table !== 'get_profile_statistics') writes.push({ table, body: route.request().postDataJSON() })
    const data = table === 'profiles' ? profile : table === 'profile_links' ? links : table === 'profile_contacts' ? contacts : table === 'staff_role' ? null : table === 'get_profile_statistics' ? { views: 12, visitors: 8, clicks: 5, daily: [{ date: '2026-10-09', views: 12, clicks: 5 }], links: [{ id: links[0].id, label: 'Ссылка 1', clicks: 5 }] } : []
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  })
  await page.route('**/functions/v1/favicon**', route => route.fulfill({ status: 404, body: '' }))
  return { writes, events }
}

test('card arrows follow selection and update the preview and saved order @smoke', async ({ page }) => {
  const { writes } = await mock(page)
  await page.goto('/')
  const cards = page.locator('.link-editor:not(.contact-editor)')
  await expect(cards).toHaveCount(3)
  await page.getByRole('button', { name: 'Оформление', exact: true }).click()
  const rows = page.locator('.appearance-item').filter({ has: page.locator('.appearance-item__select') })
  await rows.nth(1).getByRole('button', { name: /Переместить ссылку выше/ }).click()
  await expect(rows.first().locator('.appearance-item__select')).toHaveText('Ссылка 2')
  await expect(rows.first().getByRole('button', { name: /Переместить ссылку выше/ })).toBeDisabled()
  await expect(page.locator('.preview-panel .profile-link').first()).toContainText('Ссылка 2')
  await page.getByRole('button', { name: 'Ссылки', exact: true }).click()
  const bounds = await cards.first().evaluate(card => {
    const icon = card.querySelector('.link-editor__site-icon')!.getBoundingClientRect()
    const adult = card.querySelector('.sensitive-toggle')!.getBoundingClientRect()
    return { iconRight: icon.right, adultLeft: adult.left }
  })
  expect(bounds.iconRight).toBeLessThan(bounds.adultLeft)
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Изменения сохранены')).toBeVisible()
  const saved = writes.find(write => write.table === 'profile_links')!.body as Record<string, unknown>[]
  expect(saved[0].id).toBe(links[1].id)
  expect(saved[0].position).toBe(0)
})

test('fonts and bounded sizes update immediately and are saved @smoke @mobile', async ({ page, isMobile }) => {
  const { writes } = await mock(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Оформление', exact: true }).click()
  await page.getByLabel('Шрифт: Имя', { exact: true }).selectOption('georgia')
  await page.getByLabel('Цвет: Имя', { exact: true }).fill('#12aabb')
  await page.getByLabel('Размер: Имя', { exact: true }).selectOption('28')
  await page.getByLabel('Размер: Мастер-ссылка', { exact: true }).selectOption('14')
  await page.getByLabel('Шрифт: О себе', { exact: true }).selectOption('mono')
  await page.locator('.appearance-item__select').first().click()
  await page.getByLabel('Шрифт: Название ссылки', { exact: true }).selectOption('verdana')
  await page.getByLabel('Размер: Название ссылки', { exact: true }).selectOption('16')
  await expect(page.locator('.preview-panel h1')).toHaveCSS('font-size', isMobile ? '16.8px' : '28px')
  await expect(page.locator('.preview-panel h1')).toHaveCSS('color', 'rgb(18, 170, 187)')
  await expect(page.locator('.preview-panel .profile-card__handle')).toHaveText(`mylinks.bar/${handle}`)
  await expect(page.locator('.preview-panel .profile-card__handle')).toHaveCSS('font-size', isMobile ? '11.2px' : '14px')
  expect(await page.getByLabel('Размер: Имя', { exact: true }).locator('option').allTextContents()).not.toContain('30 px')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Изменения сохранены')).toBeVisible()
  const savedProfile = writes.find(write => write.table === 'profiles')!.body
  expect(savedProfile).toMatchObject({ name_font: 'georgia', name_font_size: 28, name_color: '#12aabb', handle_font_size: 14, bio_font: 'mono' })
  expect((writes.find(write => write.table === 'profile_links')!.body as Record<string, unknown>[])[0]).toMatchObject({ label_font: 'verdana', label_font_size: 16 })
  if (isMobile) expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth))
})

test('individual card reset restores the common link typography', async ({ page }) => {
  await mock(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Оформление', exact: true }).click()
  await page.getByLabel('Шрифт: Текст ссылок').selectOption('georgia')
  await page.locator('.appearance-item__select').nth(1).click()
  await page.getByLabel('Шрифт: Название ссылки').selectOption('verdana')
  await page.getByRole('button', { name: 'Как у всех' }).click()
  await expect(page.getByLabel('Шрифт: Название ссылки')).toHaveValue('georgia')
})

test('owner statistics load, change period and show link counts', async ({ page }) => {
  await mock(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Статистика', exact: true }).click()
  await expect(page.locator('.statistics__metrics')).toContainText('12')
  await expect(page.locator('.statistics__metrics')).toContainText('8')
  await expect(page.locator('.statistics__table').last()).toContainText('Ссылка 1')
  const request = page.waitForRequest(request => request.url().includes('get_profile_statistics') && request.postDataJSON().p_days === 7)
  await page.getByLabel('Период статистики').selectOption('7')
  await request
  await expect(page.locator('.statistics__metrics')).toBeVisible()
  for (const value of [30, 90, 180, -1, 0]) {
    const periodRequest = page.waitForRequest(request => request.url().includes('get_profile_statistics') && request.postDataJSON().p_days === value)
    await page.getByLabel('Период статистики').selectOption(String(value))
    await periodRequest
    await expect(page.locator('.statistics__metrics')).toBeVisible()
  }
})

const contacts = [0,1].map(n => ({ id: `00000000-0000-4000-8000-00000000002${n}`, profile_id: id, kind: 'phone', label: `Телефон ${n+1}`, value: `+7999000000${n}`, position: n, is_visible: true, label_font: 'manrope', label_font_size: 10, value_font: 'manrope', value_font_size: 9 }))

test('all-time daily history can be paged without changing totals', async ({ page }) => {
  await mock(page)
  const daily=Array.from({length:45},(_,n)=>({date:new Date(Date.UTC(2026,9,9-n)).toISOString().slice(0,10),views:n===44?1:0,clicks:0}))
  await page.route('**/rest/v1/rpc/get_profile_statistics',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({views:1,visitors:1,clicks:0,from:daily[44].date,to:daily[0].date,daily,links:[]})}))
  await page.goto('/')
  await page.getByRole('button',{name:'Статистика',exact:true}).click()
  await expect(page.getByLabel('Период статистики')).toHaveValue('0')
  await expect(page.locator('.statistics__table tbody tr')).toHaveCount(30)
  await page.getByRole('button',{name:'Следующие',exact:true}).click()
  await expect(page.locator('.statistics__table tbody tr')).toHaveCount(15)
  await expect(page.locator('.statistics__table tbody tr').last()).toContainText('26 авг.')
  await expect(page.locator('.statistics__metrics > div').first().locator('strong')).toHaveText('1')
  await expect(page.getByRole('button',{name:'Следующие',exact:true})).toBeDisabled()
})

test('contact arrows, typography and saved positions follow the selected card @mobile', async ({ page, isMobile }, testInfo) => {
  const { writes } = await mock(page,true,contacts)
  await page.goto('/')
  const cards = page.locator('.contact-editor')
  await expect(cards).toHaveCount(2)
  await page.getByRole('button',{name:'Оформление',exact:true}).click()
  const contactRows=page.locator('.appearance-item').filter({has:page.locator('.appearance-item__details')})
  const second=contactRows.filter({hasText:'Телефон 2'})
  await second.getByRole('button',{name:/Переместить контакт выше/}).click()
  await expect(contactRows.first()).toContainText('Телефон 2')
  await expect(contactRows.first().getByRole('button',{name:/Переместить контакт выше/})).toBeDisabled()
  await contactRows.first().locator('summary').click()
  await contactRows.first().getByLabel('Шрифт: Подпись контакта',{exact:true}).selectOption('caveat')
  await contactRows.first().getByLabel('Размер: Подпись контакта',{exact:true}).selectOption('16')
  await contactRows.first().getByLabel('Шрифт: Значение контакта',{exact:true}).selectOption('pixel')
  await contactRows.first().getByLabel('Размер: Значение контакта',{exact:true}).selectOption('14')
  await expect(page.locator('.preview-panel .profile-contact strong').first()).toHaveCSS('font-size','16px')
  await expect(page.locator('.preview-panel .profile-contact small').first()).toHaveCSS('font-size','14px')
  await contactRows.first().scrollIntoViewIfNeeded()
  await page.screenshot({path:testInfo.outputPath('contacts.png')})
  if(isMobile) expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(()=>innerWidth))
  await page.getByRole('button',{name:'Сохранить',exact:true}).click()
  await expect(page.getByText('Изменения сохранены')).toBeVisible()
  const saved=writes.find(write=>write.table==='profile_contacts')!.body as Record<string,unknown>[]
  expect(saved[0]).toMatchObject({id:contacts[1].id,position:0,label_font:'caveat',label_font_size:16,value_font:'pixel',value_font_size:14})
})

test('public contacts use saved fonts and fit their card', async ({ page }) => {
  await mock(page,false,[{...contacts[0],label_font:'ruslan',value_font:'mono',label_font_size:16,value_font_size:14,label:'Длинная подпись '.repeat(5),value:'+799912345678901234567890'}])
  await page.goto(`/${handle}`)
  const contact=page.locator('.profile-contact')
  await expect(contact.locator('strong')).toHaveCSS('font-family','"Ruslan Display", fantasy')
  await expect(contact.locator('small')).toHaveCSS('font-family','"Roboto Mono", "Courier New", monospace')
  const bounds=await contact.evaluate(el=>({height:el.getBoundingClientRect().height,copy:el.querySelector('.profile-contact__copy')!.getBoundingClientRect().height,width:el.getBoundingClientRect().width,copyWidth:el.querySelector('.profile-contact__copy')!.getBoundingClientRect().width}))
  expect(bounds.copy).toBeLessThan(bounds.height)
  expect(bounds.copyWidth).toBeLessThan(bounds.width)
})

test('all fifteen fonts load real Cyrillic and Latin faces', async ({ page }) => {
  await mock(page)
  await page.goto('/')
  await page.getByRole('button',{name:'Оформление',exact:true}).click()
  await expect(page.getByLabel('Шрифт: Имя',{exact:true}).locator('option')).toHaveCount(15)
  const results=await page.evaluate(async families=>Promise.all(families.map(async family=>{
    const faces=await document.fonts.load(`400 20px ${family}`,'Имя Михаил · Name 123')
    return {family,loaded:faces.length>0 && faces.every(face=>face.status==='loaded')}
  })),FONT_OPTIONS.map(option=>option.family))
  expect(results.filter(result=>!result.loaded)).toEqual([])
})

test('visitor events count once and an adult click waits for confirmation', async ({ page }) => {
  const { events } = await mock(page, false)
  await page.goto(`/${handle}`)
  await expect(page.getByRole('heading', { name: 'Профиль' })).toBeVisible()
  await expect.poll(() => events.filter(event => event.p_link_id === null).length).toBe(1)
  await page.getByRole('link', { name: /Ссылка 3/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(events.filter(event => event.p_link_id === links[2].id)).toHaveLength(0)
  await page.getByRole('button', { name: 'Вернуться', exact: true }).click()
  expect(events.filter(event => event.p_link_id === links[2].id)).toHaveLength(0)
  await page.getByRole('link', { name: /Ссылка 3/ }).click()
  await page.getByRole('button', { name: 'Мне есть 18 — продолжить' }).click()
  await expect.poll(() => events.filter(event => event.p_link_id === links[2].id).length).toBe(1)
})

test('owner public preview does not create events', async ({ page }) => {
  const { events } = await mock(page)
  await page.goto(`/${handle}`)
  await expect(page.getByRole('button', { name: 'Личный кабинет' })).toBeVisible()
  await page.getByRole('link', { name: /Ссылка 3/ }).click()
  await page.getByRole('button', { name: 'Мне есть 18 — продолжить' }).click()
  expect(events).toEqual([])
})


test('largest fonts keep long text and mobile navigation inside their slots @mobile', async ({ page, isMobile }, testInfo) => {
  await mock(page)
  await page.goto('/')
  await page.getByLabel('Отображаемое имя', { exact: true }).fill('ДлинноеИмя'.repeat(6))
  await page.getByRole('button',{name:'Оформление',exact:true}).click()
  await page.getByLabel('Размер: Имя', { exact: true }).selectOption('28')
  await page.getByLabel('Размер: О себе', { exact: true }).selectOption('14')
  await page.getByRole('button',{name:'Ссылки',exact:true}).click()
  await page.getByLabel('О себе', { exact: true }).fill('Очень длинное описание профиля '.repeat(5))
  await page.locator('.link-editor:not(.contact-editor)').first().getByLabel('Название ссылки', { exact: true }).fill('ДлиннаяСсылка'.repeat(6))
  await page.getByRole('button',{name:'Оформление',exact:true}).click()
  await page.locator('.appearance-item__select').first().click()
  await page.getByLabel('Размер: Название ссылки', { exact: true }).selectOption('16')
  if (isMobile) {
    const tops = await page.locator('.editor-nav button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().top))
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1)
    await expect(page.getByRole('button', { name: 'Статистика', exact: true })).toBeInViewport()
    await page.getByRole('button', { name: 'Открыть страницу', exact: true }).click()
    await expect(page.locator('.public-preview-page .profile-card')).toBeVisible()
  }
  const profileCard = page.locator(isMobile ? '.public-preview-page .profile-card' : '.preview-panel .profile-card')
  await profileCard.scrollIntoViewIfNeeded()
  const heights = await profileCard.evaluate(card => ({ name: card.querySelector('h1')!.getBoundingClientRect().height, bio: card.querySelector('.profile-card__bio')!.getBoundingClientRect().height, link: card.querySelector('.profile-link__text')!.getBoundingClientRect().height }))
  expect(heights.name).toBeLessThanOrEqual(68)
  expect(heights.bio).toBeLessThanOrEqual(87)
  expect(heights.link).toBeLessThanOrEqual(39)
  if (isMobile) {
    await page.getByRole('button', { name: 'Личный кабинет', exact: true }).click()
    await page.getByRole('button', { name: 'Статистика', exact: true }).click()
    await expect(page.locator('.statistics__metrics')).toBeVisible()
  }
  await page.screenshot({ path: testInfo.outputPath('layout.png'), fullPage: false })
})
