-- Add optional description field to document attachments
ALTER TABLE document_attachments ADD COLUMN IF NOT EXISTS description TEXT;
