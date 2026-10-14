import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, ChevronDown, LoaderCircle, Sparkles, Trash2 } from 'lucide-react'
import type { AvatarDraft, AvatarUploadOptions, EditableContact, EditableLink, LinkIcon as LinkIconKey, Profile } from '../types'
import { ProfilePreview } from './ProfilePreview'
import { DeleteAccount } from './DeleteAccount'
import { AvatarEditor } from './AvatarEditor'
import { LinkIcon } from './LinkIcon'
import { supabase } from '../lib/supabase'
import { isValidDisplayName, isValidHttpUrl, isValidNewHandle, normalizeDisplayNameInput, normalizeNewHandleInput } from '../lib/validation'
import { CONTACT_OPTIONS, isValidContactEmail, isValidInternationalPhone, normalizePhoneInput, normalizeContactEmailInput } from '../lib/contacts'
import { getLinkPlatform, LINK_PLATFORMS, onboardingPlatformUrl } from '../config/linkPlatforms'
import './onboarding.css'
const AddressPicker = lazy(() => import('./AddressPicker'))

type WizardLink = { label: string; url: string; icon_key: LinkIconKey }
type WizardContact = { kind: 'address' | 'phone' | 'email'; label: string; value: string; is_visible: boolean; latitude?: number | null; longitude?: number | null }
type WizardData = {
  display_name: string; handle: string; bio: string; links: WizardLink[]; contact: WizardContact
  background_preset: Profile['background_preset']; card_preset: Profile['card_preset']; publish: boolean
}
const steps = [
  'Давайте познакомимся',
  'Расскажите кратко о себе',
  'Добавьте несколько своих ссылок. Вы сможете добавить еще или удалить лишнее в личном кабинете',
  'Добавьте контакт для связи',
  'Вы в шаге от завершения первоначальной настройки. Выберите тему и можете сразу опубликовать вашу мастер страницу',
]
const initialData = (profile: Profile): WizardData => {
  const saved = profile.onboarding_progress as Partial<WizardData>
  return {
    display_name: saved?.display_name ?? profile.display_name ?? '',
    handle: saved?.handle ?? (profile.handle.startsWith('draft-') ? '' : profile.handle),
    bio: saved?.bio ?? profile.bio ?? '', links: saved?.links ?? [],
    contact: saved?.contact ?? { kind: 'phone', label: '', value: '', is_visible: true },
    background_preset: saved?.background_preset ?? profile.background_preset,
    card_preset: saved?.card_preset ?? profile.card_preset, publish: saved?.publish ?? false,
  }
}
const linkUrl = (link: WizardLink) => onboardingPlatformUrl(getLinkPlatform(link.icon_key), link.url)
const validLink = (link: WizardLink) => isValidHttpUrl(linkUrl(link)) && (link.icon_key !== 'whatsapp' || isValidInternationalPhone(link.url))
const validContact = (contact: WizardContact) => contact.kind === 'phone' ? isValidInternationalPhone(contact.value) : contact.kind === 'email' ? isValidContactEmail(contact.value) : contact.value.trim().length >= 3
const errorMessage = (caught: unknown, fallback: string) => {
  const message = typeof caught === 'object' && caught && 'message' in caught ? String(caught.message) : fallback
  return message.includes('duplicate key') ? 'Этот user name уже занят. Выберите другой.' : message
}
function FieldHint({ valid, invalid, children, id }: { valid?: boolean; invalid?: boolean; children: React.ReactNode; id?: string }) {
  return <small id={id} className={`field-hint ${invalid ? 'field-hint--error' : valid ? 'field-hint--valid' : ''}`} aria-live="polite">{valid && !invalid && <Check size={14} aria-hidden="true" />}{children}</small>
}
interface Props {
  onDeleted: () => Promise<void>; userId: string; profile: Profile; setProfile: (profile: Profile) => void; onFinish: () => Promise<void>
  avatarUploading: boolean; onAvatarUpload: (blob: Blob, options?: AvatarUploadOptions) => Promise<boolean>
  avatarDraft: AvatarDraft | null; onAvatarDraft: (draft: AvatarDraft | null) => void; uploadError: string
}
export function OnboardingWizard({ userId, profile, setProfile, onFinish, avatarUploading, onAvatarUpload, avatarDraft, onAvatarDraft, uploadError, onDeleted }: Props) {
  const [step, setStep] = useState(() => Math.max(0, Math.min(4, Number(profile.onboarding_progress?.step) || 0)))
  const [data, setData] = useState<WizardData>(() => initialData(profile))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<Record<string, string>>({})
  const [attempted, setAttempted] = useState(false)
  const [availability, setAvailability] = useState({ value: '', status: '' })
  const patch = <K extends keyof WizardData>(key: K, value: WizardData[K]) => setData(current => ({ ...current, [key]: value }))
  const warning = (key: string, message: string) => setWarnings(current => ({ ...current, [key]: message }))
  const handleValid = isValidNewHandle(data.handle) || (data.handle === profile.handle && !profile.handle.startsWith('draft-'))
  const nameValid = isValidDisplayName(data.display_name.trim())
  const locked = busy || avatarUploading || Boolean(avatarDraft)
  useEffect(() => {
    if (!handleValid) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      const { data: available, error: checkError } = await supabase.rpc('is_handle_available', { candidate: data.handle })
      if (!cancelled) setAvailability({ value: data.handle, status: checkError ? 'error' : available ? 'available' : 'taken' })
    }, 350)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [data.handle, handleValid])

  const saveProgress = async (draft: WizardData, nextStep: number) => {
    const { error: saveError } = await supabase.from('profiles').update({
      onboarding_progress: { ...draft, step: nextStep }, avatar_shape: profile.avatar_shape,
      avatar_size: profile.avatar_size, avatar_scale: profile.avatar_scale,
    }).eq('id', userId)
    if (saveError) throw saveError
  }
  const move = async (nextStep: number, draft = data) => {
    setBusy(true); setError('')
    try { await saveProgress(draft, nextStep); setData(draft); setStep(nextStep); setAttempted(false) }
    catch (caught) { setError(errorMessage(caught, 'Не удалось сохранить шаг. Попробуйте ещё раз.')) }
    finally { setBusy(false) }
  }
  const next = async (event: FormEvent) => {
    event.preventDefault(); setAttempted(true); setError('')
    if (locked) return
    if ((step === 0 || step === 4) && (!nameValid || !handleValid)) { setStep(0); setError('Проверьте имя и user name.'); return }
    if ((step === 2 || step === 4) && data.links.some(link => !validLink(link))) { setStep(2); setError('Заполните ссылки или удалите пустые карточки.'); return }
    if ((step === 3 || step === 4) && data.contact.value && !validContact(data.contact)) { setStep(3); setError('Проверьте контактные данные.'); return }
    setBusy(true)
    try {
      if (step === 0) {
        const { error: identityError } = await supabase.rpc('save_onboarding_identity', { profile_name: data.display_name.trim(), profile_handle: data.handle })
        if (identityError) throw identityError
        setProfile({ ...profile, display_name: data.display_name.trim(), handle: data.handle })
      }
      if (step < 4) { await saveProgress(data, step + 1); setStep(step + 1); setAttempted(false); return }
      const payload = {
        ...data, display_name: data.display_name.trim(), bio: data.bio.trim(),
        avatar_shape: profile.avatar_shape, avatar_size: profile.avatar_size, avatar_scale: profile.avatar_scale,
        links: data.links.map(link => ({ ...link, label: link.label.trim() || getLinkPlatform(link.icon_key).label, url: linkUrl(link) })),
        contact: { ...data.contact, value: data.contact.value.trim(), label: data.contact.label.trim() },
      }
      const { error: completeError } = await supabase.rpc('complete_onboarding', { payload })
      if (completeError) throw completeError
      await onFinish()
    } catch (caught) { setError(errorMessage(caught, 'Не удалось сохранить данные. Попробуйте ещё раз.')) }
    finally { setBusy(false) }
  }
  const updateLink = (index: number, change: Partial<WizardLink>) => patch('links', data.links.map((link, i) => i === index ? { ...link, ...change } : link))
  const previewProfile = { ...profile, ...data, is_published: data.publish }
  const previewLinks: EditableLink[] = data.links.filter(validLink).map((link, position) => ({ ...link, localId: `wizard-${position}`, label: link.label.trim() || getLinkPlatform(link.icon_key).label, url: linkUrl(link), position, is_visible: true, is_sensitive: false }))
  const previewContacts: EditableContact[] = data.contact.is_visible && validContact(data.contact) ? [{ ...data.contact, localId: 'wizard-contact', position: 0 }] : []
  const showPreview = step === 4
  const handleTaken = availability.value === data.handle && availability.status === 'taken'
  const handleAvailable = availability.value === data.handle && availability.status === 'available'

  return <main className="onboarding-page"><div className={`onboarding-layout ${showPreview ? 'onboarding-layout--preview' : ''}`}>
    <section className="onboarding-card" aria-labelledby="onboarding-title">
      <div className="onboarding-brand"><span className="onboarding-mark"><Sparkles size={17} /></span><span>mylinks.bar</span><span className="onboarding-count">{step + 1} / 5</span></div>
      <div className="onboarding-progress" aria-label={`Шаг ${step + 1} из 5`}>{steps.map((title, index) => <i key={title} className={index <= step ? 'is-active' : ''} />)}</div>
      <header className={`onboarding-heading ${step === 2 || step === 4 ? 'onboarding-heading--long' : ''}`}><h1 id="onboarding-title">{steps[step]}</h1></header>
      <form className="onboarding-form" onSubmit={next} noValidate>
        {step === 0 && <div className="onboarding-fields">
          <label htmlFor="wizard-name">Укажите свое имя</label>
          <input id="wizard-name" type="text" autoComplete="name" autoFocus value={data.display_name} maxLength={30} aria-describedby="name-hint" aria-invalid={Boolean(warnings.name) || ((attempted || Boolean(data.display_name)) && !nameValid)} data-valid={nameValid && !warnings.name} onChange={event => { const value = normalizeDisplayNameInput(event.target.value); warning('name', value !== event.target.value ? 'В имени допустимы только буквы и пробелы, без цифр и знаков.' : ''); patch('display_name', value) }} />
          <FieldHint id="name-hint" valid={nameValid} invalid={Boolean(warnings.name) || (attempted && !nameValid)}>{warnings.name || 'Только буквы и пробелы, от 1 до 30 символов.'}</FieldHint>
          <label htmlFor="wizard-handle">Придумайте user name</label>
          <div className="onboarding-handle" data-valid={handleValid && handleAvailable} data-invalid={Boolean(warnings.handle) || handleTaken || ((attempted || Boolean(data.handle)) && !handleValid)}><span>mylinks.bar/</span><input id="wizard-handle" value={data.handle} autoCapitalize="none" autoCorrect="off" maxLength={30} aria-describedby="handle-hint" aria-invalid={Boolean(warnings.handle) || handleTaken || ((attempted || Boolean(data.handle)) && !handleValid)} onChange={event => { const value = normalizeNewHandleInput(event.target.value); warning('handle', value !== event.target.value.toLowerCase() ? 'Допустимы латинские буквы и один разделитель: точка или подчёркивание.' : ''); patch('handle', value) }} placeholder="anna.petrova" /></div>
          <FieldHint id="handle-hint" valid={handleValid && handleAvailable} invalid={Boolean(warnings.handle) || handleTaken || ((attempted || Boolean(data.handle)) && !handleValid)}>{warnings.handle || (handleTaken ? 'Этот user name уже занят.' : !handleValid ? '3–30 символов: латинские буквы и не более одной точки или подчёркивания между словами.' : handleAvailable ? 'User name свободен' : availability.value === data.handle && availability.status === 'error' ? 'Проверка недоступна. Повторим при продолжении.' : 'Проверяем доступность…')}</FieldHint>
        </div>}
        {step === 1 && <div className="onboarding-fields">
          <label>Описание<textarea aria-label="Описание" autoFocus value={data.bio} onChange={event => patch('bio', event.target.value)} maxLength={160} rows={3} placeholder="Чем вы занимаетесь и что вам интересно" data-valid={Boolean(data.bio.trim())} /><small className="onboarding-counter">{data.bio.length} / 160</small></label>
          <AvatarEditor modal profile={previewProfile} setProfile={nextProfile => setProfile({ ...profile, avatar_shape: nextProfile.avatar_shape, avatar_size: nextProfile.avatar_size, avatar_scale: nextProfile.avatar_scale })} uploading={avatarUploading} onUpload={onAvatarUpload} onDraftChange={onAvatarDraft} />
          {uploadError && <p className="onboarding-error" role="alert">{uploadError}</p>}
          {avatarDraft && <FieldHint>Примените фото или отмените кадрирование перед продолжением.</FieldHint>}
        </div>}
        {step === 2 && <div className="onboarding-fields">
          {data.links.map((link, index) => { const valid = validLink(link); const invalid = (attempted || Boolean(link.url)) && !valid; const platform = getLinkPlatform(link.icon_key); return <fieldset className="onboarding-link" key={index}>
            <legend>Ссылка {index + 1}</legend>
            <div className="onboarding-link-toolbar"><span className="onboarding-platform-icon"><LinkIcon name={link.icon_key} url={linkUrl(link)} size={26} /></span><span className="onboarding-select"><select aria-label="Площадка" value={link.icon_key} onChange={event => { updateLink(index, { icon_key: event.target.value as LinkIconKey, url: '' }); warning(`link${index}`, '') }}>{LINK_PLATFORMS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select><ChevronDown size={17} aria-hidden="true" /></span><button type="button" className="icon-button" aria-label={`Удалить ссылку ${index + 1}`} onClick={() => { patch('links', data.links.filter((_, i) => i !== index)); setWarnings({}) }}><Trash2 size={17} /></button></div>
            <label>Описание<input aria-label="Описание ссылки" value={link.label} placeholder="Например: мой блог" maxLength={80} data-valid={Boolean(link.label.trim())} onChange={event => updateLink(index, { label: event.target.value })} /></label>
            <label className="onboarding-link-input">{link.icon_key === 'whatsapp' ? 'Номер WhatsApp' : link.icon_key === 'link' ? 'Адрес ссылки' : 'Имя пользователя или ID'}
              <span className="onboarding-link-address" data-valid={valid && !warnings[`link${index}`]} data-invalid={invalid || Boolean(warnings[`link${index}`])}>{platform.inputPrefix && link.icon_key !== 'whatsapp' && !/^https?:\/\//i.test(link.url) && <span>{platform.inputPrefix}</span>}<input aria-label={link.icon_key === 'whatsapp' ? 'Номер WhatsApp' : link.icon_key === 'link' ? 'Адрес ссылки' : 'Имя пользователя или ID'} aria-invalid={invalid || Boolean(warnings[`link${index}`])} aria-describedby={`link-hint-${index}`} value={link.url} inputMode={link.icon_key === 'whatsapp' ? 'tel' : 'text'} autoCapitalize="none" autoCorrect="off" placeholder={link.icon_key === 'whatsapp' ? '+79990000000' : platform.placeholder} onChange={event => { const raw = event.target.value; warning(`link${index}`, link.icon_key === 'whatsapp' && /[^\d+\s()-]/.test(raw) ? 'В номере допустимы только цифры. Знак + добавляется автоматически.' : ''); updateLink(index, { url: link.icon_key === 'whatsapp' ? normalizePhoneInput(raw) : raw }) }} /></span>
            </label>
            <FieldHint id={`link-hint-${index}`} valid={valid} invalid={invalid || Boolean(warnings[`link${index}`])}>{warnings[`link${index}`] || (valid ? 'Ссылка заполнена верно' : link.icon_key === 'whatsapp' ? 'Введите код страны и номер: от 7 до 15 цифр.' : link.icon_key === 'link' ? 'Укажите адрес сайта, например example.com.' : 'Укажите имя пользователя, ID или полную ссылку выбранной площадки.')}</FieldHint>
          </fieldset> })}
          {data.links.length < 3 && <button type="button" className="onboarding-add" onClick={() => patch('links', [...data.links, { label: '', url: '', icon_key: 'link' }])}>＋ Добавить ссылку</button>}
          <button type="button" className="onboarding-skip-link" onClick={() => void move(3, { ...data, links: [] })} disabled={locked}>Добавлю позже</button>
        </div>}
        {step === 3 && <div className="onboarding-fields">
          <span className="onboarding-select"><select aria-label="Тип контакта" value={data.contact.kind} onChange={event => { patch('contact', { kind: event.target.value as WizardContact['kind'], label: '', value: '', is_visible: data.contact.is_visible }); warning('contact', '') }}>{CONTACT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={17} aria-hidden="true" /></span>
          <label>{data.contact.kind === 'phone' ? 'Телефон' : data.contact.kind === 'email' ? 'Email' : 'Адрес'}<input aria-label="Значение контакта" value={data.contact.value} type={data.contact.kind === 'email' ? 'email' : data.contact.kind === 'phone' ? 'tel' : 'text'} inputMode={data.contact.kind === 'phone' ? 'tel' : undefined} maxLength={data.contact.kind === 'email' ? 254 : 500} aria-describedby="contact-hint" aria-invalid={Boolean(warnings.contact) || (Boolean(data.contact.value) && !validContact(data.contact))} data-valid={validContact(data.contact) && !warnings.contact} placeholder={data.contact.kind === 'phone' ? '+79990000000' : data.contact.kind === 'email' ? 'name@example.com' : 'Город, улица, дом'} onChange={event => { const raw = event.target.value; const value = data.contact.kind === 'phone' ? normalizePhoneInput(raw) : data.contact.kind === 'email' ? normalizeContactEmailInput(raw) : raw; warning('contact', data.contact.kind === 'phone' && /[^\d+\s()-]/.test(raw) ? 'В телефоне допустимы только цифры и знак +.' : data.contact.kind === 'email' && value !== raw ? 'Для email используйте латинские буквы, цифры, точку и @.' : ''); patch('contact', { ...data.contact, value, latitude: null, longitude: null }) }} /></label>
          <FieldHint id="contact-hint" valid={validContact(data.contact)} invalid={Boolean(warnings.contact) || (Boolean(data.contact.value) && !validContact(data.contact))}>{warnings.contact || (data.contact.kind === 'phone' ? 'Код страны и номер: от 7 до 15 цифр. Знак + добавляется автоматически.' : data.contact.kind === 'email' ? 'Формат name@example.com, без пробелов и кириллицы.' : 'Введите адрес или выберите точку на карте.')}</FieldHint>
          {data.contact.kind === 'address' && <Suspense fallback={<p>Загружаем карту…</p>}><AddressPicker value={data.contact.value} latitude={data.contact.latitude} longitude={data.contact.longitude} onSelect={selection => patch('contact', { ...data.contact, ...selection })} /></Suspense>}
          <label className="onboarding-visibility"><input type="checkbox" checked={data.contact.is_visible} onChange={event => patch('contact', { ...data.contact, is_visible: event.target.checked })} />Показывать контакт на странице</label>
          <button type="button" className="onboarding-skip-link" onClick={() => void move(4, { ...data, contact: { ...data.contact, value: '', latitude: null, longitude: null } })} disabled={locked}>Пропустить</button>
        </div>}
        {step === 4 && <div className="onboarding-fields">
          <fieldset className="onboarding-theme"><legend>Фон</legend>{(['midnight', 'mist', 'cobalt'] as const).map((preset, index) => <button key={preset} type="button" aria-pressed={data.background_preset === preset} className={data.background_preset === preset ? 'is-selected' : ''} onClick={() => patch('background_preset', preset)}><i className={`onboarding-swatch onboarding-swatch--${preset}`} />{['Полночь', 'Туман', 'Кобальт'][index]}{data.background_preset === preset && <Check size={15} />}</button>)}</fieldset>
          <fieldset className="onboarding-theme"><legend>Карточки</legend>{(['glass', 'solid', 'outline'] as const).map((preset, index) => <button key={preset} type="button" aria-pressed={data.card_preset === preset} className={data.card_preset === preset ? 'is-selected' : ''} onClick={() => patch('card_preset', preset)}>{['Стекло', 'Плотные', 'Контур'][index]}{data.card_preset === preset && <Check size={15} />}</button>)}</fieldset>
{showPreview && <aside className="onboarding-live-preview" aria-label="Предпросмотр вашей страницы"><p>Так будет выглядеть ваша страница</p><div className="onboarding-preview-frame"><ProfilePreview profile={previewProfile} links={previewLinks} contacts={previewContacts} avatarDraft={avatarDraft} showPrivacy={!data.publish} /></div></aside>}
          <label className="onboarding-visibility"><input type="checkbox" checked={data.publish} onChange={event => patch('publish', event.target.checked)} />Сделать страницу доступной по ссылке</label>
          <p className="onboarding-private-note">Без этой отметки страница останется приватной.</p>
        </div>}
        {error && <p className="onboarding-error" role="alert">{error}</p>}
        <div className="onboarding-actions">{step > 0 ? <button type="button" className="onboarding-back" onClick={() => void move(step - 1)} disabled={locked}><ArrowLeft size={16} />Назад</button> : <span />}<button type="submit" className="onboarding-next" disabled={locked}>{busy ? <LoaderCircle size={17} className="spin" /> : step === 4 ? 'Готово' : 'Продолжить'}{!busy && step < 4 && <ArrowRight size={16} />}</button></div>
      </form>
      <p className="onboarding-footnote">Шаг сохраняется при переходе дальше. Настройки доступны и в личном кабинете.</p>
      <DeleteAccount onDeleted={onDeleted} />
    </section>
  </div></main>
}
