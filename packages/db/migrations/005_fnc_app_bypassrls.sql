-- fnc_app is the sole application role. RLS remains enabled as defence-in-depth
-- against direct DB access (psql, BI tools, etc.).
-- The application enforces company isolation via withTransaction() context vars;
-- BYPASSRLS lets system-level queries (auth lookups, session checks) work without
-- a pre-established session context.
ALTER ROLE fnc_app BYPASSRLS;
