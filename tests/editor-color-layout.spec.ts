import { expect, test } from '@playwright/test'
import { mockWizard } from './helpers/wizard'
async function setup(page:import('@playwright/test').Page){const state=await mockWizard(page);state.profile={...state.profile,onboarding_completed:true,display_name:'Анна',handle:'anna.page'};state.links=[{id:'link',profile_id:state.profile.id,label:'Мой сайт',url:'https://example.com',position:0,is_visible:true,icon_key:'link'}];await page.reload();return state}
test('link editor fields and actions occupy separate areas on desktop and narrow screens @mobile',async({page},info)=>{
 await setup(page)
 for(const width of [320,390,1280]){
  await page.setViewportSize({width,height:900})
  const card=page.locator('.link-editor').first(),body=card.locator('.link-editor__body'),actions=card.locator('.link-editor__actions')
  const b=await body.boundingBox(),a=await actions.boundingBox(),c=await card.boundingBox()
  expect(b!.width).toBeGreaterThan(width<650?140:260)
  expect(a!.x>=b!.x+b!.width-1 || a!.y>=b!.y+b!.height-1).toBeTruthy()
  expect(b!.x+b!.width).toBeLessThanOrEqual(c!.x+c!.width)
  await card.screenshot({path:info.outputPath(`link-editor-${width}.png`)})
 }
})
test('templates are discoverable and colors accept reusable HEX and RGB with dismissible palette',async({page})=>{
 await setup(page)
 await page.getByRole('button',{name:'Шаблоны и оформление страницы',exact:true}).click()
 await expect(page.getByRole('button',{name:'Выбрать шаблон',exact:true})).toBeVisible()
 const name=page.getByLabel('Цвет: Имя',{exact:true}),bio=page.getByLabel('Цвет: О себе',{exact:true})
 await name.fill('#e17209');await name.press('Tab')
 await bio.fill(await name.inputValue());await bio.press('Tab');await expect(bio).toHaveValue('#e17209')
 await bio.fill('255 255 255');await bio.press('Enter');await expect(bio).toHaveValue('#ffffff')
 await page.getByRole('button',{name:'Палитра: Имя',exact:true}).click()
 const palette=page.getByRole('group',{name:'Палитра цвета: Имя',exact:true})
 await expect(palette).toBeVisible();await page.getByRole('heading',{name:'Текст профиля',exact:true}).click();await expect(palette).toHaveCount(0)
 await page.getByRole('button',{name:'Палитра: Имя',exact:true}).click();await page.keyboard.press('Escape');await expect(palette).toHaveCount(0)
})
