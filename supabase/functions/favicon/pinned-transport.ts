import type { Fetched, Transport } from './safe-fetch.ts'

export interface Connection {
  read(buffer: Uint8Array): Promise<number | null>
  write(buffer: Uint8Array): Promise<number>
  close(): void
}
export type Connector = (address: string, hostname: string) => Promise<Connection>

const connect: Connector = async (address, hostname) => {
  // Edge runtime's node:https adapter loses servername when hostname is an IP.
  // Upgrade the already pinned TCP socket: TLS verifies the original hostname
  // and never resolves it again. Certificate validation stays enabled.
  const tcp = await Deno.connect({ hostname: address, port: 443 })
  try { return await Deno.startTls(tcp, { hostname }) }
  catch (error) { tcp.close(); throw error }
}

const decoder = new TextDecoder()
const encoder = new TextEncoder()
const join = (chunks: Uint8Array[], size: number) => {
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length }
  return body
}

// HTTP/1.1, identity encoding and one request per socket. Never reuse sockets
// across hosts. Bound both the payload and framing/header bytes independently.
export async function readResponse(conn: Connection, url: string, limit: number): Promise<Fetched | null> {
  let buffer: Uint8Array = new Uint8Array()
  let received = 0
  const more = async () => {
    const chunk = new Uint8Array(16384)
    const count = await conn.read(chunk)
    if (count === null) return false
    received += count
    if (!count || received > limit + 65536) throw Error('Response framing limit')
    buffer = join([buffer, chunk.subarray(0, count)], buffer.length + count)
    return true
  }
  const line = async (max: number) => {
    while (true) {
      const end = buffer.findIndex((b, i) => b === 13 && buffer[i + 1] === 10)
      if (end >= 0) {
        if (end > max) throw Error('Response line limit')
        const result = decoder.decode(buffer.subarray(0, end))
        buffer = buffer.slice(end + 2)
        return result
      }
      if (buffer.length > max || !await more()) throw Error('Incomplete response line')
    }
  }
  const exact = async (size: number) => {
    while (buffer.length < size) if (!await more()) throw Error('Truncated response')
    const result = buffer.slice(0, size)
    buffer = buffer.slice(size)
    return result
  }
  const statusLine = await line(4096)
  const match = /^HTTP\/1\.[01] (\d{3})(?: |$)/.exec(statusLine)
  if (!match) return null
  const status = Number(match[1])
  const headers = new Map<string, string>()
  let headerSize = statusLine.length + 2
  while (true) {
    const value = await line(8192)
    headerSize += value.length + 2
    if (headerSize > 32768) return null
    if (!value) break
    const header = /^([!#$%&'*+.^_`|~\da-z-]+):[ \t]*([^\r\n]*)$/i.exec(value)
    if (!header) return null
    const key = header[1].toLowerCase()
    if (headers.has(key) && ['content-length', 'transfer-encoding', 'location'].includes(key)) return null
    headers.set(key, header[2].trim())
  }
  const type = headers.get('content-type') || ''
  if (status >= 300 && status < 400) return { body: new Uint8Array(), type, url, status, location: headers.get('location') }
  if (status !== 200 || !['identity', ''].includes(headers.get('content-encoding') || '')) return null
  const transfer = headers.get('transfer-encoding')?.toLowerCase()
  const length = headers.get('content-length')
  if (transfer && (transfer !== 'chunked' || length !== undefined)) return null
  const chunks: Uint8Array[] = []
  let size = 0
  if (transfer === 'chunked') {
    while (true) {
      const chunkLine = await line(4096)
      if (!/^[\da-f]+(?:;[^\r\n]*)?$/i.test(chunkLine)) return null
      const count = parseInt(chunkLine.split(';')[0], 16)
      if (!Number.isSafeInteger(count) || count > limit - size) return null
      if (!count) break // Socket closes; trailers cannot affect a subsequent request.
      chunks.push(await exact(count)); size += count
      const ending = await exact(2)
      if (ending[0] !== 13 || ending[1] !== 10) return null
    }
  } else if (length !== undefined) {
    if (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) > limit) return null
    size = Number(length)
    chunks.push(await exact(size))
  } else {
    do {
      if (size + buffer.length > limit) return null
      size += buffer.length; chunks.push(buffer); buffer = new Uint8Array()
    } while (await more())
  }
  return { body: join(chunks, size), type, url, status }
}

export function createPinnedRequest(connector: Connector = connect): Transport {
  return async (url, address, limit, accept, ua, timeout) => {
    let conn: Connection | undefined
    let expired = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const close = () => { try { conn?.close() } catch { /* Already closed. */ } }
    const work = async () => {
      conn = await connector(address.address, url.hostname)
      if (expired) { close(); return null }
      const request = encoder.encode(`GET ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.hostname}\r\nAccept: ${accept}\r\nUser-Agent: ${ua}\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n`)
      for (let offset = 0; offset < request.length;) {
        const count = await conn.write(request.subarray(offset))
        if (!count) throw Error('Incomplete request')
        offset += count
      }
      return await readResponse(conn, url.href, limit)
    }
    try {
      return await Promise.race([work().catch(() => null), new Promise<null>(resolve => {
        timer = setTimeout(() => { expired = true; close(); resolve(null) }, timeout)
      })])
    } finally { clearTimeout(timer); close() }
  }
}
