import { writeFileSync } from 'node:fs'
import { loadEnv } from 'vite'

const env = loadEnv('production', process.cwd(), 'VITE_')
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!url || !key || !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url) || !key.startsWith('sb_publishable_')) {
  throw new Error('A Supabase URL and publishable key are required for share previews')
}
const config = Buffer.from(JSON.stringify({ url, key })).toString('base64')
writeFileSync('dist/preview-config.php', `<?php return json_decode(base64_decode('${config}'), true);\n`)
