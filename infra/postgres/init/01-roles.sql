-- BasaManager local roles for the DEV and TEST databases.
-- !! The passwords below are DEV/TEST ONLY and are public in this repo. !!
-- Staging and production get generated passwords in task V3; never reuse these there.
--
-- Runs once on first start of the Postgres container (docker-entrypoint-initdb.d) against
-- POSTGRES_DB (basamanager_dev in compose.dev.yml, basamanager_test in compose.test.yml),
-- which is already owned by the superuser bm_owner. CI runs the same file with psql.
-- Idempotent: safe to run twice. The V4 migration 0001_roles.sql builds on top of this.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bm_app') THEN
    CREATE ROLE bm_app LOGIN NOBYPASSRLS PASSWORD 'bm_app_dev';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bm_worker') THEN
    CREATE ROLE bm_worker LOGIN BYPASSRLS PASSWORD 'bm_worker_dev';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bm_readonly') THEN
    CREATE ROLE bm_readonly LOGIN PASSWORD 'bm_readonly_dev';
  END IF;
END
$$;

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Connect rights on the current database, usage on public, and default privileges for
-- tables/sequences that bm_owner (the migration role) creates later.
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO bm_app, bm_worker, bm_readonly', current_database());
END
$$;
GRANT USAGE ON SCHEMA public TO bm_app, bm_worker, bm_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE bm_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bm_app, bm_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE bm_owner IN SCHEMA public
  GRANT SELECT ON TABLES TO bm_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE bm_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO bm_app, bm_worker;
