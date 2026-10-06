import { useEffect, useState } from 'react'
import { AtSign, Globe2, Link2 } from 'lucide-react'
import { faviconUrl } from '../config/linkPlatforms'
import type { LinkIcon as LinkIconName } from '../types'

interface LinkIconProps {
  name: LinkIconName
  url?: string
  size?: number
}

export function LinkIcon({ name, url = '', size = 19 }: LinkIconProps) {
  const favicon = faviconUrl(url)
  const normalizedUrl = url.toLowerCase()
  const localIcon = name === 'instagram' || normalizedUrl.includes('instagram.com')
    ? '/icons/platforms/instagram.png'
    : name === 'telegram' || normalizedUrl.includes('t.me/') || normalizedUrl.includes('telegram.me/')
      ? '/icons/platforms/telegram.png'
      : name === 'whatsapp' || normalizedUrl.includes('whatsapp.com/') || normalizedUrl.includes('wa.me/')
        ? '/icons/platforms/whatsapp.png'
        : name === 'onlyfans' || normalizedUrl.includes('onlyfans.com/')
          ? '/icons/platforms/onlyfans.png'
          : ''
  const [localIconFailed, setLocalIconFailed] = useState(false)
  const [faviconFailed, setFaviconFailed] = useState(false)

  useEffect(() => {
    setLocalIconFailed(false)
    setFaviconFailed(false)
  }, [favicon, localIcon])

  const props = { className: 'link-icon__glyph', size: size + 2, strokeWidth: 1.8, 'aria-hidden': true }

  if (localIcon && !localIconFailed) {
    return <img className="link-icon__brand" src={localIcon} alt="" aria-hidden onError={() => setLocalIconFailed(true)} />
  }
  if (name === 'email') return <AtSign {...props} />
  if (name === 'website') return <Globe2 {...props} />
  if (favicon && !faviconFailed) {
    return <img className="link-icon__favicon" src={favicon} width={size} height={size} alt="" aria-hidden onError={() => setFaviconFailed(true)} />
  }
  return <Link2 {...props} />
}
