import { useBreakpoint } from './useBreakpoint'

export function usePagePadding() {
  const { isPhone, isTablet } = useBreakpoint()
  if (isPhone)
    return { paddingTop: '12px', paddingRight: '12px', paddingBottom: '12px', paddingLeft: '12px' }
  if (isTablet)
    return { paddingTop: '16px', paddingRight: '16px', paddingBottom: '16px', paddingLeft: '16px' }
  return { paddingTop: '24px', paddingRight: '24px', paddingBottom: '24px', paddingLeft: '24px' }
}
