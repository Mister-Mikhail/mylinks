import { spawnSync } from 'node:child_process'
import { changedSpecs } from './select-e2e.mjs'

const mode = process.argv[2] || 'quick'
const common = [`--workers=${process.env.E2E_WORKERS || '4'}`, '--reporter=line']
function run(args) {
  const result = spawnSync('npx', ['playwright', 'test', ...args, ...common], { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status || 1)
}
if (mode === 'full') run([])
else if (mode === 'quick') {
  run(['--project=desktop-chromium', '--grep=@smoke', '--grep-invert=@full'])
  const specs = changedSpecs(process.env.CI_BASE_SHA || process.argv[3])
  if (specs.length) run([...specs.map(path => path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), '--project=desktop-chromium', '--grep-invert=@smoke|@full'])
} else throw new Error(`Unknown e2e suite: ${mode}`)
