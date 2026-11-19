// The month arrows of the attendance calendar. They are the two angle quotes, the same two characters in every language: the browser
// mirrors ‹ and › by itself in a right-to-left page, so swapping them in code would flip them back (playbook #104).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import i18n from '../../../i18n'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { AttendanceCalendar } from '../AttendanceCalendar'

afterEach(async () => {
  await i18n.changeLanguage('en')
})

const show = () => {
  const onMonthChange = vi.fn()
  render(
    <ThemeProvider>
      <AttendanceCalendar
        month={new Date(2026, 10, 1)}
        days={[]}
        onDayClick={vi.fn()}
        onMonthChange={onMonthChange}
      />
    </ThemeProvider>,
  )
  const [previous, next] = screen.getAllByRole('button')
  return { onMonthChange, previous, next }
}

describe('AttendanceCalendar month arrows', () => {
  it('go back and forward a month, the first button back and the second forward', () => {
    const { onMonthChange, previous, next } = show()
    fireEvent.click(previous)
    expect(onMonthChange).toHaveBeenLastCalledWith(new Date(2026, 9, 1))
    fireEvent.click(next)
    expect(onMonthChange).toHaveBeenLastCalledWith(new Date(2026, 11, 1))
  })

  it('draw ‹ then › in English', () => {
    const { previous, next } = show()
    expect(previous).toHaveTextContent('‹')
    expect(next).toHaveTextContent('›')
  })

  it('draw the same two characters in Arabic, not swapped', async () => {
    await i18n.changeLanguage('ar')
    const { previous, next } = show()
    expect(previous).toHaveTextContent('‹')
    expect(next).toHaveTextContent('›')
  })
})
