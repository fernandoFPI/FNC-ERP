import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { JsonViewer } from '../JsonViewer'
import { ThemeProvider } from '../../../theme/ThemeContext'

function wrap(props: { data: unknown; title?: string; collapsed?: boolean }) {
  return render(
    <ThemeProvider>
      <JsonViewer {...props} />
    </ThemeProvider>
  )
}

describe('JsonViewer', () => {
  it('renders string value', () => {
    wrap({ data: 'hello world' })
    expect(screen.getByText(/"hello world"/)).toBeInTheDocument()
  })

  it('renders number value', () => {
    wrap({ data: 42 })
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders null value', () => {
    wrap({ data: null })
    expect(screen.getByText('null')).toBeInTheDocument()
  })

  it('renders boolean true', () => {
    wrap({ data: true })
    expect(screen.getByText('true')).toBeInTheDocument()
  })

  it('renders object keys', () => {
    wrap({ data: { name: 'FNC ERP', version: 5 }, collapsed: false })
    expect(screen.getByText(/"name"/)).toBeInTheDocument()
  })

  it('shows title when provided', () => {
    wrap({ data: {}, title: 'Event Payload' })
    expect(screen.getByText('Event Payload')).toBeInTheDocument()
  })

  it('renders copy button', () => {
    wrap({ data: { key: 'value' } })
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument()
  })

  it('toggles object collapse on click', () => {
    wrap({ data: { a: 1, b: 2 }, collapsed: true })
    expect(screen.getByText(/2 keys/)).toBeInTheDocument()
    const toggleBtn = screen.getByRole('button', { name: '▶' })
    fireEvent.click(toggleBtn)
    expect(screen.getByText(/"a"/)).toBeInTheDocument()
  })

  it('renders array length indicator when collapsed', () => {
    wrap({ data: [1, 2, 3], collapsed: true })
    expect(screen.getByText(/3 items/)).toBeInTheDocument()
  })
})
