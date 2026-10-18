export function Spinner({ size = 20, color = 'currentColor', className }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite' }} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** Centered spinner with optional message - for sections and whole pages. */
export function LoadingSpinner({ label = 'Loading…', size = 28, fullPage }) {
  return (
    <div className="center" role="status" style={{ flexDirection: 'column', gap: 12, padding: fullPage ? '25vh 0' : '40px 0', color: 'var(--primary)' }}>
      <Spinner size={size} />
      {label && <span className="text-sm text-muted">{label}</span>}
    </div>
  )
}

export function Skeleton({ width = '100%', height = 16, radius, style, className = '' }) {
  return <div className={`skeleton ${className}`} style={{ width, height, borderRadius: radius, ...style }} />
}

/** A stack of card-shaped skeletons for list pages. */
export function SkeletonList({ count = 3, height = 110 }) {
  return (
    <div className="stack">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={height} radius={14} />
      ))}
    </div>
  )
}

export default LoadingSpinner
