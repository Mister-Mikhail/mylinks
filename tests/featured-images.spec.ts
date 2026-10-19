import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { mockWizard } from './helpers/wizard'
test('featured card preserves saved ID, crop and image when switching display modes',async({page},info)=>{
 const state=await mockWizard(page),id='00000000-0000-4000-8000-000000000081',path=`${state.profile.id}/11111111-1111-4111-8111-111111111111.webp`
 state.profile={...state.profile,onboarding_completed:true,handle:'anna.page',display_name:'Анна'}
 state.links=[{id,profile_id:state.profile.id,label:'Мой сайт',url:'https://example.com',position:0,is_visible:true,icon_key:'link',presentation:'normal',image_path:path,image_alt:'Проект',image_position_x:30,image_position_y:60}]
 const writes:Record<string,unknown>[][]=[]
 await page.route('**/rest/v1/profile_links**',route=>{if(route.request().method()==='GET')return route.fulfill({contentType:'application/json',body:JSON.stringify(state.links)});const data=route.request().postDataJSON();writes.push(data);state.links=data;return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify(data)})})
 const image=readFileSync('tests/fixtures/avatar.webp')
 await page.route('**/storage/v1/**',route=>{const url=new URL(route.request().url());return route.request().method()==='GET'?route.fulfill({contentType:'image/webp',body:image}):route.fulfill({contentType:'application/json',body:JSON.stringify({signedURL:url.pathname.replace('/storage/v1','')+'?token=test'})})})
 await page.reload()
 await page.getByLabel('Вид карточки: Мой сайт').selectOption('featured')
 await expect(page.locator('.preview-panel .profile-link--featured')).toHaveCount(1)
 await expect(page.locator('.preview-panel .profile-link__image')).toHaveCSS('object-position','30% 60%')
 await expect(page.locator('.preview-panel .profile-link__image')).toBeVisible()
 await expect.poll(()=>page.locator('.preview-panel .profile-link__image').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0)
 await page.locator('.preview-panel .profile-link--featured').screenshot({path:info.outputPath('featured-card.png')})
 await page.getByRole('button',{name:'Сохранить',exact:true}).click()
 await expect.poll(()=>writes.length).toBe(1)
 expect(writes[0][0]).toMatchObject({id,url:'https://example.com',presentation:'featured',image_path:path,image_position_x:30,image_position_y:60})
 await page.reload()
 await expect(page.getByLabel('Вид карточки: Мой сайт')).toHaveValue('featured')
 await page.getByLabel('Вид карточки: Мой сайт').selectOption('normal')
 await page.getByRole('button',{name:'Сохранить',exact:true}).click()
 await expect.poll(()=>writes.length).toBe(2)
 expect(writes[1][0]).toMatchObject({id,presentation:'normal',image_path:path})
})

test('public featured image loads and records a click against the existing link ID',async({page,context})=>{
 const state=await mockWizard(page,false),id='00000000-0000-4000-8000-000000000081'
 state.profile={...state.profile,onboarding_completed:true,handle:'anna.page',display_name:'Анна',is_published:true}
 state.links=[{id,profile_id:state.profile.id,label:'Открыть проект',url:'https://example.com/project',position:0,is_visible:true,icon_key:'link',presentation:'featured',image_path:`${state.profile.id}/11111111-1111-4111-8111-111111111111.webp`,image_alt:'Проект'}]
 await page.route('**/profile-image.php?**',route=>route.fulfill({contentType:'image/webp',body:readFileSync('tests/fixtures/avatar.webp')}))
 await context.route('https://example.com/**',route=>route.fulfill({contentType:'text/html',body:'Project'}))
 const events:Record<string,unknown>[]=[]
 await page.route('**/rest/v1/rpc/record_profile_event',route=>{events.push(route.request().postDataJSON());return route.fulfill({contentType:'application/json',body:'null'})})
 await page.goto('/anna.page')
 await expect(page.getByAltText('Проект',{exact:true})).toBeVisible()
 await expect.poll(()=>page.getByAltText('Проект',{exact:true}).evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0)
 await page.getByRole('link',{name:/Открыть проект/}).click()
 await expect.poll(()=>events.some(event=>event.p_link_id===id&&event.p_profile_id===state.profile.id)).toBe(true)
})
