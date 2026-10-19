import { normalizeUrl } from './validation'

const ICON_SERVICE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/favicon`

const hostnameOf = (value: string) => {
  try {
    return new URL(normalizeUrl(value)).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return ''
  }
}

/**
 * Icon sources, tried one after another until one loads. All of them come from the
 * linked site itself — no search-engine icon services:
 * 1. our icon function, which reads the site's own <link rel="icon"> declarations
 *    (best quality, works for icons at any path);
 * 2. the site's standard files fetched straight by the visitor's browser
 *    (helps when a site blocks servers outside its country);
 * Registrable-domain fallback is resolved in the proxy using Public Suffix List.
 */
export const faviconCandidates = (value: string): string[] => {
  const hostname = hostnameOf(value)
  if (!hostname) return []
  const direct = (host: string) => [`https://${host}/apple-touch-icon.png`, `https://${host}/favicon.ico`]
  return [
    `${ICON_SERVICE}?domain=${encodeURIComponent(hostname)}`,
    ...direct(hostname),
  ]
}
