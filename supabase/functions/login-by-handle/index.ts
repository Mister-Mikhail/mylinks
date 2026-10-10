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
  if (!url || !anonKey || !serviceKey) return reply(503, { error: 'Authentication is unavailable.' })

  let input: { handle?: string; password?: string }
  try { input = await request.json() } catch { return reply(400, { error: 'Invalid JSON' }) }
  const handle = String(input.handle || '').trim().toLowerCase()
  const password = String(input.password || '')
  if (!/^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/.test(handle) || password.length < 1 || password.length > 128) {
    return reply(400, { error: 'Неверный логин или пароль.' })
  }

  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const ip = (request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim().slice(0,80)
  const { data: allowed, error: limitError } = await service.rpc('username_login_allowed', { target_handle: handle, request_ip: ip })
  if (limitError || !allowed) return reply(401, { error: 'Неверный логин или пароль. Попробуйте позже.' })

  const { data: profile } = await service.from('profiles').select('id').eq('handle', handle).maybeSingle()
  if (!profile?.id) return reply(401, { error: 'Неверный логин или пароль.' })
  const { data: userResult } = await service.auth.admin.getUserById(profile.id)
  const accountEmail = userResult?.user?.email
  if (!accountEmail) return reply(401, { error: 'Неверный логин или пароль.' })

  const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await auth.auth.signInWithPassword({ email: accountEmail, password })
  if (error || !data.session) {
    await service.rpc('username_login_failed', { target_handle: handle, request_ip: ip })
    return reply(401, { error: 'Неверный логин или пароль.' })
  }
  return reply(200, {
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      token_type: data.session.token_type,
      expires_in: data.session.expires_in,
      expires_at: data.session.expires_at,
    },
  })
})
