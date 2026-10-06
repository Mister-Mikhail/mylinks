import { useState } from 'react'
import { AtSign, Globe2, Link2 } from 'lucide-react'
import { faviconCandidates } from '../lib/favicons'
import type { LinkIcon as LinkIconName } from '../types'

interface LinkIconProps {
  name: LinkIconName
  url?: string
  size?: number
}

interface BrandIcon {
  src: string
  /** Single-colour icons are drawn in the card's text colour, so they suit every theme. */
  mono?: boolean
}

const hostOf = (url: string) => {
  try {
    return new URL(/^[a-z][a-z\d+.-]*:/i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

const onDomain = (host: string, ...domains: string[]) => domains.some(domain => host === domain || host.endsWith(`.${domain}`))

/** Icons the owner picked for popular services; these never come from the site itself. */
const localBrandIcon = (name: LinkIconName, url: string): BrandIcon | null => {
  const normalizedUrl = url.toLowerCase()
  const host = hostOf(url)
  if (name === 'instagram' || normalizedUrl.includes('instagram.com')) return { src: '/icons/platforms/instagram.png' }
  if (name === 'telegram' || normalizedUrl.includes('t.me/') || normalizedUrl.includes('telegram.me/')) return { src: '/icons/platforms/telegram.png' }
  if (name === 'whatsapp' || normalizedUrl.includes('whatsapp.com/') || normalizedUrl.includes('wa.me/')) return { src: '/icons/platforms/whatsapp.png' }
  if (name === 'onlyfans' || normalizedUrl.includes('onlyfans.com/')) return { src: '/icons/platforms/onlyfans.png' }
  if (name === 'vk' || onDomain(host, 'vk.com', 'vk.ru', 'vk.me', 'vkvideo.ru')) return { src: '/icons/platforms/vk.svg' }
  if (onDomain(host, 'capcut.com', 'capcut.net', 'capcut.cn')) return { src: '/icons/platforms/capcut.svg', mono: true }
  if (onDomain(host, 'dzen.ru') || host === 'zen.yandex.ru') return { src: '/icons/platforms/dzen.svg', mono: true }
  // Russian banks refuse visitors from abroad, so their own icons would not load there.
  if (onDomain(host, 'alfabank.ru', 'alfa-bank.ru', 'alfabank.com')) return { src: '/icons/platforms/alfabank.svg' }
  if (onDomain(host, 'sovcombank.ru', 'halvacard.ru')) return { src: '/icons/platforms/sovcombank.svg' }
  return null
}

export function LinkIcon({ name, url = '', size = 19 }: LinkIconProps) {
  const localIcon = localBrandIcon(name, url)
  const candidates = faviconCandidates(url)
  // Progress is remembered per address, so editing the URL starts the search over.
  const [attempt, setAttempt] = useState({ key: '', index: 0, localFailed: false })
  const key = `${localIcon?.src ?? ''}|${url}`
  const state = attempt.key === key ? attempt : { key, index: 0, localFailed: false }

  const props = { className: 'link-icon__glyph', size: size + 2, strokeWidth: 1.8, 'aria-hidden': true }

  if (localIcon?.mono) {
    const mask = `url(${localIcon.src}) center / contain no-repeat`
    return <span className="link-icon__brand link-icon__mono" style={{ WebkitMask: mask, mask }} aria-hidden />
  }
  if (localIcon && !state.localFailed) {
    return <img className="link-icon__brand" src={localIcon.src} alt="" aria-hidden onError={() => setAttempt({ ...state, localFailed: true })} />
  }
  if (name === 'email') return <AtSign {...props} />
  if (name === 'website') return <Globe2 {...props} />

  const candidate = candidates[state.index]
  if (candidate) {
    const next = () => setAttempt({ ...state, index: state.index + 1 })
    return <img key={candidate} className="link-icon__favicon" src={candidate} width={size} height={size} alt="" aria-hidden onError={next} />
  }
  return candidates.length ? <Globe2 {...props} /> : <Link2 {...props} />
}
