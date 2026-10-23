import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { createPinnedRequest } from './pinned-transport.ts'

export const validHost = (host: string) => /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) && !/(?:^|\.)(localhost|local|internal|test|invalid)$/.test(host)

// Only globally routable addresses. IPv6 transition/mapped ranges are excluded.
export function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a,b,c] = address.split('.').map(Number)
    return !(a===0 || a===10 || a===127 || a>=224 || a===100&&b>=64&&b<=127 || a===169&&b===254 || a===172&&b>=16&&b<=31 || a===192&&(b===0 || b===168 || b===88&&c===99) || a===198&&(b===18 || b===19 || b===51&&c===100) || a===203&&b===0&&c===113)
  }
  if (isIP(address) !== 6) return false
  const [first,second] = address.toLowerCase().split(':').map(x=>parseInt(x || '0',16))
  return first>=0x2000 && first<=0x3fff && first!==0x2002 && !(first===0x2001 && (second<=0x1ff || second===0xdb8)) && first!==0x3fff
}
export interface Fetched {body:Uint8Array;type:string;url:string;status:number;location?:string}
type Address = {address:string;family:number}
export type Resolver = (host:string)=>Promise<Address[]>
export type Transport = (url:URL,address:Address,limit:number,accept:string,ua:string,timeout:number)=>Promise<Fetched|null>

// Bound aggregate sockets and queued work across candidates and requests in an isolate.
export function limitedTransport(transport:Transport,parallel=6,maxQueue=96):Transport {
 let active=0
 const queue:{grant:()=>void}[]=[]
 return async(url,address,limit,accept,ua,timeout)=>{
  const deadline=Date.now()+timeout
  if(active>=parallel){
   if(queue.length>=maxQueue)return null
   const admitted=await new Promise<boolean>(resolve=>{
    const entry={grant:()=>{clearTimeout(timer);active++;resolve(true)}}
    const timer=setTimeout(()=>{const index=queue.indexOf(entry);if(index>=0)queue.splice(index,1);resolve(false)},Math.max(1,timeout))
    queue.push(entry)
   })
   if(!admitted)return null
  }else active++
  try{const remaining=deadline-Date.now();return remaining>0?await transport(url,address,limit,accept,ua,remaining):null}
  finally{active--;queue.shift()?.grant()}
 }
}
export const pinnedRequest:Transport = limitedTransport(createPinnedRequest())

export async function safeFetch(input:string,limit:number,accept:string,ua:string,timeout=5000,resolve:Resolver=host=>lookup(host,{all:true}),transport:Transport=pinnedRequest):Promise<Fetched|null> {
  const deadline=Date.now()+timeout
  try {
    let url=new URL(input)
    for(let redirect=0;redirect<=3;redirect++) {
      if(url.protocol!=='https:' || url.username || url.password || url.port && url.port!=='443' || !validHost(url.hostname))return null
      let timer:ReturnType<typeof setTimeout>|undefined
      const addresses=await Promise.race([resolve(url.hostname),new Promise<Address[]>(res=>{timer=setTimeout(()=>res([]),Math.max(1,deadline-Date.now()))})]).finally(()=>clearTimeout(timer))
      if(!addresses.length || addresses.some(x=>!publicAddress(x.address)))return null
      const remaining=deadline-Date.now();if(remaining<=0)return null
      // Race validated addresses: a dead first A/AAAA record must not mask a working one.
      // Every socket remains pinned and has the same absolute request deadline.
      let pending = addresses.length
      const result = await new Promise<Fetched|null>(resolveResult => {
        for (const address of addresses) {
          void transport(url,address,limit,accept,ua,remaining).catch(()=>null).then(value=>{
            if(value && (value.status===200 || value.status>=300 && value.status<400))resolveResult(value)
            if(--pending===0)resolveResult(null)
          })
        }
      })
      if(!result)return null
      if(result.status>=300 && result.status<400){if(!result.location)return null;url=new URL(result.location,url);continue}
      return result.status===200 ? result : null
    }
  }catch{/* DNS, certificates, timeouts and malformed redirects fail closed. */}
  return null
}
