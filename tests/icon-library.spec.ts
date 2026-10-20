import { expect, test } from '@playwright/test'
import { mockWizard } from './helpers/wizard'
const sites=['instagram.com','t.me','wa.me','onlyfans.com','vk.com','capcut.com','dzen.ru','alfabank.ru','sovcombank.ru','sberbank.ru','tbank.ru','youtube.com','tiktok.com','x.com','facebook.com','boosty.to','discord.com','twitch.tv','pinterest.com','reddit.com','github.com','spotify.com','soundcloud.com','music.apple.com','patreon.com','behance.net','dribbble.com','figma.com','notion.so','vimeo.com','threads.net','snapchat.com','mastercard.ru','tesla.com','ok.ru','rutube.ru','linkedin.com','music.yandex.ru','fansly.com','avito.ru','ozon.ru','wildberries.ru']
test('known platforms use local square artwork without favicon requests',async({page},info)=>{
 const state=await mockWizard(page)
 state.profile={...state.profile,onboarding_completed:true,handle:'anna.page',display_name:'Анна'}
 state.links=sites.map((host,index)=>({id:`link-${index}`,profile_id:state.profile.id,label:host,url:`https://${host}/anna`,icon_key:'link',position:index,is_visible:true,is_sensitive:false}))
 let remote=0
 await page.route('**/site-icon.php?**',route=>{remote++;return route.fulfill({status:404})})
 await page.route('**/functions/v1/favicon**',route=>{remote++;return route.fulfill({status:404})})
 await page.reload()
 await expect(page.locator('.link-editor')).toHaveCount(sites.length)
 const icons=page.locator('.link-editor__site-icon')
 await expect(icons.locator('img')).toHaveCount(sites.length)
 for(const icon of await icons.all()){await expect(icon).toHaveCSS('width','36px');await expect.poll(()=>icon.locator('img').evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBeGreaterThan(0)}
 await expect.poll(()=>remote).toBe(0)
 await page.locator('.links-editor').first().screenshot({path:info.outputPath('platform-icons.png')})
})
