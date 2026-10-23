import { useState } from 'react'
import { AtSign, Globe2 } from 'lucide-react'
import { useEditorIcon } from '../hooks/useEditorIcon'
import { localBrandIcon } from '../lib/brandIcons'
import type { LinkIcon as LinkIconName } from '../types'

interface LinkIconProps {
  name: LinkIconName
  url?: string
  size?: number
  snapshotPath?: string | null
  publicView?: boolean
}

export function LinkIcon({ name, url = '', size = 19, snapshotPath, publicView = false }: LinkIconProps) {
  const localIcon = localBrandIcon(name, url)
  // Progress is remembered per address, so editing the URL starts the search over.
  const [attempt, setAttempt] = useState({ key: '', index: 0, localFailed: false })
  const key = `${localIcon?.src ?? ''}|${url}|${publicView}|${snapshotPath ?? ''}`
  const state = attempt.key === key ? attempt : { key, index: 0, localFailed: false }
  const editorIcon = useEditorIcon(url, !publicView && (!localIcon || state.localFailed))
  const candidates = publicView ? (snapshotPath ? [snapshotPath] : []) : editorIcon ? [editorIcon] : []

  const props = { className: 'link-icon__glyph', size: size + 2, strokeWidth: 1.8, 'aria-hidden': true }

  if (localIcon && !state.localFailed) {
    return <img className={`link-icon__brand${localIcon.plate ? ' link-icon__plate' : ''}`} src={`${localIcon.src}?v=${localIcon.version}`} width={size} height={size} alt="" aria-hidden onError={() => setAttempt({ ...state, localFailed: true })} />
  }
  if (name === 'email') return <AtSign {...props} />

  const candidate = candidates[state.index]
  if (candidate) {
    const next = () => setAttempt({ ...state, index: state.index + 1 })
    return <img key={candidate} className="link-icon__favicon" src={candidate} width={size} height={size} alt="" aria-hidden onError={next} />
  }
  return <Globe2 {...props} />
}

