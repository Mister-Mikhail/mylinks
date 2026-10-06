import { normalizeUrl } from './validation'

/** Second-level labels that belong to a public suffix (example.co.uk, example.com.ru). */
const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'msk', 'spb'])

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

export interface FaviconCandidate {
  src: string
  /** Google answers unknown sites with a generic 16 px globe instead of an error. */
  rejectBelow?: number
}

/**
 * Icon sources tried one after another until a real icon loads:
 * Google (sharp 64 px for popular sites) → DuckDuckGo (finds icons Google misses)
 * → the same two for the main domain when the link points to a subdomain.
 */
export const faviconCandidates = (value: string): FaviconCandidate[] => {
  const hostname = hostnameOf(value)
  if (!hostname) return []
  const hosts = [hostname, registrableDomain(hostname)].filter((host, index, all) => all.indexOf(host) === index)
  return hosts.flatMap((host) => [
    { src: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`, rejectBelow: 17 },
    { src: `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico` },
  ])
}
