import { useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, LoaderCircle, Sparkles } from 'lucide-react'
import type { EditableContact, EditableLink, LinkIcon, Profile } from '../types'
import { ProfilePreview } from './ProfilePreview'
import { supabase } from '../lib/supabase'
import { isValidHttpUrl } from '../lib/validation'
import { CONTACT_OPTIONS, isValidContactValue, isValidInternationalPhone, normalizePhone } from '../lib/contacts'
import { getLinkPlatform, LINK_PLATFORMS, onboardingPlatformUrl } from '../config/linkPlatforms'
import './onboarding.css'

type WizardLink = { label: string; url: string; icon_key: string }
type WizardContact = { kind: 'address' | 'phone' | 'email'; label: string; value: string; is_visible: boolean }
type WizardData = {
  bio: string
  links: WizardLink[]
  contact: WizardContact
  background_preset: Profile['background_preset']
  card_preset: Profile['card_preset']
  publish: boolean
}

const initialData = (profile: Profile): WizardData => {
  const saved = profile.onboarding_progress as Partial<WizardData> | null | undefined
  return {
    bio: saved?.bio ?? profile.bio ?? '',
    links: saved?.links?.length ? saved.links : [],
    contact: saved?.contact ?? { kind: 'phone', label: '', value: '', is_visible: true },
    background_preset: saved?.background_preset ?? profile.background_preset ?? 'midnight',
    card_preset: saved?.card_preset ?? profile.card_preset ?? 'glass',
    publish: saved?.publish ?? false,
  }
}

const steps = [
  { title: 'Пара слов о вас', subtitle: 'Имя и адрес страницы уже сохранены. Здесь можно добавить описание.' },
  { title: 'Первая ссылка', subtitle: 'Добавьте самое важное. Остальное — в редакторе.' },
  { title: 'Контакт', subtitle: 'По желанию. Вы сами решаете, показывать ли контакт на странице.' },
  { title: 'Последний штрих', subtitle: 'Выберите настроение и решите, когда открыть страницу.' },
]

export function OnboardingWizard({ userId, profile, onFinish }: { userId: string; profile: Profile; onFinish: () => void }) {
  const [step, setStep] = useState(0)
  const [data, setData] = useState<WizardData>(() => initialData(profile))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const patch = <K extends keyof WizardData>(key: K, value: WizardData[K]) => setData(current => ({ ...current, [key]: value }))

  const saveProgress = async (draft: WizardData = data) => {
    const { error: saveError } = await supabase.from('profiles').update({ onboarding_progress: draft }).eq('id', userId)
    if (saveError) throw saveError
  }

  const next = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if ((step === 1 || step === 3) && data.links.some(link => link.url.trim() && !isValidHttpUrl(onboardingPlatformUrl(getLinkPlatform(link.icon_key as LinkIcon), link.url)))) {
      setError('Проверьте имя пользователя, номер телефона или адрес ссылки.')
      return
    }
    if ((step === 2 || step === 3) && data.contact.value.trim() && (data.contact.kind === 'phone'
      ? !isValidInternationalPhone(data.contact.value)
      : !isValidContactValue(data.contact.kind, data.contact.value))) {
      setError(data.contact.kind === 'phone' ? 'Введите телефон в международном формате: + и 7–15 цифр, без букв.' : 'Проверьте контактные данные.')
      return
    }
    if (step < steps.length - 1) {
      setBusy(true)
      try {
        await saveProgress()
        setStep(value => Math.min(steps.length - 1, value + 1))
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Не удалось сохранить шаг. Попробуйте ещё раз.')
      } finally {
        setBusy(false)
      }
      return
    }

    setBusy(true)
    try {
      const payload = {
        ...data,
        handle: profile.handle,
        display_name: profile.display_name.trim(),
        bio: data.bio.trim(),
        links: data.links.filter(link => link.url.trim()).map(link => ({
          ...link,
          label: link.label.trim() || link.icon_key,
          url: onboardingPlatformUrl(getLinkPlatform(link.icon_key as LinkIcon), link.url),
        })),
        contact: { ...data.contact, label: data.contact.label.trim(), value: data.contact.kind === 'phone' ? normalizePhone(data.contact.value) : data.contact.value.trim() },
      }
      const { error: completeError } = await supabase.rpc('complete_onboarding', { payload })
      if (completeError) throw completeError
      onFinish()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось завершить настройку. Проверьте данные и повторите.')
    } finally {
      setBusy(false)
    }
  }

  const skip = async () => {
    setError('')
    setBusy(true)
    try {
      const draft = step === 1 ? { ...data, links: [] } : { ...data, contact: { ...data.contact, value: '', is_visible: true } }
      await saveProgress(draft)
      setData(draft)
      setStep(value => Math.min(steps.length - 1, value + 1))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить шаг. Попробуйте ещё раз.')
    } finally {
      setBusy(false)
    }
  }

  const previewProfile: Profile = { ...profile, ...data, is_published: data.publish }
  const previewLinks: EditableLink[] = data.links
    .filter(link => link.url.trim())
    .map((link, index) => ({
      localId: `onboarding-${index}`,
      label: link.label.trim() || getLinkPlatform(link.icon_key as LinkIcon).label,
      url: onboardingPlatformUrl(getLinkPlatform(link.icon_key as LinkIcon), link.url),
      icon_key: link.icon_key as LinkIcon,
      position: index,
      is_visible: true,
      is_sensitive: false,
    }))
    .filter(link => isValidHttpUrl(link.url))
  const previewContacts: EditableContact[] = data.contact.is_visible && data.contact.value.trim() && (data.contact.kind === 'phone' ? isValidInternationalPhone(data.contact.value) : isValidContactValue(data.contact.kind, data.contact.value))
    ? [{ localId: 'onboarding-contact', kind: data.contact.kind, label: data.contact.label.trim(), value: data.contact.value.trim(), position: 0, is_visible: true }]
    : []

  return (
    <main className="onboarding-page">
      <div className={`onboarding-layout ${step === 3 ? 'onboarding-layout--preview' : ''}`}>
      <section className="onboarding-card" aria-labelledby="onboarding-title">
        <div className="onboarding-brand"><span className="onboarding-mark"><Sparkles size={17} /></span><span>mylinks.bar</span><span className="onboarding-count">{step + 1} / {steps.length}</span></div>
        <div className="onboarding-progress" aria-label={`Шаг ${step + 1} из ${steps.length}`}>{steps.map((item, index) => <i key={item.title} className={index <= step ? 'is-active' : ''} />)}</div>
        <header className="onboarding-heading">
          <span className="onboarding-eyebrow">Начнём с простого</span>
          <h1 id="onboarding-title">{steps[step].title}</h1>
          <p>{steps[step].subtitle}</p>
        </header>

        <form className="onboarding-form" onSubmit={next}>
          {step === 0 && <><div className="onboarding-identity"><strong>{profile.display_name}</strong><span>mylinks.bar/{profile.handle}</span><small>Имя и адрес заданы при регистрации. Изменить их можно позже в редакторе.</small></div><label>Описание<textarea autoFocus value={data.bio} onChange={event => patch('bio', event.target.value)} maxLength={160} rows={4} placeholder="Например: дизайнер, путешественник, автор проекта…" /><small className="onboarding-counter">{data.bio.length} / 160</small></label></>}
          {step === 1 && <div className="onboarding-fields">
            {data.links.map((link, index) => <div className="onboarding-link" key={index}>
              <select aria-label="Площадка" value={link.icon_key} onChange={event => patch('links', data.links.map((item, i) => i === index ? { ...item, icon_key: event.target.value, url: '' } : item))}>{LINK_PLATFORMS.map(platform => <option key={platform.value} value={platform.value}>{platform.label}</option>)}</select>
              <input aria-label="Название ссылки" value={link.label} onChange={event => patch('links', data.links.map((item, i) => i === index ? { ...item, label: event.target.value } : item))} placeholder="Название" maxLength={80} />
              <label className="onboarding-link-input">{link.icon_key === 'whatsapp' ? 'Номер телефона' : link.icon_key === 'link' ? 'Адрес ссылки' : 'Имя пользователя или ID'}
                <span className="onboarding-link-address">{getLinkPlatform(link.icon_key as LinkIcon).inputPrefix && <span>{getLinkPlatform(link.icon_key as LinkIcon).inputPrefix}</span>}<input aria-label={link.icon_key === 'whatsapp' ? 'Номер WhatsApp' : link.icon_key === 'link' ? 'Адрес ссылки' : 'Имя пользователя или ID'} value={link.url} onChange={event => patch('links', data.links.map((item, i) => i === index ? { ...item, url: event.target.value } : item))} inputMode={link.icon_key === 'whatsapp' ? 'tel' : link.icon_key === 'link' ? 'url' : 'text'} autoCapitalize="none" autoCorrect="off" placeholder={link.icon_key === 'whatsapp' ? '+79990000000' : getLinkPlatform(link.icon_key as LinkIcon).placeholder} /></span>
              </label>
            </div>)}
            {data.links.length < 3 && <button type="button" className="onboarding-add" onClick={() => patch('links', [...data.links, { label: '', url: '', icon_key: 'link' }])}>＋ Добавить ссылку</button>}
            <button type="button" className="onboarding-skip-link" onClick={skip} disabled={busy}>Добавлю позже</button>
          </div>}
          {step === 2 && <div className="onboarding-fields">
            <select aria-label="Тип контакта" value={data.contact.kind} onChange={event => patch('contact', { ...data.contact, kind: event.target.value as WizardContact['kind'] })}>{CONTACT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            <label>{data.contact.kind === 'phone' ? 'Телефон' : 'Контакт'}<input aria-label="Значение контакта" value={data.contact.value} onChange={event => patch('contact', { ...data.contact, value: event.target.value })} placeholder={data.contact.kind === 'email' ? 'name@example.com' : data.contact.kind === 'phone' ? '+7 900 000-00-00' : 'Город, адрес'} type={data.contact.kind === 'email' ? 'email' : data.contact.kind === 'phone' ? 'tel' : 'text'} inputMode={data.contact.kind === 'phone' ? 'tel' : undefined} aria-invalid={Boolean(data.contact.value.trim()) && (data.contact.kind === 'phone' ? !isValidInternationalPhone(data.contact.value) : !isValidContactValue(data.contact.kind, data.contact.value))} />{data.contact.kind === 'phone' && <small>Укажите + и 7–15 цифр. Пробелы, скобки и дефисы допустимы; буквы — нет.</small>}</label>
            <label className="onboarding-visibility"><input type="checkbox" checked={data.contact.is_visible} onChange={event => patch('contact', { ...data.contact, is_visible: event.target.checked })} />Показывать контакт на странице</label>
            {data.contact.value.trim() && <small>{data.contact.is_visible ? 'Контакт появится в предпросмотре и на опубликованной странице.' : 'Контакт сохранится в редакторе, но не появится на странице.'}</small>}
            <button type="button" className="onboarding-skip-link" onClick={skip} disabled={busy}>Пропустить</button>
          </div>}
          {step === 3 && <div className="onboarding-fields">
            <fieldset className="onboarding-theme"><legend>Фон</legend>{(['midnight', 'mist', 'cobalt'] as const).map((preset, index) => <button key={preset} type="button" className={data.background_preset === preset ? 'is-selected' : ''} onClick={() => patch('background_preset', preset)}><i className={`onboarding-swatch onboarding-swatch--${preset}`} />{['Полночь', 'Туман', 'Кобальт'][index]}{data.background_preset === preset && <Check size={15} />}</button>)}</fieldset>
            <fieldset className="onboarding-theme"><legend>Карточки</legend>{(['glass', 'solid', 'outline'] as const).map((preset, index) => <button key={preset} type="button" className={data.card_preset === preset ? 'is-selected' : ''} onClick={() => patch('card_preset', preset)}>{['Стекло', 'Плотные', 'Контур'][index]}{data.card_preset === preset && <Check size={15} />}</button>)}</fieldset>
            <label className="onboarding-visibility"><input type="checkbox" checked={data.publish} onChange={event => patch('publish', event.target.checked)} />Сделать страницу доступной по ссылке</label>
            <p className="onboarding-private-note">Без этой отметки страница останется приватной. Все настройки можно изменить позже.</p>
          </div>}

          {error && <p className="onboarding-error" role="alert">{error}</p>}
          <div className="onboarding-actions">
            {step > 0 ? <button type="button" className="onboarding-back" onClick={() => setStep(value => Math.max(0, value - 1))} disabled={busy}><ArrowLeft size={16} />Назад</button> : <span />}
            <button type="submit" className="onboarding-next" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin" /> : step === steps.length - 1 ? 'Готово' : 'Продолжить'}{!busy && step < steps.length - 1 && <ArrowRight size={16} />}</button>
          </div>
        </form>
        <p className="onboarding-footnote">Шаги сохраняются автоматически. Всё можно изменить позже.</p>
      </section>
      {step === 3 && <aside className="onboarding-live-preview" aria-label="Предпросмотр вашей страницы">
        <p>Так будет выглядеть ваша страница</p>
        <div className="onboarding-preview-frame"><ProfilePreview profile={previewProfile} links={previewLinks} contacts={previewContacts} showPrivacy={!data.publish} /></div>
      </aside>}
      </div>
    </main>
  )
}
