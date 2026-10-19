import { supabase } from './supabase'
export const validAssetPath=(owner:string,path:string)=>new RegExp(`^${owner}/[a-f0-9-]{36}\\.webp$`).test(path)
export function publicImageUrl(handle:string,path?:string|null) {
 if(!path || !/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.webp$/.test(path))return null
 return `/profile-image.php?handle=${encodeURIComponent(handle)}&asset=${encodeURIComponent(path.split('/')[1])}`
}
export async function signedImage(path?:string|null){if(!path)return null;const {data,error}=await supabase.storage.from('profile-assets').createSignedUrl(path,3600);if(error)throw error;return data?.signedUrl || null}
export async function uploadProfileImage(file:File,owner:string,signal:AbortSignal) {
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('Выберите JPG, PNG или WebP до 10 МБ.')
 const {data:{session}}=await supabase.auth.getSession();if(!session)throw Error('Войдите в аккаунт.')
 const body=new FormData();body.append('file',file)
 const response=await fetch('/profile-image-process.php',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`},body,signal})
 const result=await response.json();if(!response.ok)throw Error(result.error || 'Не удалось обработать изображение.')
 if(result.mime!=='image/webp'||typeof result.data!=='string'||result.data.length>2000000)throw Error('Некорректный ответ обработки.')
 if(signal.aborted)throw new DOMException('Aborted','AbortError')
 if(owner!==session.user.id){const {data,error}=await supabase.functions.invoke('admin-profile',{body:{action:'asset',target_id:owner,data:result.data}});if(error||!data?.path)throw Error('Не удалось загрузить файл пользователя.');return {path:data.path as string,url:data.url as string}}
 const blob=new Blob([Uint8Array.from(atob(result.data),c=>c.charCodeAt(0))],{type:'image/webp'})
 const path=`${owner}/${crypto.randomUUID()}.webp`
 const {error}=await supabase.storage.from('profile-assets').upload(path,blob,{upsert:false,contentType:'image/webp',cacheControl:'3600'})
 if(error)throw error
 try {return {path,url:await signedImage(path)}}catch(error){await supabase.storage.from('profile-assets').remove([path]);throw error}
}
