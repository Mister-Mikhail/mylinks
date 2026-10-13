import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
type StoredObject = { bucket: string; name: string }

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
  if (roleError || role !== 'admin') return reply(403, { error: 'Только администратор может удалить аккаунт.' })

  let input: { target_id?: string; expected_handle?: string; reason?: string }
  try { input = await request.json() } catch { return reply(400, { error: 'Invalid JSON' }) }
  const target = String(input.target_id || '')
  const handle = String(input.expected_handle || '').trim()
  const reason = String(input.reason || '').trim()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target) || target === user.id) {
    return reply(400, { error: 'Проверьте аккаунт.' })
  }
  if (!handle || reason.length < 3 || reason.length > 1000) return reply(400, { error: 'Подтвердите адрес страницы и укажите причину.' })

  const { data: prepared, error: prepareError } = await staff.rpc('staff_prepare_account_deletion', {
    target, expected_handle: handle, reason,
  })
  if (prepareError) return reply(400, { error: prepareError.message })
  const objects = (prepared?.objects || []) as StoredObject[]
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  // The public page is already hidden. Stop new sign-ins before removing files.
  const { error: banError } = await admin.auth.admin.updateUserById(target, { ban_duration: '876000h' })
  if (banError) return reply(500, { error: 'Профиль скрыт, но вход пока не отключён. Повторите удаление.' })

  const buckets = new Map<string, string[]>()
  for (const object of objects) {
    if (typeof object.bucket !== 'string' || typeof object.name !== 'string') {
      return reply(500, { error: 'Список файлов повреждён. Удаление остановлено.' })
    }
    buckets.set(object.bucket, [...(buckets.get(object.bucket) || []), object.name])
  }
  for (const [bucket, names] of buckets) {
    const { error } = await admin.storage.from(bucket).remove(names)
    if (error) return reply(500, { error: 'Профиль скрыт, но не все файлы удалены. Повторите удаление.' })
  }

  const { error: deletionError } = await admin.auth.admin.deleteUser(target)
  if (deletionError) return reply(500, { error: 'Профиль скрыт, но удаление аккаунта не завершилось. Повторите действие.' })
  const { error: auditError } = await admin.rpc('staff_record_account_deleted', { target })
  if (auditError) return reply(500, { error: 'Аккаунт удалён, но запись в журнале не завершена. Проверьте журнал и обратитесь к администратору базы.' })
  return reply(200, { deleted: true })
})
