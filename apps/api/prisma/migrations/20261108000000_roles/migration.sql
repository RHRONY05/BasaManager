-- 0001 roles (03-DATABASE.md "Database roles"). Hand-written, idempotent, runs as bm_owner.
--
-- Every fresh database needs this (tests create one per run; staging/prod run it once via
-- `prisma migrate deploy`). Roles are cluster-wide and created WITHOUT passwords here: passwords are set
-- per environment by infra/postgres/init/01-roles.sql (dev/test) or by DevOps (staging/prod).
-- Extensions, schema usage and default privileges are per database, so they live here too.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bm_app') THEN
    CREATE ROLE bm_app LOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bm_worker') THEN
    CREATE ROLE bm_worker LOGIN BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bm_readonly') THEN
    CREATE ROLE bm_readonly LOGIN NOBYPASSRLS;
  END IF;
  -- Re-assert the security-relevant attributes when we are allowed to (superuser only).
  IF (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    ALTER ROLE bm_app NOSUPERUSER NOBYPASSRLS;
    ALTER ROLE bm_worker NOSUPERUSER BYPASSRLS;
    ALTER ROLE bm_readonly NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO bm_app, bm_worker, bm_readonly', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO bm_app, bm_worker, bm_readonly;

-- Tables, views and sequences that bm_owner creates from now on. The history tables lose DELETE and the
-- outbox loses SELECT/UPDATE/DELETE for bm_app in migration 20261108000300.
ALTER DEFAULT PRIVILEGES FOR ROLE bm_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bm_app, bm_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE bm_owner IN SCHEMA public
  GRANT SELECT ON TABLES TO bm_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE bm_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO bm_app, bm_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE bm_owner IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO bm_readonly;
