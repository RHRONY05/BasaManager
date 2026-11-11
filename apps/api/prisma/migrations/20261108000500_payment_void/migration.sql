-- 0005 payment_void: app_void_payment function for Rule 6 payment voiding.
-- bm_app has NO DELETE grant on history tables (payments, bill_lines, payment_allocations, receipts, credit_entries)
-- to enforce auditability. When a landlord voids a payment, its allocations must be removed and any associated
-- overpayment credit reversed/deleted in the same transaction.
-- This SECURITY DEFINER function runs as bm_owner to perform the delete securely within the tenant's org.

CREATE OR REPLACE FUNCTION app_void_payment(
  p_org_id uuid,
  p_payment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session_org_id uuid;
BEGIN
  -- Verify the session's app.org_id matches p_org_id to prevent cross-tenant invocation
  v_session_org_id := nullif(current_setting('app.org_id', true), '')::uuid;
  IF v_session_org_id IS NULL OR v_session_org_id <> p_org_id THEN
    RAISE EXCEPTION 'Unauthorized: org_id mismatch' USING ERRCODE = '42501';
  END IF;

  -- Verify payment belongs to this org and is confirmed
  IF NOT EXISTS (
    SELECT 1 FROM public.payments
     WHERE id = p_payment_id AND org_id = p_org_id AND status = 'confirmed'
  ) THEN
    RAISE EXCEPTION 'Payment not found or not eligible for voiding' USING ERRCODE = 'P0002';
  END IF;

  -- Delete allocations for this payment
  DELETE FROM public.payment_allocations
   WHERE org_id = p_org_id AND payment_id = p_payment_id;

  -- Delete overpayment credit created by this payment
  DELETE FROM public.credit_entries
   WHERE org_id = p_org_id AND payment_id = p_payment_id AND kind = 'overpayment';
END;
$$;

REVOKE ALL ON FUNCTION app_void_payment(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_void_payment(uuid, uuid) TO bm_app;
