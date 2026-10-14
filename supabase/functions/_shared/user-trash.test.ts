import { trashHandler, purgeTrashHandler } from './user-trash.ts'
const own='00000000-0000-4000-8000-000000000001',target='00000000-0000-4000-8000-000000000002'
const assert=(v:unknown,message:string)=>{if(!v)throw new Error(message)}
function fixture(options:{role?:string;denied?:boolean;authError?:boolean;finishError?:boolean;storageError?:boolean;lock?:boolean;ticketError?:boolean}={}){
 const calls:{name:string;body?:unknown}[]=[]
 let updates=0
 const factory=((_url:string,key:string)=>key==='anon'?{
  auth:{getUser:async()=>({data:{user:{id:own}},error:null})},
  rpc:async(name:string,body:unknown)=>{calls.push({name,body});if(name==='staff_role')return{data:options.role??'admin',error:null};return{data:{email:name==='staff_trash_restore_prepare'?'old@example.com':`trash-${target}@accounts.mylinks.invalid`,email_confirmed:false},error:options.denied||options.finishError&&name.endsWith('_finish')?{message:'denied'}:null}},
 }:{
  auth:{admin:{updateUserById:async(id:string,body:unknown)=>{calls.push({name:'update:'+id,body});return{error:options.authError&&updates++===0?{message:'Email exists'}:null}},deleteUser:async(id:string)=>{calls.push({name:'delete:'+id});return{error:null}}}},
  storage:{from:()=>({remove:async(paths:string[])=>{calls.push({name:'storage',body:paths});return{error:options.storageError?{}:null}}})},
  rpc:async(name:string,body:unknown)=>{calls.push({name,body});return{data:name==='trash_lock'?options.lock!==false:name==='trash_claim_purge_batch'?[{target,objects:[{bucket:'avatars',name:target+'/image.gif'}]}]:null,error:options.ticketError?{}:null}},
 })as unknown as NonNullable<Parameters<typeof trashHandler>[0]>
 const env=(key:string)=>key==='SUPABASE_URL'?'https://example.supabase.co':key==='SUPABASE_ANON_KEY'?'anon':'service'
 return{calls,run:(body:unknown,auth=true)=>trashHandler(factory,env)(new Request('https://example.test',{method:'POST',headers:auth?{Authorization:'Bearer test'}:{},body:JSON.stringify(body)})),purge:(body:unknown)=>purgeTrashHandler(factory,env)(new Request('https://example.test',{method:'POST',body:JSON.stringify(body)}))}
}
Deno.test('trash changes email and bans without deleting data or resetting password',async()=>{
 const f=fixture();assert((await f.run({target_id:target,reason:'',retention_days:30})).status===200,'trash failed')
 assert(f.calls.map(c=>c.name).join('|')===`staff_role|trash_lock|staff_trash_prepare|update:${target}|staff_trash_finish|trash_unlock`,'wrong order')
 assert(JSON.stringify(f.calls.find(c=>c.name.startsWith('update:'))?.body)===JSON.stringify({email:`trash-${target}@accounts.mylinks.invalid`,ban_duration:'876000h'}),'credentials overwritten')
})
Deno.test('ordinary users, moderators, self target, SQL rejection and concurrent requests cannot change Auth',async()=>{
 for(const role of ['user','moderator']){const f=fixture({role});assert((await f.run({target_id:target})).status===403,'non-admin accepted');assert(!f.calls.some(c=>c.name.startsWith('update:')),'Auth changed')}
 for(const [opts,body,code] of [[{}, {target_id:own},400],[{denied:true},{target_id:target},400],[{lock:false},{target_id:target},409]] as const){const f=fixture(opts);assert((await f.run(body)).status===code,'wrong failure');assert(!f.calls.some(c=>c.name.startsWith('update:')),'Auth changed')}
 const f=fixture();assert((await f.run({target_id:target},false)).status===401,'anonymous accepted')
})
Deno.test('restore preserves original email confirmation and unbans with no password reset',async()=>{
 const f=fixture();assert((await f.run({target_id:target,action:'restore'})).status===200,'restore failed')
 assert(JSON.stringify(f.calls.find(c=>c.name.startsWith('update:'))?.body)===JSON.stringify({email:'old@example.com',email_confirm:false,ban_duration:'none'}),'confirmation or credentials changed')
})
Deno.test('failed restore rolls back email before releasing the reserved handle',async()=>{
 const f=fixture({authError:true});assert((await f.run({target_id:target,action:'restore'})).status===400,'error hidden')
 assert(f.calls.map(c=>c.name).join('|')===`staff_role|trash_lock|staff_trash_restore_prepare|update:${target}|update:${target}|staff_trash_restore_cancel|trash_unlock`,'unsafe rollback')
})
Deno.test('ambiguous finish failure stays retryable and does not overwrite successful Auth restore',async()=>{
 const f=fixture({finishError:true});assert((await f.run({target_id:target,action:'restore'})).status===500,'error hidden')
 assert(f.calls.filter(c=>c.name.startsWith('update:')).length===1,'rolled back after ambiguous finish')
})
Deno.test('worker validates ticket and removes storage before Auth, recording completion last',async()=>{
 const f=fixture();assert((await f.purge({ticket:'valid-ticket'})).status===200,'purge failed');assert(f.calls.map(c=>c.name).join('|')===`trash_claim_purge_batch|storage|delete:${target}|trash_finish_purge`,'incorrect purge order')
 const denied=fixture({ticketError:true});assert((await denied.purge({ticket:'invalid'})).status===403,'bad ticket accepted');assert(!denied.calls.some(c=>c.name.startsWith('delete:')),'deleted for invalid ticket')
})
Deno.test('worker storage failure preserves Auth and finalization for retry',async()=>{
 const f=fixture({storageError:true});assert((await f.purge({ticket:'valid-ticket'})).status===207,'error hidden');assert(!f.calls.some(c=>c.name.startsWith('delete:')||c.name==='trash_finish_purge'),'deleted despite storage error')
})
