// Uploads design-screens/*.png to single-use Figma upload URLs listed in design/figma-uploads.json:
//   [{ "name": "01-landing--desktop", "url": "https://..." }, ...]
// URLs expire 10 minutes after they are issued. Each upload becomes an image frame named after the file.
import { readFileSync, existsSync } from 'node:fs'

const plan = JSON.parse(readFileSync('design/figma-uploads.json', 'utf8'))
const results = await Promise.all(plan.map(async ({ name, url }) => {
  const file = `design-screens/${name}.png`
  if (!existsSync(file)) return `skip  ${name} (no screenshot)`
  const form = new FormData()
  form.append('file', new Blob([readFileSync(file)], { type: 'image/png' }), `${name}.png`)
  const response = await fetch(url, { method: 'POST', body: form })
  const detail = response.ok ? '' : ` ${(await response.text()).slice(0, 200)}`
  return `${response.ok ? 'ok  ' : 'FAIL'}  ${name} → ${response.status}${detail}`
}))
console.log(results.join('\n'))
if (results.some((line) => line.startsWith('FAIL'))) process.exit(1)
