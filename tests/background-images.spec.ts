import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockWizard } from './helpers/wizard'
async function setup(page:import('@playwright/test').Page){
 const state=await mockWizard(page);state.profile={...state.profile,onboarding_completed:true,handle:'anna.page',display_name:'Анна'}
 const image=readFileSync('tests/fixtures/background-grid.webp')
 let processing=0
 await page.route('**/profile-image-process.php',route=>{processing++;expect(route.request().headers().authorization).toMatch(/^Bearer /);return route.fulfill({contentType:'application/json',body:JSON.stringify({mime:'image/webp',data:image.toString('base64')})})})
 await page.route('**/storage/v1/**',route=>{const url=new URL(route.request().url());if(route.request().method()==='GET')return route.fulfill({contentType:'image/webp',body:image});if(url.pathname.includes('/object/sign/'))return route.fulfill({contentType:'application/json',body:JSON.stringify({signedURL:url.pathname.replace('/storage/v1','')+'?token=test'})});return route.fulfill({contentType:'application/json',body:'{"Key":"test"}'})})
 await page.reload();await page.getByRole('button',{name:'Оформление',exact:true}).click()
 await page.getByRole('button',{name:'Изображение',exact:true}).click()
 return {state,getProcessing:()=>processing}
}
test('background photo applies only after confirming, preserves crop on reload, and can reset @mobile',async({page},info)=>{
 const {state}=await setup(page)
 await page.getByLabel('Загрузить фон',{exact:true}).setInputFiles('tests/fixtures/background-grid.webp')
 await expect(page.getByRole('dialog')).toBeVisible()
 await page.getByRole('button',{name:'Отмена',exact:true}).click()
 await expect(page.getByAltText('Загрузить фон')).toHaveCount(0)
 await page.getByLabel('Загрузить фон',{exact:true}).setInputFiles('tests/fixtures/background-grid.webp')
 await expect(page.getByRole('dialog')).toBeVisible()
 expect(state.profile.background_image_path).toBeUndefined()
 await page.getByRole('button',{name:'Применить',exact:true}).click()
 await expect(page.getByAltText('Загрузить фон')).toBeVisible()
 await expect(page.getByLabel('Положение фона по горизонтали',{exact:true})).toHaveCount(0)
 await expect(page.getByLabel('Увеличение фонового фото',{exact:true})).toHaveCount(0)
 await page.getByLabel('Затемнение фона').fill('65')
 await page.getByRole('button',{name:'Сохранить',exact:true}).click()
 await expect.poll(()=>state.profile.background_overlay).toBe(65)
 expect(state.profile.background_crop).toMatchObject({version:1,mode:'frame',zoom:1,x:0,y:0,fill:'blur'})
 const path=state.profile.background_image_path,crop=state.profile.background_crop
 await page.reload();await page.getByRole('button',{name:'Оформление',exact:true}).click()
 await expect(page.getByAltText('Загрузить фон')).toBeVisible()
 expect(state.profile.background_image_path).toBe(path)
 await expect(page.locator('.preview-panel .profile-card__photo>.cropped-image')).toHaveAttribute('data-crop',JSON.stringify(crop))
 await page.locator('.preview-panel .profile-card').screenshot({path:info.outputPath('background-crop.png')})
 await page.getByRole('button',{name:'Вернуть исходный фон'}).click()
 await expect(page.locator('.preview-panel .profile-card')).not.toHaveClass(/profile-card--image/)
 await page.getByRole('button',{name:'Сохранить',exact:true}).click()
 await expect.poll(()=>state.profile.background_image_path).toBe(null)
 expect(state.profile.background_crop).toBe(null)
})
test('invalid background files fail without network upload',async({page})=>{
 const {getProcessing}=await setup(page)
 await page.getByLabel('Загрузить фон',{exact:true}).setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')})
 await expect(page.getByRole('alert')).toContainText('JPG, PNG или WebP')
 expect(getProcessing()).toBe(0)
})

test('public profile renders the saved background area and zoom @mobile',async({page},info)=>{
 const state=await mockWizard(page,false)
 state.profile={...state.profile,onboarding_completed:true,is_published:true,handle:'anna.page',display_name:'Анна',background_style:'image',background_image_path:`${state.profile.id}/11111111-1111-4111-8111-111111111111.webp`,background_position_x:20,background_position_y:80,background_zoom:175,background_overlay:35}
 await page.route('**/profile-image.php?**',route=>route.fulfill({contentType:'image/webp',body:readFileSync('tests/fixtures/background-grid.webp')}))
 await page.goto('/anna.page')
 const card=page.getByRole('region',{name:'Профиль Анна',exact:true})
 await expect(card).toHaveClass(/profile-card--image/)
 await expect.poll(()=>card.evaluate(node=>getComputedStyle(node,'::before').backgroundPosition.split(',').at(-1)?.trim())).toBe('20% 80%')
 await expect.poll(()=>card.evaluate(node=>getComputedStyle(node,'::before').transform)).toBe('matrix(1.75, 0, 0, 1.75, 0, 0)')
 await card.screenshot({path:info.outputPath('public-background-area.png')})
})
