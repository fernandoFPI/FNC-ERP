import React from 'react'
import { Card } from './Card'

interface State {
  hasError: boolean
  error: Error | null
}

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <Card padding="md" style={{ margin: '24px' }}>
          <p style={{ color: 'var(--danger)', fontWeight: 600, marginBottom: '8px' }}>Something went wrong</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: '12px',
              padding: '6px 14px',
              fontSize: '12px',
              background: 'var(--danger-bg)',
              border: '1px solid var(--danger-border)',
              borderRadius: '6px',
              color: 'var(--danger)',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Retry
          </button>
        </Card>
      )
    }
    return this.props.children
  }
}
