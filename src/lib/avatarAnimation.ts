/** Encode a cropped animated avatar before upload; the 60 MB source never leaves the device. */
const OUTPUT_SIDE = 1000
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024
const MAX_DURATION = 10
const FPS = 24

const recorderType = () => {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) throw new Error('Этот браузер не поддерживает обработку видео. Попробуйте другой браузер или фото.')
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type))
  if (!mime) throw new Error('Не удалось подобрать формат видео для этого браузера.')
  return mime
}

const wait = (duration: number) => new Promise<void>(resolve => window.setTimeout(resolve, duration))

export async function optimizeAnimatedAvatar(
  source: Blob,
  element: HTMLImageElement | HTMLVideoElement,
  kind: 'gif' | 'video',
  sourceX: number,
  sourceY: number,
  sourceSize: number,
): Promise<Blob> {
  const mimeType = recorderType()
  const side = Math.max(1, Math.min(OUTPUT_SIDE, Math.round(sourceSize)))
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = side
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('Не удалось подготовить анимацию.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  const draw = (frame: CanvasImageSource) => context.drawImage(frame, sourceX, sourceY, sourceSize, sourceSize, 0, 0, side, side)
  const stream = canvas.captureStream(FPS)
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void }
  const chunks: Blob[] = []
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_800_000 })
  const complete = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
    recorder.onerror = () => reject(new Error('Не удалось сжать анимацию.'))
    recorder.onstop = () => {
      const result = new Blob(chunks, { type: recorder.mimeType.split(';')[0] })
      if (!result.size || result.size > MAX_OUTPUT_BYTES) reject(new Error('Анимация после обработки всё ещё больше 5 МБ. Выберите более короткий ролик.'))
      else resolve(result)
    }
  })
  try {
    recorder.start()
    if (kind === 'video') {
      const video = element as HTMLVideoElement
      video.pause()
      video.loop = false
      video.currentTime = 0
      await new Promise<void>((resolve, reject) => {
        if (video.readyState >= 2 && video.currentTime === 0) return resolve()
        video.addEventListener('seeked', () => resolve(), { once: true })
        video.addEventListener('error', () => reject(new Error('Не удалось прочитать видео.')), { once: true })
      })
      await video.play()
      const start = performance.now()
      while (!video.ended && (performance.now() - start) / 1000 < Math.min(video.duration, MAX_DURATION)) {
        draw(video)
        track.requestFrame?.()
        await wait(1000 / FPS)
      }
      video.pause()
    } else {
      // ImageDecoder provides complete composited GIF frames and their timing.
      const construct = window.ImageDecoder
      if (!construct) throw new Error('Для сжатия большого GIF нужен браузер с поддержкой ImageDecoder. Попробуйте Chrome или видео MP4.')
      const decoder = new construct({ data: source.stream(), type: 'image/gif' })
      try {
        await decoder.tracks.ready
        if (!decoder.tracks.selectedTrack) throw new Error('Не удалось прочитать кадры GIF.')
        let elapsed = 0
        for (let index = 0; index < decoder.tracks.selectedTrack.frameCount; index++) {
          const { image } = await decoder.decode({ frameIndex: index })
          const delay = Math.max(20, (image.duration ?? 100_000) / 1000)
          if (elapsed + delay > MAX_DURATION * 1000) { image.close(); throw new Error('Большой GIF должен длиться не более 10 секунд.') }
          draw(image)
          track.requestFrame?.()
          image.close()
          await wait(delay)
          elapsed += delay
        }
      } finally { decoder.close() }
    }
    recorder.stop()
    return await complete
  } catch (error) {
    if (recorder.state !== 'inactive') recorder.stop()
    void complete.catch(() => undefined)
    throw error
  } finally { stream.getTracks().forEach(item => item.stop()) }
}
