// What the requisition page does with the organizer review, in the smallest form the tests can render: the controller hook,
// the slim card, the summary strip, and a Lines table whose Bought and Status columns are the review's own cells (with the line's
// details opening under its row), or, on a phone, the compact cards and their sheet. (RequisitionDetail wires the same pieces into
// its much larger Lines table; its own test checks that wiring.)
import { useBreakpoint } from '../../../hooks/useBreakpoint'
import { Table } from '../../ui/Table'
import type { Column } from '../../ui/Table'
import {
  OrganizerReviewPanel,
  ReviewActionsCell,
  ReviewLineDetails,
  ReviewPhoneList,
  ReviewPurchasesCell,
  ReviewSummaryStrip,
  useOrganizerReview,
} from '../OrganizerReviewPanel'
import type { ReviewLineRow, ReviewRequisition } from '../OrganizerReviewPanel'

export function ReviewHarness({
  requisition,
  onChanged,
  barSlot,
}: {
  requisition: ReviewRequisition
  onChanged: () => void
  barSlot?: HTMLElement | null
}) {
  const ctl = useOrganizerReview(requisition, onChanged)
  const { isPhone } = useBreakpoint()
  const columns: Column<ReviewLineRow>[] = [
    // the page's own tick column, drawn only while the approver can flag lines
    ...(ctl.flagging
      ? [
          {
            key: 'flag_toggle',
            header: 'Flag',
            render: (l: ReviewLineRow) => (
              <input
                type="checkbox"
                title="Flag this line for rejection"
                checked={l.id in ctl.flagged}
                onChange={() => {
                  ctl.toggleFlag(l.id)
                }}
              />
            ),
          },
        ]
      : []),
    {
      key: 'item',
      header: 'Item',
      mobilePrimary: true,
      render: (l) => <span>{l.product_name ? l.product_name : (l.description ?? '—')}</span>,
    },
    {
      key: 'purchases',
      header: 'Bought',
      render: (l) => (
        <ReviewPurchasesCell
          ctl={ctl}
          line={l}
          fallback={(l.purchases ?? []).length === 0 ? <span>no purchase</span> : undefined}
        />
      ),
    },
    {
      key: 'review_actions',
      header: 'Status',
      mobileAction: true,
      render: (l: ReviewLineRow) => <ReviewActionsCell ctl={ctl} line={l} />,
    },
  ]
  return (
    <>
      <OrganizerReviewPanel ctl={ctl} barSlot={barSlot} />
      <ReviewSummaryStrip ctl={ctl} />
      {isPhone && ctl.active ? (
        <ReviewPhoneList ctl={ctl} />
      ) : (
        <Table<ReviewLineRow>
          columns={columns}
          data={[...requisition.lines].sort((a, b) => (a.line_number ?? 0) - (b.line_number ?? 0))}
          rowKey="id"
          mobileLayout="fields"
          renderExpanded={(l) =>
            ctl.active && ctl.expanded.includes(l.id) ? (
              <ReviewLineDetails ctl={ctl} line={l} />
            ) : null
          }
        />
      )}
    </>
  )
}
