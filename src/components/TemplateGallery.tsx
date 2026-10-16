import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Check, LayoutTemplate, RotateCcw, X } from 'lucide-react'
import type { EditableContact, EditableLink, Profile } from '../types'
import { appearanceSnapshot, templates, type AppearancePatch, type TemplateCategory } from '../config/templates'
import { FONT_OPTIONS } from '../lib/typography'
import { ProfilePreview } from './ProfilePreview'
import './template-gallery.css'

const filters: { key: TemplateCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'Все' }, { key: 'minimal', label: 'Минимализм' },
  { key: 'creative', label: 'Творческие' }, { key: 'professional', label: 'Деловые' },
]

export function TemplateGallery({ profile, links, contacts, setProfile }: {
  profile: Profile
  links: EditableLink[]
  contacts: EditableContact[]
  setProfile: (profile: Profile) => void
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<TemplateCategory | 'all'>('all')
  const [selected, setSelected] = useState(templates[0].id)
  const [previous, setPrevious] = useState<AppearancePatch | null>(null)
  const [mobileDetail, setMobileDetail] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { if (open && !dialog.current?.open) dialog.current?.showModal(); else if (!open && dialog.current?.open) dialog.current?.close() }, [open])

  const template = templates.find(item => item.id === selected) ?? templates[0]
  const preview = { ...profile, ...template.appearance }
  const apply = () => {
    setPrevious(appearanceSnapshot(profile))
    setProfile(preview)
    setOpen(false)
  }
  const undo = () => {
    if (!previous) return
    setProfile({ ...profile, ...previous })
    setPrevious(null)
  }

  return <>
    <section className="settings-card template-gallery-entry">
      <div className="settings-card__title"><LayoutTemplate size={18} /><div><h2>Готовые шаблоны</h2><p>Девять вариантов оформления. Ваши ссылки и аватар останутся на месте.</p></div></div>
      <div className="template-gallery-entry__actions">
        <button type="button" className="button button--secondary button--small" onClick={() => { setMobileDetail(false); setOpen(true) }}>Выбрать шаблон</button>
        {previous && <button type="button" className="button button--ghost button--small" onClick={undo}><RotateCcw size={14} /> Отменить применение</button>}
      </div>
    </section>
    <dialog ref={dialog} className="template-gallery" aria-labelledby="template-gallery-title" onCancel={() => setOpen(false)}>
      <header className="template-gallery__header"><div><span className="eyebrow">Оформление страницы</span><h2 id="template-gallery-title">Выберите шаблон</h2></div><button type="button" className="icon-button" aria-label="Закрыть галерею" onClick={() => setOpen(false)}><X size={20}/></button></header>
      <p className="template-gallery__intro">Шаблон меняет фон, карточки и шрифты. После применения каждый параметр можно настроить отдельно.</p>
      {mobileDetail && <button type="button" className="template-gallery__back" onClick={() => setMobileDetail(false)}>← Все шаблоны</button>}
      <div className={`template-gallery__filters ${mobileDetail ? 'template-gallery__mobile-hidden' : ''}`} role="group" aria-label="Категория шаблонов">
        {filters.map(item => <button key={item.key} type="button" aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>{item.label}</button>)}
      </div>
      <div className={`template-gallery__layout ${mobileDetail ? 'template-gallery__layout--preview' : ''}`}>
        <div className="template-gallery__grid">
          {templates.filter(item => filter === 'all' || filter === item.category).map(item => {
            const font = FONT_OPTIONS.find(option => option.value === item.appearance.name_font)?.family
            return <button type="button" className={`template-tile template-tile--${item.appearance.background_preset}`} aria-pressed={selected === item.id} key={item.id} onClick={() => { setSelected(item.id); if (window.matchMedia('(max-width: 650px)').matches) setMobileDetail(true) }}>
              <span className={`template-tile__sample theme-${item.appearance.background_preset}`} style={{ '--sample-radius': `${item.appearance.card_radius}px` } as CSSProperties}>
                <span className="template-tile__portrait" />
                <span className="template-tile__name" style={{ fontFamily: font }}>Ваше имя</span>
                <span className={`template-tile__link card-${item.appearance.card_preset}`} /><span className={`template-tile__link card-${item.appearance.card_preset}`} />
              </span>
              <span className="template-tile__caption"><strong>{item.name}</strong>{selected === item.id && <Check size={15}/>}</span>
              <small>{item.description}</small>
            </button>
          })}
        </div>
        <div className="template-gallery__detail"><div className="template-gallery__detail-title"><strong>{template.name}</strong><span>Ваши данные в выбранном оформлении</span></div><div className="template-gallery__preview"><ProfilePreview profile={preview} links={links} contacts={contacts} showPrivacy={false} /></div></div>
      </div>
      <footer className="template-gallery__footer"><button type="button" className="button button--ghost" onClick={() => setOpen(false)}>Отмена</button><button type="button" className="button button--primary" onClick={apply}>Применить «{template.name}»</button></footer>
    </dialog>
  </>
}
