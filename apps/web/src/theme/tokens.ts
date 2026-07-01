export type ThemeKey = 'dark-glass' | 'dark-white' | 'light-glass' | 'light-flat'

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
  'dark-glass': {
    key: 'dark-glass',
    label: 'Dark glass',
    description: 'Deep canvas with frosted surfaces',
    bgCanvas: '#0a0812',
    orb1: 'rgba(120,60,200,0.18)',
    orb2: 'rgba(45,140,210,0.14)',
    orb3: 'rgba(30,200,160,0.10)',
    hasOrbs: true,
    hasBlur: true,
    bgSurface: 'rgba(255,255,255,0.04)',
    bgSurfaceHover: 'rgba(255,255,255,0.07)',
    bgTopbar: 'rgba(10,8,18,0.50)',
    bgSidebar: 'rgba(15,10,28,0.60)',
    border: 'rgba(255,255,255,0.08)',
    borderStrong: 'rgba(255,255,255,0.14)',
    borderInput: 'rgba(255,255,255,0.12)',
    textPrimary: '#f0eeff',
    textSecondary: 'rgba(240,238,255,0.55)',
    textMuted: 'rgba(240,238,255,0.30)',
    accent: '#88b4cc',
    accentBg: 'rgba(136,180,204,0.12)',
    accentBorder: 'rgba(136,180,204,0.25)',
    accentHover: 'rgba(136,180,204,0.18)',
    success: '#3de8c8',
    successBg: 'rgba(61,232,200,0.12)',
    successBorder: 'rgba(61,232,200,0.22)',
    warning: '#ffb347',
    warningBg: 'rgba(255,179,71,0.12)',
    warningBorder: 'rgba(255,179,71,0.22)',
    danger: '#ff6b6b',
    dangerBg: 'rgba(255,107,107,0.12)',
    dangerBorder: 'rgba(255,107,107,0.22)',
    info: '#5eb3ff',
    infoBg: 'rgba(94,179,255,0.12)',
    infoBorder: 'rgba(94,179,255,0.22)',
    barGradStart: '#88b4cc',
    barGradEnd: '#5a8aaa',
    hbarTrack: 'rgba(255,255,255,0.06)',
    tableRowHover: 'rgba(255,255,255,0.02)',
    tableBorder: 'rgba(255,255,255,0.04)',
    topRim: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)',
    blurAmount: 'blur(16px)',
  },

  'dark-white': {
    key: 'dark-white',
    label: 'Dark — white',
    description: 'Dark canvas with white accent',
    bgCanvas: '#0a0812',
    orb1: 'rgba(120,60,200,0.18)',
    orb2: 'rgba(45,140,210,0.14)',
    orb3: 'rgba(30,200,160,0.10)',
    hasOrbs: true,
    hasBlur: true,
    bgSurface: 'rgba(255,255,255,0.04)',
    bgSurfaceHover: 'rgba(255,255,255,0.07)',
    bgTopbar: 'rgba(10,8,18,0.50)',
    bgSidebar: 'rgba(15,10,28,0.60)',
    border: 'rgba(255,255,255,0.08)',
    borderStrong: 'rgba(255,255,255,0.14)',
    borderInput: 'rgba(255,255,255,0.12)',
    textPrimary: '#f0eeff',
    textSecondary: 'rgba(240,238,255,0.55)',
    textMuted: 'rgba(240,238,255,0.30)',
    accent: 'rgba(255,255,255,0.90)',
    accentBg: 'rgba(255,255,255,0.07)',
    accentBorder: 'rgba(255,255,255,0.18)',
    accentHover: 'rgba(255,255,255,0.10)',
    success: '#3de8c8',
    successBg: 'rgba(61,232,200,0.12)',
    successBorder: 'rgba(61,232,200,0.22)',
    warning: '#ffb347',
    warningBg: 'rgba(255,179,71,0.12)',
    warningBorder: 'rgba(255,179,71,0.22)',
    danger: '#ff6b6b',
    dangerBg: 'rgba(255,107,107,0.12)',
    dangerBorder: 'rgba(255,107,107,0.22)',
    info: '#5eb3ff',
    infoBg: 'rgba(94,179,255,0.12)',
    infoBorder: 'rgba(94,179,255,0.22)',
    barGradStart: 'rgba(255,255,255,0.75)',
    barGradEnd: 'rgba(255,255,255,0.40)',
    hbarTrack: 'rgba(255,255,255,0.06)',
    tableRowHover: 'rgba(255,255,255,0.02)',
    tableBorder: 'rgba(255,255,255,0.04)',
    topRim: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.10),transparent)',
    blurAmount: 'blur(16px)',
  },

  'light-glass': {
    key: 'light-glass',
    label: 'Light glass',
    description: 'Soft gradient with frosted cards',
    bgCanvas: 'linear-gradient(145deg,#eef2ff,#f0f6ff,#edf9f6)',
    orb1: 'rgba(136,180,204,0.14)',
    orb2: 'rgba(61,232,200,0.08)',
    orb3: 'rgba(94,179,255,0.07)',
    hasOrbs: true,
    hasBlur: true,
    bgSurface: 'rgba(255,255,255,0.62)',
    bgSurfaceHover: 'rgba(255,255,255,0.78)',
    bgTopbar: 'rgba(255,255,255,0.55)',
    bgSidebar: 'rgba(245,248,255,0.70)',
    border: 'rgba(136,180,204,0.18)',
    borderStrong: 'rgba(136,180,204,0.30)',
    borderInput: 'rgba(136,180,204,0.25)',
    textPrimary: '#1a1a3a',
    textSecondary: 'rgba(26,26,58,0.60)',
    textMuted: 'rgba(26,26,58,0.38)',
    accent: '#4a7a9b',
    accentBg: 'rgba(74,122,155,0.10)',
    accentBorder: 'rgba(74,122,155,0.22)',
    accentHover: 'rgba(74,122,155,0.15)',
    success: '#0f7a6b',
    successBg: 'rgba(61,232,200,0.14)',
    successBorder: 'rgba(61,232,200,0.30)',
    warning: '#8a5e0a',
    warningBg: 'rgba(210,160,60,0.13)',
    warningBorder: 'rgba(210,160,60,0.28)',
    danger: '#b91c1c',
    dangerBg: 'rgba(220,38,38,0.10)',
    dangerBorder: 'rgba(220,38,38,0.22)',
    info: '#1d6fa8',
    infoBg: 'rgba(94,179,255,0.12)',
    infoBorder: 'rgba(94,179,255,0.25)',
    barGradStart: '#4a7a9b',
    barGradEnd: '#7aaccc',
    hbarTrack: 'rgba(136,180,204,0.14)',
    tableRowHover: 'rgba(136,180,204,0.05)',
    tableBorder: 'rgba(136,180,204,0.10)',
    topRim: 'linear-gradient(90deg,transparent,rgba(136,180,204,0.22),transparent)',
    blurAmount: 'blur(14px)',
  },

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
}
