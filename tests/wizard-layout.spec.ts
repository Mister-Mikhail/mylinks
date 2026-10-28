import { expect, test } from '@playwright/test'
import { mockWizard } from './helpers/wizard'
import { gif } from './helpers/media'

test('wizard dark name, avatar scale and final layout follow the chosen order @mobile',async({page})=>{
 const state=await mockWizard(page)
 const name=page.getByLabel('Укажите свое имя',{exact:true})
 await expect(name).toHaveCSS('background-color','rgba(13, 27, 65, 0.44)')
 await name.fill('Анна');await page.getByLabel('Придумайте user name',{exact:true}).fill('anna.page')
 await page.getByRole('button',{name:'Продолжить'}).click()
 const slider=page.getByLabel('Размер аватара',{exact:true}),avatar=page.locator('.avatar-settings__preview')
 await slider.fill('10');const small=(await avatar.boundingBox())!.width
 await slider.fill('100');const large=(await avatar.boundingBox())!.width
 expect(large).toBeGreaterThan(small*2)
 const contentWidth=await page.locator('.avatar-settings__main').evaluate(el=>{const s=getComputedStyle(el);return el.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)})
 expect(Math.abs(large-contentWidth)).toBeLessThan(2)
 await page.getByRole('button',{name:'Продолжить'}).click()
 await page.getByRole('button',{name:'Добавлю позже'}).click()
 await page.getByRole('button',{name:'Пропустить',exact:true}).click()
 const preview=page.locator('.onboarding-live-preview')
 const selectors=page.locator('.onboarding-theme')
 await expect(selectors).toHaveCount(2)
 for(const selector of await selectors.all()){const tops=await selector.locator('button').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));expect(Math.max(...tops)-Math.min(...tops)).toBeLessThan(2)}
 const box=(await preview.boundingBox())!
 expect((await selectors.last().boundingBox())!.y).toBeLessThan(box.y)
 expect((await page.getByText('Сделать страницу доступной по ссылке',{exact:true}).boundingBox())!.y).toBeGreaterThan(box.y+box.height)
 expect((await page.getByRole('button',{name:'Готово'}).boundingBox())!.y).toBeGreaterThan(box.y+box.height)
 await expect(preview).toHaveCSS('background-color','rgba(0, 0, 0, 0)')
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy()
 await page.getByRole('button',{name:'Готово'}).click()
 await expect.poll(()=>state.submitted?.avatar_scale).toBe(100)
})

test('mobile two-finger gesture zooms avatar without scrolling the page @mobile',async({page,context,isMobile})=>{
 test.skip(!isMobile,'touch gesture is mobile-only')
 await mockWizard(page)
 await page.getByLabel('Укажите свое имя',{exact:true}).fill('Анна');await page.getByLabel('Придумайте user name',{exact:true}).fill('anna.page')
 await page.getByRole('button',{name:'Продолжить'}).click()
 await page.locator('input[type=file]').setInputFiles({name:'pinch.gif',mimeType:'image/gif',buffer:Buffer.from(gif,'base64')})
 const crop=page.getByRole('group',{name:/Положение фото/});await expect(crop).toBeVisible()
 const zoom=page.getByLabel('Масштаб фото',{exact:true}),before=Number(await zoom.inputValue()),b=(await crop.boundingBox())!,x=b.x+b.width/2,y=b.y+b.height/2
 const cdp=await context.newCDPSession(page)
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-25,y,id:1},{x:x+25,y,id:2}]})
 for(const d of [30,40,50,60])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-d,y,id:1},{x:x+d,y,id:2}]})
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
 await expect.poll(async()=>Number(await zoom.inputValue())).toBeGreaterThan(before*1.5)
 await page.getByRole('button',{name:'Применить фото'}).click()
 await expect(page.getByRole('dialog')).toHaveCount(0)
})
