import { deletionHandler } from './delete-account.ts'
const own = '00000000-0000-4000-8000-000000000001', other = '00000000-0000-4000-8000-000000000002'
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
function fixture(options: { role?: string; storageError?: boolean; prepareError?: boolean } = {}) {
  const calls: string[] = []
  const factory = ((_url: string, key: string) => key === 'anon' ? {
    auth: { getUser: async () => ({ data: { user: { id: own } }, error: null }) },
    rpc: async (name: string) => { calls.push(name); return name === 'staff_role' ? { data: options.role ?? 'admin', error: null } : { data: { objects: [{ bucket: 'avatars', name: 'avatar.webp' }] }, error: options.prepareError ? { message: 'not allowed' } : null } },
  } : {
    auth: { admin: {
      updateUserById: async (id: string) => { calls.push(`ban:${id}`); return { error: null } },
      deleteUser: async (id: string) => { calls.push(`delete:${id}`); return { error: null } },
    } },
    storage: { from: () => ({ remove: async () => { calls.push('storage'); return { error: options.storageError ? {} : null } } }) },
    rpc: async () => { calls.push('audit'); return { error: null } },
  }) as unknown as NonNullable<Parameters<typeof deletionHandler>[1]>
  const env = (key: string) => key === 'SUPABASE_URL' ? 'https://example.supabase.co' : key === 'SUPABASE_ANON_KEY' ? 'anon' : 'service'
  return { calls, run: (self: boolean, body: unknown, authorized = true) => deletionHandler(self, factory, env)(new Request('https://example.test', { method: 'POST', headers: authorized ? { Authorization: 'Bearer test' } : {}, body: JSON.stringify(body) })) }
}
Deno.test('self deletion ignores caller-supplied target and cleans storage before Auth', async () => {
  const f = fixture(); const response = await f.run(true, { confirmation: 'УДАЛИТЬ', target_id: other })
  assert(response.status === 200, 'failed deletion')
  assert(f.calls.join('|') === `prepare_own_account_deletion|storage|delete:${own}|audit`, 'wrong target/order')
})
Deno.test('missing authorization and confirmation never start deletion', async () => {
  const f = fixture(); assert((await f.run(true, {}, false)).status === 401, 'accepted anonymous')
  assert((await f.run(true, { confirmation: 'DELETE' })).status === 400, 'accepted missing confirmation')
  assert(f.calls.length === 0, 'started deletion')
})
Deno.test('moderator cannot delete and SQL denial is honored', async () => {
  const f = fixture({ role: 'moderator' }); assert((await f.run(false, { target_id: other, expected_handle: 'user', reason: 'reason' })).status === 403, 'accepted moderator')
  assert(!f.calls.some(call => call.startsWith('delete:')), 'deleted for moderator')
  const denied = fixture({ prepareError: true }); assert((await denied.run(true, { confirmation: 'УДАЛИТЬ' })).status === 400, 'ignored SQL rejection')
  assert(!denied.calls.includes('storage'), 'cleaned despite denial')
})
Deno.test('Storage failure preserves Auth so the owner can retry', async () => {
  const f = fixture({ storageError: true }); assert((await f.run(true, { confirmation: 'УДАЛИТЬ' })).status === 500, 'failure not reported')
  assert(!f.calls.some(call => call.startsWith('ban:') || call.startsWith('delete:')), 'owner locked out before retry')
})
Deno.test('administrator uses server role and target checks', async () => {
  const f = fixture(); assert((await f.run(false, { target_id: other, expected_handle: 'user', reason: 'reason' })).status === 200, 'admin rejected')
  assert(f.calls.join('|') === `staff_role|staff_prepare_account_deletion|ban:${other}|storage|delete:${other}|audit`, 'admin order incorrect')
})
