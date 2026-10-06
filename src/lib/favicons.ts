import { normalizeUrl } from './validation'

/** Second-level labels that belong to a public suffix (example.co.uk, example.com.ru). */
const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'msk', 'spb'])
const ICON_SERVICE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/favicon`

const hostnameOf = (value: string) => {
  try {
    return new URL(normalizeUrl(value)).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return ''
  }
}

/** lk.example.com → example.com; example.co.uk stays as is. */
const registrableDomain = (hostname: string) => {
  const labels = hostname.split('.')
  if (labels.length <= 2) return hostname
  const keep = SECOND_LEVEL.has(labels[labels.length - 2]) ? 3 : 2
  return labels.slice(-keep).join('.')
}

/**
 * Icon sources, tried one after another until one loads. All of them come from the
 * linked site itself — no search-engine icon services:
 * 1. our icon function, which reads the site's own <link rel="icon"> declarations
 *    (best quality, works for icons at any path);
 * 2. the site's standard files fetched straight by the visitor's browser
 *    (helps when a site blocks servers outside its country);
 * 3. the same files of the main domain when the link points to a subdomain.
 */
export const faviconCandidates = (value: string): string[] => {
  const hostname = hostnameOf(value)
  if (!hostname) return []
  const main = registrableDomain(hostname)
  const direct = (host: string) => [`https://${host}/apple-touch-icon.png`, `https://${host}/favicon.ico`]
  return [
    `${ICON_SERVICE}?domain=${encodeURIComponent(hostname)}`,
    ...direct(hostname),
    ...(main !== hostname ? direct(main) : []),
  ]
}
