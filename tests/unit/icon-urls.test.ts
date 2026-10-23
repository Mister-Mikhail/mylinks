import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { hostnameOf, snapshotUrl } from '../../src/lib/favicons.ts'
import { localBrandIcon } from '../../src/lib/brandIcons.ts'
import manifest from '../../public/icons/platforms/brand-assets.json' with { type: 'json' }

test('snapshot addresses migrate old namespaces and reject external or malformed sources', () => {
  const id='00000000-0000-4000-8000-000000000002', hash='123456789abc'
  const canonical=`/i/v2/anna.page/${id}/${hash}.png`
  assert.equal(snapshotUrl(`/link-icon/${id}/${hash}.png`,'anna.page'),canonical)
  assert.equal(snapshotUrl(`/link-icon/anna.page/${id}/${hash}.png`),canonical)
  assert.equal(snapshotUrl(canonical),canonical)
  for(const path of [null,'','https://evil.example/image.png','/link-icon/bad.png',`/link-icon/${id}/${hash}.png`])assert.equal(snapshotUrl(path),null)
  assert.equal(hostnameOf(' HTTPS://WWW.Example.COM/path '),'example.com')
  assert.equal(hostnameOf('not a url'),'')
})
test('one manifest drives every colored brand and its actual content version', () => {
  assert.equal(manifest.length,42)
  assert.deepEqual(JSON.parse(readFileSync('src/generated/platform-icons.json','utf8')),manifest.map(({name,file,sha256,domains})=>({name,file,sha256,domains})))
  for(const entry of manifest) {
    const bytes=readFileSync(`public/icons/platforms/${entry.file}`)
    assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256)
    for(const domain of entry.domains)assert.equal(localBrandIcon('website',`https://${domain}/`)?.src,`/icons/platforms/${entry.file}`)
  }
  assert.equal(localBrandIcon('website','https://instagram.com.evil.example'),null)
  assert.equal(localBrandIcon('website','https://evil.example/instagram.com'),null)
})
