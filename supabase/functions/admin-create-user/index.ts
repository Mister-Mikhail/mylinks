import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

function randomSecret(bytes = 24) {
  const values = crypto.getRandomValues(new Uint8Array(bytes))
  let binary = ''
  for (const value of values) binary += String.fromCharCode(value)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' })

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization')
  if (!url || !anonKey || !serviceKey || !authorization) return reply(401, { error: 'Unauthorized' })

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return reply(401, { error: 'Unauthorized' })
  const { data: role, error: roleError } = await userClient.rpc('staff_role')
  if (roleError || role !== 'admin') return reply(403, { error: 'Только администратор может создавать временные аккаунты.' })

  let input: { handle?: string; display_name?: string }
  try { input = await request.json() } catch { return reply(400, { error: 'Invalid JSON' }) }
  const handle = String(input.handle || '').trim().toLowerCase()
  const displayName = String(input.display_name || '').trim()
  const reserved = new Set(['admin','auth','p','assets','icons','sounds','fonts','share-image'])
  if (!/^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/.test(handle) || reserved.has(handle)) return reply(400, { error: 'Проверьте адрес страницы.' })
  if (displayName.length < 1 || displayName.length > 80) return reply(400, { error: 'Проверьте имя пользователя.' })

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const login = `temp-${randomSecret(7)}@temporary.mylinks.bar`
  const password = randomSecret()
  const { data, error } = await admin.auth.admin.createUser({
    email: login,
    password,
    email_confirm: true,
    user_metadata: { handle, display_name: displayName },
    app_metadata: { account_kind: 'temporary' },
  })
  if (error || !data.user) return reply(400, { error: error?.message || 'Не удалось создать пользователя.' })

  const { error: recordError } = await userClient.rpc('staff_register_temporary', { target: data.user.id, initial_handle: handle, initial_name: displayName })
  if (recordError) {
    await admin.auth.admin.deleteUser(data.user.id)
    return reply(500, { error: 'Аккаунт создан с ошибкой учёта. Создание отменено.' })
  }

  return reply(200, { login, password, handle, display_name: displayName, expires_after_logins: 10, expires_after_days: 30 })
})
