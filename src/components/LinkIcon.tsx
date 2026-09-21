import { useEffect, useState } from 'react'
import { AtSign, Globe2, Instagram, Link2, Send, Youtube } from 'lucide-react'
import { faviconUrl } from '../config/linkPlatforms'
import type { LinkIcon as LinkIconName } from '../types'

interface LinkIconProps {
  name: LinkIconName
  url?: string
  size?: number
}

export function LinkIcon({ name, url = '', size = 19 }: LinkIconProps) {
  const favicon = faviconUrl(url)
  const [faviconFailed, setFaviconFailed] = useState(false)

  useEffect(() => setFaviconFailed(false), [favicon])

  if (favicon && !faviconFailed) {
    return <img className="link-icon__favicon" src={favicon} width={size} height={size} alt="" aria-hidden onError={() => setFaviconFailed(true)} />
  }

  const props = { size, strokeWidth: 1.8, 'aria-hidden': true }

  if (name === 'instagram') return <Instagram {...props} />
  if (name === 'telegram') return <Send {...props} />
  if (name === 'youtube') return <Youtube {...props} />
  if (name === 'email') return <AtSign {...props} />
  if (name === 'website') return <Globe2 {...props} />
  return <Link2 {...props} />
}
