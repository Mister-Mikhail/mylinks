import { useState } from 'react'
import { Check, Copy, QrCode, Share2, X } from 'lucide-react'
import { copyText } from '../lib/clipboard'
import { profileUrl } from '../lib/profileUrl'
import './activation-checklist.css'

export function ActivationChecklist({ id, handle }: { id: string; handle: string }) {
  const key = `mylinks:welcome:${id}`
  const [visible, setVisible] = useState(() => {
    try { return sessionStorage.getItem(key) === 'show' && localStorage.getItem(key) !== 'dismissed' }
    catch { return false }
  })
  const [copied, setCopied] = useState(false)
  if (!visible) return null
  const dismiss = () => { try { localStorage.setItem(key, 'dismissed'); sessionStorage.removeItem(key) } catch { /* restricted storage */ } setVisible(false) }
  const share = async () => {
    const url = profileUrl(handle)
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ url, title: 'Моя страница mylinks.bar' }); return }
      catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return }
    }
    setCopied(await copyText(url))
  }
  return <section className="activation-checklist" aria-label="Следующие шаги">
    <button type="button" className="activation-checklist__close" onClick={dismiss} aria-label="Больше не показывать подсказки"><X size={17} /></button>
    <strong>Страница готова. Поделитесь ею.</strong>
    <p>Ссылка и QR-код уже доступны. Эти действия необязательны.</p>
    <div>
      <button type="button" onClick={() => void share()}>{typeof navigator.share === 'function' ? <Share2 size={16} /> : <Copy size={16} />}{copied ? 'Ссылка скопирована' : 'Поделиться страницей'}</button>
      <button type="button" onClick={() => document.querySelector('.profile-share__qr')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><QrCode size={16} /> Показать QR</button>
      <button type="button" onClick={dismiss}><Check size={16} /> Понятно</button>
    </div>
  </section>
}
