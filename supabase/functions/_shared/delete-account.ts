import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
type StoredObject = { bucket: string; name: string }

// Injectable clients let tests exercise the real authorization and cleanup order without live users.
export const deletionHandler = (selfService: boolean, clientFactory = createClient, env = (key: string) => Deno.env.get(key)) => async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' })
  const url = env('SUPABASE_URL'), anonKey = env('SUPABASE_ANON_KEY'), serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization')
  if (!url || !anonKey || !serviceKey || !authorization?.startsWith('Bearer ')) return reply(401, { error: 'Войдите в аккаунт.' })
  try {
    const caller = clientFactory(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
    const { data: { user }, error: authError } = await caller.auth.getUser()
    if (authError || !user) return reply(401, { error: 'Войдите в аккаунт.' })
    let input: Record<string, unknown>
    try { input = await request.json() } catch { return reply(400, { error: 'Invalid JSON' }) }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return reply(400, { error: 'Invalid JSON' })
    const target = selfService ? user.id : String(input.target_id || '')
    if (!selfService) {
      const { data: role, error } = await caller.rpc('staff_role')
      if (error || role !== 'admin') return reply(403, { error: 'Только администратор может удалить аккаунт.' })
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target) || target === user.id) return reply(400, { error: 'Проверьте аккаунт.' })
      if (typeof input.expected_handle !== 'string' || !input.expected_handle || typeof input.reason !== 'string' || input.reason.trim().length < 3 || input.reason.trim().length > 1000) return reply(400, { error: 'Подтвердите адрес страницы и укажите причину.' })
    } else if (input.confirmation !== 'УДАЛИТЬ') return reply(400, { error: 'Подтвердите удаление словом УДАЛИТЬ.' })

    const { data: prepared, error: prepareError } = await caller.rpc(selfService ? 'prepare_own_account_deletion' : 'staff_prepare_account_deletion', selfService ? { confirmation: input.confirmation } : { target, expected_handle: input.expected_handle, reason: (input.reason as string).trim() })
    if (prepareError) return reply(400, { error: prepareError.message })
    if (!Array.isArray(prepared?.objects)) return reply(500, { error: 'Не удалось получить список файлов. Повторите удаление.' })
    const objects = prepared.objects as StoredObject[]
    const admin = clientFactory(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    // The SQL transaction has hidden the page and blocked all owner writes, including Storage.
    // Self-service stays signed in until cleanup succeeds so a failed request can be retried.
    if (!selfService) {
      const { error } = await admin.auth.admin.updateUserById(target, { ban_duration: '876000h' })
      if (error) return reply(500, { error: 'Профиль скрыт. Не удалось отключить вход; повторите удаление.' })
    }
    const buckets = new Map<string, string[]>()
    for (const object of objects) {
      if (typeof object.bucket !== 'string' || typeof object.name !== 'string') return reply(500, { error: 'Список файлов повреждён. Повторите удаление.' })
      buckets.set(object.bucket, [...(buckets.get(object.bucket) || []), object.name])
    }
    for (const [bucket, names] of buckets) {
      for (let i = 0; i < names.length; i += 100) {
        const { error } = await admin.storage.from(bucket).remove(names.slice(i, i + 100))
        if (error) return reply(500, { error: 'Профиль скрыт. Удаление файлов не завершилось; повторите попытку.' })
      }
    }
    const { error: deletionError } = await admin.auth.admin.deleteUser(target)
    if (deletionError) return reply(500, { error: 'Профиль скрыт. Удаление аккаунта не завершилось; повторите попытку.' })
    // Auth deletion removes refresh sessions; account_editable also rejects stale access JWTs.
    const { error: auditError } = await admin.rpc('staff_record_account_deleted', { target })
    if (auditError) console.error('account deletion audit failed', target, auditError.code)
    return reply(200, { deleted: true, audit_pending: Boolean(auditError) })
  } catch {
    return reply(500, { error: 'Удаление не завершилось. Повторите попытку.' })
  }
}
