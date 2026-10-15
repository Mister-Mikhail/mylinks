/** One canonical origin for sharing and printed QR codes, including preview hosts. */
export const profileUrl = (handle: string) => `https://mylinks.bar/${encodeURIComponent(handle)}`
/** A fresh share URL makes messaging apps fetch new metadata after profile edits. QR remains canonical. */
export const shareProfileUrl = (handle: string, updatedAt?: string, avatarPath?: string | null) => {
 const version = `${updatedAt ?? ''}:${avatarPath ?? ''}`
 let hash = 2166136261
 for (let i=0;i<version.length;i++) hash = Math.imul(hash ^ version.charCodeAt(i), 16777619)
 return `${profileUrl(handle)}?v=${(hash >>> 0).toString(36)}`
}
export const profileFilename = (handle: string) => handle.replace(/[^a-z0-9._-]/gi, '').slice(0,50) || 'profile'
export function downloadBlob(blob: Blob, filename: string) {
 const url=URL.createObjectURL(blob), a=document.createElement('a')
 a.href=url; a.download=filename; document.body.append(a); a.click(); a.remove()
 window.setTimeout(()=>URL.revokeObjectURL(url),1000)
}
