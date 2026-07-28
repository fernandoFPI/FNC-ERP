import { useSubscription } from '@apollo/client'
import { useCompanyStore } from '../store/companyStore'
import { ENTITY_CHANGED_SUBSCRIPTION } from '../graphql/live'

interface EntityChangedData {
  entityChanged: { companyId: string; entityType: string; entityId: string; action: string }
}

// Drop-in live refetch for any list/detail page: subscribes to the active
// company's changes for one entityType and calls onChange when one arrives.
// onChange is typically `() => void refetch()` — the payload is signal-only,
// so pages re-fetch rather than trying to patch the event into their cache.
export function useEntityChanged(entityType: string, onChange: () => void): void {
  const companyId = useCompanyStore((s) => s.activeCompany?.id)
  useSubscription<EntityChangedData>(ENTITY_CHANGED_SUBSCRIPTION, {
    variables: { companyId: companyId ?? '', entityType },
    skip: !companyId,
    onData: () => {
      onChange()
    },
  })
}
