import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { mockLayout } from './helpers/editor-layout'

test.use({deviceScaleFactor:1})

test('editor full-page visual matrix @mobile @full', async ({ page }, info) => {
 test.setTimeout(90000)
 await mockLayout(page)
 for (const width of [1280, 390, 320]) {
  await page.setViewportSize({width, height:900})
  for (const section of ['Ссылки', 'Оформление']) {
   await page.getByRole('button', {name:section, exact:true}).click()
   if (section === 'Ссылки') await page.locator('.link-editor__summary').first().click()
   else { const row=page.getByRole('region',{name:'Порядок на странице'}).getByRole('button',{name:'Мой сайт',exact:true}); if(await row.getAttribute('aria-pressed') !== 'true') await row.click() }
   await expect(page.locator('.editor-panel')).toBeVisible()
   // Capture the whole scrollable editor, keeping the actual responsive widths.
   const style = await page.addStyleTag({content:'html,body,#root{height:auto!important;max-height:none!important;overflow:visible!important}.glass-app .dashboard-shell{position:relative!important;inset:auto!important;height:auto!important;min-height:100dvh;overflow:visible!important}.glass-app .dashboard-grid{flex:none!important;height:auto!important;overflow:visible!important;align-items:start}.glass-app .dashboard-grid .editor-panel{flex:none!important;height:auto!important;max-height:none!important;overflow:visible!important}.preview-panel{position:sticky;top:0}body{overflow:auto!important}@media(max-width:767px){.glass-app .editor-nav,.glass-app .mobile-preview-trigger{position:absolute!important}}'})
   const name = `${process.env.SCREENSHOT_PHASE || 'after'}-${section === 'Ссылки' ? 'links' : 'appearance'}-${width}.png`
   const screenshot = await page.screenshot({path:info.outputPath(name), fullPage:true, animations:'disabled'})
   if(process.env.SCREENSHOT_PHASE) { mkdirSync('docs/screenshots/editor-20261030',{recursive:true}); writeFileSync(`docs/screenshots/editor-20261030/${name}`,screenshot) }
   await style.evaluate(el=>el.remove())
  }
 }
})
