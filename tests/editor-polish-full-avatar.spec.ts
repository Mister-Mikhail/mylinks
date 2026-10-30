import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { mockLayout } from './helpers/editor-layout'

const image = `data:image/webp;base64,${readFileSync('tests/fixtures/avatar-master.webp').toString('base64')}`
const links = Array.from({length:8},(_,i)=>({id:`link-${i}`,label:`Ссылка ${i+1}`,url:'https://youtube.com/@test',icon_key:'youtube',position:i,is_visible:true,is_sensitive:false}))

for(const width of [1280,768,390,320]) {
 test(`editor geometry, 18+ and unobstructed order controls at ${width} @mobile`,async({page})=>{
  await page.setViewportSize({width,height:900})
  await mockLayout(page,false,'Тестовый профиль',{links,contacts:[{id:'contact-1',kind:'email',label:'Почта',value:'hello@example.com',is_visible:true,position:0}]})
  for(const section of ['Ссылки','Оформление']) {
   await page.getByRole('button',{name:section,exact:true}).click()
   if(section==='Ссылки') await page.locator('.link-editor__summary').last().click()
   const geometry=await page.locator('.editor-panel').evaluate(panel=>{
    const bounds=panel.getBoundingClientRect()
    const visible=(node:Element)=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0}
    const fields=Array.from(panel.querySelectorAll('input:not([type=checkbox]):not([type=range]):not([type=file]):not([type=hidden]),select')).filter(visible)
    const buttons=Array.from(panel.querySelectorAll('.button')).filter(visible)
    const cards=Array.from(panel.querySelectorAll('.settings-card')).map(card=>{
     const cr=card.getBoundingClientRect(),cs=getComputedStyle(card)
     return Array.from(card.children).filter(visible).map(child=>{const r=child.getBoundingClientRect();return {left:r.left-cr.left-parseFloat(cs.borderLeftWidth),right:cr.right-r.right-parseFloat(cs.borderRightWidth)}})
    })
    return {fields:fields.map(el=>({height:el.getBoundingClientRect().height,font:parseFloat(getComputedStyle(el).fontSize)})),buttons:buttons.map(el=>el.getBoundingClientRect().height),cards,overflow:Array.from(panel.querySelectorAll('*')).filter(visible).filter(el=>!el.closest('.font-tape')).filter(el=>el.getBoundingClientRect().right>bounds.right+1).map(el=>el.className||el.tagName)}
   })
   expect(geometry.overflow).toEqual([])
   for(const field of geometry.fields){expect(field.height).toBeCloseTo(44,0);if(width<768)expect(field.font).toBeGreaterThanOrEqual(16)}
   for(const height of geometry.buttons)expect([36,40]).toContain(Math.round(height))
   for(const card of geometry.cards)for(const child of card){expect(Math.abs(child.left-child.right)).toBeLessThanOrEqual(1);expect(child.left).toBeCloseTo(width<768?16:20,0)}
   if(section==='Ссылки') {
    const warning=page.locator('.sensitive-toggle').last()
    const dimensions=await warning.evaluate(el=>{const title=el.querySelector('strong')!,toggle=el.querySelector('.publish-setting__switch')!,show=document.querySelector('.link-editor__visibility-label .publish-setting__switch')!;return {title:title.getBoundingClientRect().height,line:parseFloat(getComputedStyle(title).lineHeight),toggle:[toggle.getBoundingClientRect().width,toggle.getBoundingClientRect().height],show:[show.getBoundingClientRect().width,show.getBoundingClientRect().height]}})
    expect(dimensions.title).toBeLessThanOrEqual(dimensions.line+1)
    expect(dimensions.toggle).toEqual(dimensions.show)
   } else {
    const down=page.getByRole('button',{name:/Переместить ссылку ниже/}).last()
    await down.scrollIntoViewIfNeeded()
    await expect.poll(()=>down.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))})).toBeTruthy()
   }
  }
  if(width<768){
   const header=page.locator('.dashboard-topbar');expect((await header.boundingBox())!.height).toBeLessThanOrEqual(60)
   const controls=await header.locator('button').filter({visible:true}).evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right}}))
   for(const r of controls){expect(r.left).toBeGreaterThanOrEqual(0);expect(r.right).toBeLessThanOrEqual(width)}
  }
 })
}

test('account menus dismiss, switch section, and open the unchanged deletion dialog @mobile',async({page})=>{
 await mockLayout(page)
 for(const width of [1280,390,320]) {
  await page.setViewportSize({width,height:900})
  const trigger=page.getByRole('button',{name:'Меню профиля',exact:true}).filter({visible:true})
  await trigger.click()
  await expect(page.getByRole('button',{name:'Экспорт данных',exact:true})).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button',{name:'Экспорт данных',exact:true})).toHaveCount(0)
  await trigger.click();await page.locator('.dashboard-topbar__section').click()
  await expect(page.getByRole('button',{name:'Экспорт данных',exact:true})).toHaveCount(0)
  await trigger.click();await page.getByRole('button',{name:'Ссылки',exact:true}).click()
  await expect(page.getByRole('button',{name:'Экспорт данных',exact:true})).toHaveCount(0)
  await trigger.click();await page.getByRole('button',{name:'Удалить аккаунт',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'Удалить профиль и аккаунт?'})).toBeVisible()
  await page.getByRole('button',{name:'Отмена',exact:true}).click()
  await page.getByRole('button',{name:'Оформление',exact:true}).click()
 }
 await expect(page.locator('.delete-account-trigger')).toHaveCount(0)
})

test('selected link expands in place, including grouped icons, and toggles closed @mobile',async({page})=>{
 await mockLayout(page,false,'Тестовый профиль',{links,profile:{link_layout:{version:1,blocks:[{id:'group',type:'group',title:'Группа',link_ids:['link-0','link-1']}]}}})
 const order=page.getByRole('region',{name:'Порядок на странице'})
 const member=order.locator('.section-editor__member-block').first()
 await expect(member.locator('.page-order__icon')).toHaveCount(1)
 await member.locator('.appearance-item__select').click()
 await expect(member.locator('.selected-card-settings')).toBeVisible()
 await member.getByLabel('Стиль этой карточки: Ссылка 1').selectOption('outline')
 await order.getByRole('button',{name:'Ссылка 3',exact:true}).click()
 await expect(page.locator('.selected-card-settings')).toHaveCount(1)
 await expect(member.locator('.selected-card-settings')).toHaveCount(0)
 await order.getByRole('button',{name:'Ссылка 3',exact:true}).click()
 await expect(page.locator('.selected-card-settings')).toHaveCount(0)
 await expect(page.getByRole('heading',{name:'Отдельная карточка',exact:true})).toHaveCount(0)
})

for(const shape of ['square','full']) {
 test(`${shape} avatar persists and uses exact public/preview geometry @mobile`,async({page})=>{
  await mockLayout(page,false,'Тестовый профиль',{profile:{avatar_url:image}})
  await page.getByRole('button',{name:shape==='full'?'Во всю ширину':'Квадрат',exact:true}).click()
  if(shape==='full')await expect(page.getByLabel('Размер аватара',{exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'Сохранить',exact:true}).click()
  await expect(page.getByText('Изменения сохранены')).toBeVisible()
  await page.reload();await page.getByRole('button',{name:'Оформление',exact:true}).click()
  await expect(page.getByRole('button',{name:shape==='full'?'Во всю ширину':'Квадрат',exact:true})).toHaveAttribute('aria-pressed','true')
  for(const width of [1280,390,320]) {
   await page.setViewportSize({width,height:900})
   if(width<768)await page.getByRole('button',{name:'Превью',exact:true}).click()
   const card=page.locator(width<768?'.mobile-full-preview .profile-card':'.device-frame .profile-card')
   const check=async()=>{
    const geometry=await card.evaluate((el,shape)=>{const av=el.querySelector(`.avatar--${shape}`)!,r=av.getBoundingClientRect(),c=el.getBoundingClientRect();return {width:r.width,height:r.height,left:r.left,radius:getComputedStyle(av).borderRadius,border:getComputedStyle(av).borderWidth,column:c.width,columnLeft:c.left}},shape)
    expect(geometry.radius).toBe('0px')
    if(shape==='full'){expect(Math.abs(geometry.width-(width<768?width:geometry.column))).toBeLessThanOrEqual(1);expect(Math.abs(geometry.left-(width<768?0:geometry.columnLeft))).toBeLessThanOrEqual(1);expect(geometry.width/geometry.height).toBeCloseTo(.8,2);expect(geometry.border).toBe('0px')}
   }
   await check()
   if(width<768)await page.getByRole('button',{name:'Закрыть',exact:true}).click()
  }
  await page.goto('/sample-user')
  for(const width of [1280,390,320]){
   await page.setViewportSize({width,height:900})
   const metrics=await page.locator(`.profile-card .avatar--${shape}`).evaluate(el=>{const r=el.getBoundingClientRect(),c=el.closest('.profile-card')!.getBoundingClientRect();return {width:r.width,height:r.height,left:r.left,column:c.width,columnLeft:c.left,radius:getComputedStyle(el).borderRadius}})
   expect(metrics.radius).toBe('0px')
   if(shape==='full'){expect(Math.abs(metrics.width-(width<768?width:metrics.column))).toBeLessThanOrEqual(1);expect(Math.abs(metrics.left-(width<768?0:metrics.columnLeft))).toBeLessThanOrEqual(1);expect(metrics.width/metrics.height).toBeCloseTo(.8,2)}
  }
 })
}

test('full crop sends a 4:5 frame and keeps square corners @mobile',async({page})=>{
 await mockLayout(page)
 await page.getByRole('button',{name:'Во всю ширину',exact:true}).click()
 const rendered:number[]=[]
 page.on('request',req=>{if(req.url().endsWith('/avatar-process.php')&&req.postData()?.includes('render')){const data=req.postData()!;if(data.includes('0.8'))rendered.push(1)}})
 await page.locator('.avatar-settings input[type=file]').setInputFiles({name:'test.webp',mimeType:'image/webp',buffer:readFileSync('tests/fixtures/avatar.webp')})
 const viewport=page.locator('.avatar-cropper__viewport')
 await expect(viewport).toBeVisible()
 const r=await viewport.boundingBox();expect(r!.width/r!.height).toBeCloseTo(.8,2)
 await expect(viewport).toHaveCSS('border-radius','0px')
 await page.getByRole('button',{name:'Применить фото',exact:true}).click()
 await expect(viewport).toHaveCount(0)
 expect(rendered).toHaveLength(1)
})


test('forced adult warning and deletion confirmations name the saved item @mobile',async({page})=>{
 await mockLayout(page,false,'Тестовый профиль',{links:[{...links[0],label:'OnlyFans',url:'https://onlyfans.com/test',icon_key:'onlyfans'}],contacts:[{id:'contact-1',kind:'email',label:'Почта',value:'hello@example.com',is_visible:true,position:0}]})
 await page.getByRole('button',{name:'Ссылки',exact:true}).click()
 const contact=page.locator('.contact-editor').first()
 await contact.locator('.link-editor__summary').click()
 page.once('dialog',async dialog=>{expect(dialog.message()).toBe('Удалить контакт „Почта“? Он исчезнет со страницы после нажатия „Сохранить“.');await dialog.dismiss()})
 await contact.getByRole('button',{name:'Удалить контакт',exact:true}).click()
 const row=page.locator('.link-editor:not(.contact-editor)').first()
 await row.locator('.link-editor__summary').click()
 await expect(page.locator('.link-editor--expanded')).toHaveCount(1)
 await expect(row.locator('.sensitive-toggle--forced input')).toBeChecked()
 await expect(row.locator('.sensitive-toggle--forced input')).toBeDisabled()
 page.once('dialog',async dialog=>{expect(dialog.message()).toBe('Удалить ссылку „OnlyFans“? Она исчезнет со страницы после нажатия „Сохранить“.');await dialog.dismiss()})
 await row.getByRole('button',{name:'Удалить ссылку',exact:true}).click()
})
