import { supabase } from './supabase'
import type { Profile, ProfileContact, ProfileLink } from '../types'
import { profileUrl } from './profileUrl'
export interface ExportOptions { metadata: boolean; links: boolean; contacts: boolean; privateContacts: boolean; appearance: boolean; assets: boolean; assetUrls: boolean; statistics: boolean }
export const defaultExportOptions: ExportOptions = {metadata:true,links:true,contacts:false,privateContacts:false,appearance:true,assets:true,assetUrls:false,statistics:false}
const selectFields=<T extends object>(source:T, keys:readonly (keyof T)[])=>Object.fromEntries(keys.filter(k=>source[k]!==undefined).map(k=>[k,source[k]]))
export function buildProfileExport(profile:Profile, links:ProfileLink[], contacts:ProfileContact[], options:ExportOptions) {
 if(links.some(l=>l.profile_id!==profile.id)||contacts.some(c=>c.profile_id!==profile.id))throw new Error('Не удалось проверить владельца данных.')
 return {
  schema_version:1, exported_at:new Date().toISOString(), canonical_url:profileUrl(profile.handle),
  ...(options.metadata?{profile:selectFields(profile,['handle','display_name','bio','is_published','created_at','updated_at'])}:{}),
  ...(options.links?{links:links.map(l=>selectFields(l,['id','label','url','label_font','label_font_size','label_color','icon_key','presentation','image_path','image_alt','image_position_x','image_position_y','card_preset_override','card_radius_override','card_style','position','is_visible','is_sensitive']))}:{}),
  ...(options.contacts?{contacts:contacts.filter(c=>options.privateContacts||c.is_visible).map(c=>selectFields(c,['id','kind','label','value','latitude','longitude','label_font','label_font_size','label_color','value_font','value_font_size','value_color','position','is_visible']))}:{}),
  ...(options.appearance?{appearance:selectFields(profile,['background_preset','background_style','background_image_path','background_overlay','background_primary','background_secondary','card_preset','card_radius','card_border_width','card_opacity','card_padding','link_font','link_font_size','link_color','show_qr','qr_size','avatar_shape','avatar_size','avatar_scale','avatar_media','avatar_crop','name_font','name_font_size','name_color','bio_font','bio_font_size','bio_color','handle_font','handle_font_size','handle_color'])}:{}),
 } as Record<string,unknown>
}
let lastExport=0
export async function exportOwnProfile(expectedUserId:string,options:ExportOptions) {
 if(Date.now()-lastExport<10000)throw new Error('Подождите 10 секунд перед повторным экспортом.')
 lastExport=Date.now()
 const {data:{user},error:authError}=await supabase.auth.getUser()
 if(authError||!user||user.id!==expectedUserId)throw new Error('Войдите в свой аккаунт повторно.')
 const [p,l,c]=await Promise.all([
  supabase.from('profiles').select('*').eq('id',user.id).single(),
  options.links?supabase.from('profile_links').select('*',{count:'exact'}).eq('profile_id',user.id).order('position').range(0,1000):Promise.resolve({data:[],error:null,count:0}),
  options.contacts?supabase.from('profile_contacts').select('*',{count:'exact'}).eq('profile_id',user.id).order('position').range(0,1000):Promise.resolve({data:[],error:null,count:0}),
 ])
 if(p.error||l.error||c.error||!p.data||p.data.id!==user.id)throw new Error('Не удалось загрузить ваши данные. Повторите попытку.')
 if((l.count??l.data?.length??0)>1000||(c.count??c.data?.length??0)>1000)throw new Error('Слишком много записей для одного экспорта.')
 const profile=p.data as Profile, result=buildProfileExport(profile,(l.data||[]) as ProfileLink[],(c.data||[]) as ProfileContact[],options)
 if(options.assets){
  const assets=[]
  for(const [kind,path] of [['background',profile.background_image_path],['avatar',profile.avatar_path],['avatar_master',profile.avatar_master_path],['avatar_poster',profile.avatar_poster_path]] as const){
   if(!path)continue
   if(!path.startsWith(`${user.id}/`)||path.includes('..')||path.includes('\\'))throw new Error('Не удалось проверить принадлежность файла.')
   const bucket=kind==='background'?'profile-assets':'avatars'
   const asset:Record<string,unknown>={kind,bucket,path}
   if(options.assetUrls){
    const {data,error}=await supabase.storage.from(bucket).createSignedUrl(path,300)
    if(error||!data?.signedUrl)throw new Error('Не удалось подготовить ссылку на файл.')
    asset.download_url=data.signedUrl;asset.expires_at=new Date(Date.now()+300000).toISOString()
   }
   assets.push(asset)
  }
  if(options.links)for(const link of (l.data||[]) as ProfileLink[]){if(!link.image_path)continue;const path=link.image_path;if(!path.startsWith(`${user.id}/`)||path.includes('..')||path.includes('\\'))throw Error('Не удалось проверить принадлежность файла.');const asset:Record<string,unknown>={kind:'link_image',link_id:link.id,bucket:'profile-assets',path};if(options.assetUrls){const {data,error}=await supabase.storage.from('profile-assets').createSignedUrl(path,300);if(error||!data?.signedUrl)throw Error('Не удалось подготовить файл.');asset.download_url=data.signedUrl;asset.expires_at=new Date(Date.now()+300000).toISOString()}assets.push(asset)}
  result.assets=assets
 }
 if(options.statistics){
  const {data,error}=await supabase.rpc('get_profile_statistics',{p_days:0})
  if(error||!data)throw new Error('Не удалось загрузить статистику.')
  // Only aggregate counters; never raw visitor IDs, IPs or event logs.
  result.statistics={...selectFields(data,['from','to','registered_on','views','clicks','visitors']),daily:(data.daily||[]).map((d:Record<string,unknown>)=>selectFields(d,['date','views','clicks'])),links:(data.links||[]).map((l:Record<string,unknown>)=>selectFields(l,['id','label','clicks']))}
 }
 const blob=new Blob([JSON.stringify(result,null,2)],{type:'application/json'})
 if(blob.size>10*1024*1024)throw new Error('Экспорт превышает 10 МБ. Выберите меньше разделов.')
 return {blob,handle:profile.handle}
}
