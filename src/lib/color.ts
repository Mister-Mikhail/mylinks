export function normalizeColor(input:string):string|null {
 const text=input.trim().toLowerCase()
 if(/^#?[0-9a-f]{6}$/.test(text))return '#'+text.replace('#','')
 if(/^#[0-9a-f]{3}$/.test(text))return '#'+text.slice(1).split('').map(c=>c+c).join('')
 const match=text.match(/^(?:rgb\(\s*)?(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*\)?$/)
 if(!match)return null
 const rgb=match.slice(1).map(Number)
 return rgb.every(x=>x<=255)?'#'+rgb.map(x=>x.toString(16).padStart(2,'0')).join(''):null
}
export function hexToHsl(hex:string):[number,number,number] {
 const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2
 const h=d===0?0:max===r?((g-b)/d+(g<b?6:0))*60:max===g?((b-r)/d+2)*60:((r-g)/d+4)*60
 return [Math.round(h),Math.round((d===0?0:d/(1-Math.abs(2*l-1)))*100),Math.round(l*100)]
}
export function hslToHex(h:number,s:number,l:number):string {
 s/=100;l/=100
 const a=s*Math.min(l,1-l),f=(n:number)=>{const k=(n+h/30)%12;return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)))).toString(16).padStart(2,'0')}
 return '#'+f(0)+f(8)+f(4)
}
