interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = { sm: 14, md: 20, lg: 28 }

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  const px = sizes[size]
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      className={`no-theme-transition${className ? ` ${className}` : ''}`}
      style={{ animation: 'spin 0.8s linear infinite' }}
      aria-label="Loading"
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="31.4 31.4"
        strokeDashoffset="0"
        opacity="0.25"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
