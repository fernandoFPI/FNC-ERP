// Whether a purchase order already has the buyer's vendor receipt on file.
//
// Takes the rows `entityAttachments('purchase_order', poId)` returns and mirrors
// confirmReceipt's own acceptance rule exactly (gateway resolvers.ts) — NOT just
// "any attachment exists". That union also includes the PO page's unrelated
// "Delivery Photos" uploader (category 'attachment', no status gating), which
// once made this true with no real vendor receipt anywhere, so the backend
// rejected the receipt right after. A direct-PO attachment (sourceEntityType
// 'purchase_order') only counts with category 'po_receipt_document'; a G1 child
// PO's per-vendor purchase receipt (sourceEntityType 'po_line_purchase',
// attached during the requisition's Items Bought stage) counts regardless of
// category, since that flow never writes 'po_receipt_document' at all.
//
// One shared copy, used by both places that ask for a vendor receipt at
// receiving time (the Store In detail page and the jobsite delivery form). They
// used to carry their own: the jobsite form had none, so it asked for a vendor
// receipt the buyer had already uploaded (playbook entry 31).
export interface AttachmentRow {
  sourceEntityType?: string | null
  file?: { category?: string | null } | null
}

export function hasBuyerReceipt(
  attachments: readonly (AttachmentRow | null)[] | null | undefined,
): boolean {
  return (attachments ?? []).some(
    (a) =>
      a != null &&
      (a.sourceEntityType === 'po_line_purchase' || a.file?.category === 'po_receipt_document'),
  )
}
