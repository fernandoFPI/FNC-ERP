-- An extra layer of approval on the Items Bought step. An admin can mark users whose purchases must be approved by the
-- requisition's organizer before the requisition continues (it stays in Items Bought, and Finish Buying waits).
--
-- The mark is a row per (company, user) rather than a flag on user_company_roles (that table has one row per user,
-- company AND module) or a PO position (positions belong to employees and come from a fixed list), so it works for a
-- procurement position holder and for a normal user alike.
CREATE TABLE user_purchase_review_marks (
  company_id UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  marked_by  UUID                 REFERENCES users(id)     ON DELETE SET NULL,
  marked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, user_id)
);

-- Whether a purchase needs the approval is decided when it is recorded (the buyer's mark at that moment), so marking
-- or un-marking a user later never traps or frees a purchase that already exists. Existing rows default to false.
-- organizer_approved_by is the organizer, or an admin acting for him; it is never the buyer.
ALTER TABLE po_line_purchases
  ADD COLUMN needs_organizer_approval BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN organizer_approved_by    UUID                 REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN organizer_approved_at    TIMESTAMPTZ;
