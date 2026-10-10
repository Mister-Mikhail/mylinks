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

  const staff = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
  const { data: { user }, error: authError } = await staff.auth.getUser()
  if (authError || !user) return reply(401, { error: 'Unauthorized' })
  const { data: role, error: roleError } = await staff.rpc('staff_role')
  if (roleError || !['admin', 'moderator'].includes(role)) return reply(403, { error: 'Недостаточно прав для деактивации аккаунта.' })

  let input: { target_id?: string; reason?: string }
  try { input = await request.json() } catch { return reply(400, { error: 'Invalid JSON' }) }
  const targetId = String(input.target_id || '')
  const reason = String(input.reason || '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(targetId) || targetId === user.id) return reply(400, { error: 'Проверьте аккаунт.' })
  if (reason.length < 3 || reason.length > 1000) return reply(400, { error: 'Укажите причину: 3–1000 символов.' })

  // Hide the public page and record the moderation action before disabling sign-in.
  const { error: restrictionError } = await staff.rpc('staff_change', { target: targetId, action: 'restrict_profile', reason })
  if (restrictionError) return reply(400, { error: restrictionError.message })

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: banError } = await admin.auth.admin.updateUserById(targetId, { ban_duration: '876000h' })
  if (banError) return reply(500, { error: 'Страница скрыта, но блокировку входа завершить не удалось. Повторите действие.' })
  return reply(200, { deactivated: true })
})
