import { test, expect } from '@playwright/test'
import { readFileSync, statSync } from 'node:fs'
import { FONT_OPTIONS } from '../src/lib/typography'

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
