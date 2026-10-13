export const normalizeHandle = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 30)
    .replace(/[._-]+$/g, '')

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
