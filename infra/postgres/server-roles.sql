-- BasaManager database roles for STAGING and PROD (the VM). Unlike postgres/init/01-roles.sql (dev/test, public
-- passwords) the passwords here are generated, per environment, and arrive as psql variables:
--   app_pw, worker_pw, readonly_pw, owner_pw   (deploy.sh pipes `\set` lines in front of this file, over stdin)
-- Idempotent: safe on every deploy. It also re-applies the passwords, so rotating one is "change the secret, deploy".
-- The V4 migration 0001_roles.sql builds on top of this and never sets passwords.

SELECT format('CREATE ROLE bm_app LOGIN NOBYPASSRLS PASSWORD %L', :'app_pw')
  WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bm_app') \gexec
SELECT format('CREATE ROLE bm_worker LOGIN BYPASSRLS PASSWORD %L', :'worker_pw')
  WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bm_worker') \gexec
SELECT format('CREATE ROLE bm_readonly LOGIN PASSWORD %L', :'readonly_pw')
  WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bm_readonly') \gexec

SELECT format('ALTER ROLE bm_app LOGIN NOBYPASSRLS PASSWORD %L', :'app_pw') \gexec
SELECT format('ALTER ROLE bm_worker LOGIN BYPASSRLS PASSWORD %L', :'worker_pw') \gexec
SELECT format('ALTER ROLE bm_readonly LOGIN PASSWORD %L', :'readonly_pw') \gexec

-- The postgres image reads POSTGRES_PASSWORD only when it first creates the data directory, so a rotated owner
-- password has to be applied here (migrations connect over TCP with it).
SELECT format('ALTER ROLE bm_owner PASSWORD %L', :'owner_pw') \gexec

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

SELECT format('GRANT CONNECT ON DATABASE %I TO bm_app, bm_worker, bm_readonly', current_database()) \gexec
GRANT USAGE ON SCHEMA public TO bm_app, bm_worker, bm_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE bm_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bm_app, bm_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE bm_owner IN SCHEMA public
  GRANT SELECT ON TABLES TO bm_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE bm_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO bm_app, bm_worker;
