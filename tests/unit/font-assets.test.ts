import { test } from 'node:test'
import { expect } from '@playwright/test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { FONT_OPTIONS } from '../../src/lib/typography.ts'

test('all fifteen font families use self-hosted nonempty WOFF2 files', async () => {
  const css = readFileSync('src/fonts.css', 'utf8')
  expect(FONT_OPTIONS).toHaveLength(15)
  expect(css).not.toMatch(/https?:\/\//)
  const paths = [...css.matchAll(/url\(['"]?(\/fonts\/[^'")]+\.woff2)['"]?\)/g)].map(match => match[1])
  expect(paths.length).toBeGreaterThanOrEqual(15)
  for (const path of paths) expect(statSync(`public${path}`).size).toBeGreaterThan(100)
  for (const { family } of FONT_OPTIONS) {
    const name = family.split(',')[0].replaceAll("'", '').trim()
    expect(css).toContain(`font-family: '${name}'`)
  }
})

test('font provenance covers and pins every shipped binary and license', async () => {
  const manifest = JSON.parse(readFileSync('public/fonts/provenance.json', 'utf8'))
  expect(manifest.schemaVersion).toBe(1)
  expect(manifest.packages).toHaveLength(15)
  const css = readFileSync('src/fonts.css', 'utf8')
  const declared: string[] = []
  for (const entry of manifest.packages) {
    expect(entry.package).toMatch(/^@fontsource\/[a-z0-9-]+$/)
    expect(entry.version).toBe('5.3.0')
    const slug = entry.package.split('/')[1]
    expect(entry.url).toBe(`https://registry.npmjs.org/@fontsource/${slug}/-/${slug}-${entry.version}.tgz`)
    expect(entry.tarballSha256).toMatch(/^[a-f0-9]{64}$/)
    for (const file of [...entry.files, entry.license]) {
      expect(file.file).toMatch(/^[a-z0-9.-]+(?:woff2|LICENSE\.txt)$/)
      const bytes = readFileSync(`public/fonts/${file.file}`)
      expect(createHash('sha256').update(bytes).digest('hex'), file.file).toBe(file.sha256)
      declared.push(file.file)
    }
    expect(entry.license.source).toBe('package/LICENSE')
    expect(entry.license.file).toBe(`${slug}-LICENSE.txt`)
    for (const file of entry.files) {
      expect(file.source).toBe(`package/files/${file.file.split('.')[0]}.woff2`)
      expect(css).toContain(`/fonts/${file.file}`)
    }
  }
  const shipped = readdirSync('public/fonts').filter(file => /\.woff2$|-LICENSE\.txt$/.test(file)).sort()
  expect([...new Set(declared)].sort()).toEqual(shipped)
  expect(declared).toHaveLength(shipped.length)
})
