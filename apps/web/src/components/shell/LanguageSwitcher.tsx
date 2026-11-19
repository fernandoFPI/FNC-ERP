import { useTranslation } from 'react-i18next'
import { isRtl } from '../../i18n'
import { TopbarButton } from './shellParts'

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  const rtl = isRtl(i18n.resolvedLanguage)

  return (
    <TopbarButton
      onClick={() => {
        void i18n.changeLanguage(rtl ? 'en' : 'ar')
      }}
      aria-label={t('common.switchLanguage')}
      title={t('common.switchLanguage')}
      style={{ padding: '0 10px', whiteSpace: 'nowrap' }}
    >
      {/* the label is the OTHER language's own name, so a screen reader reads it in that language */}
      <span lang={rtl ? 'en' : 'ar'}>{rtl ? 'EN' : 'عربي'}</span>
    </TopbarButton>
  )
}
