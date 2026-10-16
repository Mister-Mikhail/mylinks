import type { CSSProperties } from 'react'
import type { CardStyleV1 } from '../types'

const bounded = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : undefined

export function cardOverrideStyle(style: CardStyleV1 | null | undefined): CSSProperties {
  if (!style || style.version !== 1) return {}
  const padding = bounded(style.padding, 8, 24)
  const border = bounded(style.borderWidth, 0, 3)
  const opacity = bounded(style.opacity, 60, 100)
  return {
    ...(padding === undefined ? {} : { '--card-padding': `${padding}px` }),
    ...(border === undefined ? {} : { '--card-border-width': `${border}px` }),
    ...(opacity === undefined ? {} : { '--card-alpha': opacity / 100 }),
  } as CSSProperties
}
