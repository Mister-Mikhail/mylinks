import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' }
const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers })
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const allowedFonts = new Set(['manrope','arial','verdana','trebuchet','georgia','mono','oswald','cormorant','caveat','marck','lobster','pacifico','ruslan','rubik-mono','pixel'])
const number = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error('Некорректный размер.')
  return parsed
}
const font = (value: unknown) => {
  const result = String(value ?? 'manrope')
  if (!allowedFonts.has(result)) throw new Error('Некорректный шрифт.')
  return result
}
const text = (value: unknown, max: number) => {
  if (typeof value !== 'string' || value.length > max) throw new Error('Слишком длинное значение.')
  return value.trim()
}
const url = (value: unknown) => {
  const result = text(value, 2048)
  const parsed = new URL(result)
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) throw new Error('Проверьте адрес ссылки.')
  return result
}
const formatProfile = (raw: Record<string, unknown>, currentHandle: string) => {
  const handle = text(raw.handle, 30)
  const displayName = text(raw.display_name, 30)
  if ((handle !== currentHandle && (!/^[a-z]+([._][a-z]+)?$/.test(handle) || handle.length < 3)) || !/^[\p{L}]+(?: [\p{L}]+)*$/u.test(displayName)) throw new Error('Проверьте имя и user name.')
  if (!['midnight','mist','cobalt'].includes(String(raw.background_preset)) || !['glass','solid','outline'].includes(String(raw.card_preset)) || !['round','square'].includes(String(raw.avatar_shape))) throw new Error('Проверьте оформление.')
  return {
    handle, display_name: displayName, bio: text(raw.bio, 160),
    name_font: font(raw.name_font), bio_font: font(raw.bio_font), handle_font: font(raw.handle_font),
    name_font_size: number(raw.name_font_size,21,5,60), bio_font_size: number(raw.bio_font_size,10,5,60), handle_font_size: number(raw.handle_font_size,10,5,60),
    background_preset: raw.background_preset, card_preset: raw.card_preset, avatar_shape: raw.avatar_shape,
    avatar_size: ['small','medium','large'].includes(String(raw.avatar_size)) ? raw.avatar_size : 'medium',
    avatar_scale: number(raw.avatar_scale,28,10,100), is_published: raw.is_published === true, show_qr: raw.show_qr === true,
  }
}
const formatLink = (raw: Record<string, unknown>, owner: string, position: number) => ({
  ...(typeof raw.id === 'string' && uuid.test(raw.id) ? { id: raw.id } : {}),
  profile_id: owner, label: text(raw.label,80), url: url(raw.url), icon_key: text(raw.icon_key,30),
  position, is_visible: raw.is_visible === true, is_sensitive: raw.is_sensitive === true,
  label_font: font(raw.label_font), label_font_size: number(raw.label_font_size,11,5,60),
})
const formatContact = (raw: Record<string, unknown>, owner: string, position: number) => {
  const kind = text(raw.kind,10), value = text(raw.value,500)
  if (!['email','phone','address'].includes(kind)) throw new Error('Проверьте контакт.')
  if (kind === 'email' && !/^[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)*@[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)*\.[a-zA-Z]{2,}$/.test(value)) throw new Error('Проверьте email.')
  if (kind === 'phone' && !/^\+[1-9][0-9]{6,14}$/.test(value)) throw new Error('Проверьте номер.')
  return {
    ...(typeof raw.id === 'string' && uuid.test(raw.id) ? { id: raw.id } : {}),
    profile_id: owner, kind, label: text(raw.label,80), value, position, is_visible: raw.is_visible === true,
    latitude: kind === 'address' && raw.latitude != null ? number(raw.latitude,0,-90,90) : null,
    longitude: kind === 'address' && raw.longitude != null ? number(raw.longitude,0,-180,180) : null,
    label_font: font(raw.label_font), label_font_size: number(raw.label_font_size,10,5,60),
    value_font: font(raw.value_font), value_font_size: number(raw.value_font_size,9,5,60),
  }
}

export const handler = (clientFactory=createClient,env=(key:string)=>Deno.env.get(key)) => async(request:Request) => {
  if(request.method==='OPTIONS') return new Response('ok',{headers})
  if(request.method!=='POST') return reply(405,{error:'Method not allowed'})
  const endpoint=env('SUPABASE_URL'),anon=env('SUPABASE_ANON_KEY'),service=env('SUPABASE_SERVICE_ROLE_KEY'),authorization=request.headers.get('Authorization')
  if(!endpoint||!anon||!service||!authorization?.startsWith('Bearer ')) return reply(401,{error:'Требуется вход.'})
  try {
    const caller=clientFactory(endpoint,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}})
    const {data:{user},error:authError}=await caller.auth.getUser()
    if(authError||!user) return reply(401,{error:'Требуется вход.'})
    const {data:role,error:roleError}=await caller.rpc('staff_role')
    if(roleError||!['admin','moderator'].includes(role)) return reply(403,{error:'Нет доступа к профилям пользователей.'})
    const input=await request.json()
    const target=String(input?.target_id||''),action=String(input?.action||'')
    if(!uuid.test(target)||!['load','save','avatar'].includes(action)) return reply(400,{error:'Проверьте выбранный профиль.'})
    if(action!=='load'&&role!=='admin') return reply(403,{error:'Редактирование доступно только администратору.'})
    const {data:detail,error:detailError}=await caller.rpc('staff_detail',{target})
    if(detailError||!detail?.user||!detail?.profile) return reply(404,{error:'Профиль не найден.'})
    if(action!=='load'&&(target===user.id||detail.user.role!=='user')) return reply(403,{error:'Для изменения профиля сотрудника сначала снимите его роль.'})
    const admin=clientFactory(endpoint,service,{auth:{persistSession:false,autoRefreshToken:false}})
    if(action==='load') {
      const [{data:links,error:linksError},{data:contacts,error:contactsError}]=await Promise.all([
        admin.from('profile_links').select('*').eq('profile_id',target).order('position'),
        admin.from('profile_contacts').select('*').eq('profile_id',target).order('position'),
      ])
      if(linksError||contactsError) return reply(500,{error:'Не удалось загрузить содержимое профиля.'})
      const profile=detail.profile
      const [avatar,poster]=await Promise.all([
        profile.avatar_path?admin.storage.from('avatars').createSignedUrl(profile.avatar_path,3600):Promise.resolve(null),
        profile.avatar_poster_path?admin.storage.from('avatars').createSignedUrl(profile.avatar_poster_path,3600):Promise.resolve(null),
      ])
      return reply(200,{profile:{...profile,avatar_preview_url:avatar?.data?.signedUrl??null,avatar_poster_url:poster?.data?.signedUrl??null},links,contacts})
    }
    if(action==='save') {
      if(!input.profile||!Array.isArray(input.links)||!Array.isArray(input.contacts)||input.links.length>500||input.contacts.length>100) return reply(400,{error:'Проверьте поля профиля.'})
      const profile=formatProfile(input.profile,detail.profile.handle)
      const links=input.links.map((raw:Record<string,unknown>,index:number)=>formatLink(raw,target,index))
      const contacts=input.contacts.map((raw:Record<string,unknown>,index:number)=>formatContact(raw,target,index))
      if(links.some((link:{label:string;icon_key:string})=>!link.label||!['link','website','instagram','youtube','telegram','tiktok','whatsapp','vk','facebook','x','onlyfans','email'].includes(link.icon_key))) return reply(400,{error:'Проверьте ссылки.'})
      const {data,error}=await caller.rpc('staff_save_profile',{target,payload:{profile,links,contacts}})
      return error?reply(400,{error:error.message}):reply(200,{saved:true,summary:data})
    }
    if(typeof input.data!=='string'||input.data.length>7_000_000||!['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'].includes(String(input.mime))) return reply(400,{error:'Допустимы фото, GIF и MP4/WebM до 5 МБ.'})
    const kind=input.mime==='image/gif'?'gif':String(input.mime).startsWith('video/')?'video':'image'
    if(input.kind && input.kind!==kind) return reply(400,{error:'Тип файла не совпадает с форматом.'})
    if(input.poster && (typeof input.poster.data!=='string'||input.poster.data.length>7_000_000||!['image/jpeg','image/png','image/webp'].includes(String(input.poster.mime)))) return reply(400,{error:'Проверьте кадр превью.'})
    const bytes=Uint8Array.from(atob(input.data),value=>value.charCodeAt(0))
    if(bytes.length>5*1024*1024) return reply(400,{error:'Файл больше 5 МБ.'})
    const ext:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','video/mp4':'mp4','video/webm':'webm'}
    const path=`${target}/avatar-${crypto.randomUUID()}.${ext[input.mime]}`
    const {error:uploadError}=await admin.storage.from('avatars').upload(path,bytes,{contentType:input.mime,upsert:false})
    if(uploadError) return reply(500,{error:'Не удалось загрузить аватар.'})
    let posterPath:string|null=null
    if(input.poster) {
      const posterBytes=Uint8Array.from(atob(input.poster.data),value=>value.charCodeAt(0))
      if(posterBytes.length>5*1024*1024){await admin.storage.from('avatars').remove([path]);return reply(400,{error:'Кадр превью больше 5 МБ.'})}
      posterPath=`${target}/poster-${crypto.randomUUID()}.${ext[input.poster.mime]}`
      const {error:posterError}=await admin.storage.from('avatars').upload(posterPath,posterBytes,{contentType:input.poster.mime,upsert:false})
      if(posterError){await admin.storage.from('avatars').remove([path]);return reply(500,{error:'Не удалось загрузить кадр превью.'})}
    }
    const {error:updateError}=await caller.rpc('staff_set_avatar',{target,avatar:path,media:kind,crop:input.crop??null,poster:posterPath})
    if(updateError){await admin.storage.from('avatars').remove([path,...(posterPath?[posterPath]:[])]);return reply(500,{error:'Не удалось сохранить аватар.'})}
    const [signed,posterSigned]=await Promise.all([
      admin.storage.from('avatars').createSignedUrl(path,3600),
      posterPath?admin.storage.from('avatars').createSignedUrl(posterPath,3600):Promise.resolve(null),
    ])
    const oldPaths=[detail.profile.avatar_path,detail.profile.avatar_poster_path].filter((old:string)=>Boolean(old && old.startsWith(target+'/') && old!==path && old!==posterPath))
    if(oldPaths.length) await admin.storage.from('avatars').remove(oldPaths)
    return reply(200,{avatar_path:path,avatar_preview_url:signed.data?.signedUrl??null,avatar_media:kind,avatar_crop:input.crop??null,avatar_poster_path:posterPath,avatar_poster_url:posterSigned?.data?.signedUrl??null})
  } catch(error) {return reply(400,{error:error instanceof Error?error.message:'Действие не завершено.'})}
}
Deno.serve(handler())
