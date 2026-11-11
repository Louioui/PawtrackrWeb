#!/usr/bin/env bash
set -euo pipefail

# The socket path must stay short, so default to /tmp rather than $TMPDIR.
temp_dir=$(mktemp -d "${PAWTRACKR_TEST_TMPDIR:-/tmp}/pawtrackr-migrations.XXXXXX")
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
SET custom_settings = jsonb_build_object('packages', jsonb_build_array(jsonb_build_object('name', 'Bath')), 'time_zone', 'America/Los_Angeles')
WHERE business_id = '11111111-1111-4111-8111-111111111111';
DO $$ BEGIN
  IF (SELECT packages FROM public.booking_public_catalog
      WHERE business_id = '11111111-1111-4111-8111-111111111111')
      <> '[{"name":"Bath"}]'::jsonb THEN
    RAISE EXCEPTION 'Public booking catalog did not refresh';
  END IF;
  IF (SELECT time_zone FROM public.booking_service_catalog WHERE slug = 'a') <> 'America/Los_Angeles' THEN
    RAISE EXCEPTION 'Public booking catalog did not publish salon time zone';
  END IF;
END $$;
-- Reservations need usable hours; the catalog fixture above replaced them.
UPDATE public.business_configs
SET custom_settings = '{"packages":[{"name":"Bath"}],"operating_hours":{"open":"08:00","close":"18:00"},"booking_buffer_mins":15}'::jsonb
WHERE business_id = '11111111-1111-4111-8111-111111111111';
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
RESET ROLE;

-- 0016: salon operating hours and groomer shifts are enforced by the database.
CREATE FUNCTION pg_temp.expect_visit(label text, starts timestamptz, minutes integer, groomer uuid, expected text)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE got text := 'ok';
BEGIN
  BEGIN
    INSERT INTO public.visits (business_id, client_id, pet_id, staff_id,
      service_package, total_amount, scheduled_time, duration_minutes)
    VALUES ('11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      (SELECT id FROM public.pets WHERE name = 'Valid Pet'), groomer,
      label, 20, starts, minutes);
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE;
  END;
  IF got <> expected THEN
    RAISE EXCEPTION 'Availability case "%" returned % (expected %)', label, got, expected;
  END IF;
END $fn$;
DO $$
DECLARE second_groomer constant uuid := 'aaaaaaaa-1111-4111-8111-111111111111';
DECLARE salon constant uuid := '11111111-1111-4111-8111-111111111111';
DECLARE moved text;
BEGIN
  -- Default settings: 08:00-18:00, no zone (UTC).
  PERFORM pg_temp.expect_visit('Before open', '2030-02-01 07:00:00+00', 30, second_groomer, 'PW001');
  PERFORM pg_temp.expect_visit('Runs past close', '2030-02-01 17:30:00+00', 60, second_groomer, 'PW001');
  PERFORM pg_temp.expect_visit('Ends at close', '2030-02-01 17:00:00+00', 60, second_groomer, 'ok');
  PERFORM pg_temp.expect_visit('Unassigned outside hours', '2030-02-01 06:00:00+00', 30, NULL, 'PW001');

  -- History is never rejected.
  INSERT INTO public.visits (business_id, client_id, pet_id, staff_id,
    service_package, total_amount, scheduled_time, duration_minutes, status)
  VALUES (salon, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    (SELECT id FROM public.pets WHERE name = 'Valid Pet'), second_groomer,
    'Imported history', 20, '2020-02-01 03:00:00+00', 30, 'completed');

  -- Hours follow the salon's zone: 09:00 PST is 17:00 UTC.
  UPDATE public.business_configs SET custom_settings = custom_settings || '{"time_zone":"America/Los_Angeles"}'
    WHERE business_id = salon;
  PERFORM pg_temp.expect_visit('09:00 UTC is 01:00 local', '2030-02-04 09:00:00+00', 30, second_groomer, 'PW001');
  PERFORM pg_temp.expect_visit('09:00 local', '2030-02-04 17:00:00+00', 30, second_groomer, 'ok');

  -- A scheduled shift narrows that groomer's day; others keep salon hours.
  INSERT INTO public.staff_shifts (business_id, staff_id, shift_date, start_time, end_time, assigned_station, status)
  VALUES (salon, second_groomer, '2030-02-05', '09:00', '11:00', 'Bay 1', 'scheduled');
  PERFORM pg_temp.expect_visit('After shift', '2030-02-05 20:00:00+00', 30, second_groomer, 'PW002');
  PERFORM pg_temp.expect_visit('Spills past shift end', '2030-02-05 18:45:00+00', 30, second_groomer, 'PW002');
  PERFORM pg_temp.expect_visit('Inside shift', '2030-02-05 17:15:00+00', 60, second_groomer, 'ok');
  PERFORM pg_temp.expect_visit('Other groomer same time', '2030-02-05 20:00:00+00', 30,
    (SELECT id FROM public.staff_members WHERE auth_user_id = 'aaaaaaaa-0000-4000-8000-000000000000'), 'ok');

  -- Time off blocks the whole local day even beside a scheduled shift.
  INSERT INTO public.staff_shifts (business_id, staff_id, shift_date, start_time, end_time, assigned_station, status)
  VALUES (salon, second_groomer, '2030-02-06', '09:00', '17:00', 'Bay 1', 'scheduled'),
         (salon, second_groomer, '2030-02-06', '09:00', '17:00', 'Bay 1', 'time_off');
  PERFORM pg_temp.expect_visit('Time off', '2030-02-06 18:00:00+00', 30, second_groomer, 'PW002');

  -- A completed shift row does not grant availability.
  INSERT INTO public.staff_shifts (business_id, staff_id, shift_date, start_time, end_time, assigned_station, status)
  VALUES (salon, second_groomer, '2030-02-07', '09:00', '17:00', 'Bay 1', 'completed');
  PERFORM pg_temp.expect_visit('Completed shift only', '2030-02-07 18:00:00+00', 30, second_groomer, 'PW002');

  -- 02:30 does not exist on 2030-03-10 in Los Angeles, so the shift is unusable.
  INSERT INTO public.staff_shifts (business_id, staff_id, shift_date, start_time, end_time, assigned_station, status)
  VALUES (salon, second_groomer, '2030-03-10', '02:30', '12:00', 'Bay 1', 'scheduled');
  PERFORM pg_temp.expect_visit('Skipped DST shift start', '2030-03-10 16:00:00+00', 30, second_groomer, 'PW002');
  IF private.salon_local_instant('2030-03-10', '02:30', 'America/Los_Angeles') IS NOT NULL
     OR private.salon_local_instant('2030-11-03', '01:30', 'America/Los_Angeles') IS NOT NULL
     OR private.salon_local_instant('2030-11-03', '09:00', 'America/Los_Angeles')
        <> '2030-11-03 17:00:00+00'::timestamptz
     OR private.salon_local_instant('2030-11-03', '9:00', 'America/Los_Angeles') IS NOT NULL THEN
    RAISE EXCEPTION 'Salon local instant resolution is wrong around daylight-saving changes';
  END IF;

  -- Narrowing hours later must not strand a visit already on the books,
  -- but moving or reactivating one is rechecked.
  UPDATE public.business_configs
    SET custom_settings = jsonb_set(custom_settings, '{operating_hours}', '{"open":"12:00","close":"13:00"}')
    WHERE business_id = salon;
  UPDATE public.visits SET status = 'dropped_off' WHERE service_package = '09:00 local';
  UPDATE public.visits SET status = 'completed' WHERE service_package = '09:00 local';
  BEGIN
    UPDATE public.visits SET scheduled_time = '2030-02-04 18:00:00+00' WHERE service_package = 'Inside shift';
    RAISE EXCEPTION 'Reschedule outside narrowed hours was accepted';
  EXCEPTION WHEN SQLSTATE 'PW001' THEN NULL;
  END;
  BEGIN
    UPDATE public.visits SET status = 'booked' WHERE service_package = '09:00 local';
    RAISE EXCEPTION 'Reactivation outside narrowed hours was accepted';
  EXCEPTION WHEN SQLSTATE 'PW001' THEN NULL;
  END;

  -- Unusable settings reject instead of guessing.
  UPDATE public.business_configs SET custom_settings = custom_settings || '{"time_zone":"Mars/Phobos"}'
    WHERE business_id = salon;
  PERFORM pg_temp.expect_visit('Unknown zone', '2030-02-08 20:15:00+00', 30, second_groomer, 'PW003');
  UPDATE public.business_configs SET custom_settings = (custom_settings - 'operating_hours') || '{"time_zone":"UTC"}'
    WHERE business_id = salon;
  PERFORM pg_temp.expect_visit('Missing hours', '2030-02-08 12:15:00+00', 30, second_groomer, 'PW003');
  UPDATE public.business_configs
    SET custom_settings = custom_settings || '{"time_zone":"America/Los_Angeles","operating_hours":{"open":"08:00","close":"18:00"}}'
    WHERE business_id = salon;
END $$;

-- A signed-in staff member writing visits directly is held to the same rules,
-- and cannot call the private helpers.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000000', false);
DO $$ BEGIN
  BEGIN
    INSERT INTO public.visits (business_id, client_id, pet_id, staff_id,
      service_package, total_amount, scheduled_time, duration_minutes)
    VALUES ('11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      (SELECT id FROM public.pets WHERE name = 'Valid Pet'),
      'aaaaaaaa-1111-4111-8111-111111111111',
      'Direct write outside shift', 20, '2030-02-05 21:00:00+00', 30);
    RAISE EXCEPTION 'Direct authenticated write bypassed the groomer shift';
  EXCEPTION WHEN SQLSTATE 'PW002' THEN NULL;
  END;
  BEGIN
    PERFORM private.salon_local_instant('2030-02-05', '09:00', 'UTC');
    RAISE EXCEPTION 'Authenticated role can call private availability helpers';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

-- 0017: a signed-up user with no membership provisions exactly one salon.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-000000000000', false);
SELECT set_config('request.jwt.claims', '{"email":"new-owner@example.test"}', false);
DO $$
DECLARE salon uuid;
BEGIN
  IF private.current_business_id() IS NOT NULL THEN RAISE EXCEPTION 'New user already has a tenant'; END IF;
  BEGIN
    PERFORM public.provision_salon('New Salon', 'Bad Slug!', 'America/Chicago', 'New Owner');
    RAISE EXCEPTION 'Invalid slug was accepted';
  EXCEPTION WHEN SQLSTATE 'PW012' THEN NULL;
  END;
  BEGIN
    PERFORM public.provision_salon('New Salon', 'new-salon', 'Mars/Phobos', 'New Owner');
    RAISE EXCEPTION 'Unknown time zone was accepted';
  EXCEPTION WHEN SQLSTATE 'PW012' THEN NULL;
  END;
  BEGIN
    PERFORM public.provision_salon('Copycat', 'a', 'America/Chicago', 'New Owner');
    RAISE EXCEPTION 'Too-short slug was accepted';
  EXCEPTION WHEN SQLSTATE 'PW012' THEN NULL;
  END;
  salon := public.provision_salon('  New Salon  ', 'new-salon', 'America/Chicago', 'New Owner');
  IF private.current_business_id() IS DISTINCT FROM salon THEN
    RAISE EXCEPTION 'Provisioned owner was not bound to the new salon';
  END IF;
  IF (SELECT count(*) FROM public.businesses) <> 1
     OR (SELECT name || '|' || subscription_status || '|' || owner_email FROM public.businesses)
        <> 'New Salon|trialing|new-owner@example.test'
     OR (SELECT custom_settings ->> 'time_zone' FROM public.business_configs) <> 'America/Chicago'
     OR (SELECT custom_settings #>> '{operating_hours,open}' FROM public.business_configs) <> '08:00'
     OR (SELECT role FROM public.staff_members) <> 'owner' THEN
    RAISE EXCEPTION 'Provisioned salon rows are wrong or other tenants are visible';
  END IF;
  BEGIN
    PERFORM public.provision_salon('Second Salon', 'second-salon', 'America/Chicago', 'New Owner');
    RAISE EXCEPTION 'A member provisioned a second salon';
  EXCEPTION WHEN SQLSTATE 'PW011' THEN NULL;
  END;
END $$;
SELECT set_config('request.jwt.claim.sub', 'dddddddd-0000-4000-8000-000000000000', false);
SELECT set_config('request.jwt.claims', '{"email":"other@example.test"}', false);
DO $$ BEGIN
  BEGIN
    PERFORM public.provision_salon('Slug Thief', 'new-salon', 'America/Chicago', 'Other');
    RAISE EXCEPTION 'Duplicate slug was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  IF private.current_business_id() IS NOT NULL THEN RAISE EXCEPTION 'Failed provisioning left a membership'; END IF;
END $$;
RESET ROLE;
SET ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT set_config('request.jwt.claims', '{}', false);
DO $$ BEGIN
  BEGIN
    PERFORM public.provision_salon('Anon Salon', 'anon-salon', 'UTC', 'Nobody');
    RAISE EXCEPTION 'Anonymous provisioning was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

-- 0018: anonymous online booking through the two public functions only.
UPDATE public.business_configs SET custom_settings = '{
  "packages":[{"id":"bath","name":"Bath","price":19.99,"durationMinutes":60},
              {"id":"broken","name":"Broken","price":19.999,"durationMinutes":60}],
  "operating_hours":{"open":"08:00","close":"18:00"},
  "booking_buffer_mins":15,"time_zone":"America/Los_Angeles"}'::jsonb
WHERE business_id = '11111111-1111-4111-8111-111111111111';
SET ROLE anon;
DO $$
DECLARE day constant date := (now() AT TIME ZONE 'America/Los_Angeles')::date + 7;
DECLARE nine timestamptz;
DECLARE confirmation jsonb;
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.public_booking_slots('a', 'bath', day);
  IF n <> 18 THEN RAISE EXCEPTION 'Expected 18 open slots, got %', n; END IF;
  SELECT slot_start INTO nine FROM public.public_booking_slots('a', 'bath', day)
    WHERE (slot_start AT TIME ZONE 'America/Los_Angeles')::time = '09:00';
  IF nine IS NULL THEN RAISE EXCEPTION '09:00 local slot missing'; END IF;
  IF (SELECT count(*) FROM public.public_booking_slots('a', 'bath', (now() - interval '3 days')::date)) <> 0
     OR (SELECT count(*) FROM public.public_booking_slots('a', 'bath', (now() + interval '200 days')::date)) <> 0 THEN
    RAISE EXCEPTION 'Slots were offered outside the booking horizon';
  END IF;
  BEGIN
    PERFORM public.public_booking_slots('no-such-salon', 'bath', day);
    RAISE EXCEPTION 'Unknown salon returned slots';
  EXCEPTION WHEN SQLSTATE 'PW020' THEN NULL;
  END;
  BEGIN
    PERFORM public.public_booking_slots('a', 'broken', day);
    RAISE EXCEPTION 'Sub-cent service returned slots';
  EXCEPTION WHEN SQLSTATE 'PW020' THEN NULL;
  END;
  BEGIN
    PERFORM public.public_book_appointment('a', 'bath', nine, 'Pat Parent', '555', NULL, 'Rex', 'Lab');
    RAISE EXCEPTION 'Short phone was accepted';
  EXCEPTION WHEN SQLSTATE 'PW021' THEN NULL;
  END;
  SELECT slot_start INTO nine FROM public.public_booking_slots('a', 'bath', day)
    WHERE (slot_start AT TIME ZONE 'America/Los_Angeles')::time = '09:00';
  confirmation := public.public_book_appointment('a', 'bath', nine,
    'Pat Parent', '(323) 555-0100', 'Pat@Example.test', 'Rex', 'Lab');
  IF confirmation ->> 'status' <> 'booked' OR confirmation ->> 'service' <> 'Bath'
     OR (confirmation ->> 'price')::numeric <> 19.99 OR length(confirmation ->> 'reference') <> 8
     OR confirmation ? 'staff_id' OR confirmation ? 'client_id' THEN
    RAISE EXCEPTION 'Booking confirmation is wrong or leaks internals: %', confirmation;
  END IF;
  SELECT count(*) INTO n FROM public.public_booking_slots('a', 'bath', day);
  IF n <> 13 THEN RAISE EXCEPTION 'Expected 13 open slots after one booking, got %', n; END IF;
  BEGIN
    PERFORM public.public_book_appointment('a', 'bath', nine, 'Someone Else', '3235550199', NULL, 'Milo', 'Pug');
    RAISE EXCEPTION 'Taken slot was booked twice';
  EXCEPTION WHEN SQLSTATE 'PW022' THEN NULL;
  END;
  -- Same person, second pet, then two more: the fifth upcoming booking is refused.
  PERFORM public.public_book_appointment('a', 'bath', nine + interval '90 minutes', 'pat parent', '323-555-0100', NULL, 'Bella', 'Doodle');
  PERFORM public.public_book_appointment('a', 'bath', nine + interval '180 minutes', 'Pat Parent', '3235550100', NULL, 'Rex', 'Lab');
  PERFORM public.public_book_appointment('a', 'bath', nine + interval '270 minutes', 'Pat Parent', '3235550100', NULL, 'Rex', 'Lab');
  BEGIN
    PERFORM public.public_book_appointment('a', 'bath', nine + interval '360 minutes', 'Pat Parent', '3235550100', NULL, 'Rex', 'Lab');
    RAISE EXCEPTION 'Per-phone booking limit was not enforced';
  EXCEPTION WHEN SQLSTATE 'PW023' THEN NULL;
  END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.clients WHERE phone = '3235550100') <> 1
     OR (SELECT count(*) FROM public.pets p JOIN public.clients c ON c.id = p.client_id WHERE c.phone = '3235550100') <> 2
     OR (SELECT count(*) FROM public.clients WHERE name = 'Someone Else') <> 0 THEN
    RAISE EXCEPTION 'Online booking duplicated or leaked client records';
  END IF;
  -- Earlier fixtures also default to booking_source 'online', so pick these by client.
  IF (SELECT count(*) FROM public.visits v JOIN public.clients c ON c.id = v.client_id
      JOIN public.staff_members s ON s.id = v.staff_id
      WHERE c.phone = '3235550100' AND s.role = 'groomer' AND v.total_amount = 19.99
        AND v.booking_source = 'online' AND v.booking_buffer_minutes = 15) <> 4 THEN
    RAISE EXCEPTION 'Online bookings are not four groomer-assigned visits at the catalog price';
  END IF;
END $$;

-- 0019: settlement is written only by the verified-webhook function.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000000', false);
SELECT set_config('request.jwt.claims', '{}', false);
DO $$ BEGIN
  BEGIN
    UPDATE public.transactions SET settlement_status = 'settled', settled_at = now()
      WHERE visit_id = 'aaaaaaaa-2222-4222-8222-222222222222';
    RAISE EXCEPTION 'Staff marked a checkout settled';
  EXCEPTION WHEN SQLSTATE 'PW030' THEN NULL;
  END;
  UPDATE public.transactions SET stripe_payment_intent_id = 'pi_test_1', settlement_status = 'pending'
    WHERE visit_id = 'aaaaaaaa-2222-4222-8222-222222222222';
  BEGIN
    UPDATE public.transactions SET stripe_payment_intent_id = 'pi_swapped'
      WHERE visit_id = 'aaaaaaaa-2222-4222-8222-222222222222';
    RAISE EXCEPTION 'Staff swapped a linked payment intent';
  EXCEPTION WHEN SQLSTATE 'PW030' THEN NULL;
  END;
  BEGIN
    PERFORM public.apply_stripe_payment_event('evt_forged', 'payment_intent.succeeded', 'pi_test_1', 4800, 'usd');
    RAISE EXCEPTION 'Staff called the webhook settlement function';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants
             WHERE table_name = 'stripe_webhook_events' AND grantee IN ('anon', 'authenticated')) THEN
    NULL; -- The test fixture grants ALL on public tables; RLS without policies still hides rows.
  END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF public.apply_stripe_payment_event('evt_2', 'payment_intent.succeeded', 'pi_unknown', 4800, 'usd') <> 'unknown_payment'
     OR public.apply_stripe_payment_event('evt_1', 'payment_intent.succeeded', 'pi_test_1', 4800, 'usd') <> 'settled'
     OR public.apply_stripe_payment_event('evt_1', 'payment_intent.succeeded', 'pi_test_1', 4800, 'usd') <> 'duplicate' THEN
    RAISE EXCEPTION 'Stripe settlement outcomes are wrong';
  END IF;
  IF (SELECT settlement_status || (settled_at IS NOT NULL)::text FROM public.transactions
      WHERE stripe_payment_intent_id = 'pi_test_1') <> 'settledtrue' THEN
    RAISE EXCEPTION 'Verified payment did not settle the checkout';
  END IF;
  IF public.apply_stripe_payment_event('evt_3', 'payment_intent.payment_failed', 'pi_test_1', 4800, 'usd') <> 'ignored'
     OR public.apply_stripe_payment_event('evt_4', 'charge.refunded', 'pi_test_1', 4800, 'usd') <> 'refunded' THEN
    RAISE EXCEPTION 'Late failure or refund handling is wrong';
  END IF;
  INSERT INTO public.transactions (business_id, visit_id, subtotal, discount, tax, tip, amount,
    payment_method, status, stripe_payment_intent_id, settlement_status)
  SELECT business_id, id, 20.00, 0, 0, 0, 20.00, 'card', 'pending', 'pi_test_2', 'pending'
  FROM public.visits WHERE service_package = 'Adjacent';
  IF public.apply_stripe_payment_event('evt_5', 'payment_intent.succeeded', 'pi_test_2', 1999, 'usd') <> 'amount_mismatch' THEN
    RAISE EXCEPTION 'A mismatched amount was not reported';
  END IF;
  IF (SELECT settlement_status FROM public.transactions WHERE stripe_payment_intent_id = 'pi_test_2') <> 'failed' THEN
    RAISE EXCEPTION 'A mismatched amount settled the checkout';
  END IF;
  IF (SELECT count(*) FROM public.stripe_webhook_events) <> 5 THEN
    RAISE EXCEPTION 'Webhook events were not recorded exactly once';
  END IF;
END $$;
SET ROLE authenticated;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.stripe_webhook_events) <> 0 THEN
    RAISE EXCEPTION 'Staff can read webhook events';
  END IF;
END $$;
RESET ROLE;

-- 0020: privileged bodies live outside the exposed public schema. The public
-- API signatures remain callable only by the intended roles and run as the
-- caller; the private implementations retain the narrowly scoped elevation.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('provision_salon', 'public_booking_slots', 'public_book_appointment')
      AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'An exposed Pawtrackr workflow RPC still runs as SECURITY DEFINER';
  END IF;
  IF (SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'private'
        AND p.proname IN ('provision_salon_internal', 'public_booking_slots_internal', 'public_book_appointment_internal')
        AND p.prosecdef) <> 3 THEN
    RAISE EXCEPTION 'Privileged workflow implementations are missing from private schema';
  END IF;
  IF has_function_privilege('anon', 'public.provision_salon(text,text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.provision_salon(text,text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.public_booking_slots(text,text,date)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.public_book_appointment(text,text,timestamptz,text,text,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Public workflow RPC grants changed during hardening';
  END IF;
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'stripe_webhook_events') <> 4 THEN
    RAISE EXCEPTION 'Webhook event ledger does not have explicit client deny policies';
  END IF;
END $$;
-- 0024: billing state is written only by verified Stripe subscription events.
DO $$
DECLARE
  salon uuid := '11111111-1111-4111-8111-111111111111';
  blocked boolean := false;
  reached integer := 0;
BEGIN
  IF has_function_privilege('authenticated', 'public.apply_stripe_subscription_event(text,text,timestamptz,uuid,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.apply_stripe_subscription_event(text,text,timestamptz,uuid,text,text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.apply_stripe_subscription_event(text,text,timestamptz,uuid,text,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Subscription event function has the wrong grants';
  END IF;

  UPDATE public.businesses SET subscription_status = 'trialing', stripe_customer_id = NULL,
    stripe_subscription_id = NULL, subscription_event_at = NULL WHERE id = salon;

  -- An API role cannot activate its own salon, but can still rename it.
  UPDATE public.staff_members SET is_active = true, business_id = salon
    WHERE auth_user_id = 'aaaaaaaa-0000-4000-8000-000000000000';
  PERFORM set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000000', true);
  PERFORM set_config('request.jwt.claims', '{}', true);
  SET LOCAL ROLE authenticated;
  UPDATE public.businesses SET name = name WHERE id = salon;
  GET DIAGNOSTICS reached = ROW_COUNT;
  BEGIN
    UPDATE public.businesses SET subscription_status = 'active' WHERE id = salon;
  EXCEPTION WHEN SQLSTATE 'PW040' THEN blocked := true;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  IF reached <> 1 THEN
    RAISE EXCEPTION 'Billing guard fixture did not reach the salon row as staff';
  END IF;
  IF NOT blocked THEN
    RAISE EXCEPTION 'An API role changed its own subscription status';
  END IF;

  IF public.apply_stripe_subscription_event('evt_sub_1', 'checkout.session.completed', '2026-11-10 10:00+00', salon, 'cus_a', 'sub_a', NULL, 'solo_van') <> 'linked'
     OR public.apply_stripe_subscription_event('evt_sub_2', 'customer.subscription.updated', '2026-11-10 10:05+00', NULL, 'cus_a', 'sub_a', 'active', NULL) <> 'updated'
     OR public.apply_stripe_subscription_event('evt_sub_2', 'customer.subscription.updated', '2026-11-10 10:05+00', NULL, 'cus_a', 'sub_a', 'active', NULL) <> 'duplicate' THEN
    RAISE EXCEPTION 'Subscription link, activation, or replay handling is wrong';
  END IF;
  -- IS DISTINCT FROM, not <>: a NULL column makes the whole string NULL, and
  -- NULL <> 'x' is not true, so <> would let a cleared id pass unnoticed.
  IF (SELECT subscription_status || '|' || subscription_plan || '|' || stripe_customer_id || '|' || stripe_subscription_id
      FROM public.businesses WHERE id = salon) IS DISTINCT FROM 'active|solo_van|cus_a|sub_a' THEN
    RAISE EXCEPTION 'Verified subscription events did not produce the expected billing state';
  END IF;

  -- A late, older event must not overwrite newer state; a foreign customer must not attach.
  IF public.apply_stripe_subscription_event('evt_sub_3', 'customer.subscription.updated', '2026-11-10 10:01+00', NULL, 'cus_a', 'sub_a', 'trialing', NULL) <> 'stale'
     OR public.apply_stripe_subscription_event('evt_sub_4', 'customer.subscription.updated', '2026-11-10 10:06+00', salon, 'cus_other', 'sub_x', 'canceled', NULL) <> 'customer_mismatch'
     OR public.apply_stripe_subscription_event('evt_sub_5', 'customer.subscription.updated', '2026-11-10 10:07+00', NULL, 'cus_none', 'sub_none', 'active', NULL) <> 'unknown_business' THEN
    RAISE EXCEPTION 'Stale, mismatched, or unknown subscription events were not rejected';
  END IF;
  IF (SELECT subscription_status || '|' || stripe_customer_id || '|' || stripe_subscription_id
      FROM public.businesses WHERE id = salon) IS DISTINCT FROM 'active|cus_a|sub_a' THEN
    RAISE EXCEPTION 'Stale, mismatched, or unknown subscription events changed billing state';
  END IF;

  -- The state check is a separate statement on purpose: a subquery in the same
  -- statement as the function call reads the snapshot from before its update.
  IF public.apply_stripe_subscription_event('evt_sub_6', 'customer.subscription.deleted', '2026-11-10 11:00+00', NULL, 'cus_a', 'sub_a', 'canceled', NULL) <> 'updated' THEN
    RAISE EXCEPTION 'Subscription cancellation was not accepted';
  END IF;
  IF (SELECT subscription_status || '|' || stripe_customer_id || '|' || COALESCE(stripe_subscription_id, 'none')
      FROM public.businesses WHERE id = salon) IS DISTINCT FROM 'canceled|cus_a|none' THEN
    RAISE EXCEPTION 'Subscription cancellation was not applied';
  END IF;

  UPDATE public.businesses SET subscription_status = 'active' WHERE id = salon;
END $$;
SQL
# ---------------------------------------------------------------------------
# Scenario: Friday double-booking. Two front-desk sessions book the same
# groomer for the same time at the same moment. The database must accept
# exactly one. Run as two real concurrent connections, not one transaction.
# ---------------------------------------------------------------------------
psql -v ON_ERROR_STOP=1 -q <<'SQL'
INSERT INTO public.businesses (id, name, slug, owner_email) VALUES
  ('33333333-3333-4333-8333-333333333333', 'Race Salon', 'race-salon', 'race@example.test');
INSERT INTO public.business_configs (business_id, custom_settings) VALUES
  ('33333333-3333-4333-8333-333333333333',
   '{"time_zone": "America/Los_Angeles", "operating_hours": {"open": "08:00", "close": "18:00"}}');
INSERT INTO public.clients (id, business_id, name, phone) VALUES
  ('33333333-cccc-4ccc-8ccc-333333333333', '33333333-3333-4333-8333-333333333333', 'Race Client', '5');
INSERT INTO public.pets (id, business_id, client_id, name, breed) VALUES
  ('33333333-dddd-4ddd-8ddd-333333333333', '33333333-3333-4333-8333-333333333333',
   '33333333-cccc-4ccc-8ccc-333333333333', 'Race Pet', 'Poodle');
INSERT INTO public.staff_members (id, business_id, name, role) VALUES
  ('33333333-eeee-4eee-8eee-333333333333', '33333333-3333-4333-8333-333333333333', 'Alex', 'groomer');
SQL

race_insert() {
  # $1 = UTC start time, $2 = label
  printf "INSERT INTO public.visits (business_id, client_id, pet_id, staff_id, service_package,
    total_amount, scheduled_time, duration_minutes) VALUES ('33333333-3333-4333-8333-333333333333',
    '33333333-cccc-4ccc-8ccc-333333333333', '33333333-dddd-4ddd-8ddd-333333333333',
    '33333333-eeee-4eee-8eee-333333333333', '%s', 60, '%s', 30);" "$2" "$1"
}

race_count() {
  psql -tA -c "SELECT count(*) FROM public.visits WHERE staff_id = '33333333-eeee-4eee-8eee-333333333333'
    AND scheduled_time = '$1' AND status = 'booked'"
}

# Wait until a session reaches a given wait state, so the race does not
# depend on timing guesses. $1 = application name, $2 = SQL condition.
wait_for_session() {
  for _ in $(seq 1 100); do
    if [ "$(psql -tA -c "SELECT count(*) FROM pg_stat_activity WHERE application_name = '$1' AND $2")" = '1' ]; then
      return 0
    fi
    sleep 0.1
  done
  printf 'Session %s never reached: %s\n' "$1" "$2" >&2
  exit 1
}

# Emits SQL that keeps the first session's transaction open until the named
# second session is seen blocked on a lock, so the first can never finish
# early on a slow runner. Gives up loudly after 60 seconds.
race_hold() {
  printf "\nDO \$race_hold\$ BEGIN
  FOR i IN 1..600 LOOP
    PERFORM pg_stat_clear_snapshot();
    IF EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name = '%s' AND wait_event_type = 'Lock') THEN
      RETURN;
    END IF;
    PERFORM pg_sleep(0.1);
  END LOOP;
  RAISE EXCEPTION 'The second booking session never blocked on the first';
END \$race_hold\$;\n" "$1"
}

# Race 1: both sessions commit. A inserts and holds its booking uncommitted;
# B starts only once A's row is in place, and is shown to be blocked on it.
slot_one='2030-03-15 21:00:00+00'   # Friday 2:00 PM Pacific
{ printf 'BEGIN;\n'; race_insert "$slot_one" 'Front desk A'; race_hold race_b; printf 'COMMIT;\n'; } \
  | PGAPPNAME=race_a psql -v ON_ERROR_STOP=1 -q >"$temp_dir/race_a.log" 2>&1 &
race_a=$!
wait_for_session race_a "query LIKE '%race_hold%'"
race_insert "$slot_one" 'Front desk B' \
  | PGAPPNAME=race_b psql -v ON_ERROR_STOP=1 -q >"$temp_dir/race_b.log" 2>&1 &
race_b=$!
wait_for_session race_b "wait_event_type = 'Lock'"
set +e
wait "$race_a"; race_a_status=$?
wait "$race_b"; race_b_status=$?
set -e
if [ "$race_a_status" -ne 0 ] || [ "$race_b_status" -eq 0 ] \
   || ! grep -q 'exclusion constraint' "$temp_dir/race_b.log" \
   || [ "$(race_count "$slot_one")" != '1' ]; then
  printf 'Double-booking race was not resolved to exactly one booking.\n' >&2
  cat "$temp_dir/race_a.log" "$temp_dir/race_b.log" >&2
  exit 1
fi

# Race 2: A abandons its booking. B, blocked on it, must then get the slot.
slot_two='2030-03-15 23:00:00+00'   # Friday 4:00 PM Pacific
{ printf 'BEGIN;\n'; race_insert "$slot_two" 'Abandoned'; race_hold race_d; printf 'ROLLBACK;\n'; } \
  | PGAPPNAME=race_c psql -v ON_ERROR_STOP=1 -q >"$temp_dir/race_c.log" 2>&1 &
race_c=$!
wait_for_session race_c "query LIKE '%race_hold%'"
race_insert "$slot_two" 'Takes the slot' \
  | PGAPPNAME=race_d psql -v ON_ERROR_STOP=1 -q >"$temp_dir/race_d.log" 2>&1 &
race_d=$!
wait_for_session race_d "wait_event_type = 'Lock'"
set +e
wait "$race_c"; race_c_status=$?
wait "$race_d"; race_d_status=$?
set -e
if [ "$race_c_status" -ne 0 ] || [ "$race_d_status" -ne 0 ] \
   || [ "$(race_count "$slot_two")" != '1' ] \
   || [ "$(psql -tA -c "SELECT service_package FROM public.visits WHERE scheduled_time = '$slot_two'")" != 'Takes the slot' ]; then
  printf 'A booking waiting on an abandoned one did not get the slot.\n' >&2
  cat "$temp_dir/race_c.log" "$temp_dir/race_d.log" >&2
  exit 1
fi

# Not covered here: a public online booking (public_book_appointment, which
# picks a groomer itself) racing a staff booking. That path needs its own
# fixture and is the next increment.

# Scenario: opening hours are local time, including the day the clocks
# change. 2030-03-10 is the US spring-forward Sunday.
psql -v ON_ERROR_STOP=1 -q <<'SQL'
DO $$
DECLARE
  start_at timestamptz;
  expect_ok boolean;
  accepted boolean;
BEGIN
  FOR start_at, expect_ok IN VALUES
    ('2030-03-09 15:30:00+00'::timestamptz, false),  -- Sat 7:30 AM PST, before opening
    ('2030-03-09 16:00:00+00'::timestamptz, true),   -- Sat 8:00 AM PST
    ('2030-03-11 14:30:00+00'::timestamptz, false),  -- Mon 7:30 AM PDT, before opening
    ('2030-03-11 15:00:00+00'::timestamptz, true),   -- Mon 8:00 AM PDT, one hour earlier in UTC
    ('2030-03-11 00:45:00+00'::timestamptz, false)   -- Sun 5:45 PM PDT, runs past closing
  LOOP
    BEGIN
      INSERT INTO public.visits (business_id, client_id, pet_id, staff_id, service_package,
        total_amount, scheduled_time, duration_minutes, booking_buffer_minutes)
      VALUES ('33333333-3333-4333-8333-333333333333', '33333333-cccc-4ccc-8ccc-333333333333',
        '33333333-dddd-4ddd-8ddd-333333333333', '33333333-eeee-4eee-8eee-333333333333',
        'DST check', 60, start_at, 30, 0);
      accepted := true;
    EXCEPTION WHEN SQLSTATE 'PW001' THEN
      accepted := false;
    END;
    IF accepted IS DISTINCT FROM expect_ok THEN
      RAISE EXCEPTION 'Opening-hours check was wrong at % (expected accepted=%)', start_at, expect_ok;
    END IF;
  END LOOP;
END $$;
SQL
printf 'Double-booking race and daylight-saving hours checks passed.\n'
printf 'Migration execution and basic tenant/RPC checks passed.\n'
