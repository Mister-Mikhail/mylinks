import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' })
  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization')
  if (!url || !anonKey || !serviceKey || !authorization) return reply(401, { error: 'Unauthorized' })

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return reply(401, { error: 'Unauthorized' })
  const { data: access, error: accessError } = await userClient.rpc('temporary_account_session')
  if (accessError || !access?.is_temporary || access?.expired) return reply(403, { error: 'Временный доступ истёк.' })

  let input: { handle?: string; display_name?: string; password?: string }
  try { input = await request.json() } catch { return reply(400, { error: 'Invalid JSON' }) }
  const handle = String(input.handle || '').trim().toLowerCase()
  const displayName = String(input.display_name || '').trim()
  const password = String(input.password || '')
  const reserved = new Set(['admin','auth','p','assets','icons','sounds','fonts','share-image'])
  if (!/^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/.test(handle) || reserved.has(handle)) return reply(400, { error: 'Проверьте логин и адрес страницы.' })
  if (displayName.length < 1 || displayName.length > 80) return reply(400, { error: 'Проверьте имя.' })
  if (password.length < 6 || password.length > 128) return reply(400, { error: 'Пароль должен содержать от 6 до 128 символов.' })

  const { error: beginError } = await userClient.rpc('begin_temporary_claim', { desired_handle: handle, desired_name: displayName })
  if (beginError) return reply(400, { error: beginError.message })

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const nextMetadata = { ...(user.app_metadata || {}), account_kind: 'standard' }
  const { error: passwordError } = await admin.auth.admin.updateUserById(user.id, { password, app_metadata: nextMetadata })
  if (passwordError) return reply(400, { error: passwordError.message })

  const { data: completed, error: completeError } = await admin.rpc('finish_temporary_claim', { target: user.id })
  if (completeError || completed !== true) {
    await admin.auth.admin.updateUserById(user.id, { app_metadata: { ...(user.app_metadata || {}), account_kind: 'temporary' } })
    return reply(400, { error: completeError?.message || 'Не удалось завершить передачу страницы.' })
  }
  return reply(200, { claimed: true, handle })
})
