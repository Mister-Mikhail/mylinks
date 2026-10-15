import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type PointerEvent, type KeyboardEvent } from 'react'
import { Camera, Check, Crop, LoaderCircle, Move, RotateCcw, X, ZoomIn } from 'lucide-react'
import type { AvatarDraft, AvatarUploadOptions, Profile } from '../types'
import { createPortal } from 'react-dom'
import { AvatarMedia } from './AvatarMedia'
import { cropAvatarToBlob } from '../lib/avatarImage'
import { optimizeAnimatedAvatar } from '../lib/avatarAnimation'

interface AvatarEditorProps {
  profile: Profile
  setProfile: (profile: Profile) => void
  modal?: boolean
  onDraftChange: (draft: AvatarDraft | null) => void
  uploading: boolean
  onUpload: (blob: Blob, options?: AvatarUploadOptions) => Promise<boolean>
}

interface Point {
  x: number
  y: number
}

interface ImageSize {
  width: number
  height: number
}

const DEFAULT_OFFSET: Point = { x: 0, y: 0 }

const avatarStyle = (scale: number) => ({ '--avatar-size': `${Math.round(42 + scale * 2.1)}px`, '--avatar-width': `${scale}%` } as CSSProperties)

export function AvatarEditor({ profile, setProfile, uploading, onUpload, onDraftChange, modal = false }: AvatarEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const mediaRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null)
  const [selectedFile, setSelectedFile] = useState<Blob | null>(null)
  const [kind, setKind] = useState<'image' | 'gif' | 'video'>('image')
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerX: number; pointerY: number; offset: Point } | null>(null)
  const pointers = useRef(new Map<number, Point>())
  const pinch = useRef<{ distance: number; center: Point; offset: Point; zoom: number } | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const [imageSize, setImageSize] = useState<ImageSize>({ width: 0, height: 0 })
  const [viewportSize, setViewportSize] = useState(320)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState<Point>(DEFAULT_OFFSET)
  const [error, setError] = useState('')
  const [preparing, setPreparing] = useState(false)

  useEffect(() => {
    if (!modal || !source) return
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.showModal()
    return () => { document.body.style.overflow = overflow; previous?.focus() }
  }, [source, modal])

  useEffect(() => {
    if (!source || !viewportRef.current) return
    const viewport = viewportRef.current
    let previousSize = viewportSize
    const observer = new ResizeObserver(([entry]) => {
      const nextSize = entry.contentRect.width
      if (!nextSize) return
      setViewportSize(nextSize)
      setOffset(current => ({ x: current.x * nextSize / previousSize, y: current.y * nextSize / previousSize }))
      previousSize = nextSize
    })
    observer.observe(viewport)
    return () => observer.disconnect()
    // Keep the same crop composition when the inline viewport changes size.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source])

  useEffect(() => {
    onDraftChange(source ? { src: source, kind, aspectRatio: imageSize.height ? imageSize.width / imageSize.height : 1, zoom, x: offset.x / viewportSize, y: offset.y / viewportSize } : null)
  }, [source, kind, imageSize, zoom, offset, viewportSize, onDraftChange])

  useEffect(() => () => onDraftChange(null), [onDraftChange])

  useEffect(() => () => {
    if (source) URL.revokeObjectURL(source)
  }, [source])

  const closeEditor = () => {
    pointers.current.clear(); pinch.current = null; dragRef.current = null
    if (source) URL.revokeObjectURL(source)
    setSource(null)
    setSelectedFile(null)
    setImageSize({ width: 0, height: 0 })
    setZoom(1)
    setOffset(DEFAULT_OFFSET)
    setError('')
  }

  const openEditor = (file: Blob, restore = false) => {
    const nextSource = URL.createObjectURL(file)
    setSelectedFile(file)
    setKind(file.type.startsWith('video/') ? 'video' : file.type === 'image/gif' ? 'gif' : 'image')
    if (source) URL.revokeObjectURL(source)
    setSource(nextSource)
    setImageSize({ width: 0, height: 0 })
    setZoom(restore ? profile.avatar_crop?.zoom ?? 1 : 1)
    setOffset(restore && profile.avatar_crop ? { x: profile.avatar_crop.x * viewportSize, y: profile.avatar_crop.y * viewportSize } : DEFAULT_OFFSET)
  }

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setError('')
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'].includes(file.type)) {
      setError('Выберите JPG, PNG, WebP, GIF или видео MP4/WebM.')
      return
    }
    if (file.size > 60 * 1024 * 1024) {
      setError('Размер исходного файла не должен превышать 60 МБ.')
      return
    }

    openEditor(file)
  }

  const editCurrentAvatar = async () => {
    const currentAvatar = profile.avatar_preview_url || profile.avatar_url
    if (!currentAvatar) return

    setPreparing(true)
    setError('')
    try {
      const response = await fetch(currentAvatar)
      if (!response.ok) throw new Error('Не удалось загрузить текущее фото для кадрирования.')
      openEditor(await response.blob(), true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось открыть редактор изображения.')
    } finally {
      setPreparing(false)
    }
  }

  const updateZoom = (nextZoom: number) => {
    setZoom(nextZoom)
  }

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!source || uploading || preparing) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const rect = event.currentTarget.getBoundingClientRect()
      pinch.current = { distance: Math.hypot(b.x - a.x, b.y - a.y), center: { x: (a.x + b.x) / 2 - rect.left - rect.width / 2, y: (a.y + b.y) / 2 - rect.top - rect.height / 2 }, zoom, offset }
      dragRef.current = null
      return
    }
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, offset }
  }

  const drag = (event: PointerEvent<HTMLDivElement>) => {
    if (uploading || preparing || !pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const rect = event.currentTarget.getBoundingClientRect()
      const initial = pinch.current
      const nextZoom = Math.min(3, Math.max(.25, initial.zoom * Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, initial.distance)))
      const ratio = nextZoom / initial.zoom
      const center = { x: (a.x + b.x) / 2 - rect.left - rect.width / 2, y: (a.y + b.y) / 2 - rect.top - rect.height / 2 }
      setZoom(nextZoom)
      setOffset({ x: center.x - (initial.center.x - initial.offset.x) * ratio, y: center.y - (initial.center.y - initial.offset.y) * ratio })
      return
    }
    if (!dragRef.current) return
    const nextOffset = {
      x: dragRef.current.offset.x + event.clientX - dragRef.current.pointerX,
      y: dragRef.current.offset.y + event.clientY - dragRef.current.pointerY,
    }
    setOffset(nextOffset)
  }

  const moveWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[event.key]
    if (!delta || uploading || preparing) return
    event.preventDefault()
    setOffset(current => ({ x: current.x + delta[0], y: current.y + delta[1] }))
  }

  const stopDrag = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId)
    pinch.current = null
    const remaining = [...pointers.current.values()][0]
    dragRef.current = remaining ? { pointerX: remaining.x, pointerY: remaining.y, offset } : null
  }

  const saveCrop = async () => {
    if (!source || !imageSize.width || !viewportSize || !selectedFile || !mediaRef.current) return
    setError('')
    setPreparing(true)

    try {
      const image = mediaRef.current

      const coverScale = Math.max(viewportSize / imageSize.width, viewportSize / imageSize.height)
      const renderedScale = coverScale * zoom
      const renderedWidth = imageSize.width * renderedScale
      const renderedHeight = imageSize.height * renderedScale
      const sourceX = ((renderedWidth - viewportSize) / 2 - offset.x) / renderedScale
      const sourceY = ((renderedHeight - viewportSize) / 2 - offset.y) / renderedScale
      const sourceSize = viewportSize / renderedScale

      // Photos and the preview frame are stored at no more than 1000 px.
      const poster = await cropAvatarToBlob(image, sourceX, sourceY, sourceSize)
      let media = kind === 'image' ? poster : selectedFile
      let mediaKind = kind
      let crop = kind === 'image' ? null : { aspectRatio: imageSize.width / imageSize.height, zoom, x: offset.x / viewportSize, y: offset.y / viewportSize }
      if (kind !== 'image' && (kind === 'video' || selectedFile.size > 5 * 1024 * 1024 || (typeof window.ImageDecoder !== 'undefined' && Math.max(imageSize.width, imageSize.height) > 1000))) {
        media = await optimizeAnimatedAvatar(selectedFile, image, kind, sourceX, sourceY, sourceSize)
        mediaKind = 'video'
        crop = null // Animation was already cropped into the uploaded square.
      }
      const uploaded = await onUpload(media, mediaKind === 'image' ? undefined : { kind: mediaKind, poster, crop: crop ?? undefined })
      if (uploaded) closeEditor()
      else setError('Не удалось сохранить фото. Попробуйте ещё раз.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось обработать изображение.')
    } finally {
      setPreparing(false)
    }
  }

  const coverScale = imageSize.width && viewportSize
    ? Math.max(viewportSize / imageSize.width, viewportSize / imageSize.height)
    : 1

  const mediaStyle = { width: imageSize.width ? imageSize.width * coverScale * zoom : 'auto', height: imageSize.height ? imageSize.height * coverScale * zoom : 'auto', transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))` }
  const cropEditor = (
          <section className="avatar-cropper" aria-labelledby="avatar-crop-title">
            <div className="avatar-cropper__heading">
              <div><span className="eyebrow">Редактор фото</span><h2 id="avatar-crop-title">Настройте кадр</h2></div>
              <button className="icon-button" type="button" onClick={closeEditor} disabled={uploading || preparing} aria-label="Закрыть редактор"><X size={18} /></button>
            </div>

            <div
              ref={viewportRef}
              tabIndex={0}
              role="group"
              aria-label="Положение фото: перетащите или используйте стрелки"
              onKeyDown={moveWithKeyboard}
              onLostPointerCapture={stopDrag}
              className={`avatar-cropper__viewport avatar-cropper__viewport--${profile.avatar_shape}`}
              onPointerDown={startDrag}
              onPointerMove={drag}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
            >
              {kind === 'video' ? <video ref={element => { mediaRef.current = element }} src={source || undefined} autoPlay muted loop playsInline preload="auto" style={mediaStyle}
                onLoadedData={event => { const v = event.currentTarget; if (!Number.isFinite(v.duration) || v.duration > 10) { setError('Видео должно длиться не более 10 секунд.'); setImageSize({ width: 0, height: 0 }); v.pause() } else setImageSize({ width: v.videoWidth, height: v.videoHeight }) }}
                onError={() => { setImageSize({ width: 0, height: 0 }); setError('Не удалось прочитать видео. Попробуйте другой MP4 или WebM.') }} />
                : <img ref={element => { mediaRef.current = element }} src={source || undefined} alt="Область будущего аватара" draggable="false" style={mediaStyle}
                  onError={() => setError('Не удалось прочитать изображение.')}
                  onLoad={event => { const img = event.currentTarget; setImageSize({ width: img.naturalWidth, height: img.naturalHeight }) }} />}
              <span className="avatar-cropper__grid" />
              <span className="avatar-cropper__move"><Move size={15} /> Перемещайте фото · масштаб двумя пальцами</span>
            </div>

            <label className="crop-zoom-control">
              <ZoomIn size={17} />
              <input aria-label="Масштаб фото" disabled={uploading || preparing} type="range" min="0.25" max="3" step="0.01" value={zoom} onChange={(event) => updateZoom(Number(event.target.value))} />
              <output className="crop-zoom-value">{Math.round(zoom * 100)}%</output>
              <button type="button" className="icon-button" disabled={uploading || preparing} onClick={() => { setZoom(1); setOffset(DEFAULT_OFFSET) }} aria-label="Сбросить кадр"><RotateCcw size={16} /></button>
            </label>

            {error && <div className="form-message form-message--error">{error}</div>}
            <div className="avatar-cropper__actions">
              <button className="button button--ghost" type="button" disabled={uploading || preparing} onClick={closeEditor}>Отмена</button>
              <button className="button button--primary" type="button" onClick={saveCrop} disabled={uploading || preparing || !imageSize.width}>
                {uploading || preparing ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}
                {preparing ? 'Обрабатываем…' : uploading ? 'Сохраняем…' : 'Применить фото'}
              </button>
            </div>
          </section>
  )

  return (
    <section className="settings-card avatar-settings">
      <div className="settings-card__title"><Camera size={18} /><div><h2>Аватар</h2><p>Фото или живой аватар, форма и размер.</p></div></div>

      <div className="avatar-settings__main">
        <div className={`avatar avatar--${profile.avatar_shape} avatar-settings__preview`} style={avatarStyle(profile.avatar_scale)}>
          <AvatarMedia profile={profile} alt="Текущий аватар" />
        </div>
        <div className="avatar-settings__upload">
          <strong>Аватар профиля</strong>
          <span>Исходное фото, GIF или видео до 60 МБ. Фото и видео оптимизируются после кадрирования; видео до 10 секунд.</span>
          <div className="avatar-settings__upload-actions">
            <button className="button button--secondary button--small" type="button" onClick={() => inputRef.current?.click()} disabled={uploading || preparing}>
              {uploading ? <LoaderCircle className="spin" size={16} /> : <Camera size={16} />}
              {uploading ? 'Загружаем…' : (profile.avatar_path || profile.avatar_url) ? 'Заменить фото' : 'Выбрать фото'}
            </button>
            {(profile.avatar_preview_url || profile.avatar_url) && (
              <button className="button button--ghost button--small" type="button" onClick={editCurrentAvatar} disabled={uploading || preparing}>
                {preparing ? <LoaderCircle className="spin" size={16} /> : <Crop size={16} />}
                {preparing ? 'Открываем…' : 'Изменить кадр'}
              </button>
            )}
          </div>
          <input ref={inputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" onChange={selectFile} />
        </div>
      </div>

      {error && !source && <div className="form-message form-message--error">{error}</div>}

      <div className="avatar-settings__controls">
        <div>
          <span className="field-caption">Форма</span>
          <div className="segmented-picker segmented-picker--small avatar-shape-picker">
            <button type="button" aria-pressed={profile.avatar_shape === 'round'} className={profile.avatar_shape === 'round' ? 'selected' : ''} onClick={() => setProfile({ ...profile, avatar_shape: 'round' })}>Круг</button>
            <button type="button" aria-pressed={profile.avatar_shape === 'square'} className={profile.avatar_shape === 'square' ? 'selected' : ''} onClick={() => setProfile({ ...profile, avatar_shape: 'square' })}>Квадрат</button>
          </div>
        </div>
        <label className="avatar-size-control">
          <span><span className="field-caption">Размер</span><strong>{profile.avatar_scale}%</strong></span>
          <input aria-label="Размер аватара" type="range" min="10" max="100" step="1" value={profile.avatar_scale} onChange={(event) => setProfile({ ...profile, avatar_scale: Number(event.target.value) })} />
          <small><span>Маленький</span><span>На всю ширину</span></small>
        </label>
      </div>

      {source && (modal ? createPortal(<dialog className="avatar-crop-dialog" ref={dialogRef} aria-labelledby="avatar-crop-title" onCancel={event => { event.preventDefault(); if (!uploading && !preparing) closeEditor() }}>{cropEditor}</dialog>, document.body) : <div className="avatar-cropper-inline">{cropEditor}</div>)}
    </section>
  )
}
