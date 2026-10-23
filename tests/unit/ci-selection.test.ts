import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectSpecs } from '../../scripts/select-e2e.mjs'

const specs = ['tests/appearance.spec.ts', 'tests/icon-library.spec.ts', 'tests/public-profile.spec.ts', 'tests/onboarding.spec.ts']
test('changed spec and icon code select relevant browser coverage', () => {
  assert.deepEqual(selectSpecs(['tests/appearance.spec.ts'], specs), ['tests/appearance.spec.ts'])
  assert.deepEqual(selectSpecs(['src/lib/favicons.ts'], specs), ['tests/icon-library.spec.ts', 'tests/public-profile.spec.ts'])
})
test('shared dependencies and unknown application paths fail safe to all specs', () => {
  assert.deepEqual(selectSpecs(['tests/helpers/wizard.ts'], specs), [...specs].sort())
  assert.deepEqual(selectSpecs(['src/new-feature.ts'], specs), [...specs].sort())
  assert.deepEqual(selectSpecs(['docs/acceptance.md'], specs), [])
})
