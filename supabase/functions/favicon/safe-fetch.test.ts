import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { publicAddress, safeFetch, type Resolver, type Transport } from './safe-fetch.ts'
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
