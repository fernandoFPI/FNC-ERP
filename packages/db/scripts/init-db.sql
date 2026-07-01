-- ── FNC ERP — Database Initialisation Script ─────────────────────────────────
-- Run ONCE as postgres superuser when setting up a fresh environment.
-- After this script, run: pnpm --filter @fnc-erp/db migrate && pnpm --filter @fnc-erp/db seed
--
-- Usage:
--   psql postgresql://postgres:admin@localhost:5432/postgres -f packages/db/scripts/init-db.sql
--   (or via npm: pnpm --filter @fnc-erp/db init-db)

-- ── Create application role ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fnc_app') THEN
    CREATE ROLE fnc_app WITH LOGIN PASSWORD 'dev_password_change_in_prod' SUPERUSER BYPASSRLS;
    RAISE NOTICE 'Role fnc_app created as superuser.';
  ELSE
    ALTER ROLE fnc_app SUPERUSER BYPASSRLS;
    RAISE NOTICE 'Role fnc_app already exists — ensured SUPERUSER + BYPASSRLS.';
  END IF;
END $$;

-- ── Create databases ──────────────────────────────────────────────────────────
SELECT 'CREATE DATABASE fnc_erp_dev  OWNER fnc_app'  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'fnc_erp_dev')  \gexec
SELECT 'CREATE DATABASE fnc_erp_test OWNER fnc_app'  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'fnc_erp_test') \gexec

\echo 'init-db.sql complete. Now run: pnpm --filter @fnc-erp/db migrate'
