// What stops a project in the Financing phase from being closed, for the Close Project button.
//
// This is a MIRROR of the rule the server enforces (packages/db/src/projectCloseout.ts, used by the
// gateway's completeProject and the projects service). The server is the authority and refuses with a
// plain message; this only lets the button say so before it is pressed. A test reads the server file and
// fails if the status lists below differ from it.
//
//   * an invoice that is not paid blocks everyone, administrators included;
//   * cancelled and void invoices never count (they will not be paid, and are not "an invoice");
//   * a project with no invoices blocks everyone except an administrator.

export const PAID_INVOICE_STATUS = 'paid'
export const DEAD_INVOICE_STATUSES = ['cancelled', 'void'] as const

export type CloseoutGate = { kind: 'unpaid'; open: number } | { kind: 'none' }

/**
 * `invoices` is null/undefined while the list has not loaded (or the viewer may not read invoices):
 * then there is nothing to say and the server decides. `isAdmin` mirrors the server's notion: a system or
 * company admin, or a projects module admin.
 */
export function projectCloseoutGate(
  invoices: readonly { status: string }[] | null | undefined,
  isAdmin: boolean,
): CloseoutGate | null {
  if (!invoices) return null
  const live = invoices.filter(
    (i) => !(DEAD_INVOICE_STATUSES as readonly string[]).includes(i.status),
  )
  const open = live.filter((i) => i.status !== PAID_INVOICE_STATUS).length
  if (open > 0) return { kind: 'unpaid', open }
  if (live.length === 0 && !isAdmin) return { kind: 'none' }
  return null
}
