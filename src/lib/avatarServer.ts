import { supabase } from './supabase'

interface Encoded { mime: string; data: string }
interface Prepared { token: string; kind: 'image' | 'gif' | 'video'; preview: string; width: number; height: number }
interface Rendered { master: Encoded; delivery: Encoded; poster: Encoded | null; kind: 'image' | 'video' }

const request = async <T>(body: FormData, signal: AbortSignal): Promise<T> => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Войдите в аккаунт, чтобы сохранить аватар.')
  const response = await fetch('/avatar-process.php', {
    method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body, signal,
  })
  const data = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(data.error || 'Сервер не смог обработать аватар.')
  return data
}

export const prepareAvatar = (file: Blob, signal: AbortSignal) => {
  const body = new FormData()
  body.append('action', 'prepare')
  body.append('file', file, file instanceof File ? file.name : 'avatar')
  return request<Prepared>(body, signal)
}
const decode = (encoded: Encoded): Blob => {
  const bytes = Uint8Array.from(atob(encoded.data), character => character.charCodeAt(0))
  return new Blob([bytes], { type: encoded.mime })
}
export const renderAvatar = async (token: string, x: number, y: number, size: number, rotation: number, signal: AbortSignal, aspect = 1) => {
  const body = new FormData()
  for (const [key, value] of Object.entries({ action: 'render', token, x, y, size, rotation, aspect })) body.append(key, String(value))
  const result = await request<Rendered>(body, signal)
  return { delivery: decode(result.delivery), master: decode(result.master), poster: result.poster ? decode(result.poster) : undefined, kind: result.kind }
}
export const discardAvatar = async (token: string) => {
  if (!token) return
  const body = new FormData()
  body.append('action', 'discard')
  body.append('token', token)
  await request<{ discarded: boolean }>(body, new AbortController().signal).catch(() => undefined)
}
