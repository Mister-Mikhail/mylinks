import { useEffect, useState } from 'react'
import { editorIconUrl } from '../lib/editorIconUrls'
export function useEditorIcon(url: string, enabled: boolean) {
  const [result, setResult] = useState<{ url: string; path: string | null }>({ url: '', path: null })
  useEffect(() => {
    let active = true
    if (enabled) void editorIconUrl(url).then(path => { if (active) setResult({ url, path }) })
    return () => { active = false }
  }, [url, enabled])
  return enabled && result.url === url ? result.path : null
}
