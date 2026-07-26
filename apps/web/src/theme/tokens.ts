export type ThemeKey = 'light-flat' | 'black'

export interface ThemeTokens {
  key: ThemeKey
  label: string
  description: string
  bgCanvas: string
  orb1: string
  orb2: string
  orb3: string
  hasOrbs: boolean
  hasBlur: boolean
  bgSurface: string
  bgSurfaceHover: string
  bgTopbar: string
  bgSidebar: string
  border: string
  borderStrong: string
  borderInput: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  accent: string
  accentBg: string
  accentBorder: string
  accentHover: string
  success: string
  successBg: string
  successBorder: string
  warning: string
  warningBg: string
  warningBorder: string
  danger: string
  dangerBg: string
  dangerBorder: string
  info: string
  infoBg: string
  infoBorder: string
  barGradStart: string
  barGradEnd: string
  hbarTrack: string
  tableRowHover: string
  tableBorder: string
  topRim: string
  blurAmount: string
}

export const themes: Record<ThemeKey, ThemeTokens> = {
  'light-flat': {
    key: 'light-flat',
    label: 'Light flat',
    description: 'Clean white, maximum readability',
    bgCanvas: '#f4f6f8',
    orb1: 'transparent',
    orb2: 'transparent',
    orb3: 'transparent',
    hasOrbs: false,
    hasBlur: false,
    bgSurface: '#ffffff',
    bgSurfaceHover: '#fafbfc',
    bgTopbar: '#ffffff',
    bgSidebar: '#ffffff',
    border: '#e2e5e9',
    borderStrong: '#cdd1d6',
    borderInput: '#d1d5db',
    textPrimary: '#1a1a2e',
    textSecondary: '#5f6368',
    textMuted: '#9aa0a8',
    accent: '#4a7a9b',
    accentBg: 'rgba(74,122,155,0.08)',
    accentBorder: 'rgba(74,122,155,0.20)',
    accentHover: 'rgba(74,122,155,0.12)',
    success: '#065f46',
    successBg: '#ecfdf5',
    successBorder: '#a7f3d0',
    warning: '#92400e',
    warningBg: '#fffbeb',
    warningBorder: '#fcd34d',
    danger: '#991b1b',
    dangerBg: '#fef2f2',
    dangerBorder: '#fecaca',
    info: '#1e40af',
    infoBg: '#eff6ff',
    infoBorder: '#bfdbfe',
    barGradStart: '#4a7a9b',
    barGradEnd: '#4a7a9b',
    hbarTrack: '#eef0f2',
    tableRowHover: '#fafbfc',
    tableBorder: '#f0f2f4',
    topRim: 'none',
    blurAmount: 'none',
  },

  black: {
    key: 'black',
    label: 'Black',
    description: 'Pure black, maximum contrast',
    bgCanvas: '#141618',
    orb1: 'transparent',
    orb2: 'transparent',
    orb3: 'transparent',
    hasOrbs: false,
    hasBlur: false,
    bgSurface: '#1c1e21',
    bgSurfaceHover: '#22252a',
    bgTopbar: '#1c1e21',
    bgSidebar: '#1c1e21',
    border: '#2a2d32',
    borderStrong: '#363a40',
    borderInput: '#363a40',
    textPrimary: '#f2f2f0',
    textSecondary: '#b0aea8',
    textMuted: '#6e6c66',
    accent: '#6ba8ca',
    accentBg: 'rgba(107,168,202,0.12)',
    accentBorder: 'rgba(107,168,202,0.25)',
    accentHover: 'rgba(107,168,202,0.18)',
    success: '#34d399',
    successBg: '#062318',
    successBorder: '#1a5e3a',
    warning: '#fbbf24',
    warningBg: '#1a1500',
    warningBorder: '#4a3a00',
    danger: '#f87171',
    dangerBg: '#1a0a0a',
    dangerBorder: '#5a1c1c',
    info: '#60a5fa',
    infoBg: '#0d1e3d',
    infoBorder: '#1e3a6e',
    barGradStart: '#6ba8ca',
    barGradEnd: '#4a7a9b',
    hbarTrack: '#1a1c1f',
    tableRowHover: '#161718',
    tableBorder: '#1a1c1f',
    topRim: 'none',
    blurAmount: 'none',
  },
}
