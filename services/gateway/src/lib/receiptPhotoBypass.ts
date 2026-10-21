// A system administrator can confirm a goods receipt (Store In) or record a
// direct-to-jobsite delivery without the required photos (vendor receipt and
// materials photo). Everyone else still needs them.
//
// Confirming a receipt moves real stock and cost, so the override is narrow and
// leaves a trail:
//   - system_admin only (not company_admin), same rule as adminCorrectPO;
//   - a written reason is required;
//   - the caller records the override in po_approval_log and audit_log.
// Enforced on the server, not just hidden in the UI: confirmReceipt itself rejects
// a missing photo, so a button alone would still be refused.

export const MAX_BYPASS_REASON_LENGTH = 500

export interface PhotoBypass {
  reason: string
}

// Returns the validated override, or null when none was asked for. Throws when
// one was asked for but isn't allowed or isn't justified.
export function resolvePhotoBypass(
  role: string,
  bypassPhotos: boolean | null | undefined,
  bypassReason: string | null | undefined,
): PhotoBypass | null {
  if (!bypassPhotos) return null
  if (role !== 'system_admin') {
    throw new Error('Only a system administrator can confirm a receipt without photos')
  }
  const reason = (bypassReason ?? '').trim()
  if (!reason) throw new Error('A reason is required to confirm a receipt without photos')
  if (reason.length > MAX_BYPASS_REASON_LENGTH) {
    throw new Error(`The reason must be ${MAX_BYPASS_REASON_LENGTH} characters or fewer`)
  }
  return { reason }
}
