import { useTranslation } from 'react-i18next'
import { ActionButton } from '../ui/ActionButton'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { useToastStore } from '../../store/toastStore'
import { openPoPhotoViewer } from '../../lib/poPhotoViewer'

interface OpenPhotosButtonProps {
  poId: string
  /**
   * Opens the viewer as a floating picture-in-picture window (no address bar) and resolves true; resolves false where the browser
   * cannot. When it is not given, or says false, the viewer opens as a pop-up window instead.
   */
  onOpenFloating?: () => Promise<boolean>
}

/**
 * Opens the order's receipts and photos in a window of its own, which can be dragged to a second screen and left open while the
 * lines are checked: a floating window where the browser has one, else a pop-up window. On a phone, where windows cannot float,
 * it opens as a tab. A browser that blocks the window is told so.
 */
export function OpenPhotosButton({ poId, onOpenFloating }: OpenPhotosButtonProps) {
  const { t } = useTranslation()
  const { isPhone } = useBreakpoint()
  const addToast = useToastStore((s) => s.addToast)

  const openPopup = () => {
    const win = openPoPhotoViewer(poId, { asTab: isPhone })
    if (!win) addToast({ type: 'error', message: t('po.photoViewer.popupBlocked') })
  }

  return (
    <span title={t('po.photoViewer.openInWindowHint')} style={{ display: 'inline-flex' }}>
      <ActionButton
        size="sm"
        variant="outline"
        onClick={() => {
          if (onOpenFloating && !isPhone) {
            void onOpenFloating().then(
              (opened) => {
                if (!opened) openPopup()
              },
              () => {
                openPopup()
              },
            )
          } else {
            openPopup()
          }
        }}
      >
        {t('po.photoViewer.openInWindow')}
      </ActionButton>
    </span>
  )
}
