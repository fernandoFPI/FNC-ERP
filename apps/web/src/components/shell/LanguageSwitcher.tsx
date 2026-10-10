import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import { isRtl } from '../../i18n'

export function LanguageSwitcher() {
  const { theme } = useTheme()
  const { t, i18n } = useTranslation()
  const rtl = isRtl(i18n.resolvedLanguage)

  return (
    <button
      onClick={() => {
        void i18n.changeLanguage(rtl ? 'en' : 'ar')
      }}
      aria-label={t('common.switchLanguage')}
      title={t('common.switchLanguage')}
      style={{
        height: '34px',
        padding: '0 10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: theme.bgSurface,
        border: `1px solid ${theme.border}`,
        borderRadius: '8px',
        color: theme.textSecondary,
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        backdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
      }}
    >
      {rtl ? 'EN' : 'عربي'}
    </button>
  )
}
