import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
const entries = JSON.parse(readFileSync('public/icons/platforms/brand-assets.json', 'utf8'))
const client = entries.map(({ name, file, sha256, domains }) => ({ name, file, sha256, domains }))
mkdirSync('src/generated', { recursive: true })
writeFileSync('src/generated/platform-icons.json', JSON.stringify(client, null, 2) + '\n')
