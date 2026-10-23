import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function selectSpecs(paths, available) {
  const chosen = new Set()
  const add = (...names) => names.forEach(name => { if (available.includes(name)) chosen.add(name) })
  const editor = ['appearance', 'editor-links', 'editor-color-layout', 'profile-settings', 'profile-tools', 'link-sections', 'background-images', 'featured-images', 'crop-font-gestures']
  for (const path of paths) {
    if (/^tests\/[^/]+\.spec\.ts$/.test(path)) { add(path); continue }
    if (/^(docs\/|.*\.md$)/.test(path)) continue
    if (/^(tests\/helpers\/|tests\/fixtures\/|package(-lock)?\.json$|playwright\.config|vite\.config|\.github\/|scripts\/(ci|run-e2e|select-e2e|test-))/.test(path)) return [...available].sort()
    if (/^public\/.*\.php$|^supabase\//.test(path)) { add('tests/icon-delivery.spec.ts', 'tests/public-profile.spec.ts', 'tests/password-recovery.spec.ts'); continue }
    if (/font|typography/i.test(path)) { add('tests/appearance.spec.ts', 'tests/profile-settings.spec.ts', 'tests/crop-font-gestures.spec.ts'); continue }
    if (/icon|favicon|platform/i.test(path)) { add('tests/icon-library.spec.ts', 'tests/icon-delivery.spec.ts', 'tests/public-profile.spec.ts', 'tests/editor-links.spec.ts'); continue }
    if (/Auth|Password|confirmation/i.test(path)) { add('tests/smoke.spec.ts', 'tests/password-recovery.spec.ts', 'tests/activation-media.spec.ts'); continue }
    if (/Onboarding|validation/i.test(path)) { add('tests/onboarding.spec.ts', 'tests/wizard-layout.spec.ts'); continue }
    if (/Admin|moderation/i.test(path)) { add('tests/admin.spec.ts'); continue }
    if (/PublicProfile|ProfilePreview|profile.*css/i.test(path)) { add('tests/public-profile.spec.ts', 'tests/background-images.spec.ts', 'tests/featured-images.spec.ts', 'tests/crop-font-gestures.spec.ts'); continue }
    if (/Crop|Avatar|ImageAsset|imageCrop|useCrop/i.test(path)) { add('tests/appearance.spec.ts', 'tests/activation-media.spec.ts', 'tests/background-images.spec.ts', 'tests/featured-images.spec.ts', 'tests/crop-font-gestures.spec.ts', 'tests/wizard-layout.spec.ts'); continue }
    if (/^src\/App\.|^src\/components\/(Appearance|Color|Typography)/.test(path)) { add(...editor.map(name => `tests/${name}.spec.ts`)); continue }
    if (/^src\/|^public\/|^index\.html$/.test(path)) return [...available].sort()
  }
  return [...chosen].sort()
}

export function changedSpecs(base) {
  const available = readdirSync('tests').filter(name => name.endsWith('.spec.ts')).map(name => `tests/${name}`)
  if (!base) return available.sort()
  // No shell evaluation: refs and filenames are passed as literal arguments.
  const paths = execFileSync('git', ['diff', '--name-only', '-z', `${base}...HEAD`], { encoding: 'utf8' }).split('\0').filter(Boolean)
  return selectSpecs(paths, available)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(changedSpecs(process.argv[2])))
