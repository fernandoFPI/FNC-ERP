// The control a system administrator uses to confirm a goods receipt without the
// vendor receipt / materials photos. The server enforces the role and the reason;
// this checks the control itself: the reason box only appears once the override is
// ticked, and "ready" means ticked and justified.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { AdminPhotoBypass, photoBypassReady, PHOTO_BYPASS_MAX_REASON } from '../AdminPhotoBypass'

function renderControl(props: { enabled?: boolean; reason?: string } = {}) {
  const onEnabledChange = vi.fn()
  const onReasonChange = vi.fn()
  render(
    <ThemeProvider>
      <AdminPhotoBypass
        enabled={props.enabled ?? false}
        reason={props.reason ?? ''}
        onEnabledChange={onEnabledChange}
        onReasonChange={onReasonChange}
      />
    </ThemeProvider>,
  )
  return { onEnabledChange, onReasonChange }
}

describe('photoBypassReady', () => {
  it('needs the override ticked and a non-blank reason', () => {
    expect(photoBypassReady(false, 'a reason')).toBe(false)
    expect(photoBypassReady(true, '')).toBe(false)
    expect(photoBypassReady(true, '   ')).toBe(false)
    expect(photoBypassReady(true, 'photos lost')).toBe(true)
  })
})

describe('AdminPhotoBypass', () => {
  it('starts unticked with no reason box, and reports the tick', () => {
    const { onEnabledChange } = renderControl()
    expect(screen.queryByPlaceholderText(/why are the photos/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText(/admin override/i))
    expect(onEnabledChange).toHaveBeenCalledWith(true)
  })

  it('asks for a reason once ticked, and reports what is typed', () => {
    const { onReasonChange } = renderControl({ enabled: true })
    const box = screen.getByPlaceholderText(/why are the photos/i)
    fireEvent.change(box, { target: { value: 'Photos lost with the old phone' } })
    expect(onReasonChange).toHaveBeenCalledWith('Photos lost with the old phone')
  })

  it('caps the reason at the length the server accepts', () => {
    const { onReasonChange } = renderControl({ enabled: true })
    fireEvent.change(screen.getByPlaceholderText(/why are the photos/i), {
      target: { value: 'x'.repeat(PHOTO_BYPASS_MAX_REASON + 50) },
    })
    expect(onReasonChange).toHaveBeenCalledWith('x'.repeat(PHOTO_BYPASS_MAX_REASON))
  })
})
