-- Migration 144: Engineering Documents — Review Metadata & Industry-Standard Status Codes
-- Adds originator/checker/approver metadata, purpose_of_issue, and expands status to
-- include IFA/IFR/IFI/IFC/AFC alongside legacy values for backward compatibility.

ALTER TABLE engineering_documents
  ADD COLUMN IF NOT EXISTS originator_name  VARCHAR(255),
  ADD COLUMN IF NOT EXISTS checker_name     VARCHAR(255),
  ADD COLUMN IF NOT EXISTS approver_name    VARCHAR(255),
  ADD COLUMN IF NOT EXISTS purpose_of_issue VARCHAR(10);

-- Widen status constraint to include industry-standard codes while keeping legacy values
ALTER TABLE engineering_documents DROP CONSTRAINT IF EXISTS engineering_documents_status_check;

ALTER TABLE engineering_documents ADD CONSTRAINT engineering_documents_status_check
  CHECK (status IN (
    -- Industry-standard issue codes
    'draft',          -- Internal working copy, not yet issued
    'IFA',            -- Issued for Approval
    'IFR',            -- Issued for Review
    'IFI',            -- Issued for Information
    'IFC',            -- Issued for Construction
    'AFC',            -- Approved for Construction
    -- Terminal states
    'as_built',       -- Final as-built record
    'superseded',     -- Replaced by a newer revision
    'cancelled',      -- Voided / withdrawn
    -- Legacy values (kept for backward compatibility with existing records)
    'preliminary', 'for_review', 'for_construction'
  ));

COMMENT ON COLUMN engineering_documents.purpose_of_issue IS
  'Reason for issue: IFA=Issued for Approval, IFR=Issued for Review, IFI=Issued for Information, IFC=Issued for Construction, AFC=Approved for Construction, IFT=Issued for Tender';

COMMENT ON COLUMN engineering_documents.originator_name IS
  'Name of the person/company who produced the document';

COMMENT ON COLUMN engineering_documents.checker_name IS
  'Name of the person who checked the document for technical accuracy';

COMMENT ON COLUMN engineering_documents.approver_name IS
  'Name of the person who gave final approval for issue';
