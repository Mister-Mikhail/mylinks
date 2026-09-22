import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type PointerEvent } from 'react'
import { Camera, Check, Crop, LoaderCircle, Move, RotateCcw, X, ZoomIn } from 'lucide-react'
import type { Profile } from '../types'

interface AvatarEditorProps {
  profile: Profile
  setProfile: (profile: Profile) => void
  uploading: boolean
  onUpload: (blob: Blob) => Promise<boolean>
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

const avatarStyle = (scale: number) => ({ '--avatar-size': `${Math.round(42 + scale * 2.1)}px` } as CSSProperties)

const clampOffset = (offset: Point, image: ImageSize, zoom: number, viewportSize: number) => {
  if (!image.width || !image.height || !viewportSize) return DEFAULT_OFFSET
  const coverScale = Math.max(viewportSize / image.width, viewportSize / image.height)
  const renderedWidth = image.width * coverScale * zoom
  const renderedHeight = image.height * coverScale * zoom
  const maxX = Math.max(0, (renderedWidth - viewportSize) / 2)
  const maxY = Math.max(0, (renderedHeight - viewportSize) / 2)

  return {
    x: Math.max(-maxX, Math.min(maxX, offset.x)),
    y: Math.max(-maxY, Math.min(maxY, offset.y)),
  }
}

const canvasBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Не удалось подготовить изображение.')), 'image/webp', 0.9)
})

export function AvatarEditor({ profile, setProfile, uploading, onUpload }: AvatarEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerX: number; pointerY: number; offset: Point } | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const [imageSize, setImageSize] = useState<ImageSize>({ width: 0, height: 0 })
  const [viewportSize, setViewportSize] = useState(320)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState<Point>(DEFAULT_OFFSET)
  const [error, setError] = useState('')
  const [preparing, setPreparing] = useState(false)

  useEffect(() => {
    if (!source || !viewportRef.current) return
    const viewport = viewportRef.current
    const observer = new ResizeObserver(([entry]) => setViewportSize(entry.contentRect.width))
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [source])

  useEffect(() => () => {
    if (source) URL.revokeObjectURL(source)
  }, [source])

  const closeEditor = () => {
    if (source) URL.revokeObjectURL(source)
    setSource(null)
    setImageSize({ width: 0, height: 0 })
    setZoom(1)
    setOffset(DEFAULT_OFFSET)
    setError('')
  }

  const openEditor = (nextSource: string) => {
    if (source) URL.revokeObjectURL(source)
    setSource(nextSource)
    setImageSize({ width: 0, height: 0 })
    setZoom(1)
    setOffset(DEFAULT_OFFSET)
  }

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setError('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Выберите изображение JPG, PNG или WebP.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Размер изображения не должен превышать 5 МБ.')
      return
    }

    openEditor(URL.createObjectURL(file))
  }

  const editCurrentAvatar = async () => {
    const currentAvatar = profile.avatar_preview_url || profile.avatar_url
    if (!currentAvatar) return

    setPreparing(true)
    setError('')
    try {
      const response = await fetch(currentAvatar)
      if (!response.ok) throw new Error('Не удалось загрузить текущее фото для кадрирования.')
      openEditor(URL.createObjectURL(await response.blob()))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось открыть редактор изображения.')
    } finally {
      setPreparing(false)
    }
  }

  const updateZoom = (nextZoom: number) => {
    setZoom(nextZoom)
    setOffset((current) => clampOffset(current, imageSize, nextZoom, viewportSize))
  }

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!source) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, offset }
  }

  const drag = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    const nextOffset = {
      x: dragRef.current.offset.x + event.clientX - dragRef.current.pointerX,
      y: dragRef.current.offset.y + event.clientY - dragRef.current.pointerY,
    }
    setOffset(clampOffset(nextOffset, imageSize, zoom, viewportSize))
  }

  const stopDrag = () => {
    dragRef.current = null
  }

  const saveCrop = async () => {
    if (!source || !imageSize.width || !viewportSize) return
    setError('')

    try {
      const image = new Image()
      image.src = source
      await image.decode()

      const coverScale = Math.max(viewportSize / image.naturalWidth, viewportSize / image.naturalHeight)
      const renderedScale = coverScale * zoom
      const renderedWidth = image.naturalWidth * renderedScale
      const renderedHeight = image.naturalHeight * renderedScale
      const sourceX = ((renderedWidth - viewportSize) / 2 - offset.x) / renderedScale
      const sourceY = ((renderedHeight - viewportSize) / 2 - offset.y) / renderedScale
      const sourceSize = viewportSize / renderedScale
      const canvas = document.createElement('canvas')
      canvas.width = 1024
      canvas.height = 1024
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Не удалось открыть редактор изображения.')

      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 1024, 1024)
      const uploaded = await onUpload(await canvasBlob(canvas))
      if (uploaded) closeEditor()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось обработать изображение.')
    }
  }

  const coverScale = imageSize.width && viewportSize
    ? Math.max(viewportSize / imageSize.width, viewportSize / imageSize.height)
    : 1

  return (
    <section className="settings-card avatar-settings">
      <div className="settings-card__title"><Camera size={18} /><div><h2>Аватар</h2><p>Фото, кадрирование, форма и размер.</p></div></div>

      <div className="avatar-settings__main">
        <div className={`avatar avatar--${profile.avatar_shape} avatar-settings__preview`} style={avatarStyle(profile.avatar_scale)}>
          {profile.avatar_preview_url || profile.avatar_url
            ? <img src={profile.avatar_preview_url || profile.avatar_url || ''} alt="Текущий аватар" />
            : <span>{profile.display_name.slice(0, 2).toUpperCase() || 'ML'}</span>}
        </div>
        <div className="avatar-settings__upload">
          <strong>Фотография профиля</strong>
          <span>После выбора откроется редактор кадра · JPG, PNG или WebP до 5 МБ</span>
          <div className="avatar-settings__upload-actions">
            <button className="button button--secondary button--small" type="button" onClick={() => inputRef.current?.click()} disabled={uploading || preparing}>
              {uploading ? <LoaderCircle className="spin" size={16} /> : <Camera size={16} />}
              {uploading ? 'Загружаем…' : profile.avatar_path ? 'Заменить фото' : 'Выбрать фото'}
            </button>
            {(profile.avatar_preview_url || profile.avatar_url) && (
              <button className="button button--ghost button--small" type="button" onClick={editCurrentAvatar} disabled={uploading || preparing}>
                {preparing ? <LoaderCircle className="spin" size={16} /> : <Crop size={16} />}
                {preparing ? 'Открываем…' : 'Изменить кадр'}
              </button>
            )}
          </div>
          <input ref={inputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectFile} />
        </div>
      </div>

      {error && !source && <div className="form-message form-message--error">{error}</div>}

      <div className="avatar-settings__controls">
        <div>
          <span className="field-caption">Форма</span>
          <div className="segmented-picker segmented-picker--small avatar-shape-picker">
            <button type="button" className={profile.avatar_shape === 'round' ? 'selected' : ''} onClick={() => setProfile({ ...profile, avatar_shape: 'round' })}>Круг</button>
            <button type="button" className={profile.avatar_shape === 'square' ? 'selected' : ''} onClick={() => setProfile({ ...profile, avatar_shape: 'square' })}>Квадрат</button>
          </div>
        </div>
        <label className="avatar-size-control">
          <span><span className="field-caption">Размер</span><strong>{profile.avatar_scale}%</strong></span>
          <input type="range" min="10" max="100" step="1" value={profile.avatar_scale} onChange={(event) => setProfile({ ...profile, avatar_scale: Number(event.target.value) })} />
          <small><span>Маленький</span><span>На всю ширину</span></small>
        </label>
      </div>

      {source && (
        <div className="avatar-cropper-backdrop" role="presentation">
          <section className="avatar-cropper" role="dialog" aria-modal="true" aria-labelledby="avatar-crop-title">
            <div className="avatar-cropper__heading">
              <div><span className="eyebrow">Редактор фото</span><h2 id="avatar-crop-title">Настройте кадр</h2></div>
              <button className="icon-button" type="button" onClick={closeEditor} aria-label="Закрыть редактор"><X size={18} /></button>
            </div>

            <div
              ref={viewportRef}
              className={`avatar-cropper__viewport avatar-cropper__viewport--${profile.avatar_shape}`}
              onPointerDown={startDrag}
              onPointerMove={drag}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
            >
              <img
                src={source}
                alt="Область будущего аватара"
                draggable="false"
                onLoad={(event) => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                style={{
                  width: imageSize.width ? imageSize.width * coverScale * zoom : 'auto',
                  height: imageSize.height ? imageSize.height * coverScale * zoom : 'auto',
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                }}
              />
              <span className="avatar-cropper__grid" />
              <span className="avatar-cropper__move"><Move size={15} /> Перемещайте фото</span>
            </div>

            <label className="crop-zoom-control">
              <ZoomIn size={17} />
              <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => updateZoom(Number(event.target.value))} />
              <button type="button" className="icon-button" onClick={() => { setZoom(1); setOffset(DEFAULT_OFFSET) }} aria-label="Сбросить кадр"><RotateCcw size={16} /></button>
            </label>

            {error && <div className="form-message form-message--error">{error}</div>}
            <div className="avatar-cropper__actions">
              <button className="button button--ghost" type="button" onClick={closeEditor}>Отмена</button>
              <button className="button button--primary" type="button" onClick={saveCrop} disabled={uploading || !imageSize.width}>
                {uploading ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}
                {uploading ? 'Сохраняем…' : 'Применить фото'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
