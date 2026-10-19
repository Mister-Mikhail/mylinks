import { lookup } from 'node:dns/promises'
import { request } from 'node:https'
import { isIP } from 'node:net'

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

export const pinnedRequest:Transport = (url,address,limit,accept,ua,timeout)=>new Promise(resolve=>{
  let done=false
  const finish=(result:Fetched|null)=>{if(done)return;done=true;clearTimeout(timer);resolve(result)}
  // Connect to the validated IP itself: there is no second DNS lookup to rebind.
  // SNI/certificate validation and HTTP Host still use the original hostname.
  const req=request({protocol:'https:',hostname:address.address,family:address.family,port:443,servername:url.hostname,path:url.pathname+url.search,method:'GET',agent:false,headers:{Host:url.hostname,Accept:accept,'User-Agent':ua,'Accept-Encoding':'identity'}},res=>{
    const status=res.statusCode || 0
    if (status>=300 && status<400) { res.destroy();finish({body:new Uint8Array(),type:'',url:url.href,status,location:res.headers.location});return }
    if (status!==200 || Number(res.headers['content-length'] || 0)>limit) {res.destroy();finish(null);return}
    const chunks:Uint8Array[]=[];let size=0
    res.on('data',(chunk:Uint8Array)=>{size+=chunk.length;if(size>limit){res.destroy();finish(null)}else chunks.push(chunk)})
    res.on('error',()=>finish(null))
    res.on('end',()=>{const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length}finish({body,type:res.headers['content-type'] || '',url:url.href,status})})
  })
  const timer=setTimeout(()=>{req.destroy();finish(null)},timeout)
  req.on('error',()=>finish(null));req.end()
})

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
      const result=await transport(url,addresses[0],limit,accept,ua,remaining)
      if(!result)return null
      if(result.status>=300 && result.status<400){if(!result.location)return null;url=new URL(result.location,url);continue}
      return result.status===200 ? result : null
    }
  }catch{/* DNS, certificates, timeouts and malformed redirects fail closed. */}
  return null
}
