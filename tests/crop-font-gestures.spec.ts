import { expect,test,type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockWizard } from './helpers/wizard'
const image=readFileSync('tests/fixtures/background-grid.webp')
async function setup(page:Page){
 const state=await mockWizard(page)
 state.profile={...state.profile,onboarding_completed:true,handle:'anna.page',display_name:'Анна'}
 state.links=[{id:'00000000-0000-4000-8000-000000000081',profile_id:state.profile.id,label:'Мой проект',url:'https://example.com',position:0,is_visible:true,is_sensitive:false,icon_key:'link',presentation:'featured'}]
 const writes:Record<string,unknown>[][]=[]
 await page.route('**/rest/v1/profile_links**',route=>{if(route.request().method()==='GET')return route.fulfill({contentType:'application/json',body:JSON.stringify(state.links)});const body=route.request().postDataJSON();state.links=body;writes.push(body);return route.fulfill({contentType:'application/json',body:JSON.stringify(body)})})
 await page.route('**/profile-image-process.php',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({mime:'image/webp',data:image.toString('base64')})}))
 await page.route('**/storage/v1/**',route=>route.request().method()==='GET'?route.fulfill({contentType:'image/webp',body:image}):route.fulfill({contentType:'application/json',body:JSON.stringify({signedURL:new URL(route.request().url()).pathname.replace('/storage/v1','')+'?token=test'})}))
 await page.route('**/profile-image.php?**',route=>route.fulfill({contentType:'image/webp',body:image}))
 await page.reload();await page.getByRole('button',{name:'Оформление',exact:true}).click()
 return {state,writes}
}
async function pinch(page:Page,ratio:number){
 const b=(await page.locator('.image-crop-editor__viewport').boundingBox())!,x=b.x+b.width/2,y=b.y+b.height/2
 const cdp=await page.context().newCDPSession(page)
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-22,y,id:1},{x:x+22,y,id:2}]})
 for(let n=1;n<=5;n++){const d=22*(1+(ratio-1)*n/5);await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-d,y,id:1},{x:x+d,y,id:2}]})}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach()
}
for(const target of ['background','card'])test(`${target} crop uses real drag/zoom, Apply/Cancel and persists fractions at every width @mobile`,async({page,isMobile},info)=>{
 // Gestures, save/reload and nine screenshots across three widths: well over the 30 s default
 // in slower engines (Yandex mobile), although every assertion passes.
 test.setTimeout(90_000)
 const {state,writes}=await setup(page)
 let field:string
 if(target==='background'){await page.getByRole('button',{name:'Изображение',exact:true}).click();field='Загрузить фон'}
 else {await page.getByRole('button',{name:'Ссылки',exact:true}).click();await page.locator('.link-editor__summary').first().click();field='Загрузить фото'}
 await page.getByLabel(field,{exact:true}).setInputFiles('tests/fixtures/background-grid.webp')
 const dialog=page.getByRole('dialog'),frame=page.locator('.image-crop-editor__viewport'),zoom=page.getByLabel('Масштаб кадра',{exact:true})
 await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'Применить',exact:true})).toBeEnabled()
 const box=(await frame.boundingBox())!
 expect(box.width/box.height).toBeCloseTo(target==='background'?9/19.5:16/9,1)
 const scroll=await page.evaluate(()=>scrollY),viewportScale=await page.evaluate(()=>visualViewport?.scale)
 if(isMobile){await pinch(page,1.8);await expect(zoom).not.toHaveText('100%');await pinch(page,.35)}
 else {await frame.hover();await page.mouse.wheel(0,-180);await expect(zoom).not.toHaveText('100%');await page.mouse.wheel(0,600)}
 await expect.poll(async()=>parseInt(await zoom.textContent()||'100')).toBeLessThan(100)
 const b=(await frame.boundingBox())!,x=b.x+b.width/2,y=b.y+b.height/2
 if(isMobile){const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});for(let n=1;n<=5;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+n*5,y:y+n*3,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach()}
 else {await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+30,y+20,{steps:5});await page.mouse.up()}
 if(target==='card'){await page.getByLabel('Заполнение свободного поля').selectOption('color');await page.getByLabel('Цвет: Цвет свободного поля',{exact:true}).fill('255 255 255')}
 await frame.focus();await page.keyboard.press('ArrowRight')
 await dialog.screenshot({path:info.outputPath(`${target}-editor.png`)})
 const draft=JSON.parse(await frame.locator('.cropped-image').getAttribute('data-crop')||'{}')
 expect(draft.x).toBeGreaterThan(0);expect(draft.zoom).toBeLessThan(1)
 expect(await page.evaluate(()=>scrollY)).toBe(scroll);expect(await page.evaluate(()=>visualViewport?.scale)).toBe(viewportScale)
 await dialog.getByRole('button',{name:'Применить',exact:true}).click();await expect(dialog).toHaveCount(0)
 const selector=target==='background'?'.profile-card__photo>.cropped-image':'.profile-link__image.cropped-image'
 const preview=page.locator(isMobile?'.mobile-full-preview':'.preview-panel')
 if(isMobile)await page.getByRole('button',{name:'Превью',exact:true}).click()
 await expect(preview.locator(selector)).toHaveAttribute('data-crop',JSON.stringify(draft))
 if(isMobile)await page.getByRole('button',{name:'Закрыть'}).click()
 // Reopen, reset and cancel must leave the applied frame untouched.
 const fieldRoot=page.locator('.image-asset-field').filter({has:page.getByLabel(field,{exact:true})})
 await fieldRoot.getByRole('button',{name:'Изменить кадр',exact:true}).click();await dialog.getByRole('button',{name:'Сбросить кадр',exact:true}).click();await expect(zoom).toHaveText('100%');await dialog.getByRole('button',{name:'Отмена',exact:true}).click()
 if(isMobile)await page.getByRole('button',{name:'Превью',exact:true}).click()
 await expect(preview.locator(selector)).toHaveAttribute('data-crop',JSON.stringify(draft))
 if(isMobile)await page.getByRole('button',{name:'Закрыть'}).click()
 await page.getByRole('button',{name:'Сохранить',exact:true}).click()
 await expect.poll(()=>target==='background'?state.profile.background_crop:writes.at(-1)?.[0]?.image_crop).toEqual(draft)
 const original=target==='background'?state.profile.background_image_path:(state.links[0] as Record<string,unknown>).image_path
 await page.reload();await page.getByRole('button',{name:'Оформление',exact:true}).click()
 if(isMobile)await page.getByRole('button',{name:'Превью',exact:true}).click()
 await expect(preview.locator(selector)).toHaveAttribute('data-crop',JSON.stringify(draft))
 if(isMobile)await page.getByRole('button',{name:'Закрыть'}).click()
 state.profile.is_published=true
 await page.goto('/anna.page')
 const publicSelector=target==='background'?'.public-preview-page__background>.cropped-image':'.profile-link__image.cropped-image'
 for(const width of [1280,390,320]){
  await page.setViewportSize({width,height:900})
  const media=page.locator(publicSelector);await expect(media).toHaveAttribute('data-crop',JSON.stringify(draft))
  const rect=(await media.boundingBox())!;if(target==='background'){expect(rect.x).toBe(0);expect(rect.y).toBe(0);expect(rect.width).toBe(width);expect(rect.height).toBe(900)}else expect(rect.width/rect.height).toBeCloseTo(draft.aspect,1)
  if(target==='background'&&width===1280)expect((await page.locator('.profile-card').boundingBox())!.height).toBeLessThan(900)
  const photo=media.locator('.cropped-image__photo')
  const measure=()=>photo.evaluate(el=>{const p=el.parentElement!.getBoundingClientRect(),b=el.getBoundingClientRect();return {x:(b.x+b.width/2-p.x)/p.width-.5,y:(b.y+b.height/2-p.y)/p.height-.5,width:b.width/p.width}})
  const expectedWidth=Math.max(1,draft.sourceAspect/(target==='background'?width/900:draft.aspect))*draft.zoom
  // The background frame follows its container through ResizeObserver, one frame after the viewport change.
  await expect.poll(async()=>Math.abs((await measure()).width-expectedWidth)).toBeLessThan(.005)
  const geom=await measure()
  expect(geom.x).toBeCloseTo(draft.x,2);expect(geom.y).toBeCloseTo(draft.y,2);expect(geom.width).toBeCloseTo(expectedWidth,2)
  await page.screenshot({path:info.outputPath(`${target}-${width}.png`),fullPage:true})
 }
 if(target==='background'){
  const first=state.links[0] as Record<string,unknown>
  state.links=Array.from({length:24},(_,i)=>({...first,id:`00000000-0000-4000-8000-${String(i+100).padStart(12,'0')}`,label:`Ссылка ${i+1}`,presentation:'normal',position:i}))
  await page.reload()
  for(const width of [1280,390,320]){
   await page.setViewportSize({width,height:900})
   const background=page.locator('.public-preview-page__background')
   await expect(background).toHaveCSS('position','fixed')
   await expect.poll(()=>page.locator('.profile-card').evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThan(900)
   await page.evaluate(()=>scrollTo(0,500))
   const fixed=(await background.boundingBox())!;expect(fixed).toEqual({x:0,y:0,width,height:900})
   expect(await page.evaluate(()=>scrollY)).toBeGreaterThan(0)
   await page.screenshot({path:info.outputPath(`background-long-${width}.png`)})
  }
 }
 expect(target==='background'?state.profile.background_image_path:(state.links[0] as Record<string,unknown>).image_path).toBe(original)
})
test('desktop font wheel and keyboard update live text without page scrolling',async({page,isMobile})=>{
 test.skip(isMobile,'desktop control')
 await setup(page)
 const control=page.getByLabel('Шрифт: Имя',{exact:true})
 await control.hover();await page.mouse.wheel(0,110);await expect(control).toHaveValue('manrope')
 await control.click();await page.keyboard.press('Escape');await expect(control).toBeFocused();const before=await page.evaluate(()=>({page:scrollY,panel:document.querySelector('.editor-panel')?.scrollTop}))
 await page.mouse.wheel(0,110);await expect(control).toHaveValue('arial')
 await expect(page.locator('.preview-panel h1')).toHaveCSS('font-family',/Arimo/)
 expect(await page.evaluate(()=>({page:scrollY,panel:document.querySelector('.editor-panel')?.scrollTop}))).toEqual(before)
 await page.keyboard.press('ArrowDown');await expect(control).toHaveValue('verdana');await page.keyboard.press('ArrowUp');await expect(control).toHaveValue('arial')
})
test('mobile font tape uses real text, swipe selects on stop, tap selects and Save persists @mobile',async({page,isMobile})=>{
 test.skip(!isMobile,'mobile tape')
 const {state}=await setup(page)
 const tape=page.getByRole('listbox',{name:'Образцы шрифтов: Имя',exact:true})
 await expect(tape).toBeVisible();await expect(tape.locator('[data-font]').first()).toContainText('Анна')
 const b=(await tape.boundingBox())!,y=b.y+b.height/2,x=b.x+b.width*.8,cdp=await page.context().newCDPSession(page)
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]})
 for(let n=1;n<=8;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-n*22,y,id:1}]})
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach()
 await expect.poll(()=>tape.locator('[aria-selected=true]').getAttribute('data-font')).not.toBe('manrope')
 await tape.locator('[data-font=caveat]').click();await expect(tape.locator('[data-font=caveat]')).toHaveAttribute('aria-selected','true')
 await page.getByRole('button',{name:'Превью',exact:true}).click()
 await expect(page.locator('.mobile-full-preview h1')).toHaveCSS('font-family',/Caveat/)
 await page.getByRole('button',{name:'Закрыть'}).click()
 // Wait past the 180ms scroll-selection debounce to catch a centering feedback loop.
 await page.waitForTimeout(250);await expect(tape.locator('[data-font=caveat]')).toHaveAttribute('aria-selected','true')
 await tape.screenshot({path:test.info().outputPath('font-tape.png')})
 await page.getByRole('button',{name:'Сохранить',exact:true}).click();await expect.poll(()=>state.profile.name_font).toBe('caveat')
})
