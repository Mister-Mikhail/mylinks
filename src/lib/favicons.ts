import { normalizeUrl } from './validation'
export const hostnameOf = (value:string) => {
 try{return new URL(normalizeUrl(value)).hostname.replace(/^www\./i,'').toLowerCase()}catch{return ''}
}
export const snapshotUrl = (path:string|null|undefined,handle?:string):string|null => {
 if(!path)return null
 const versioned=/^\/i\/v2\/([a-z0-9._-]+)\/([a-f0-9-]{36})\/([a-f0-9]{12})\.png$/.exec(path)
 if(versioned)return path
 const old=/^\/link-icon\/(?:(?<handle>[a-z0-9._-]+)\/)?(?<id>[a-f0-9-]{36})\/(?<hash>[a-f0-9]{12})\.png$/.exec(path)
 const owner=handle||old?.groups?.handle
 return old&&owner?`/i/v2/${encodeURIComponent(owner)}/${old.groups!.id}/${old.groups!.hash}.png`:null
}
/** All drafts/owner-only icons use the same local RU/EU collector. */
export const faviconCandidates=(value:string):string[]=>{
 const host=hostnameOf(value)
 return host?[`/site-icon.php?v=2&domain=${encodeURIComponent(host)}`]:[]
}
