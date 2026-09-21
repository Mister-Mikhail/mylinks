interface BrandMarkProps {
  compact?: boolean
  light?: boolean
}

export function BrandMark({ compact = false, light = false }: BrandMarkProps) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''} ${light ? 'brand--light' : ''}`} aria-label="mylinks.bar">
      <svg className="brand__mark" viewBox="0 0 58 42" role="img" aria-hidden="true">
        <path d="M2 7H29M2 14H29M2 21H29M2 28H29M2 35H29" />
        <path d="M39 4L54 21L39 38" />
      </svg>
      {!compact && <span className="brand__word">mylinks<span>.bar</span></span>}
    </div>
  )
}
