import { useEffect, useState } from 'react'
import { ContactRound, Copy, Share2 } from 'lucide-react'
import type { EditableContact } from '../types'
import { copyText } from '../lib/clipboard'
import { downloadBlob, profileFilename, profileUrl } from '../lib/profileUrl'
import { buildVCard } from '../lib/vcard'
import './public-share.css'

export function PublicShareTools({ handle, name, contacts, showQr }: { handle: string; name: string; contacts: EditableContact[]; showQr: boolean }) {
  const [qr, setQr] = useState('')
  const [notice, setNotice] = useState('')
  const url = profileUrl(handle)
  useEffect(() => {
    let active = true
    if (showQr) void import('qrcode').then(({ default: code }) => code.toDataURL(url, { width: 512, margin: 4, errorCorrectionLevel: 'Q', color: { dark: '#f7fafcff', light: '#101923ff' } })).then(image => { if (active) setQr(image) }).catch(() => { if (active) setNotice('QR-код временно недоступен.') })
    return () => { active = false }
  }, [showQr, url])
  const share = async () => {
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ title: name, url }); return }
      catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return }
    }
    setNotice(await copyText(url) ? 'Ссылка скопирована.' : 'Не удалось скопировать ссылку.')
  }
  const saveContact = () => {
    downloadBlob(new Blob([buildVCard(name, handle, contacts)], { type: 'text/vcard;charset=utf-8' }), `mylinks-${profileFilename(handle)}.vcf`)
  }
  return <div className="profile-share" aria-label="Поделиться профилем">
    {showQr && qr && <div className="profile-share__qr"><img src={qr} width={176} height={176} alt={`QR-код страницы mylinks.bar/${handle}`} /><span>Наведите камеру, чтобы открыть страницу</span></div>}
    <div className="profile-share__actions"><button type="button" onClick={() => void share()}><Share2 size={16} />Поделиться</button><button type="button" onClick={saveContact}><ContactRound size={16} />Сохранить контакт</button><button type="button" onClick={async () => setNotice(await copyText(url) ? 'Ссылка скопирована.' : 'Не удалось скопировать ссылку.')}><Copy size={16} />Скопировать</button></div>
    {notice && <p role="status">{notice}</p>}
  </div>
}
