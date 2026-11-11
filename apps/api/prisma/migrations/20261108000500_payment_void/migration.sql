-- 0005 payment_void: app_void_payment function for Rule 6 payment voiding.
-- bm_app has NO DELETE grant on history tables (payments, bill_lines, payment_allocations, receipts, credit_entries)
-- to enforce auditability. When a landlord voids a payment, its allocations must be removed and any associated
-- overpayment credit reversed/deleted in the same transaction.
-- This SECURITY DEFINER function runs as bm_owner to perform the delete securely within the tenant's org.

CREATE OR REPLACE FUNCTION app_void_payment(
  p_org_id uuid,
  p_payment_id uuid,
  p_unwound_bill_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_delete_credit_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Delete allocations for this payment
  DELETE FROM public.payment_allocations
   WHERE org_id = p_org_id AND payment_id = p_payment_id;

  -- Delete overpayment credit created by this payment
  DELETE FROM public.credit_entries
   WHERE org_id = p_org_id AND payment_id = p_payment_id;

  -- Delete applied credit entries for unwound bills
  IF array_length(p_unwound_bill_ids, 1) > 0 THEN
    DELETE FROM public.credit_entries
     WHERE org_id = p_org_id AND bill_id = ANY(p_unwound_bill_ids) AND kind = 'applied';
  END IF;

  -- Delete any specific credit entries
  IF array_length(p_delete_credit_ids, 1) > 0 THEN
    DELETE FROM public.credit_entries
     WHERE org_id = p_org_id AND id = ANY(p_delete_credit_ids);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION app_void_payment(uuid, uuid, uuid[], uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_void_payment(uuid, uuid, uuid[], uuid[]) TO bm_app;
