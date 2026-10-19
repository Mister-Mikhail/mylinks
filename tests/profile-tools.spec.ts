import { expect, test, type Download, type Page } from '@playwright/test'
import { createRequire } from 'node:module'
import jsQR from 'jsqr'
import { mockWizard } from './helpers/wizard'
import { profileUrl } from '../src/lib/profileUrl'
const { PNG }=createRequire(import.meta.url)('pngjs')
const id='00000000-0000-4000-8000-000000000091'
async function setup(page:Page,handle='anna.page'){
 const state=await mockWizard(page)
 state.profile={...state.profile,handle,display_name:'Анна',onboarding_completed:true}
 state.links=[{id:'link',profile_id:id,label:'VK',url:'https://vk.com/anna',position:0,is_visible:true,icon_key:'vk'}]
 state.contacts=[{id:'public',profile_id:id,kind:'email',label:'Email',value:'public@example.com',position:0,is_visible:true},{id:'private',profile_id:id,kind:'phone',label:'Телефон',value:'+79990000000',position:1,is_visible:false}]
 await page.route('**/auth/v1/user',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({id,email:'test@example.com',app_metadata:{},user_metadata:{}})}))
 await page.reload()
 await expect(page.getByRole('button',{name:'Экспорт данных'})).toBeVisible()
 return state
}
async function bytes(download:Download){const stream=await download.createReadStream();const chunks:Buffer[]=[];for await(const chunk of stream!)chunks.push(chunk);return Buffer.concat(chunks)}
for(const handle of ['anna.page','anna_page'])test(`QR PNG and SVG encode the canonical address ${handle}`,async({page})=>{
 await setup(page,handle)
 await page.getByRole('button',{name:'QR-код / Поделиться'}).click()
 const dialog=page.getByRole('dialog',{name:'QR-код страницы'})
 await expect(dialog).toContainText('Страница пока закрыта')
 await expect(dialog.locator('img')).toBeVisible()
 await expect(dialog.getByLabel('Версия',{exact:true})).toHaveCount(0)
 {
  await expect(dialog.getByRole('button',{name:'PNG',exact:true})).toBeEnabled()
  const pending=page.waitForEvent('download');await dialog.getByRole('button',{name:'PNG',exact:true}).click()
  const download=await pending,buffer=await bytes(download),png=PNG.sync.read(buffer)
  expect(download.suggestedFilename()).toMatch(/\.png$/);expect(png.width).toBeGreaterThanOrEqual(1024)
  const decoded=jsQR(new Uint8ClampedArray(png.data),png.width,png.height,{inversionAttempts:'attemptBoth'})
  expect(decoded?.data).toBe(`https://mylinks.bar/${handle}`)
 }
 const pending=page.waitForEvent('download');await dialog.getByRole('button',{name:'SVG',exact:true}).click()
 const download=await pending,svg=(await bytes(download)).toString()
 expect(download.suggestedFilename()).toMatch(/\.svg$/);expect(svg).toContain('<svg');expect(svg).not.toMatch(/<script|<foreignObject|onload=/i)
 expect(profileUrl('a/b?x=1')).toBe('https://mylinks.bar/a%2Fb%3Fx%3D1')
})
for(const includePrivate of [false,true])test(`JSON export requires opt-in for hidden contacts: ${includePrivate}`,async({page})=>{
 const state=await setup(page)
 const saved=JSON.stringify(state)
 await page.getByRole('button',{name:'Экспорт данных'}).click()
 const dialog=page.getByRole('dialog',{name:'Экспорт данных'})
 await dialog.getByLabel('Контакты',{exact:true}).check()
 if(includePrivate)await dialog.getByLabel('Включить скрытые контакты').check()
 const pending=page.waitForEvent('download');await dialog.getByRole('button',{name:'Скачать JSON'}).click()
 const download=await pending,buffer=await bytes(download),data=JSON.parse(buffer.toString())
 expect(download.suggestedFilename()).toMatch(/\.json$/)
 expect(data.schema_version).toBe(1);expect(data.profile.handle).toBe('anna.page');expect(data.links[0].url).toBe('https://vk.com/anna')
 expect(data.contacts).toHaveLength(includePrivate?2:1)
 expect(buffer.toString().includes('+79990000000')).toBe(includePrivate)
 expect(buffer.toString()).not.toMatch(/refresh_token|access_token|test@example.com/)
 expect(JSON.stringify(state)).toBe(saved)
})
test('export refuses changed identity and provides short-lived URLs only when explicitly selected',async({page})=>{
 const state=await setup(page)
 state.profile.avatar_path=id+'/avatar.gif'
 let ttl=0
 await page.route('**/storage/v1/object/sign/**',route=>{if(route.request().method()==='GET')return route.fulfill({status:404});ttl=route.request().postDataJSON().expiresIn;return route.fulfill({contentType:'application/json',body:'{"signedURL":"/object/sign/avatars/test?token=short-lived"}'})})
 await page.getByRole('button',{name:'Экспорт данных'}).click()
 await page.getByLabel('Добавить ссылки на скачивание файлов на 5 минут').check()
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать JSON'}).click()
 const data=JSON.parse((await bytes(await pending)).toString())
 expect(ttl).toBe(300);expect(data.assets[0].download_url).toContain('short-lived');expect(Date.parse(data.assets[0].expires_at)-Date.now()).toBeLessThanOrEqual(300000)
 await page.getByRole('button',{name:'Закрыть',exact:true}).click()
 await page.reload()
 await page.getByRole('button',{name:'Экспорт данных'}).click()
 state.profile.id='00000000-0000-4000-8000-000000000092'
 await page.getByRole('button',{name:'Скачать JSON'}).click()
 await expect(page.getByRole('alert')).toContainText('Не удалось загрузить ваши данные')
})

test('export preserves custom appearance and individual card overrides without changing saved data',async({page})=>{
 const state=await setup(page)
 Object.assign(state.profile,{background_position_x:25,background_position_y:75,background_zoom:180,background_style:'gradient',background_primary:'#e17209',background_secondary:'#162638',card_radius:24,card_padding:20,card_border_width:2,card_opacity:80,link_font:'lora',link_font_size:18,link_color:'#e17209',show_qr:true,qr_size:180})
 Object.assign(state.links[0] as object,{card_preset_override:'outline',card_radius_override:12,card_style:{version:1,padding:16,borderWidth:1,opacity:90},label_color:null})
 const saved=JSON.stringify(state)
 await page.getByRole('button',{name:'Экспорт данных'}).click()
 const pending=page.waitForEvent('download')
 await page.getByRole('button',{name:'Скачать JSON'}).click()
 const data=JSON.parse((await bytes(await pending)).toString())
 expect(data.appearance).toMatchObject({background_position_x:25,background_position_y:75,background_zoom:180,background_style:'gradient',background_primary:'#e17209',background_secondary:'#162638',card_radius:24,card_padding:20,card_border_width:2,card_opacity:80,link_font:'lora',link_font_size:18,link_color:'#e17209',show_qr:true,qr_size:180})
 expect(data.links[0]).toMatchObject({id:'link',card_preset_override:'outline',card_radius_override:12,card_style:{version:1,padding:16,borderWidth:1,opacity:90},label_color:null})
 expect(JSON.stringify(state)).toBe(saved)
})
