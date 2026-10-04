-- 'direct_supply' — a project type that skips the whole tender flow
-- (enquiry/scope review/bidding/client approval) and is created straight
-- into execution, same end state approveRFQ normally produces after an
-- RFQ is won. See createRFQ in resolvers.ts.
ALTER TABLE projects DROP CONSTRAINT projects_project_type_check;

ALTER TABLE projects ADD CONSTRAINT projects_project_type_check
  CHECK (project_type IN (
    'construction', 'epc', 'manufacturing', 'rental', 'internal',
    'supply', 'direct_supply', 'services', 'fabrication', 'manpower_supply', 'operation_maintenance'
  ));
