// Opening the Cost Control tab brings Committed up to date from the purchase orders (an idempotent Sync PO), once, for
// someone who may edit cost control; a view-only user does not trigger it (the server would refuse and the page would
// toast an error on every visit). Renders the real tab with no data.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../../../i18n'
import { ThemeProvider, useTheme } from '../../../../theme/ThemeContext'
import { CostControlTab } from '../ProjectDetail'

function Harness({
  projectId,
  isEditable,
  onSyncPO,
}: {
  projectId: string
  isEditable: boolean
  onSyncPO: (v: Record<string, unknown>) => void
}) {
  const { theme } = useTheme()
  const noop = vi.fn()
  return (
    <CostControlTab
      projectId={projectId}
      th={theme as unknown as Record<string, string>}
      isEditable={isEditable}
      isAdmin
      costCodes={[]}
      summary={null}
      projectAnalyticAccountId={null}
      projectAnalyticAccountName={null}
      onCreateCostCode={noop}
      onUpdateCostCode={noop}
      onDeleteCostCode={noop}
      committedCosts={[]}
      subcontracts={[]}
      laborEntries={[]}
      equipmentLog={[]}
      cashFlow={[]}
      costForecast={[]}
      clientBillings={[]}
      onCreateCommitted={noop}
      onUpdateCommitted={noop}
      onDeleteCommitted={noop}
      onSyncPO={onSyncPO}
      onCreateSub={noop}
      onUpdateSub={noop}
      onDeleteSub={noop}
      onCreateLabor={noop}
      onUpdateLabor={noop}
      onDeleteLabor={noop}
      onCreateEquip={noop}
      onUpdateEquip={noop}
      onDeleteEquip={noop}
      onUpsertCash={noop}
      onUpsertForecast={noop}
      onCreateBilling={noop}
      onUpdateBilling={noop}
      onDeleteBilling={noop}
    />
  )
}

const tree = (props: Parameters<typeof Harness>[0]) => (
  <MemoryRouter>
    <ThemeProvider>
      <Harness {...props} />
    </ThemeProvider>
  </MemoryRouter>
)

describe('Cost Control tab: Committed is brought up to date when it opens', () => {
  it('someone who may edit: one sync for the project, as soon as the tab opens', () => {
    const onSyncPO = vi.fn()
    render(tree({ projectId: 'p-1', isEditable: true, onSyncPO }))
    expect(onSyncPO).toHaveBeenCalledTimes(1)
    expect(onSyncPO).toHaveBeenCalledWith({ projectId: 'p-1' })
  })

  it('a view-only user does not trigger it', () => {
    const onSyncPO = vi.fn()
    render(tree({ projectId: 'p-1', isEditable: false, onSyncPO }))
    expect(onSyncPO).not.toHaveBeenCalled()
  })

  it('it does not run again when the tab re-draws or another sub-section is opened', () => {
    const onSyncPO = vi.fn()
    const view = render(tree({ projectId: 'p-1', isEditable: true, onSyncPO }))
    // a new function every render, as the real page passes it
    view.rerender(
      tree({
        projectId: 'p-1',
        isEditable: true,
        onSyncPO: (v) => {
          onSyncPO(v)
        },
      }),
    )
    for (const b of Array.from(screen.getAllByRole('button')).slice(0, 6)) fireEvent.click(b)
    expect(onSyncPO).toHaveBeenCalledTimes(1)
  })

  it('opening another project syncs that one too', () => {
    const onSyncPO = vi.fn()
    const view = render(tree({ projectId: 'p-1', isEditable: true, onSyncPO }))
    view.rerender(tree({ projectId: 'p-2', isEditable: true, onSyncPO }))
    expect(onSyncPO).toHaveBeenCalledTimes(2)
    expect(onSyncPO).toHaveBeenLastCalledWith({ projectId: 'p-2' })
  })

  it('the Committed sub-tab keeps its own Sync PO button for a manual refresh', () => {
    const onSyncPO = vi.fn()
    render(tree({ projectId: 'p-1', isEditable: true, onSyncPO }))
    fireEvent.click(screen.getByRole('button', { name: i18n.t('proj.detail.committed') }))
    onSyncPO.mockClear()
    fireEvent.click(screen.getByRole('button', { name: i18n.t('proj.detail.syncPos') }))
    expect(onSyncPO).toHaveBeenCalledWith({ projectId: 'p-1' })
  })
})
