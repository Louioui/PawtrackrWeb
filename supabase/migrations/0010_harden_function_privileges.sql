-- Keep trigger helpers out of Data API RPC access and make name resolution
-- deterministic for functions that run with elevated privileges.
ALTER FUNCTION public.sync_pet_business_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_transaction_business_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_staff_payroll_ledger(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.complete_atomic_pos_checkout(uuid, uuid, numeric, numeric, numeric, numeric, text, text)
    SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.sync_pet_business_id(),
    public.sync_transaction_business_id(),
    public.assert_same_business_reference() FROM PUBLIC, anon, authenticated;

-- RLS policies invoke current_business_id() for both roles, so its EXECUTE
-- privilege remains available. A later schema revision should move that
-- helper outside the exposed API schema without breaking policy evaluation.
