-- btree_gist supplies GiST equality for UUIDs in the reservation exclusion
-- constraint. Keep extension-owned functions and operators out of public.
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION btree_gist SET SCHEMA extensions;
