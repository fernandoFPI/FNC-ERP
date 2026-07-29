export function getInitials(email: string): string {
  const parts = email.split('@')[0]?.split('.') ?? []
  if (parts.length >= 2) return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
  return (parts[0]?.slice(0, 2) ?? 'U').toUpperCase()
}
