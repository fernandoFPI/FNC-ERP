import i18n from '../i18n'
import { useAuthStore } from '../store/authStore'
import { useCompanyStore } from '../store/companyStore'
import { useToastStore } from '../store/toastStore'
import { decodeJWT } from './jwt'

// A token refresh answers with the company the SESSION was last active in, and every tab of one login shares that
// session. If another tab switched company, this tab's next refresh silently becomes that company while its screens
// (and a half-filled form) still hold the old company's data: a Yakam requisition was filed on a Factory project that
// way (playbook #114). A manual switch already resets everything (EntitySwitcher); the two refresh paths (axios.ts
// for REST, apollo.ts for GraphQL) now go through this one function so they behave the same.

let onCompanyChanged: (() => void) | null = null

/** apollo.ts registers what to do with cached company data (it owns the client; importing it here would be circular). */
export function setCompanyChangeHandler(handler: (() => void) | null): void {
  onCompanyChanged = handler
}

export function applyRefreshedToken(newToken: string): void {
  const auth = useAuthStore.getState()
  const before = auth.user?.companyId
  auth.setAccessToken(newToken)
  const decoded = decodeJWT(newToken)
  if (!decoded) return
  auth.setUser({ role: decoded.role, companyId: decoded.companyId })

  // The refreshed token's company is authoritative: put the company badge (and, through setActiveCompany, the
  // permissions) in step with it. Before, only the GraphQL path moved the badge, and neither loaded permissions.
  const { activeCompany, companies, setActiveCompany } = useCompanyStore.getState()
  const matched = companies.find((c) => c.id === decoded.companyId)
  if (matched && matched.id !== activeCompany?.id) setActiveCompany(matched)

  // A different company than this tab was using: drop what it cached for the old one, and say so.
  if (before && before !== decoded.companyId) {
    onCompanyChanged?.()
    const name = matched?.name ?? ''
    useToastStore.getState().addToast({
      type: 'warning',
      message: i18n.t('shell.companyChangedNotice', {
        company: name,
        defaultValue:
          'Your session is now in {{company}} (the company was switched in another tab or device). ' +
          "This page was refreshed with {{company}}'s data. Check anything you were filling in.",
      }),
    })
  }
}
