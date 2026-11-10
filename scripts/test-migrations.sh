#!/usr/bin/env bash
set -euo pipefail

temp_dir=$(mktemp -d /tmp/pawtrackr-migrations.XXXXXX)
cleanup() {
  pg_ctl -D "$temp_dir/data" stop -m immediate >/dev/null 2>&1 || true
  rm -r "$temp_dir"
}
trap cleanup EXIT

initdb -D "$temp_dir/data" -A trust -U postgres --no-instructions >/dev/null
pg_ctl -D "$temp_dir/data" -o "-h '' -k '$temp_dir'" -l "$temp_dir/postgres.log" start >/dev/null
export PGHOST="$temp_dir" PGUSER=postgres PGDATABASE=postgres
createdb pawtrackr_test
export PGDATABASE=pawtrackr_test

# Minimal Supabase catalog fixture. This tests PostgreSQL SQL and RLS grants;
# the real Supabase storage/auth implementation needs project-level QA.
psql -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id text primary key, name text, public boolean);
CREATE TABLE storage.objects (id bigint generated always as identity primary key, bucket_id text, name text);
CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT string_to_array($1, '/')
$$;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public, auth, storage TO authenticated, anon;
SQL

for migration in supabase/migrations/*.sql; do
  psql -v ON_ERROR_STOP=1 -q -1 -f "$migration"
  printf 'Applied %s\n' "$(basename "$migration")"
done

psql -v ON_ERROR_STOP=1 -q <<'SQL'
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT SELECT ON public.businesses, public.business_configs TO anon;
GRANT SELECT ON storage.objects TO authenticated, anon;
INSERT INTO storage.objects (bucket_id, name) VALUES
  ('grooming-photos', '11111111-1111-4111-8111-111111111111/pet-a/after.jpg'),
  ('grooming-photos', '22222222-2222-4222-8222-222222222222/pet-b/after.jpg');
DO $$ BEGIN
  IF (SELECT public FROM storage.buckets WHERE id = 'grooming-photos') THEN
    RAISE EXCEPTION 'Grooming photo bucket is public';
  END IF;
END $$;
INSERT INTO public.businesses (id, name, slug, owner_email) VALUES
  ('11111111-1111-4111-8111-111111111111', 'A', 'a', 'a@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'B', 'b', 'b@example.test');
INSERT INTO public.business_configs (business_id) VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');
UPDATE public.business_configs
SET custom_settings = jsonb_build_object('packages', jsonb_build_array(jsonb_build_object('name', 'Bath')))
WHERE business_id = '11111111-1111-4111-8111-111111111111';
DO $$ BEGIN
  IF (SELECT packages FROM public.booking_public_catalog
      WHERE business_id = '11111111-1111-4111-8111-111111111111')
      <> '[{"name":"Bath"}]'::jsonb THEN
    RAISE EXCEPTION 'Public booking catalog did not refresh';
  END IF;
END $$;
INSERT INTO public.staff_members (business_id, auth_user_id, name, role, is_active) VALUES
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000000', 'A Owner', 'owner', true),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-0000-4000-8000-000000000000', 'B Owner', 'owner', false);
INSERT INTO public.clients (id, business_id, name, phone) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'A Client', '1'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'B Client', '2');
DO $$ BEGIN
  BEGIN
    INSERT INTO public.pets (business_id, client_id, name, breed) VALUES
      ('11111111-1111-4111-8111-111111111111',
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Wrong Tenant', 'Poodle');
    RAISE EXCEPTION 'Cross-business pet reference was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM = 'Cross-business pet reference was accepted' THEN RAISE; END IF;
  END;
END $$;
INSERT INTO public.pets (business_id, client_id, name, breed) VALUES
  ('11111111-1111-4111-8111-111111111111',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Valid Pet', 'Poodle');
INSERT INTO public.staff_members (id, business_id, name, role) VALUES
  ('aaaaaaaa-1111-4111-8111-111111111111',
   '11111111-1111-4111-8111-111111111111', 'Second Groomer', 'groomer');
INSERT INTO public.visits (id, business_id, client_id, pet_id, staff_id, service_package,
  total_amount, scheduled_time, duration_minutes, booking_buffer_minutes) VALUES
  ('aaaaaaaa-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   (SELECT id FROM public.pets WHERE name = 'Valid Pet'),
   (SELECT id FROM public.staff_members WHERE auth_user_id = 'aaaaaaaa-0000-4000-8000-000000000000'),
   'Bath', 40, '2030-01-01 09:00:00+00', 60, 15);
DO $$
DECLARE owner_staff uuid;
DECLARE pet uuid;
BEGIN
  SELECT id INTO owner_staff FROM public.staff_members
    WHERE auth_user_id = 'aaaaaaaa-0000-4000-8000-000000000000';
  SELECT id INTO pet FROM public.pets WHERE name = 'Valid Pet';
  IF (SELECT reservation_end FROM public.visits
      WHERE id = 'aaaaaaaa-2222-4222-8222-222222222222')
      <> '2030-01-01 10:15:00+00'::timestamptz THEN
    RAISE EXCEPTION 'Reservation end omitted the booking buffer';
  END IF;
  BEGIN
    INSERT INTO public.visits (business_id, client_id, pet_id, staff_id,
      service_package, total_amount, scheduled_time, duration_minutes)
    VALUES ('11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pet, owner_staff,
      'Overlap', 20, '2030-01-01 10:00:00+00', 30);
    RAISE EXCEPTION 'Overlapping groomer reservation was accepted';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;
  INSERT INTO public.visits (business_id, client_id, pet_id, staff_id,
    service_package, total_amount, scheduled_time, duration_minutes)
  VALUES ('11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pet, owner_staff,
    'Adjacent', 20, '2030-01-01 10:15:00+00', 30);
  INSERT INTO public.visits (business_id, client_id, pet_id, staff_id,
    service_package, total_amount, scheduled_time, duration_minutes)
  VALUES ('11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pet,
    'aaaaaaaa-1111-4111-8111-111111111111',
    'Other Groomer', 20, '2030-01-01 10:00:00+00', 30);
  INSERT INTO public.visits (business_id, client_id, pet_id, staff_id,
    service_package, total_amount, scheduled_time, duration_minutes, status)
  VALUES ('11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pet, owner_staff,
    'Canceled', 20, '2030-01-01 09:30:00+00', 30, 'cancelled');
  BEGIN
    UPDATE public.visits SET status = 'booked' WHERE service_package = 'Canceled';
    RAISE EXCEPTION 'Cancel-to-booked transition bypassed overlap constraint';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;
  UPDATE public.visits SET reservation_end = '2030-01-01 09:01:00+00'
    WHERE id = 'aaaaaaaa-2222-4222-8222-222222222222';
  IF (SELECT reservation_end FROM public.visits
      WHERE id = 'aaaaaaaa-2222-4222-8222-222222222222')
      <> '2030-01-01 10:15:00+00'::timestamptz THEN
    RAISE EXCEPTION 'Caller could shorten the protected reservation range';
  END IF;
  BEGIN
    INSERT INTO public.transactions (business_id, visit_id, subtotal, discount, tax, tip, amount, payment_method, status)
    VALUES ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-2222-4222-8222-222222222222',
      40.00, 0.00, 3.00, 5.00, 99.99, 'card', 'completed');
    RAISE EXCEPTION 'Unbalanced transaction amount was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM = 'Unbalanced transaction amount was accepted' THEN RAISE; END IF;
  END;
  INSERT INTO public.transactions (business_id, visit_id, subtotal, discount, tax, tip, amount, payment_method, status)
  VALUES ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-2222-4222-8222-222222222222',
    40.00, 0.00, 3.00, 5.00, 48.00, 'card', 'completed');
  BEGIN
    INSERT INTO public.transactions (business_id, visit_id, subtotal, discount, tax, tip, amount, payment_method, status)
    VALUES ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-2222-4222-8222-222222222222',
      40.00, 0.00, 3.00, 5.00, 48.00, 'card', 'completed');
    RAISE EXCEPTION 'Duplicate completed checkout for visit was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000000', false);
SELECT set_config('request.jwt.claims',
  '{"app_metadata":{"business_id":"11111111-1111-4111-8111-111111111111"}}', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.clients) <> 1 THEN
    RAISE EXCEPTION 'Client tenant isolation failed';
  END IF;
  INSERT INTO public.visits (business_id, client_id, pet_id, staff_id,
    service_package, total_amount, scheduled_time, duration_minutes)
  VALUES ('11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    (SELECT id FROM public.pets WHERE name = 'Valid Pet'),
    (SELECT id FROM public.staff_members WHERE auth_user_id = 'aaaaaaaa-0000-4000-8000-000000000000'),
    'Authenticated Booking', 20, '2030-01-02 09:00:00+00', 60);
  IF (SELECT count(*) FROM public.businesses) <> 1 OR
     (SELECT count(*) FROM public.business_configs) <> 1 THEN
    RAISE EXCEPTION 'Staff business/config tenant isolation failed';
  END IF;
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id = 'grooming-photos') <> 1 THEN
    RAISE EXCEPTION 'Photo tenant isolation failed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN information_schema.columns col
      ON col.table_schema = n.nspname AND col.table_name = c.relname
    WHERE n.nspname = 'public' AND col.column_name = 'business_id'
      AND c.relkind = 'r' AND NOT c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Tenant table without RLS';
  END IF;
  IF has_function_privilege('authenticated', 'public.get_staff_payroll_ledger(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Payroll RPC is callable by authenticated users';
  END IF;
  IF has_function_privilege('authenticated', 'public.sync_pet_business_id()', 'EXECUTE') OR
     has_function_privilege('anon', 'public.assert_same_business_reference()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Trigger helper is callable as an API RPC';
  END IF;
  IF has_function_privilege('authenticated',
    'public.complete_atomic_pos_checkout(uuid,uuid,numeric,numeric,numeric,numeric,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Checkout RPC is callable by authenticated users';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.get_staff_payroll_ledger(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Payroll RPC is unavailable to trusted server role';
  END IF;
  BEGIN
    INSERT INTO public.clients (business_id, name, phone) VALUES
      ('22222222-2222-4222-8222-222222222222', 'Forbidden', '3');
    RAISE EXCEPTION 'Cross-business client insert was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;
SELECT set_config('request.jwt.claims',
  '{"app_metadata":{"business_id":"22222222-2222-4222-8222-222222222222"}}', false);
DO $$ BEGIN
  IF private.current_business_id() IS NOT NULL OR (SELECT count(*) FROM public.clients) <> 0 THEN
    RAISE EXCEPTION 'Mismatched tenant claim was accepted';
  END IF;
END $$;
SELECT set_config('request.jwt.claims', '{}', false);
SELECT set_config('request.jwt.claim.sub', '', false);
DO $$ BEGIN
  IF private.current_business_id() IS NOT NULL OR (SELECT count(*) FROM public.clients) <> 0 THEN
    RAISE EXCEPTION 'Missing staff identity was accepted';
  END IF;
END $$;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000000', false);
DO $$ BEGIN
  IF private.current_business_id() IS NOT NULL OR (SELECT count(*) FROM public.clients) <> 0 THEN
    RAISE EXCEPTION 'Inactive staff identity was accepted';
  END IF;
END $$;
RESET ROLE;
SET ROLE anon;
SELECT set_config('request.jwt.claims', '{}', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.businesses) <> 0 OR
     (SELECT count(*) FROM public.business_configs) <> 0 THEN
    RAISE EXCEPTION 'Anonymous direct business/config access is allowed';
  END IF;
  IF (SELECT count(*) FROM public.booking_business_directory) <> 2 OR
     (SELECT count(*) FROM public.booking_service_catalog) <> 2 THEN
    RAISE EXCEPTION 'Public booking views are unavailable';
  END IF;
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id = 'grooming-photos') <> 0 THEN
    RAISE EXCEPTION 'Anonymous photo access is allowed';
  END IF;
END $$;
SQL
printf 'Migration execution and basic tenant/RPC checks passed.\n'
