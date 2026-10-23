import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isValidDisplayName, isValidNewHandle, normalizeDisplayNameInput, normalizeNewHandleInput, isValidHttpUrl } from '../../src/lib/validation.ts'

test('new handles accept one separator and reject malformed or reserved names', () => {
  for (const name of ['anna', 'anna.name', 'anna_name']) assert.equal(isValidNewHandle(name), true, name)
  for (const name of ['a', '...', '___', 'anna..name', 'anna__name', 'anna.name_more', '.anna', 'anna.', 'anna1', 'admin', 'auth', 'a'.repeat(31)]) assert.equal(isValidNewHandle(name), false, name)
  assert.equal(normalizeNewHandleInput('ANNA12?'), 'anna')
})
test('display names preserve letters and spaces within thirty characters', () => {
  for (const name of ['Анна', 'Анна Мария', 'Anna Maria']) assert.equal(isValidDisplayName(name), true)
  for (const name of ['', ' Анна', 'Анна ', 'Анна  Мария', 'Анна2', 'А'.repeat(31)]) assert.equal(isValidDisplayName(name), false)
  assert.equal(normalizeDisplayNameInput('  Анна?  Мария123'), 'Анна Мария')
})
test('web addresses accept HTTP(S), reject unsupported and malformed URLs', () => {
  for (const url of ['example.com', 'https://example.com/path', 'http://localhost']) assert.equal(isValidHttpUrl(url), true)
  for (const url of ['', 'https://', 'bad url']) assert.equal(isValidHttpUrl(url), false)
})
