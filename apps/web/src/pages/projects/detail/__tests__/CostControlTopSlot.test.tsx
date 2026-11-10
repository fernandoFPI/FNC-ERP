// The "Other Currency Budgets" card moved from the page header (every tab) to the top of the Cost Control tab.
// The tab takes it as a `topSlot` and draws it above its sub-sections. Renders the real tab with no data.
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider, useTheme } from '../../../../theme/ThemeContext'
import { CostControlTab } from '../ProjectDetail'

function Harness({ withSlot }: { withSlot: boolean }) {
  const { theme } = useTheme()
  const noop = vi.fn()
  return (
    <CostControlTab
      projectId="p-1"
      th={theme as unknown as Record<string, string>}
      isEditable
      isAdmin
      topSlot={withSlot ? <div data-testid="slot">Other Currency Budgets card</div> : undefined}
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
      onSyncPO={noop}
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

const renderTab = (withSlot = true) =>
  render(
    <MemoryRouter>
      <ThemeProvider>
        <Harness withSlot={withSlot} />
      </ThemeProvider>
    </MemoryRouter>,
  )

describe('Cost Control tab: top slot', () => {
  it('draws the slot first, above the sub-section buttons', () => {
    renderTab()
    const slot = screen.getByTestId('slot')
    const root = slot.parentElement
    expect(root?.firstElementChild).toBe(slot)
    // The sub-nav (a row of buttons) comes right after it.
    expect(slot.nextElementSibling?.querySelectorAll('button').length).toBeGreaterThan(3)
  })

  it('keeps the slot at the top when another sub-section is opened', () => {
    renderTab()
    const nav = screen.getByTestId('slot').nextElementSibling
    const buttons = nav?.querySelectorAll('button') ?? []
    expect(buttons.length).toBeGreaterThan(3)
    for (const b of Array.from(buttons)) {
      fireEvent.click(b)
      const slot = screen.getByTestId('slot')
      expect(slot.parentElement?.firstElementChild).toBe(slot)
    }
  })

  it('draws nothing extra when there is no slot', () => {
    renderTab(false)
    expect(screen.queryByTestId('slot')).not.toBeInTheDocument()
  })
})

// The page itself (a 36k-line file with no harness): pin how it hands the card to the tab.
describe('the project page hands the card to the Cost Control tab', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../ProjectDetail.tsx'), 'utf8')

  it('uses the card once, inside the Cost Control tab, and not under the page header any more', () => {
    expect(source.match(/<OtherCurrencyBudgets/g)).toHaveLength(1)
    expect(source).toMatch(/<CostControlTab[\s\S]*?topSlot=\{\s*<OtherCurrencyBudgets/)
    expect(source).not.toContain("t('proj.detail.otherCurrencyBudgets')")
  })

  it('keeps the same administrator rule as before, not the Cost Control edit right', () => {
    // The strip was shown to the page-wide administrator (projects.edit), not to whoever may edit cost control.
    expect(source).toMatch(/<OtherCurrencyBudgets\s+isAdmin=\{isAdmin\}/)
  })
})
