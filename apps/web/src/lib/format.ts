export function formatDate(date: string | Date, format?: string): string {
  const fmt = format ?? 'DD/MM/YYYY'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return String(date)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = String(d.getFullYear())
  if (fmt === 'MM/DD/YYYY') return `${month}/${day}/${year}`
  if (fmt === 'YYYY-MM-DD') return `${year}-${month}-${day}`
  return `${day}/${month}/${year}`
}

export function formatNumber(value: number, format?: string): string {
  const fmt = format ?? 'standard'
  if (fmt === 'european') {
    return value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatCurrency(amount: number, currency: string, format?: string): string {
  return `${formatNumber(amount, format)} ${currency}`
}

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin} min ago`
  if (diffHr < 24) return `${diffHr} hr ago`
  if (diffDay === 1) return 'Yesterday'
  if (diffDay < 7) return `${diffDay} days ago`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  if (days > 0) return `${days}d ${hours}h`
  const mins = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${mins}m`
}
