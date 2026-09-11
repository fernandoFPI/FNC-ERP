-- G1 Phase 2 PR 5 — the completion evaluator's manual escape hatch:
-- closeRequisitionLine lets a supervisor mark one line resolved (stop
-- waiting on it) once the requisition has reached 'sourcing', for a case
-- the automatic checks can't resolve on their own — a Store Out that will
-- never be confirmed (stock turned out damaged/miscounted), or a forked
-- child line whose parent PO is stuck with nobody formally cancelling it.
-- Distinct from po_lines.short_marked_at (migration 264), which is an
-- items_bought-stage concept blocking further purchases on a line — this
-- is a sourcing-stage concept the completion evaluator treats as resolved
-- regardless of the line's normal resolution rule (from-stock qty fully
-- issued, or its child PO reaching a terminal status).

BEGIN;

ALTER TABLE po_lines
  ADD COLUMN closed_at TIMESTAMPTZ,
  ADD COLUMN closed_reason TEXT,
  ADD COLUMN closed_by UUID REFERENCES users(id);

COMMIT;
