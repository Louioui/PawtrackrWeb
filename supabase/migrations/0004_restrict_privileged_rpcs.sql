-- These SECURITY DEFINER functions bypass caller RLS. Until request-scoped
-- authorization is implemented in the functions, only the trusted server role
-- may invoke them. PostgreSQL grants new functions to PUBLIC by default.
REVOKE ALL ON FUNCTION public.get_staff_payroll_ledger(uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_payroll_ledger(uuid)
    TO service_role;

REVOKE ALL ON FUNCTION public.complete_atomic_pos_checkout(
    uuid, uuid, numeric, numeric, numeric, numeric, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_atomic_pos_checkout(
    uuid, uuid, numeric, numeric, numeric, numeric, text, text
) TO service_role;
