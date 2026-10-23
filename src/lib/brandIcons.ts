import manifest from '../generated/platform-icons.json' with { type: 'json' }
const plates = new Set(['capcut', 'github', 'notion', 'mastercard', 'tesla'])
export function localBrandIcon(name: string, value: string) {
  let host = ''
  try { host = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, '') } catch { /* Invalid draft address. */ }
  const exact = manifest.find(entry => entry.domains.some(domain => host === domain || host.endsWith(`.${domain}`)))
  const entry = exact || manifest.find(entry => entry.name === name && ['instagram', 'telegram', 'whatsapp', 'onlyfans', 'vk', 'youtube', 'tiktok', 'x', 'facebook'].includes(name))
  return entry ? { src: `/icons/platforms/${entry.file}`, plate: plates.has(entry.name), version: entry.sha256.slice(0, 12) } : null
}
