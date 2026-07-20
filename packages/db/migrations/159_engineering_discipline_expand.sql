-- Migration 159: Expand engineering document disciplines
-- Adds HVAC, Plumbing, Sewerage, Water Supply, Storm Water, Fire Fighting,
-- Telecommunications, ICT, Process, HSE Engineering, QA/QC, Document Control.

ALTER TABLE engineering_documents
  DROP CONSTRAINT IF EXISTS engineering_documents_discipline_check;

ALTER TABLE engineering_documents
  ADD CONSTRAINT engineering_documents_discipline_check
  CHECK (discipline IN (
    'civil', 'structural', 'architectural',
    'mechanical', 'hvac', 'plumbing', 'sewerage', 'water_supply', 'storm_water', 'fire_fighting',
    'electrical', 'ist', 'telecommunications', 'ict', 'process',
    'hse_eng', 'qa_qc', 'document_control', 'others'
  ));
