import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockWizard } from './helpers/wizard'
import { mockEditorIcons } from './helpers/icons'
const id='00000000-0000-4000-8000-000000000002'
const hash='123456789abc'
const old=`/link-icon/anna.page/${id}/${hash}.png`
const fresh=`/i/v2/anna.page/${id}/${hash}.png`
const png=readFileSync('public/icons/platforms/avito.png')
for(const published of [true,false])test(`owner ${published?'published':'private'} page uses correct icon path after refresh @smoke @mobile`,async({page,browser},info)=>{
 console.log(`Engine ${await browser.version()} / ${info.project.name}`)
 const state=await mockWizard(page)
 const signing=await mockEditorIcons(page)
 state.profile={...state.profile,handle:'anna.page',display_name:'Анна',onboarding_completed:true,is_published:published}
 state.links=[{id,profile_id:state.profile.id,label:'Сайт с карточкой',url:'https://example.com',icon_key:'website',position:0,is_visible:true,presentation:'featured',image_url:null,icon_snapshot_path:old}]
 const paths:string[]=[]
 await page.route('**/link-icon/**',route=>{throw Error('Poisoned legacy icon path requested: '+route.request().url())})
 await page.route('**/i/v2/**',route=>{paths.push(new URL(route.request().url()).pathname);return route.fulfill({contentType:'image/png',body:png})})
 await page.route('**/site-icon.php?**',route=>{paths.push('/site-icon.php');return route.fulfill({contentType:'image/png',body:png})})
 await page.goto('/anna.page')
 await expect(page.getByRole('heading',{name:'Анна',exact:true})).toBeVisible()
 const icon=page.locator('.profile-link__image-placeholder img')
 await expect(icon).toHaveAttribute('src',published?fresh:/^\/site-icon.php\?domain=example.com&owner=fixture&expires=2100000000&sig=fixture$/)
 await expect(icon).toBeVisible()
 await expect.poll(()=>icon.evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBeGreaterThan(0)
 await page.reload()
 await expect(icon).toHaveAttribute('src',published?fresh:/^\/site-icon.php\?domain=example.com&owner=fixture&expires=2100000000&sig=fixture$/)
 if(!published)expect(signing.flat()).toContain('example.com')
 expect(paths.length).toBeGreaterThan(0)
 await page.screenshot({path:info.outputPath(`icons-owner-${published}.png`)})
})
test('anonymous page chooses local brand, same-origin snapshot, then a visible fallback',async({page},info)=>{
 const state=await mockWizard(page,false)
 state.profile={...state.profile,handle:'anna.page',display_name:'Анна',is_published:true,onboarding_completed:true}
 state.links=[['youtube.com','YouTube'],['tiktok.com','TikTok'],['example.com','Snapshot'],['missing.example.com','Missing']].map(([host,label],i)=>({id:id.replace(/2$/,String(i+2)),profile_id:state.profile.id,label,url:'https://'+host,icon_key:'website',position:i,is_visible:true,icon_snapshot_path:`/link-icon/${id.replace(/2$/,String(i+2))}/${hash}.png`}))
 await page.route('**/i/v2/**',route=>new URL(route.request().url()).pathname.includes('000000000005')?route.fulfill({status:404,contentType:'text/plain',body:'Icon unavailable'}):route.fulfill({contentType:'image/png',body:png}))
 await page.goto('/anna.page')
 const cards=page.locator('.profile-link')
 await expect(cards.nth(0).locator('img')).toHaveAttribute('src',/\/icons\/platforms\/youtube\.svg\?v=[a-f0-9]{12}$/)
 await expect(cards.nth(1).locator('img')).toHaveAttribute('src',/\/icons\/platforms\/tiktok\.png\?v=[a-f0-9]{12}$/)
 await expect.poll(()=>cards.nth(2).locator('img').evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBeGreaterThan(0)
 await expect(cards.nth(3).locator('svg.link-icon__glyph')).toBeVisible()
 await page.screenshot({path:info.outputPath('icon-priority.png')})
})
