import { useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, LoaderCircle, Sparkles } from 'lucide-react'
import type { Profile } from '../types'
import { supabase } from '../lib/supabase'
import { isValidHandle, isValidHttpUrl, normalizeHandle, normalizeUrl } from '../lib/validation'
import { CONTACT_OPTIONS } from '../lib/contacts'
import { LINK_PLATFORMS } from '../config/linkPlatforms'

type WizardLink = { label: string; url: string; icon_key: string }
type WizardContact = { kind: 'address' | 'phone' | 'email'; label: string; value: string; is_visible: boolean }
type WizardData = {
  display_name: string
  handle: string
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
    display_name: saved?.display_name ?? profile.display_name ?? '',
    handle: saved?.handle ?? profile.handle ?? '',
    bio: saved?.bio ?? profile.bio ?? '',
    links: saved?.links?.length ? saved.links : [],
    contact: saved?.contact ?? { kind: 'phone', label: '', value: '', is_visible: false },
    background_preset: saved?.background_preset ?? profile.background_preset ?? 'midnight',
    card_preset: saved?.card_preset ?? profile.card_preset ?? 'glass',
    publish: saved?.publish ?? false,
  }
}

const steps = [
  { title: 'Ваш адрес', subtitle: 'Как вас будут находить по ссылке.' },
  { title: 'Пара слов о вас', subtitle: 'Короткое описание можно изменить позже.' },
  { title: 'Первая ссылка', subtitle: 'Добавьте самое важное. Остальное — в редакторе.' },
  { title: 'Контакт', subtitle: 'По желанию. Контакт скрыт от посетителей по умолчанию.' },
  { title: 'Последний штрих', subtitle: 'Выберите настроение и решите, когда открыть страницу.' },
]

export function OnboardingWizard({ userId, profile, onFinish }: { userId: string; profile: Profile; onFinish: () => void }) {
  const [step, setStep] = useState(0)
  const [data, setData] = useState<WizardData>(() => initialData(profile))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const patch = <K extends keyof WizardData>(key: K, value: WizardData[K]) => setData(current => ({ ...current, [key]: value }))

  const saveProgress = async () => {
    const { error: saveError } = await supabase.from('profiles').update({ onboarding_progress: data }).eq('id', userId)
    if (saveError) throw saveError
  }

  const next = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (step === 0) {
      const handle = normalizeHandle(data.handle)
      if (!isValidHandle(handle)) {
        setError('Введите 3–30 символов: латинские буквы, цифры, точки, дефисы или подчёркивания. Начните и закончите буквой или цифрой.')
        return
      }
      if (!data.display_name.trim()) {
        setError('Введите имя для страницы.')
        return
      }
      setData(current => ({ ...current, handle }))
    }
    if (step === 2 && data.links.some(link => link.url.trim() && !isValidHttpUrl(link.url))) {
      setError('Проверьте адрес ссылки. Можно вводить без https://.')
      return
    }
    if (step === 3 && data.contact.value.trim() && data.contact.kind === 'email' && !/^\S+@\S+\.\S+$/.test(data.contact.value.trim())) {
      setError('Проверьте адрес электронной почты.')
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
        handle: normalizeHandle(data.handle),
        display_name: data.display_name.trim(),
        bio: data.bio.trim(),
        links: data.links.filter(link => link.url.trim()).map(link => ({
          ...link,
          label: link.label.trim() || link.icon_key,
          url: normalizeUrl(link.url),
        })),
        contact: { ...data.contact, label: data.contact.label.trim(), value: data.contact.value.trim() },
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
      await saveProgress()
      setStep(value => Math.min(steps.length - 1, value + 1))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить шаг. Попробуйте ещё раз.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="onboarding-page">
      <section className="onboarding-card" aria-labelledby="onboarding-title">
        <div className="onboarding-brand"><span className="onboarding-mark"><Sparkles size={17} /></span><span>mylinks.bar</span><span className="onboarding-count">{step + 1} / {steps.length}</span></div>
        <div className="onboarding-progress" aria-label={`Шаг ${step + 1} из ${steps.length}`}>{steps.map((item, index) => <i key={item.title} className={index <= step ? 'is-active' : ''} />)}</div>
        <header className="onboarding-heading">
          <span className="onboarding-eyebrow">Начнём с простого</span>
          <h1 id="onboarding-title">{steps[step].title}</h1>
          <p>{steps[step].subtitle}</p>
        </header>

        <form className="onboarding-form" onSubmit={next}>
          {step === 0 && <div className="onboarding-fields">
            <label>Как к вам обращаться<input autoFocus value={data.display_name} onChange={event => patch('display_name', event.target.value)} maxLength={80} placeholder="Ваше имя" /></label>
            <label>Адрес страницы<div className="onboarding-handle"><span>mylinks.bar/</span><input value={data.handle} onChange={event => patch('handle', normalizeHandle(event.target.value))} autoCapitalize="none" autoCorrect="off" maxLength={30} placeholder="your.name_01" /></div><small>Латиница, цифры, точка, дефис и нижнее подчёркивание.</small></label>
          </div>}
          {step === 1 && <label>Описание<textarea autoFocus value={data.bio} onChange={event => patch('bio', event.target.value)} maxLength={160} rows={4} placeholder="Например: дизайнер, путешественник, автор проекта…" /><small className="onboarding-counter">{data.bio.length} / 160</small></label>}
          {step === 2 && <div className="onboarding-fields">
            {data.links.map((link, index) => <div className="onboarding-link" key={index}>
              <select aria-label="Площадка" value={link.icon_key} onChange={event => patch('links', data.links.map((item, i) => i === index ? { ...item, icon_key: event.target.value } : item))}>{LINK_PLATFORMS.map(platform => <option key={platform.value} value={platform.value}>{platform.label}</option>)}</select>
              <input aria-label="Название ссылки" value={link.label} onChange={event => patch('links', data.links.map((item, i) => i === index ? { ...item, label: event.target.value } : item))} placeholder="Название" maxLength={80} />
              <input aria-label="Адрес ссылки" value={link.url} onChange={event => patch('links', data.links.map((item, i) => i === index ? { ...item, url: event.target.value } : item))} inputMode="url" autoCapitalize="none" placeholder="https://…" />
            </div>)}
            {data.links.length < 3 && <button type="button" className="onboarding-add" onClick={() => patch('links', [...data.links, { label: '', url: '', icon_key: 'link' }])}>＋ Добавить ссылку</button>}
            <button type="button" className="onboarding-skip-link" onClick={skip} disabled={busy}>Добавлю позже</button>
          </div>}
          {step === 3 && <div className="onboarding-fields">
            <select aria-label="Тип контакта" value={data.contact.kind} onChange={event => patch('contact', { ...data.contact, kind: event.target.value as WizardContact['kind'] })}>{CONTACT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            <input value={data.contact.value} onChange={event => patch('contact', { ...data.contact, value: event.target.value })} placeholder={data.contact.kind === 'email' ? 'name@example.com' : data.contact.kind === 'phone' ? '+7 900 000-00-00' : 'Город, адрес'} type={data.contact.kind === 'email' ? 'email' : data.contact.kind === 'phone' ? 'tel' : 'text'} />
            <label className="onboarding-visibility"><input type="checkbox" checked={data.contact.is_visible} onChange={event => patch('contact', { ...data.contact, is_visible: event.target.checked })} />Показывать контакт на странице</label>
            <button type="button" className="onboarding-skip-link" onClick={skip} disabled={busy}>Пропустить</button>
          </div>}
          {step === 4 && <div className="onboarding-fields">
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
    </main>
  )
}
