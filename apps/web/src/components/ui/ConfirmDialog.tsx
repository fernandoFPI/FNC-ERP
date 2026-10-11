import { useTranslation } from 'react-i18next'
import React from 'react'
import { Modal } from './Modal'
import { Button } from './Button'

interface ConfirmDialogProps {
  open: boolean
  onClose?: () => void
  onCancel?: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  confirmVariant?: 'primary' | 'danger'
  variant?: string
  loading?: boolean
}

export function ConfirmDialog({
  open,
  onClose,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel,
  confirmVariant,
  variant,
  loading = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  const handleClose = onClose ?? onCancel ?? (() => undefined)
  const resolvedVariant = confirmVariant ?? (variant === 'danger' ? 'danger' : 'primary')

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="md" onClick={handleClose} disabled={loading}>
            {t('ui.confirm.cancel')}
          </Button>
          <Button variant={resolvedVariant} size="md" onClick={onConfirm} loading={loading}>
            {confirmLabel ?? t('ui.generic.confirm')}
          </Button>
        </>
      }
    >
      <p style={{ fontSize: '14px', lineHeight: 1.6, margin: 0 }}>{message}</p>
    </Modal>
  )
}
