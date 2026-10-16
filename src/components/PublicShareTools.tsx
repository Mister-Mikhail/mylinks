import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ContactRound, Copy, Download, Share2 } from 'lucide-react'
import type { EditableContact } from '../types'
import { copyText } from '../lib/clipboard'
import { downloadBlob, profileFilename, profileUrl, shareProfileUrl } from '../lib/profileUrl'
import { buildVCard } from '../lib/vcard'
import './public-share.css'

interface Props { handle: string; name: string; contacts: EditableContact[]; showQr: boolean; size: number; updatedAt?: string; avatarPath?: string | null }

export function PublicShareTools({ handle, name, contacts, showQr, size, updatedAt, avatarPath }: Props) {
  const [qr, setQr] = useState('')
  const [notice, setNotice] = useState('')
  const [open, setOpen] = useState(false)
  const [overlayMounted, setOverlayMounted] = useState(false)
  const [mobileShare, setMobileShare] = useState(false)
  const [hovered, setHovered] = useState(false)
  const qrRef = useRef<HTMLDivElement>(null)
  const url = profileUrl(handle)
  const sharingUrl = shareProfileUrl(handle, updatedAt, avatarPath)
  const qrSize = Number.isFinite(size) ? Math.min(220, Math.max(80, size)) : 176

  useEffect(() => {
    const query = window.matchMedia('(hover: none) and (pointer: coarse)')
    const update = () => setMobileShare(query.matches && typeof navigator.share === 'function')
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    let active = true
    if (showQr) void import('qrcode').then(({ default: code }) => code.toDataURL(url, { width: 640, margin: 4, errorCorrectionLevel: 'Q', color: { dark: '#f7fafcff', light: '#101923ff' } })).then(image => { if (active) setQr(image) }).catch(() => { if (active) setNotice('QR-код временно недоступен.') })
    return () => { active = false }
  }, [showQr, url])
  useEffect(() => {
    if (!open) return
    const timer = hovered ? null : window.setTimeout(() => setOpen(false), 1500)
    const outside = (event: PointerEvent) => { if (!qrRef.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { if (timer !== null) window.clearTimeout(timer); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open, hovered])
  useEffect(() => {
    if (open || !overlayMounted) return
    const timer = window.setTimeout(() => setOverlayMounted(false), 480)
    return () => window.clearTimeout(timer)
  }, [open, overlayMounted])

  const copy = async () => { setNotice(await copyText(url) ? 'Ссылка скопирована.' : 'Не удалось скопировать ссылку.'); setOpen(false) }
  const saveQr = async () => {
    try {
      const image = await (await fetch(qr)).blob()
      downloadBlob(image, `mylinks-${profileFilename(handle)}-qr.png`)
      setNotice('QR-код сохранён.')
    } catch { setNotice('Не удалось сохранить QR-код.') }
    setOpen(false)
  }
  const share = async () => {
    try { await navigator.share({ title: name, url: sharingUrl }); setOpen(false) }
    catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setNotice('Не удалось поделиться ссылкой.') }
  }
  const saveContact = () => downloadBlob(new Blob([buildVCard(name, handle, contacts)], { type: 'text/vcard;charset=utf-8' }), `mylinks-${profileFilename(handle)}.vcf`)

  return <div className="profile-share" aria-label="Поделиться профилем">
    {showQr && qr && <div className="profile-share__qr" ref={qrRef} style={{ '--qr-size': `${qrSize}px` } as CSSProperties}>
      <div className="profile-share__image" onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(true) }} onPointerLeave={event => { if (event.pointerType === 'mouse') setHovered(false) }}>
        <button type="button" className="profile-share__open" onClick={() => { setOverlayMounted(true); setOpen(value => !value) }} aria-label="Действия с QR-кодом" aria-expanded={open}>
          <img src={qr} width={qrSize} height={qrSize} alt={`QR-код страницы mylinks.bar/${handle}`} />
        </button>
        {overlayMounted && <div className={`profile-share__overlay ${open ? 'profile-share__overlay--open' : ''}`} aria-label="Действия с QR-кодом" aria-hidden={!open}>
          {mobileShare && <button type="button" onClick={() => void share()} aria-label="Поделиться страницей" title="Поделиться"><Share2 size={20} /></button>}
          <button type="button" onClick={() => void saveQr()} aria-label="Сохранить QR-код" title="Сохранить"><Download size={20} /></button>
          <button type="button" onClick={() => void copy()} aria-label="Скопировать ссылку" title="Скопировать"><Copy size={20} /></button>
        </div>}
      </div>
    </div>}
    {contacts.some(contact => contact.is_visible && contact.value.trim()) && <button className="profile-share__contact" type="button" onClick={saveContact}><ContactRound size={15} /> Сохранить контакт</button>}
    {notice && <p role="status">{notice}</p>}
  </div>
}
