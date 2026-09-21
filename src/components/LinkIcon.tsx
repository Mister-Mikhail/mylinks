import { AtSign, Globe2, Instagram, Link2, Send, Youtube } from 'lucide-react'
import type { LinkIcon as LinkIconName } from '../types'

interface LinkIconProps {
  name: LinkIconName
  size?: number
}

export function LinkIcon({ name, size = 19 }: LinkIconProps) {
  const props = { size, strokeWidth: 1.8, 'aria-hidden': true }

  if (name === 'instagram') return <Instagram {...props} />
  if (name === 'telegram') return <Send {...props} />
  if (name === 'youtube') return <Youtube {...props} />
  if (name === 'email') return <AtSign {...props} />
  if (name === 'website') return <Globe2 {...props} />
  return <Link2 {...props} />
}
