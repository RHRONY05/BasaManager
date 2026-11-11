-- 0006 payment_intents_lookup: helper functions to lookup payment intents across orgs by global tran_id or find stale intents.
-- payment_intents has org_isolation RLS. Webhook IPN, browser return callbacks, and worker recheck jobs
-- receive/scan global transactions without an initial org context and need to resolve the owning org_id
-- before executing tenant-scoped transactions.

CREATE OR REPLACE FUNCTION app_find_payment_intent_by_tran_id(p_tran_id text)
RETURNS TABLE (
  id uuid,
  org_id uuid,
  lease_id uuid,
  tran_id text,
  amount_poisha bigint,
  status payment_intent_status,
  session_key text,
  val_id text,
  payment_id uuid,
  created_by uuid,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT i.id, i.org_id, i.lease_id, i.tran_id, i.amount_poisha, i.status,
         i.session_key, i.val_id, i.payment_id, i.created_by, i.created_at
    FROM public.payment_intents i
   WHERE i.tran_id = p_tran_id;
$$;

REVOKE ALL ON FUNCTION app_find_payment_intent_by_tran_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_find_payment_intent_by_tran_id(text) TO bm_app;
GRANT EXECUTE ON FUNCTION app_find_payment_intent_by_tran_id(text) TO bm_worker;

CREATE OR REPLACE FUNCTION app_find_stale_payment_intents(p_cutoff_minutes int)
RETURNS TABLE (
  id uuid,
  org_id uuid,
  lease_id uuid,
  tran_id text,
  amount_poisha bigint,
  status payment_intent_status,
  session_key text,
  val_id text,
  payment_id uuid,
  created_by uuid,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT i.id, i.org_id, i.lease_id, i.tran_id, i.amount_poisha, i.status,
         i.session_key, i.val_id, i.payment_id, i.created_by, i.created_at
    FROM public.payment_intents i
   WHERE i.status = 'initiated'
     AND i.created_at <= (now() - (p_cutoff_minutes || ' minutes')::interval);
$$;

REVOKE ALL ON FUNCTION app_find_stale_payment_intents(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_find_stale_payment_intents(int) TO bm_app;
GRANT EXECUTE ON FUNCTION app_find_stale_payment_intents(int) TO bm_worker;
