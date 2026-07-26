-- Migration 175: Backfill lifecycle config for companies created after migration 166.
-- 166's seed only covered companies that existed at the time it ran; the
-- company-creation endpoint was never updated to seed new companies going
-- forward, so any company created since has an empty Project Lifecycle
-- settings page. This repeats 166's seed for every company still missing it.

INSERT INTO lifecycle_phases (company_id, key, label, sequence, optional)
SELECT c.id, p.key, p.label, p.sequence, p.optional
FROM companies c
CROSS JOIN (VALUES
  ('enquiry',         'Client Enquiry',  1, false),
  ('scope_review',    'Scope Review',    2, false),
  ('bidding',         'Bidding',         3, false),
  ('client_approval', 'Client Approval', 4, false),
  ('execution',       'Execution',       5, false),
  ('closeout',        'Closeout',        6, false)
) AS p(key, label, sequence, optional)
ON CONFLICT (company_id, key) DO NOTHING;

INSERT INTO lifecycle_phase_modules (company_id, module_key, min_phase_key, sequence)
SELECT c.id, m.module_key, m.min_phase_key, m.sequence
FROM companies c
CROSS JOIN (VALUES
  ('overview',         'enquiry',      1),
  ('client_documents', 'enquiry',      2),
  ('rfq_lines',        'scope_review', 3),
  ('bidding',          'enquiry',      4),
  ('contracts',        'bidding',      5),
  ('engineering',      'scope_review', 6),
  ('execution',        'execution',    7),
  ('handover',         'execution',    8),
  ('procurement',      'scope_review', 9),
  ('cost_control',     'scope_review', 10),
  ('variation_orders', 'execution',    11),
  ('risk_register',    'scope_review', 12),
  ('meetings',         'scope_review', 13),
  ('attachments',      'enquiry',      14),
  ('team',             'enquiry',      15),
  ('history',          'enquiry',      16)
) AS m(module_key, min_phase_key, sequence)
ON CONFLICT (company_id, module_key) DO NOTHING;
