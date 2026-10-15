/** Source photos may be large; store at most a sharp 1000 px square. */
const MAX_SIDE = 1000
/** Quality is lowered step by step until the file fits this size. */
const TARGET_BYTES = 320 * 1024
const QUALITIES = [0.92, 0.87, 0.81, 0.74]

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
 * Cuts the chosen square out of the photo, scales it down to at most 1000×1000
 * and encodes it as a compact WebP (JPEG where the browser cannot encode WebP).
 * Photos smaller than 512 px are never enlarged.
 */
export async function cropAvatarToBlob(image: CanvasImageSource, sourceX: number, sourceY: number, sourceSize: number): Promise<Blob> {
  const side = Math.max(1, Math.round(Math.min(MAX_SIDE, sourceSize)))
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
  if (!blob || blob.type !== 'image/webp') blob = await encodeBest(canvas, 'image/jpeg')
  if (!blob) throw new Error('Не удалось подготовить изображение.')
  return blob
}
