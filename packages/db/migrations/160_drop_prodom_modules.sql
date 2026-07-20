-- Migration 160: Drop PRODOM modules no longer needed
-- Removes: Engineering Transmittals, CDRs, Interfaces, Submittals (including Execution submittals).
-- TQs (project_tqs) are kept — they power the Clarifications Bid section.
-- Punch items, punch photos are kept — they remain in Execution.

DROP TABLE IF EXISTS project_submittal_revisions CASCADE;
DROP TABLE IF EXISTS project_submittals CASCADE;
DROP TABLE IF EXISTS project_interface_actions CASCADE;
DROP TABLE IF EXISTS project_interfaces CASCADE;
DROP TABLE IF EXISTS project_cdr_approvals CASCADE;
DROP TABLE IF EXISTS project_cdrs CASCADE;
DROP TABLE IF EXISTS project_eng_transmittal_items CASCADE;
DROP TABLE IF EXISTS project_eng_transmittals CASCADE;
