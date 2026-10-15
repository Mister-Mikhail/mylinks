import type { EditableContact } from '../types'
import { profileUrl } from './profileUrl'

const escapeField = (value: string) => value.replace(/\r\n?|\n/g, ' ').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').trim()
const fold = (line: string) => {
  const bytes = new TextEncoder().encode(line)
  const parts: string[] = []
  let start = 0
  while (start < bytes.length) {
    let end = Math.min(start + 75, bytes.length)
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--
    parts.push(new TextDecoder().decode(bytes.slice(start, end)))
    start = end
  }
  return parts.join('\r\n ')
}

export function buildVCard(displayName: string, handle: string, contacts: EditableContact[]): string {
  const name = escapeField(displayName)
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${name}`, `N:${name};;;;`, `URL:${profileUrl(handle)}`]
  for (const contact of contacts.filter(item => item.is_visible)) {
    const value = escapeField(contact.value)
    if (!value) continue
    if (contact.kind === 'email') lines.push(`EMAIL;TYPE=INTERNET:${value}`)
    if (contact.kind === 'phone') lines.push(`TEL;TYPE=CELL:${value}`)
    if (contact.kind === 'address') lines.push(`ADR;TYPE=WORK:;;${value};;;;`)
  }
  return lines.map(fold).join('\r\n') + '\r\n'
}
