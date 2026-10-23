import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
export async function mockEditorIcons(page: Page) {
  const requests: string[][] = []
  await page.route('**/site-icon.php', route => {
    const request = route.request()
    if (request.method() !== 'POST') return route.fulfill({ status: 401, body: 'Signed address required' })
    if (!request.headers().authorization?.startsWith('Bearer ')) return route.fulfill({ status: 401, body: '' })
    const domains = request.postDataJSON().domains as string[]
    requests.push(domains)
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ expires: 2100000000, urls: Object.fromEntries(domains.map(host => [host, `/site-icon.php?domain=${host}&owner=fixture&expires=2100000000&sig=fixture`])) }) })
  })
  await page.route('**/site-icon.php?**', route => route.fulfill({ contentType: 'image/png', body: readFileSync('public/icons/platforms/avito.png') }))
  return requests
}
