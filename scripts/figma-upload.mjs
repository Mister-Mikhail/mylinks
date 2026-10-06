// Uploads design-screens/*.png to single-use Figma upload URLs listed in design/figma-uploads.json:
//   [{ "name": "01-landing--desktop", "url": "https://..." }, ...]
// Each URL creates one image frame in the Figma file; frames are renamed there afterwards.
import { readFileSync, existsSync } from 'node:fs'

const plan = JSON.parse(readFileSync('design/figma-uploads.json', 'utf8'))
let failed = 0
for (const { name, url } of plan) {
  const file = `design-screens/${name}.png`
  if (!existsSync(file)) { console.log(`skip  ${name} (no screenshot)`); continue }
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: readFileSync(file) })
  console.log(`${response.ok ? 'ok   ' : 'FAIL '} ${name} → ${response.status}`)
  if (!response.ok) { failed++; console.log((await response.text()).slice(0, 300)) }
}
if (failed) process.exit(1)
