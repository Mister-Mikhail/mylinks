/** One canonical origin for sharing and printed QR codes, including preview hosts. */
export const profileUrl = (handle: string) => `https://mylinks.bar/${encodeURIComponent(handle)}`
export const profileFilename = (handle: string) => handle.replace(/[^a-z0-9._-]/gi, '').slice(0,50) || 'profile'
export function downloadBlob(blob: Blob, filename: string) {
 const url=URL.createObjectURL(blob), a=document.createElement('a')
 a.href=url; a.download=filename; document.body.append(a); a.click(); a.remove()
 window.setTimeout(()=>URL.revokeObjectURL(url),1000)
}
