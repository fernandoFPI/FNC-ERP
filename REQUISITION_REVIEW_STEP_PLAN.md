# Organizer review step (after Items Bought, before Sourcing)

Requested 2026-11-22. The organizer double-checks what was bought (and the receipts) before the requisition becomes
purchase orders. If he changes anything the requisition needs the PO Admin's approval before the POs are created.

## Decisions (the user's, 2026-11-22)
- Flow: Items Bought -> **Organizer Review** -> Sourcing. With changes: Organizer Review -> **PO Admin Approval** ->
  Sourcing (reject with a reason returns it to Organizer Review).
- The organizer may change **price and quantity** of a recorded purchase, and **send the requisition back to Items
  Bought** (optionally removing purchases so the buyer records them again). Vendor and receipts are view-only.
- When the organizer recorded any of the purchases himself, his review always needs the PO Admin's approval, even with
  no change (nobody approves what they bought).
- The marked-buyer approval (migration 316) is **folded in** and removed (separate commit). Production: 0 marked
  users, 0 flagged purchases, 0 waiting.
- The review is **always shown** after Items Bought, even when nothing was bought. A requisition that skips Items Bought
  altogether (approved -> sourcing, all covered from stock) is unchanged: there is no Items Bought step to follow.

## Mine (to confirm)
- Approver = PO Admin position holders and procurement admins, never the organizer himself.
- New statuses `organizer_review`, `review_approval`; both cancellable; the fork of child POs moves from Finish Buying to
  Confirm / Approve. Finish Buying (action `finish_buying`) now means "buying is finished, moves to Organizer Review".
- Send back to Items Bought may remove no purchase at all (then the buyers just fix a receipt and press Finish Buying).
- Over-tolerance: an edit re-judges it; approving signs off what the edit brought back.

## Checklist
- [x] 1. Migration 329, workflow package, gateway mutations, queue, notifications (+ worker), tests (39 + the older files; 24 mutations killed)
- [x] 2. Web: status labels / phases, review panel, action bar in a bottom slot, My Queue, tests, translations en + ar (55 tests; 34 mutations killed)
- [x] 3. Remove the marked-buyer approval (server, worker, web, tests, translations); table and columns left in place, unused
- [x] 4. Playbook #115, domain rules, this plan
- [ ] 5. Verify in a browser (the user), then deploy: migration 329 is forward-only; apply to dev and test (done locally), production through the pipeline

## Open / not done
- The progress bar still shows one "Buy" phase for items bought, the review, the approval and sourcing.
- No reminder when an organizer leaves a review waiting (median 31 hours at Items Bought today).
- Dropping `user_purchase_review_marks` and the three columns of `po_line_purchases` (migration 316) in a later migration.
