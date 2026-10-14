import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const trashHandler = (clientFactory = createClient, env = (key: string) => Deno.env.get(key)) => async (request: Request) => {
 if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
 if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' })
 const url=env('SUPABASE_URL'), anon=env('SUPABASE_ANON_KEY'), service=env('SUPABASE_SERVICE_ROLE_KEY'), authorization=request.headers.get('Authorization')
 if (!url || !anon || !service || !authorization?.startsWith('Bearer ')) return reply(401,{error:'Войдите в аккаунт.'})
 try {
  const caller=clientFactory(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}})
  const {data:{user},error:authError}=await caller.auth.getUser()
  if(authError || !user) return reply(401,{error:'Войдите в аккаунт.'})
  const {data:role,error:roleError}=await caller.rpc('staff_role')
  if(roleError || role!=='admin') return reply(403,{error:'Только администратор может управлять корзиной.'})
  let input: Record<string,unknown>
  try { input=await request.json() } catch { return reply(400,{error:'Invalid JSON'}) }
  if(!input || typeof input!=='object' || Array.isArray(input)) return reply(400,{error:'Invalid JSON'})
  const target=String(input.target_id||''), action=input.action??'trash'
  if(!uuid.test(target) || target===user.id || !['trash','restore'].includes(String(action))) return reply(400,{error:'Проверьте выбранный аккаунт.'})
  const admin=clientFactory(url,service,{auth:{persistSession:false,autoRefreshToken:false}})
  const lease=crypto.randomUUID()
  const {data:locked,error:lockError}=await admin.rpc('trash_lock',{target,lease})
  if(lockError || !locked) return reply(409,{error:'С этим профилем уже выполняется действие. Подождите немного и обновите список.'})
  try {
  if(action==='restore') {
   const {data:prepared,error}=await caller.rpc('staff_trash_restore_prepare',{target})
   if(error) return reply(400,{error:error.message})
   const {error:updateError}=await admin.auth.admin.updateUserById(target,{email:prepared.email,email_confirm:prepared.email_confirmed,ban_duration:'none'})
   if(updateError) {
    // Keep the page inaccessible and release its reserved handle on a failed Auth change.
    const {error:rollbackError}=await admin.auth.admin.updateUserById(target,{email:`trash-${target}@accounts.mylinks.invalid`,ban_duration:'876000h'})
    if(!rollbackError) await caller.rpc('staff_trash_restore_cancel',{target})
    return reply(400,{error:'Не удалось восстановить вход. Возможно, email уже занят. Повторите попытку.'})
   }
   const {error:finishError}=await caller.rpc('staff_trash_restore_finish',{target})
   if(finishError) return reply(500,{error:'Восстановление ещё не завершено. Обновите корзину и повторите попытку.'})
   return reply(200,{restored:true})
  }
  const comment=typeof input.reason==='string'?input.reason.trim():'', retention=Number(input.retention_days??30)
  if(comment.length>1000 || ![7,30,90].includes(retention)) return reply(400,{error:'Проверьте срок хранения и комментарий.'})
  const {data:prepared,error}=await caller.rpc('staff_trash_prepare',{target,comment,retention_days:retention})
  if(error) return reply(400,{error:error.message})
  const {error:banError}=await admin.auth.admin.updateUserById(target,{email:prepared.email,ban_duration:'876000h'})
  if(banError) return reply(500,{error:'Профиль скрыт, но перенос не завершён. Повторите действие в корзине.'})
  const {error:finishError}=await caller.rpc('staff_trash_finish',{target})
  if(finishError) return reply(500,{error:'Профиль скрыт. Повторите перенос в корзине.'})
  return reply(200,{deleted:true,trashed:true,expires_at:prepared.expires_at})
  } finally { await admin.rpc('trash_unlock',{target,lease}) }
 } catch { return reply(500,{error:'Действие не завершено. Обновите список и попробуйте ещё раз.'}) }
}

export const purgeTrashHandler = (clientFactory=createClient,env=(key:string)=>Deno.env.get(key)) => async(request:Request) => {
 if(request.method!=='POST') return reply(405,{error:'Method not allowed'})
 const url=env('SUPABASE_URL'),service=env('SUPABASE_SERVICE_ROLE_KEY')
 if(!url || !service) return reply(500,{error:'Worker not configured'})
 let input:Record<string,unknown>
 try { input=await request.json() } catch { return reply(400,{error:'Invalid JSON'}) }
 if(!input || typeof input.ticket!=='string' || input.ticket.length>100) return reply(403,{error:'Invalid ticket'})
 const admin=clientFactory(url,service,{auth:{persistSession:false,autoRefreshToken:false}})
 const {data:batch,error}=await admin.rpc('trash_claim_purge_batch',{ticket:input.ticket})
 if(error || !Array.isArray(batch)) return reply(403,{error:'Invalid or expired ticket'})
 let purged=0,failed=0
 for(const item of batch) {
  try {
   if(!uuid.test(item.target) || !Array.isArray(item.objects)) throw new Error('Invalid batch')
   const buckets=new Map<string,string[]>()
   for(const object of item.objects) {
    if(typeof object.bucket!=='string' || typeof object.name!=='string') throw new Error('Invalid object')
    buckets.set(object.bucket,[...(buckets.get(object.bucket)||[]),object.name])
   }
   for(const [bucket,names] of buckets) for(let i=0;i<names.length;i+=100) {
    const {error}=await admin.storage.from(bucket).remove(names.slice(i,i+100)); if(error) throw error
   }
   const {error:deleteError}=await admin.auth.admin.deleteUser(item.target)
   // A previous run may have deleted Auth successfully and lost its final response.
   if(deleteError && deleteError.status!==404 && deleteError.code!=='user_not_found') throw deleteError
   const {error:finishError}=await admin.rpc('trash_finish_purge',{target:item.target}); if(finishError) throw finishError
   purged++
  } catch { failed++ }
 }
 return reply(failed?207:200,{purged,failed})
}
