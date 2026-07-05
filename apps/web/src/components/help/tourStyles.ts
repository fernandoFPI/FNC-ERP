import type { ThemeTokens } from '../../theme/tokens'

const STYLE_ID = 'fnc-tour-theme'

export function injectTourStyles(theme: ThemeTokens) {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = STYLE_ID
    document.head.appendChild(el)
  }

  el.textContent = `
/* ── FNC Help Tour — theme-matched overrides ─────────────────────────── */

.driver-popover.fnc-help-tour {
  all: unset;
  box-sizing: border-box;
  position: fixed;
  top: 0;
  right: 0;
  z-index: 1000000000;
  background: ${theme.bgSurface};
  border: 1px solid ${theme.borderStrong};
  border-radius: 12px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.30);
  min-width: 300px;
  max-width: 360px;
  padding: 20px 20px 16px;
  color: ${theme.textPrimary};
}

.driver-popover.fnc-help-tour * {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  box-sizing: border-box;
  pointer-events: auto;
}

/* Title */
.driver-popover.fnc-help-tour .driver-popover-title {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: ${theme.textPrimary};
  line-height: 1.4;
  margin: 0 28px 8px 0;
}

/* Description */
.driver-popover.fnc-help-tour .driver-popover-description {
  font-size: 13px;
  line-height: 1.65;
  color: ${theme.textSecondary};
  margin: 0;
}

/* Close × */
.driver-popover.fnc-help-tour .driver-popover-close-btn {
  all: unset;
  position: absolute;
  top: 14px;
  right: 14px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 400;
  color: ${theme.textMuted};
  cursor: pointer;
  border-radius: 4px;
  line-height: 1;
  transition: color 0.15s, background 0.15s;
  pointer-events: auto;
}
.driver-popover.fnc-help-tour .driver-popover-close-btn:hover {
  color: ${theme.textPrimary};
  background: ${theme.bgSurfaceHover};
}

/* Footer */
.driver-popover.fnc-help-tour .driver-popover-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid ${theme.border};
  text-align: right;
  zoom: 1;
}

/* Progress "1 of 6" */
.driver-popover.fnc-help-tour .driver-popover-progress-text {
  font-size: 11px;
  font-weight: 500;
  color: ${theme.textMuted};
  letter-spacing: 0.02em;
}

/* Nav buttons wrapper */
.driver-popover.fnc-help-tour .driver-popover-navigation-btns {
  display: flex;
  gap: 6px;
  flex-grow: 1;
  justify-content: flex-end;
}

/* Base button reset */
.driver-popover.fnc-help-tour .driver-popover-footer-btn {
  all: unset;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  padding: 5px 14px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  font-family: inherit;
  transition: background 0.15s, opacity 0.15s;
}

.driver-popover.fnc-help-tour .driver-popover-footer .driver-popover-btn-disabled {
  opacity: 0.35;
  pointer-events: none;
}

/* Previous — ghost style */
.driver-popover.fnc-help-tour .driver-prev-btn {
  background: transparent;
  border: 1px solid ${theme.border};
  color: ${theme.textSecondary};
}
.driver-popover.fnc-help-tour .driver-prev-btn:hover {
  background: ${theme.bgSurfaceHover};
  color: ${theme.textPrimary};
  border-color: ${theme.borderStrong};
}

/* Next / Done — accent style matching app primary button */
.driver-popover.fnc-help-tour .driver-next-btn {
  background: ${theme.accentBg};
  border: 1px solid ${theme.accentBorder};
  color: ${theme.accent};
}
.driver-popover.fnc-help-tour .driver-next-btn:hover {
  background: ${theme.accentHover};
}

/* Arrow — match popover background */
.driver-popover.fnc-help-tour .driver-popover-arrow {
  border: 6px solid ${theme.bgSurface};
}
.driver-popover.fnc-help-tour .driver-popover-arrow-side-left {
  border-top-color: transparent;
  border-bottom-color: transparent;
  border-right-color: transparent;
}
.driver-popover.fnc-help-tour .driver-popover-arrow-side-right {
  border-top-color: transparent;
  border-bottom-color: transparent;
  border-left-color: transparent;
}
.driver-popover.fnc-help-tour .driver-popover-arrow-side-top {
  border-bottom-color: transparent;
  border-left-color: transparent;
  border-right-color: transparent;
}
.driver-popover.fnc-help-tour .driver-popover-arrow-side-bottom {
  border-top-color: transparent;
  border-left-color: transparent;
  border-right-color: transparent;
}
.driver-popover.fnc-help-tour .driver-popover-arrow-side-over,
.driver-popover.fnc-help-tour .driver-popover-arrow-side-center,
.driver-popover.fnc-help-tour .driver-popover-arrow-none {
  display: none;
}
`
}

export function removeTourStyles() {
  document.getElementById(STYLE_ID)?.remove()
}
