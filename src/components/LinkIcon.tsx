import { useState } from 'react'
import { AtSign, Globe2, Link2 } from 'lucide-react'
import { faviconCandidates } from '../lib/favicons'
import type { LinkIcon as LinkIconName } from '../types'

interface LinkIconProps {
  name: LinkIconName
  url?: string
  size?: number
}

const localBrandIcon = (name: LinkIconName, url: string) => {
  const normalizedUrl = url.toLowerCase()
  if (name === 'instagram' || normalizedUrl.includes('instagram.com')) return '/icons/platforms/instagram.png'
  if (name === 'telegram' || normalizedUrl.includes('t.me/') || normalizedUrl.includes('telegram.me/')) return '/icons/platforms/telegram.png'
  if (name === 'whatsapp' || normalizedUrl.includes('whatsapp.com/') || normalizedUrl.includes('wa.me/')) return '/icons/platforms/whatsapp.png'
  if (name === 'onlyfans' || normalizedUrl.includes('onlyfans.com/')) return '/icons/platforms/onlyfans.png'
  return ''
}

export function LinkIcon({ name, url = '', size = 19 }: LinkIconProps) {
  const localIcon = localBrandIcon(name, url)
  const candidates = faviconCandidates(url)
  // Progress is remembered per address, so editing the URL starts the search over.
  const [attempt, setAttempt] = useState({ key: '', index: 0, localFailed: false })
  const key = `${localIcon}|${url}`
  const state = attempt.key === key ? attempt : { key, index: 0, localFailed: false }

  const props = { className: 'link-icon__glyph', size: size + 2, strokeWidth: 1.8, 'aria-hidden': true }

  if (localIcon && !state.localFailed) {
    return <img className="link-icon__brand" src={localIcon} alt="" aria-hidden onError={() => setAttempt({ ...state, localFailed: true })} />
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
