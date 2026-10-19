import { expect, test } from '@playwright/test'
import { mockWizard } from './helpers/wizard'
test('featured card preserves saved ID, crop and image when switching display modes',async({page})=>{
 const state=await mockWizard(page),id='00000000-0000-4000-8000-000000000081',path=`${state.profile.id}/11111111-1111-4111-8111-111111111111.webp`
 state.profile={...state.profile,onboarding_completed:true,handle:'anna.page',display_name:'Анна'}
 state.links=[{id,profile_id:state.profile.id,label:'Мой сайт',url:'https://example.com',position:0,is_visible:true,icon_key:'link',presentation:'normal',image_path:path,image_alt:'Проект',image_position_x:30,image_position_y:60}]
 const writes:Record<string,unknown>[][]=[]
 await page.route('**/rest/v1/profile_links**',route=>{if(route.request().method()==='GET')return route.fulfill({contentType:'application/json',body:JSON.stringify(state.links)});const data=route.request().postDataJSON();writes.push(data);state.links=data;return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify(data)})})
 await page.reload()
 await page.getByLabel('Вид карточки: Мой сайт').selectOption('featured')
 await expect(page.locator('.preview-panel .profile-link--featured')).toHaveCount(1)
 await expect(page.locator('.preview-panel .profile-link__image')).toHaveCSS('object-position','30% 60%')
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
