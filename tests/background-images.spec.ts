import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockWizard } from './helpers/wizard'
async function setup(page:import('@playwright/test').Page){
 const state=await mockWizard(page);state.profile={...state.profile,onboarding_completed:true,handle:'anna.page',display_name:'Анна'}
 const image=readFileSync('tests/fixtures/avatar.webp')
 let processing=0
 await page.route('**/profile-image-process.php',route=>{processing++;expect(route.request().headers().authorization).toMatch(/^Bearer /);return route.fulfill({contentType:'application/json',body:JSON.stringify({mime:'image/webp',data:image.toString('base64')})})})
 await page.route('**/storage/v1/**',route=>{const url=new URL(route.request().url());if(route.request().method()==='GET')return route.fulfill({contentType:'image/webp',body:image});if(url.pathname.includes('/object/sign/'))return route.fulfill({contentType:'application/json',body:JSON.stringify({signedURL:url.pathname.replace('/storage/v1','')+'?token=test'})});return route.fulfill({contentType:'application/json',body:'{"Key":"test"}'})})
 await page.reload();await page.getByRole('button',{name:'Оформление',exact:true}).click()
 await page.getByRole('button',{name:'Изображение',exact:true}).click()
 return {state,getProcessing:()=>processing}
}
test('background image remains a private draft until Save, survives reload and can reset',async({page},info)=>{
 const {state}=await setup(page)
 await page.getByLabel('Загрузить фон',{exact:true}).setInputFiles('tests/fixtures/avatar.webp')
 await expect(page.getByAltText('Загрузить фон')).toBeVisible()
 expect(state.profile.background_image_path).toBeUndefined()
 await expect(page.locator('.preview-panel .profile-card')).toHaveCSS('background-image',/profile-assets/)
 await page.locator('.preview-panel .profile-card').screenshot({path:info.outputPath('background-image.png')})
 await page.getByLabel('Затемнение фона').fill('65')
 await page.getByRole('button',{name:'Сохранить',exact:true}).click()
 await expect.poll(()=>state.profile.background_overlay).toBe(65)
 expect(state.profile.background_image_path).toMatch(/^00000000-0000-4000-8000-000000000091\/[a-f0-9-]{36}\.webp$/)
 const path=state.profile.background_image_path
 await page.reload();await page.getByRole('button',{name:'Оформление',exact:true}).click()
 await expect(page.getByAltText('Загрузить фон')).toBeVisible()
 expect(state.profile.background_image_path).toBe(path)
 await page.getByRole('button',{name:'Вернуть исходный фон'}).click()
 await expect(page.locator('.preview-panel .profile-card')).not.toHaveCSS('background-image',/profile-assets/)
 await page.getByRole('button',{name:'Сохранить',exact:true}).click()
 await expect.poll(()=>state.profile.background_image_path).toBe(null)
})
test('invalid background files fail without network upload',async({page})=>{
 const {getProcessing}=await setup(page)
 await page.getByLabel('Загрузить фон',{exact:true}).setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')})
 await expect(page.getByRole('alert')).toContainText('JPG, PNG или WebP')
 expect(getProcessing()).toBe(0)
})
