-- Migration 165: Add 'bidding' status to engineering documents
-- Allows as-built documents to be moved into a bidding package

ALTER TABLE engineering_documents DROP CONSTRAINT IF EXISTS engineering_documents_status_check;

ALTER TABLE engineering_documents ADD CONSTRAINT engineering_documents_status_check
  CHECK (status IN (
    -- Track 1: Internal
    'draft', 'under_check', 'under_approval', 'ready_to_issue',
    -- Track 2: Client submission
    'IFA', 'IFR', 'IFI', 'IFC',
    -- Client response outcomes
    'AFC', 'approved_with_comments', 'acknowledged',
    -- Terminal / lifecycle
    'as_built', 'bidding', 'superseded', 'cancelled',
    -- Legacy
    'preliminary', 'for_review', 'for_construction'
  ));
