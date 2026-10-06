/** Longest side of the stored avatar. It is shown at ~100–250 px, so 512 px covers high-DPI screens. */
const MAX_SIDE = 512
const MIN_SIDE = 96
/** Quality is lowered step by step until the file fits this size. */
const TARGET_BYTES = 60 * 1024
const QUALITIES = [0.84, 0.74, 0.64, 0.54]

const makeCanvas = (side: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = side
  canvas.height = side
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Не удалось открыть редактор изображения.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  return { canvas, context }
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))

const encodeBest = async (canvas: HTMLCanvasElement, type: string) => {
  let result: Blob | null = null
  for (const quality of QUALITIES) {
    const blob = await toBlob(canvas, type, quality)
    if (!blob) return result
    result = blob
    if (blob.type !== type || blob.size <= TARGET_BYTES) break
  }
  return result
}

/**
 * Cuts the chosen square out of the photo, scales it down to at most 512×512
 * and encodes it as a compact WebP (JPEG where the browser cannot encode WebP).
 * Photos smaller than 512 px are never enlarged.
 */
export async function cropAvatarToBlob(image: HTMLImageElement, sourceX: number, sourceY: number, sourceSize: number): Promise<Blob> {
  const side = Math.round(Math.max(MIN_SIDE, Math.min(MAX_SIDE, sourceSize)))
  let current: CanvasImageSource = image
  let x = sourceX
  let y = sourceY
  let size = sourceSize

  // Large photos are halved step by step: one huge reduction looks jagged.
  while (size / side > 2) {
    const next = Math.round(size / 2)
    const { canvas, context } = makeCanvas(next)
    context.drawImage(current, x, y, size, size, 0, 0, next, next)
    current = canvas
    x = 0
    y = 0
    size = next
  }

  const { canvas, context } = makeCanvas(side)
  context.drawImage(current, x, y, size, size, 0, 0, side, side)

  let blob = await encodeBest(canvas, 'image/webp')
  if (blob && blob.type !== 'image/webp') blob = await encodeBest(canvas, 'image/jpeg')
  if (!blob) throw new Error('Не удалось подготовить изображение.')
  return blob
}
