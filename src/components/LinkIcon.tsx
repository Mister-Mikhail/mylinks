import { useState } from 'react'
import { AtSign, Globe2 } from 'lucide-react'
import { faviconCandidates } from '../lib/favicons'
import type { LinkIcon as LinkIconName } from '../types'

interface LinkIconProps {
  name: LinkIconName
  url?: string
  size?: number
  snapshotPath?: string | null
  publicView?: boolean
}

interface BrandIcon {
  src: string
  plate?: boolean
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
  const host = hostOf(url)
  if (name === 'instagram' || onDomain(host, 'instagram.com')) return { src: '/icons/platforms/instagram.png' }
  if (name === 'telegram' || onDomain(host, 't.me', 'telegram.me')) return { src: '/icons/platforms/telegram.png' }
  if (name === 'whatsapp' || onDomain(host, 'whatsapp.com', 'wa.me')) return { src: '/icons/platforms/whatsapp.png' }
  if (name === 'onlyfans' || onDomain(host, 'onlyfans.com')) return { src: '/icons/platforms/onlyfans.png' }
  if (name === 'vk' || onDomain(host, 'vk.com', 'vk.ru', 'vk.me', 'vkvideo.ru')) return { src: '/icons/platforms/vk.png' }
  if (onDomain(host, 'capcut.com', 'capcut.net', 'capcut.cn')) return { src: '/icons/platforms/capcut.png', plate: true }
  if (onDomain(host, 'dzen.ru') || host === 'zen.yandex.ru') return { src: '/icons/platforms/dzen.png' }
  if (name === 'youtube' || onDomain(host, 'youtube.com', 'youtu.be')) return { src: '/icons/platforms/youtube.svg' }
  if (name === 'tiktok' || onDomain(host, 'tiktok.com')) return { src: '/icons/platforms/tiktok.png' }
  if (name === 'x' || onDomain(host, 'x.com', 'twitter.com')) return { src: '/icons/platforms/x.png' }
  if (name === 'facebook' || onDomain(host, 'facebook.com', 'fb.com')) return { src: '/icons/platforms/facebook.png' }
  if (onDomain(host, 'boosty.to')) return { src: '/icons/platforms/boosty.png' }
  if (onDomain(host, 'discord.com', 'discord.gg')) return { src: '/icons/platforms/discord.png' }
  if (onDomain(host, 'twitch.tv')) return { src: '/icons/platforms/twitch.png' }
  if (onDomain(host, 'pinterest.com', 'pin.it')) return { src: '/icons/platforms/pinterest.png' }
  if (onDomain(host, 'reddit.com')) return { src: '/icons/platforms/reddit.png' }
  if (onDomain(host, 'github.com')) return { src: '/icons/platforms/github.png', plate: true }
  if (onDomain(host, 'spotify.com')) return { src: '/icons/platforms/spotify.png' }
  if (onDomain(host, 'soundcloud.com')) return { src: '/icons/platforms/soundcloud.png' }
  if (onDomain(host, 'music.apple.com')) return { src: '/icons/platforms/applemusic.png' }
  if (onDomain(host, 'patreon.com')) return { src: '/icons/platforms/patreon.png' }
  if (onDomain(host, 'behance.net')) return { src: '/icons/platforms/behance.png' }
  if (onDomain(host, 'dribbble.com')) return { src: '/icons/platforms/dribbble.svg' }
  if (onDomain(host, 'figma.com')) return { src: '/icons/platforms/figma.svg' }
  if (onDomain(host, 'notion.so', 'notion.site', 'notion.com')) return { src: '/icons/platforms/notion.png', plate: true }
  if (onDomain(host, 'vimeo.com')) return { src: '/icons/platforms/vimeo.png' }
  if (onDomain(host, 'threads.net', 'threads.com')) return { src: '/icons/platforms/threads.png' }
  if (onDomain(host, 'snapchat.com')) return { src: '/icons/platforms/snapchat.png' }
  if (onDomain(host, 'mastercard.com', 'mastercard.ru')) return { src: '/icons/platforms/mastercard.png', plate: true }
  if (onDomain(host, 'tesla.com')) return { src: '/icons/platforms/tesla.png', plate: true }
  if (onDomain(host, 'ok.ru')) return { src: '/icons/platforms/ok.png' }
  if (onDomain(host, 'rutube.ru')) return { src: '/icons/platforms/rutube.png' }
  if (onDomain(host, 'linkedin.com', 'lnkd.in')) return { src: '/icons/platforms/linkedin.svg' }
  if (onDomain(host, 'music.yandex.ru', 'music.yandex.com')) return { src: '/icons/platforms/yandexmusic.png' }
  if (onDomain(host, 'fansly.com')) return { src: '/icons/platforms/fansly.svg' }
  if (onDomain(host, 'avito.ru')) return { src: '/icons/platforms/avito.png' }
  if (onDomain(host, 'ozon.ru', 'ozon.com')) return { src: '/icons/platforms/ozon.svg' }
  if (onDomain(host, 'wildberries.ru', 'wb.ru')) return { src: '/icons/platforms/wildberries.png' }
  // Russian banks refuse visitors from abroad, so their own icons would not load there.
  if (onDomain(host, 'alfabank.ru', 'alfa-bank.ru', 'alfabank.com')) return { src: '/icons/platforms/alfabank.svg' }
  if (onDomain(host, 'sovcombank.ru', 'halvacard.ru')) return { src: '/icons/platforms/sovcombank.svg' }
  if (onDomain(host, 'sberbank.ru', 'sber.ru', 'sberbank.com')) return { src: '/icons/platforms/sberbank.svg' }
  if (onDomain(host, 'tbank.ru', 'tinkoff.ru')) return { src: '/icons/platforms/tbank.svg' }
  return null
}

export function LinkIcon({ name, url = '', size = 19, snapshotPath, publicView = false }: LinkIconProps) {
  const localIcon = localBrandIcon(name, url)
  const candidates = publicView ? (snapshotPath ? [snapshotPath] : []) : faviconCandidates(url)
  // Progress is remembered per address, so editing the URL starts the search over.
  const [attempt, setAttempt] = useState({ key: '', index: 0, localFailed: false })
  const key = `${localIcon?.src ?? ''}|${url}|${candidates.join('|')}`
  const state = attempt.key === key ? attempt : { key, index: 0, localFailed: false }

  const props = { className: 'link-icon__glyph', size: size + 2, strokeWidth: 1.8, 'aria-hidden': true }

  if (localIcon && !state.localFailed) {
    return <img className={`link-icon__brand${localIcon.plate ? ' link-icon__plate' : ''}`} src={`${localIcon.src}?v=2`} width={size} height={size} alt="" aria-hidden onError={() => setAttempt({ ...state, localFailed: true })} />
  }
  if (name === 'email') return <AtSign {...props} />

  const candidate = candidates[state.index]
  if (candidate) {
    const next = () => setAttempt({ ...state, index: state.index + 1 })
    return <img key={candidate} className="link-icon__favicon" src={candidate} width={size} height={size} alt="" aria-hidden onError={next} />
  }
  return <Globe2 {...props} />
}

