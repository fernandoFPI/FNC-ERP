-- Migration 251: Asset depreciation now posts as draft, not posted, immediately
-- The monthly depreciation job used to create its journal entry as 'posted'
-- directly, with no human review. It now creates a 'draft' entry — the same
-- entry the manual "New Journal Entry" flow already produces — and someone
-- must explicitly post it via the existing postJournalEntry mutation.
-- asset_depreciation_schedule.status needs a matching 'draft' value so it
-- doesn't misreport an unposted entry as already posted.

ALTER TABLE asset_depreciation_schedule DROP CONSTRAINT asset_depreciation_schedule_status_check;
ALTER TABLE asset_depreciation_schedule ADD CONSTRAINT asset_depreciation_schedule_status_check
  CHECK (status IN ('pending','posted','skipped','draft'));
