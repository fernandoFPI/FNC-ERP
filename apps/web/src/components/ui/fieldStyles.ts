import type { CSSProperties } from 'react'
import type { ThemeTokens } from '../../theme/tokens'

/**
 * The "field" look shared by every form control that opts in (`Input`, `Select`, `Textarea` with `field`, and the raw
 * `<input>` / `<select>` / `<textarea>` of the PO page's edit forms): a solid surface, the readable edge
 * (`borderField`, 3:1 against the card) and rounded corners, so a Priority box, a date box and a vendor picker read as
 * one family. Off, nothing changes for the ~90 screens that use the plain controls.
 *
 *  - `md` is 40px with 10px corners (a form on its own);
 *  - `sm` is 36px with 8px corners (a box inside a dense grid of lines).
 */
export type FieldSize = 'md' | 'sm'

interface FieldOptions {
  size?: FieldSize
  error?: boolean
  /** A native `<select>`: hide the browser's own arrow and draw the same chevron the searchable select shows. */
  select?: boolean
  rtl?: boolean
  /** The dark theme: lets the browser draw a date picker's calendar icon in a light colour. */
  dark?: boolean
}

// The same chevron as SearchableSelect's (12px, 1.5 stroke, the muted colour), as a background image.
function chevron(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

export function fieldRestingBorder(theme: ThemeTokens, error?: boolean): string {
  return error ? theme.dangerBorder : theme.borderField
}

export function fieldControlStyle(
  theme: ThemeTokens,
  { size = 'md', error = false, select = false, rtl = false, dark = false }: FieldOptions = {},
): CSSProperties {
  const height = size === 'md' ? 40 : 36
  return {
    width: '100%',
    boxSizing: 'border-box',
    minHeight: `${height}px`,
    height: `${height}px`,
    paddingBlock: '0',
    paddingInlineStart: '12px',
    paddingInlineEnd: select ? '36px' : '12px',
    fontSize: '13px',
    fontFamily: 'inherit',
    background: theme.bgSurface,
    border: `1px solid ${fieldRestingBorder(theme, error)}`,
    borderRadius: size === 'md' ? '10px' : '8px',
    color: theme.textPrimary,
    outline: 'none',
    colorScheme: dark ? 'dark' : 'light',
    ...(select
      ? {
          appearance: 'none' as const,
          WebkitAppearance: 'none' as const,
          backgroundImage: chevron(theme.textMuted),
          backgroundRepeat: 'no-repeat',
          backgroundPosition: rtl ? 'left 12px center' : 'right 12px center',
          cursor: 'pointer',
        }
      : {}),
  }
}

/** A text area in the same family: it grows with `rows`, so the height is not fixed. */
export function fieldTextareaStyle(
  theme: ThemeTokens,
  { size = 'md', error = false, dark = false }: Pick<FieldOptions, 'size' | 'error' | 'dark'> = {},
): CSSProperties {
  return {
    ...fieldControlStyle(theme, { size, error, dark }),
    height: 'auto',
    minHeight: size === 'md' ? '88px' : '64px',
    paddingBlock: '10px',
    resize: 'vertical',
  }
}

/**
 * The styles of the PO page's edit and correction forms, which use raw `<input>`, `<select>` and `<textarea>` in dense
 * grids of lines: the field look at 36px, a native select with the shared chevron, and a sentence-case label in the
 * readable grey (the old 11px uppercase label in `textMuted` was 2.6:1). They keep the browser's own focus ring, since
 * a raw control has no handler to draw a different one.
 */
export function denseFormStyles(theme: ThemeTokens, { rtl = false, dark = false } = {}) {
  const withoutOutline = (style: CSSProperties): CSSProperties => {
    const next = { ...style }
    delete next.outline
    return next
  }
  return {
    inputStyle: withoutOutline(fieldControlStyle(theme, { size: 'sm', dark })),
    // the full 40px box, for a row that sits beside a searchable picker (a price and its currency)
    fieldInputStyle: withoutOutline(fieldControlStyle(theme, { size: 'md', dark })),
    selectStyle: withoutOutline(fieldControlStyle(theme, { size: 'sm', select: true, rtl, dark })),
    textareaStyle: withoutOutline(fieldTextareaStyle(theme, { size: 'sm', dark })),
    labelStyle: {
      fontSize: '12px',
      fontWeight: 500,
      color: theme.textSecondary,
      display: 'block',
      marginBottom: '4px',
    } satisfies CSSProperties,
  }
}
