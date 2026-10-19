import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { publicAddress, safeFetch, type Resolver, type Transport } from './safe-fetch.ts'
import { createPinnedRequest, type Connection } from './pinned-transport.ts'
const publicDns:Resolver=async()=>[{address:'93.184.215.14',family:4}]
for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.1','192.168.0.1','100.64.0.1','198.18.1.1','192.0.2.1','203.0.113.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2002:7f00::1','2001:db8::1'])test(`deny non-public ${ip}`,()=>assert.equal(publicAddress(ip),false))
test('global addresses accepted',()=>{assert.equal(publicAddress('8.8.8.8'),true);assert.equal(publicAddress('2606:4700:4700::1111'),true)})
test('reject credentials, IP literals, unsafe ports and schemes before network access',async()=>{
 for(const url of ['http://example.com','https://example.com:444','https://user:pass@example.com','https://127.0.0.1','https://[::1]','file:///etc/passwd'])assert.equal(await safeFetch(url,100,'image/png','test',100,()=>{throw Error('DNS must not run')}),null)
})
test('mixed public and private DNS is rejected without connecting',async()=>{
 let called=false
 assert.equal(await safeFetch('https://example.com',100,'image/png','test',100,async()=>[...(await publicDns('')), {address:'10.0.0.1',family:4}],async()=>{called=true;return null}),null)
 assert.equal(called,false)
})
test('transport gets validated IP, no second lookup, and revalidates every redirect',async()=>{
 const hosts:string[]=[];const addresses:string[]=[]
 const resolver:Resolver=async(host)=>{hosts.push(host);return host==='internal.example.com'?[{address:'127.0.0.1',family:4}]:publicDns(host)}
 const transport:Transport=async(url,address)=>{addresses.push(address.address);return {body:new Uint8Array(),type:'',url:url.href,status:302,location:'https://internal.example.com/icon.png'}}
 assert.equal(await safeFetch('https://example.com',100,'image/png','test',100,resolver,transport),null)
 assert.deepEqual(hosts,['example.com','internal.example.com']);assert.deepEqual(addresses,['93.184.215.14'])
})
test('redirect loops are bounded; successful output retained',async()=>{
 let calls=0
 const loop:Transport=async(url)=>{calls++;return {body:new Uint8Array(),type:'',url:url.href,status:302,location:'/again'}}
 assert.equal(await safeFetch('https://example.com',100,'image/png','test',100,publicDns,loop),null);assert.equal(calls,4)
 const response={body:new Uint8Array([1,2]),type:'image/png',url:'https://example.com/',status:200}
 assert.equal(await safeFetch(response.url,100,'image/png','test',100,publicDns,async()=>response),response)
})

function socket(raw:string, piece=7) {
 const input=new TextEncoder().encode(raw);let offset=0;let closed=0;let written=''
 const conn:Connection={
  read:async(buffer)=>{if(offset===input.length)return null;const n=Math.min(piece,buffer.length,input.length-offset);buffer.set(input.subarray(offset,offset+n));offset+=n;return n},
  write:async(buffer)=>{const n=Math.min(9,buffer.length);written+=new TextDecoder().decode(buffer.subarray(0,n));return n},
  close:()=>{closed++},
 }
 return {conn,get closed(){return closed},get written(){return written}}
}
const responseFor=async(raw:string,limit=100)=>{
 const s=socket(raw)
 const result=await createPinnedRequest(async()=>s.conn)(new URL('https://example.com/icon?q=1'),{address:'93.184.215.14',family:4},limit,'image/*','test',1000)
 assert.ok(s.closed>0)
 return result
}
test('pinned TCP address and TLS hostname stay distinct; fragmented writes preserve HTTP Host',async()=>{
 const s=socket('HTTP/1.1 200 OK\r\nContent-Length: 3\r\nContent-Type: image/png\r\n\r\npng')
 const seen:string[][]=[]
 const result=await createPinnedRequest(async(ip,hostname)=>{seen.push([ip,hostname]);return s.conn})(new URL('https://example.com/icon?q=1'),{address:'93.184.215.14',family:4},100,'image/*','test',1000)
 assert.deepEqual(seen,[['93.184.215.14','example.com']])
 assert.match(s.written,/^GET \/icon\?q=1 HTTP\/1.1\r\nHost: example.com\r\n/)
 assert.match(s.written,/Accept-Encoding: identity\r\nConnection: close/)
 assert.equal(new TextDecoder().decode(result?.body),'png');assert.equal(result?.type,'image/png');assert.ok(s.closed>0)
})
test('bounded reader decodes split chunked and connection-close bodies',async()=>{
 for(const body of ['Transfer-Encoding: chunked\r\n\r\n2;tag=a\r\npn\r\n1\r\ng\r\n0\r\n\r\n','\r\npng']){
  const r=await responseFor('HTTP/1.1 200 OK\r\n'+body)
  assert.equal(new TextDecoder().decode(r?.body),'png')
 }
})
for(const [name,headers,body,limit] of [
 ['oversized declared length','Content-Length: 101','',100],
 ['truncated body','Content-Length: 4','png',100],
 ['oversized close body','','12345',4],
 ['oversized chunk','Transfer-Encoding: chunked','5\r\n12345\r\n0\r\n\r\n',4],
 ['truncated chunk','Transfer-Encoding: chunked','4\r\npng',100],
 ['malformed chunk','Transfer-Encoding: chunked','zzz\r\n',100],
 ['bad chunk ending','Transfer-Encoding: chunked','3\r\npngxx0\r\n',100],
 ['conflicting lengths','Content-Length: 3\r\nContent-Length: 4','png',100],
 ['ambiguous framing','Transfer-Encoding: chunked\r\nContent-Length: 3','png',100],
 ['unsupported encoding','Content-Encoding: gzip','png',100],
 ['unsupported transfer','Transfer-Encoding: gzip','png',100],
 ['oversized headers','X-Large: '+ 'x'.repeat(9000),'png',100],
] as const)test(`HTTP transport rejects ${name}`,async()=>assert.equal(await responseFor(`HTTP/1.1 200 OK\r\n${headers}${headers?'\r\n':''}\r\n${body}`,limit),null))
test('redirect returns only headers; safeFetch validates the next host',async()=>{
 const r=await responseFor('HTTP/1.1 302 Found\r\nLocation: https://internal.example.com/x\r\nContent-Length: 999999\r\n\r\n')
 assert.equal(r?.status,302);assert.equal(r?.location,'https://internal.example.com/x');assert.equal(r?.body.length,0)
})
test('TLS verification errors fail closed',async()=>{
 const r=await createPinnedRequest(async()=>{throw Error('certificate hostname mismatch')})(new URL('https://example.com'),{address:'93.184.215.14',family:4},100,'image/*','test',20)
 assert.equal(r,null)
})
test('timeout closes an in-flight connection',async()=>{
 let closed=false
 const s=socket('')
 s.conn.read=()=>new Promise(resolve=>{s.conn.close=()=>{closed=true;resolve(null)}})
 const r=await createPinnedRequest(async()=>s.conn)(new URL('https://example.com'),{address:'93.184.215.14',family:4},100,'image/*','test',20)
 assert.equal(r,null);assert.equal(closed,true)
})
test('connection that arrives after timeout is closed without writing',async()=>{
 const s=socket('');let finish!:(value:Connection)=>void
 const request=createPinnedRequest(()=>new Promise(resolve=>{finish=resolve}))(new URL('https://example.com'),{address:'93.184.215.14',family:4},100,'image/*','test',5)
 assert.equal(await request,null);finish(s.conn);await new Promise(resolve=>setTimeout(resolve,0))
 assert.ok(s.closed>0);assert.equal(s.written,'')
})
