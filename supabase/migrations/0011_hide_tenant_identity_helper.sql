-- Existing policy expressions depend on the function OID, so moving the
-- function preserves their binding while removing it from the exposed public
-- API schema. The private schema is not listed as a Data API schema.
ALTER FUNCTION public.current_business_id() SET SCHEMA private;
REVOKE ALL ON FUNCTION private.current_business_id() FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.current_business_id() TO anon, authenticated;
