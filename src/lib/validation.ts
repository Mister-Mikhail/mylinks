// Preserve a separator at the end while the person is typing: "a." can become "a.b".
export const normalizeHandleInput = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 30)

export const normalizeDisplayNameInput = (value: string) =>
  value.replace(/[^\p{L} ]/gu, '').replace(/ {2,}/g, ' ').replace(/^ /, '').slice(0, 60)

export const isValidDisplayName = (value: string) =>
  value.length >= 1 && value.length <= 60 && /^[\p{L}]+(?: [\p{L}]+)*$/u.test(value)

export const normalizeHandle = (value: string) =>
  normalizeHandleInput(value.trim()).replace(/[._-]+$/g, '')

const reservedHandles = new Set([
  'admin', 'auth', 'p', 'assets', 'icons', 'sounds', 'fonts', 'share-image',
])

export const isValidHandle = (value: string) =>
  /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/.test(value) && !reservedHandles.has(value)

export const normalizeUrl = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

export const isValidHttpUrl = (value: string) => {
  try {
    const url = new URL(normalizeUrl(value))
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}


export const normalizeNewHandleInput = (value: string) => value.toLowerCase().replace(/[^a-z._]/g, '').slice(0, 30)
export const isValidNewHandle = (value: string) => value.length >= 3 && value.length <= 30 && /^[a-z]+(?:[._][a-z]+)?$/.test(value) && !reservedHandles.has(value)
