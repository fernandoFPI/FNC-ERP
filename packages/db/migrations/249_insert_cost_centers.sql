-- Migration 248: Insert the FNC cost center list into each company (17 x 3 = 51 rows)
-- Source: FNC_ERP_Chart_of_Accounts_v1.xlsx, sheet "مراكز الكلفة".
-- The draft classifies cost centers as direct/indirect/both (cost
-- attribution), a different axis than the existing department/project/
-- entity/overhead enum (organizational type) — widening rather than
-- reusing, since forcing one onto the other would misrepresent the data.

ALTER TABLE cost_centers DROP CONSTRAINT cost_centers_type_check;
ALTER TABLE cost_centers ADD CONSTRAINT cost_centers_type_check
  CHECK (type IN ('department','project','entity','overhead','direct','indirect','both'));

CREATE TEMP TABLE tmp_cost_centers_import AS
SELECT * FROM jsonb_to_recordset('[{"code":"CC-100","name":"General Management","type":"indirect"},{"code":"CC-110","name":"Finance and Accounting","type":"indirect"},{"code":"CC-120","name":"HR and Administration","type":"indirect"},{"code":"CC-130","name":"Procurement and Contracts","type":"indirect"},{"code":"CC-140","name":"Information Technology","type":"indirect"},{"code":"CC-200","name":"Engineering and Design","type":"both"},{"code":"CC-210","name":"Civil Works","type":"direct"},{"code":"CC-220","name":"Structural and Steel Works","type":"direct"},{"code":"CC-230","name":"Electrical Works","type":"direct"},{"code":"CC-240","name":"Mechanical and MEP","type":"direct"},{"code":"CC-250","name":"Security and ELV","type":"direct"},{"code":"CC-260","name":"Pipeline Works","type":"direct"},{"code":"CC-270","name":"Prefab and Factory","type":"direct"},{"code":"CC-280","name":"HSE","type":"both"},{"code":"CC-290","name":"QA QC","type":"both"},{"code":"CC-300","name":"Warehousing and Logistics","type":"both"},{"code":"CC-310","name":"Workshop and Maintenance","type":"both"}]'::jsonb)
  AS x(code text, name text, type text);

INSERT INTO cost_centers (company_id, code, name, type, is_active)
SELECT co.id, t.code, t.name, t.type, true
FROM companies co
CROSS JOIN tmp_cost_centers_import t
WHERE co.name IN ('Nishtimani Yakam', 'Nishtimani Factory', 'Al Watanyia');

DROP TABLE tmp_cost_centers_import;
