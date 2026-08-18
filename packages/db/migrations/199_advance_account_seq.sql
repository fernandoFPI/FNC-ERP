-- Employee advance-control account codes were {parentCode}-{employee_number},
-- which could be long/inconsistent. Switch to a short, zero-padded,
-- per-company running counter instead: {parentCode}-01, {parentCode}-02, ...

ALTER TABLE system_configuration
  ADD COLUMN IF NOT EXISTS advance_control_next_seq INTEGER NOT NULL DEFAULT 1;

-- Renumber any advance-control accounts already created under the old
-- employee_number-based scheme, ordered by creation so the earliest keeps
-- the lowest number. Safe to rename — journal postings link by account id,
-- not by the code string.
WITH ranked AS (
  SELECT coa.id AS account_id, coa.company_id, coa.parent_id,
         ROW_NUMBER() OVER (PARTITION BY coa.parent_id ORDER BY coa.created_at) AS seq
  FROM chart_of_accounts coa
  JOIN employees e ON e.advance_control_account_id = coa.id
),
parent_codes AS (
  SELECT r.account_id, r.company_id, r.seq, p.code AS parent_code
  FROM ranked r
  JOIN chart_of_accounts p ON p.id = r.parent_id
)
UPDATE chart_of_accounts coa
   SET code = LEFT(pc.parent_code || '-' || LPAD(pc.seq::text, 2, '0'), 20)
  FROM parent_codes pc
 WHERE coa.id = pc.account_id;

-- Advance each company's counter past whatever just got assigned above, so
-- the next auto-created account continues without colliding.
UPDATE system_configuration sc
   SET advance_control_next_seq = sub.cnt + 1
  FROM (
    SELECT coa.company_id, COUNT(*) AS cnt
    FROM chart_of_accounts coa
    JOIN employees e ON e.advance_control_account_id = coa.id
    GROUP BY coa.company_id
  ) sub
 WHERE sc.company_id = sub.company_id;
