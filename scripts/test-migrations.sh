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
# Scenario: a competing salon owner edits their own requests to reach
# another salon's records. Signed in as salon A, every attempt to read,
# change, delete, re-home or link to salon B's data must fail or touch
# nothing, and salon B's rows must be unchanged afterwards.
# ---------------------------------------------------------------------------
psql -v ON_ERROR_STOP=1 -q <<'SQL'
UPDATE public.staff_members SET is_active = true, business_id = '11111111-1111-4111-8111-111111111111'
  WHERE auth_user_id = 'aaaaaaaa-0000-4000-8000-000000000000';
INSERT INTO public.pets (id, business_id, client_id, name, breed) VALUES
  ('bbbbbbbb-eeee-4eee-8eee-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B Pet', 'Collie');
-- Give salon B a visit and a completed checkout, so the read checks below
-- have something to hide. Without these, a count of zero proves nothing.
UPDATE public.business_configs
  SET custom_settings = COALESCE(custom_settings, '{}'::jsonb)
    || '{"time_zone": "UTC", "operating_hours": {"open": "08:00", "close": "18:00"}}'::jsonb
  WHERE business_id = '22222222-2222-4222-8222-222222222222';
INSERT INTO public.visits (id, business_id, client_id, pet_id, staff_id, service_package,
  total_amount, scheduled_time, duration_minutes)
VALUES ('bbbbbbbb-ffff-4fff-8fff-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-eeee-4eee-8eee-bbbbbbbbbbbb', NULL,
  'B Visit', 48, '2030-01-04 10:00:00+00', 30);
INSERT INTO public.transactions (business_id, visit_id, subtotal, discount, tax, tip, amount, payment_method, status)
VALUES ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-ffff-4fff-8fff-bbbbbbbbbbbb',
  40.00, 0.00, 3.00, 5.00, 48.00, 'cash', 'completed');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.visits WHERE business_id = '22222222-2222-4222-8222-222222222222') = 0
     OR (SELECT count(*) FROM public.transactions WHERE business_id = '22222222-2222-4222-8222-222222222222') = 0
     OR (SELECT count(*) FROM public.staff_members WHERE business_id = '22222222-2222-4222-8222-222222222222') = 0 THEN
    RAISE EXCEPTION 'Salon B fixture has no visit, checkout or staff to protect';
  END IF;
END $$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000000', false);
SELECT set_config('request.jwt.claims', '{}', false);
DO $$
DECLARE
  touched integer;
  rejected boolean;
  a_pet uuid;
  a_staff uuid;
BEGIN
  SELECT id INTO STRICT a_pet FROM public.pets WHERE name = 'Valid Pet';
  SELECT id INTO STRICT a_staff FROM public.staff_members WHERE auth_user_id = 'aaaaaaaa-0000-4000-8000-000000000000';
  IF private.current_business_id() IS DISTINCT FROM '11111111-1111-4111-8111-111111111111' THEN
    RAISE EXCEPTION 'Tenant fixture is not signed in as salon A';
  END IF;

  -- Reading B's data by id or by business returns nothing.
  IF (SELECT count(*) FROM public.clients WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') <> 0
     OR (SELECT count(*) FROM public.pets WHERE business_id = '22222222-2222-4222-8222-222222222222') <> 0
     OR (SELECT count(*) FROM public.visits WHERE business_id = '22222222-2222-4222-8222-222222222222') <> 0
     OR (SELECT count(*) FROM public.transactions WHERE business_id = '22222222-2222-4222-8222-222222222222') <> 0
     OR (SELECT count(*) FROM public.staff_members WHERE business_id = '22222222-2222-4222-8222-222222222222') <> 0 THEN
    RAISE EXCEPTION 'Salon A can read salon B rows';
  END IF;

  -- Changing or deleting B's rows by id touches nothing.
  UPDATE public.clients SET name = 'Stolen' WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  GET DIAGNOSTICS touched = ROW_COUNT;
  IF touched <> 0 THEN RAISE EXCEPTION 'Salon A updated a salon B client'; END IF;
  UPDATE public.pets SET name = 'Stolen Pet' WHERE id = 'bbbbbbbb-eeee-4eee-8eee-bbbbbbbbbbbb';
  GET DIAGNOSTICS touched = ROW_COUNT;
  IF touched <> 0 THEN RAISE EXCEPTION 'Salon A updated a salon B pet'; END IF;
  DELETE FROM public.pets WHERE id = 'bbbbbbbb-eeee-4eee-8eee-bbbbbbbbbbbb';
  GET DIAGNOSTICS touched = ROW_COUNT;
  IF touched <> 0 THEN RAISE EXCEPTION 'Salon A deleted a salon B pet'; END IF;
  DELETE FROM public.clients WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  GET DIAGNOSTICS touched = ROW_COUNT;
  IF touched <> 0 THEN RAISE EXCEPTION 'Salon A deleted a salon B client'; END IF;

  -- Moving A's own client into salon B is refused.
  rejected := false;
  BEGIN
    UPDATE public.clients SET business_id = '22222222-2222-4222-8222-222222222222'
      WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    GET DIAGNOSTICS touched = ROW_COUNT;
    rejected := touched = 0;
  -- Only the tenant guards count as a rejection: 23514 is the cross-salon
  -- reference check, 42501 is row-level security. Anything else fails loudly.
  EXCEPTION WHEN SQLSTATE '23514' OR insufficient_privilege OR foreign_key_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Salon A moved its client into salon B'; END IF;

  -- A pet in salon A cannot be attached to salon B's client.
  rejected := false;
  BEGIN
    INSERT INTO public.pets (business_id, client_id, name, breed) VALUES
      ('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Linked Pet', 'Pug');
  -- Only the tenant guards count as a rejection: 23514 is the cross-salon
  -- reference check, 42501 is row-level security. Anything else fails loudly.
  EXCEPTION WHEN SQLSTATE '23514' OR insufficient_privilege OR foreign_key_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Salon A attached a pet to a salon B client'; END IF;

  -- A visit in salon A cannot point at salon B's pet or client.
  rejected := false;
  BEGIN
    INSERT INTO public.visits (business_id, client_id, pet_id, staff_id, service_package,
      total_amount, scheduled_time, duration_minutes)
    VALUES ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-eeee-4eee-8eee-bbbbbbbbbbbb', a_staff,
      'Cross-salon pet', 20, '2030-01-03 17:00:00+00', 30);
  -- Only the tenant guards count as a rejection: 23514 is the cross-salon
  -- reference check, 42501 is row-level security. Anything else fails loudly.
  EXCEPTION WHEN SQLSTATE '23514' OR insufficient_privilege OR foreign_key_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Salon A booked a visit for a salon B pet'; END IF;

  rejected := false;
  BEGIN
    INSERT INTO public.visits (business_id, client_id, pet_id, staff_id, service_package,
      total_amount, scheduled_time, duration_minutes)
    VALUES ('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      a_pet, a_staff,
      'Cross-salon client', 20, '2030-01-03 18:00:00+00', 30);
  -- Only the tenant guards count as a rejection: 23514 is the cross-salon
  -- reference check, 42501 is row-level security. Anything else fails loudly.
  EXCEPTION WHEN SQLSTATE '23514' OR insufficient_privilege OR foreign_key_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Salon A booked a visit for a salon B client'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

-- Salon B's records are exactly as they were.
DO $$ BEGIN
  IF (SELECT name FROM public.clients WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') IS DISTINCT FROM 'B Client'
     OR (SELECT name FROM public.pets WHERE id = 'bbbbbbbb-eeee-4eee-8eee-bbbbbbbbbbbb') IS DISTINCT FROM 'B Pet'
     OR (SELECT business_id FROM public.clients WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
        IS DISTINCT FROM '11111111-1111-4111-8111-111111111111'
     OR EXISTS (SELECT 1 FROM public.visits WHERE service_package LIKE 'Cross-salon%')
     OR EXISTS (SELECT 1 FROM public.pets WHERE name = 'Linked Pet') THEN
    RAISE EXCEPTION 'Salon B data changed during the cross-tenant attempts';
  END IF;
END $$;
SQL
printf 'Cross-tenant access scenarios passed.\n'
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
# No shell-side wait here: the first session's race_hold already proves this
# one blocked, and commits the moment it does, so a second poll could miss it.
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
# No shell-side wait here: the first session's race_hold already proves this
# one blocked, and commits the moment it does, so a second poll could miss it.
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

# Scenario: Enterprise Slices 1-7 (WF00-WF40) workflow verification.
psql -v ON_ERROR_STOP=1 -q <<'SQL'
-- 0023: 6-role check, append-only workflow_events, idempotent provisioning,
-- draft/paused/published gate, strict shift + station requirement, station
-- overlap exclusion, and idempotent public booking + recovery lookup.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'eeeeeeee-0000-4000-8000-000000000000', false);
SELECT set_config('request.jwt.claims', '{"email":"bespoke@example.test"}', false);
DO $$
DECLARE bespoke uuid;
DECLARE retry_bespoke uuid;
DECLARE sr_groomer uuid;
DECLARE bather_id uuid;
DECLARE table_one uuid;
DECLARE target_day constant date := (now() AT TIME ZONE 'America/Chicago')::date + 10;
DECLARE target_dow constant integer := EXTRACT(DOW FROM ((now() AT TIME ZONE 'America/Chicago')::date + 10))::integer;
BEGIN
  bespoke := public.provision_salon_with_model('Bespoke Grooming', 'bespoke-chicago', 'America/Chicago', 'Elena Vance', 'hybrid');
  -- Dropped-connection retry with identical salon name + slug returns the same business_id.
  retry_bespoke := public.provision_salon_with_model('Bespoke Grooming', 'bespoke-chicago', 'America/Chicago', 'Elena Vance', 'hybrid');
  IF retry_bespoke IS DISTINCT FROM bespoke THEN
    RAISE EXCEPTION 'Provisioning retry did not return the existing salon id';
  END IF;
  IF (SELECT booking_status || '|' || operating_model || '|' || (trial_ends_at IS NOT NULL)::text
      FROM public.businesses WHERE id = bespoke) <> 'draft|hybrid|true' THEN
    RAISE EXCEPTION 'Newly provisioned salon did not start in draft with trial_ends_at';
  END IF;
  IF (SELECT strict_shift_station_mode::text || '|' || tax_rate::text
      FROM public.business_configs WHERE business_id = bespoke) <> 'true|0.00' THEN
    RAISE EXCEPTION 'Newly provisioned salon did not set strict_shift_station_mode and 0.00 default tax';
  END IF;
  -- workflow_events recorded salon.provisioned once and rejects UPDATE (even under RLS).
  IF (SELECT count(*) FROM public.workflow_events WHERE business_id = bespoke AND event_type = 'salon.provisioned') <> 1 THEN
    RAISE EXCEPTION 'Provisioning did not record exactly one workflow_events entry';
  END IF;
  BEGIN
    UPDATE public.workflow_events SET reason = 'tampered' WHERE business_id = bespoke;
    RAISE EXCEPTION 'workflow_events allowed UPDATE';
  EXCEPTION WHEN SQLSTATE 'PW040' THEN NULL;
  END;
  DELETE FROM public.workflow_events WHERE business_id = bespoke;
  IF (SELECT count(*) FROM public.workflow_events WHERE business_id = bespoke) <> 1 THEN
    RAISE EXCEPTION 'Authenticated role deleted a workflow_events row';
  END IF;

  -- Configure service, senior_groomer + bather, weekly shift, and 1 station, keeping salon in draft first.
  UPDATE public.business_configs
  SET custom_settings = custom_settings || '{
    "packages":[{"id":"full-groom","name":"Full Groom","price":95,"durationMinutes":60}],
    "operating_hours":{"open":"08:00","close":"18:00"},
    "booking_buffer_mins":15
  }'::jsonb
  WHERE business_id = bespoke;

  INSERT INTO public.staff_members (business_id, name, role, is_active)
  VALUES (bespoke, 'Maya Senior', 'senior_groomer', true) RETURNING id INTO sr_groomer;
  INSERT INTO public.staff_members (business_id, name, role, is_active)
  VALUES (bespoke, 'Sam Bather', 'bather', true) RETURNING id INTO bather_id;
END $$;
RESET ROLE;

-- While draft: absent from directory, readable in service catalog as 'draft', and PW024 on slot/book RPCs.
SET ROLE anon;
DO $$
DECLARE target_day constant date := (now() AT TIME ZONE 'America/Chicago')::date + 10;
BEGIN
  IF EXISTS (SELECT 1 FROM public.booking_business_directory WHERE slug = 'bespoke-chicago') THEN
    RAISE EXCEPTION 'Draft salon appeared in public directory';
  END IF;
  IF (SELECT booking_status FROM public.booking_service_catalog WHERE slug = 'bespoke-chicago') <> 'draft' THEN
    RAISE EXCEPTION 'Draft salon did not expose draft booking_status on direct slug catalog';
  END IF;
  BEGIN
    PERFORM public.public_booking_slots('bespoke-chicago', 'full-groom', target_day);
    RAISE EXCEPTION 'Draft salon returned booking slots';
  EXCEPTION WHEN SQLSTATE 'PW024' THEN NULL;
  END;
END $$;
RESET ROLE;

-- Publish without shift or station: 0 slots available because strict_shift_station_mode requires both.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'eeeeeeee-0000-4000-8000-000000000000', false);
DO $$
DECLARE bespoke uuid;
DECLARE sr_groomer uuid;
DECLARE table_one uuid;
DECLARE target_day constant date := (now() AT TIME ZONE 'America/Chicago')::date + 10;
DECLARE target_dow constant integer := EXTRACT(DOW FROM ((now() AT TIME ZONE 'America/Chicago')::date + 10))::integer;
BEGIN
  SELECT id INTO bespoke FROM public.businesses WHERE slug = 'bespoke-chicago';
  SELECT id INTO sr_groomer FROM public.staff_members WHERE business_id = bespoke AND role = 'senior_groomer';
  UPDATE public.businesses SET booking_status = 'published' WHERE id = bespoke;
  IF (SELECT count(*) FROM public.public_booking_slots('bespoke-chicago', 'full-groom', target_day)) <> 0 THEN
    RAISE EXCEPTION 'Strict salon offered slots without groomer shift and station';
  END IF;
  -- Add weekly shift, still 0 stations -> still 0 slots.
  INSERT INTO public.staff_weekly_shifts (business_id, staff_id, day_of_week, start_time, end_time, assigned_station)
  VALUES (bespoke, sr_groomer, target_dow, '09:00', '13:00', 'Table 1');
  IF (SELECT count(*) FROM public.public_booking_slots('bespoke-chicago', 'full-groom', target_day)) <> 0 THEN
    RAISE EXCEPTION 'Strict salon offered slots without an active station';
  END IF;
  -- Add 1 active station -> slots appear inside 09:00-13:00!
  INSERT INTO public.salon_stations (business_id, name, station_type, is_active)
  VALUES (bespoke, 'Table 1', 'table', true) RETURNING id INTO table_one;
END $$;
RESET ROLE;

SET ROLE anon;
DO $$
DECLARE target_day constant date := (now() AT TIME ZONE 'America/Chicago')::date + 10;
DECLARE slot_nine timestamptz;
DECLARE first_res jsonb;
DECLARE retry_res jsonb;
DECLARE lookup_res jsonb;
BEGIN
  SELECT slot_start INTO slot_nine FROM public.public_booking_slots('bespoke-chicago', 'full-groom', target_day)
    WHERE (slot_start AT TIME ZONE 'America/Chicago')::time = '09:00';
  IF slot_nine IS NULL THEN
    RAISE EXCEPTION 'Published salon with weekly shift + station did not offer 09:00 slot';
  END IF;
  IF (public.public_booking_attempt_status('bespoke-chicago', 'idem_key_bespoke_0001') ->> 'found')::boolean THEN
    RAISE EXCEPTION 'Attempt lookup reported found before booking';
  END IF;
  first_res := public.public_book_appointment_idempotent(
    'bespoke-chicago', 'full-groom', slot_nine,
    'Sophia Alvarez', '312-555-0144', 'sophia@example.test', 'Bello', 'Goldendoodle', 'idem_key_bespoke_0001'
  );
  retry_res := public.public_book_appointment_idempotent(
    'bespoke-chicago', 'full-groom', slot_nine,
    'Sophia Alvarez', '312-555-0144', 'sophia@example.test', 'Bello', 'Goldendoodle', 'idem_key_bespoke_0001'
  );
  lookup_res := public.public_booking_attempt_status('bespoke-chicago', 'idem_key_bespoke_0001');
  IF first_res ->> 'reference' <> retry_res ->> 'reference'
     OR (retry_res ->> 'deduplicated')::boolean IS DISTINCT FROM true
     OR (lookup_res ->> 'found')::boolean IS DISTINCT FROM true
     OR lookup_res #>> '{booking,reference}' <> first_res ->> 'reference' THEN
    RAISE EXCEPTION 'Idempotent booking retry or status lookup failed: % / % / %', first_res, retry_res, lookup_res;
  END IF;
END $$;
RESET ROLE;

-- Verify station exclusion constraint blocks a second groomer from taking the single station at the same time,
-- and pausing the salon blocks new public bookings while keeping the booked visit intact.
DO $$
DECLARE bespoke uuid;
DECLARE table_one uuid;
DECLARE g2 uuid;
DECLARE client_id uuid;
DECLARE pet_id uuid;
DECLARE booked_start timestamptz;
BEGIN
  SELECT id INTO bespoke FROM public.businesses WHERE slug = 'bespoke-chicago';
  SELECT id INTO table_one FROM public.salon_stations WHERE business_id = bespoke;
  SELECT v.client_id, v.pet_id, v.scheduled_time INTO client_id, pet_id, booked_start
    FROM public.visits v WHERE v.business_id = bespoke LIMIT 1;
  IF (SELECT count(*) FROM public.visits WHERE business_id = bespoke) <> 1 THEN
    RAISE EXCEPTION 'Idempotent retry created duplicate visit rows';
  END IF;
  INSERT INTO public.staff_members (business_id, name, role, is_active)
  VALUES (bespoke, 'Julian Groomer', 'groomer', true) RETURNING id INTO g2;
  INSERT INTO public.staff_weekly_shifts (business_id, staff_id, day_of_week, start_time, end_time, assigned_station)
  VALUES (bespoke, g2, EXTRACT(DOW FROM (booked_start AT TIME ZONE 'America/Chicago')::date)::integer, '09:00', '17:00', 'Table 1');
  BEGIN
    INSERT INTO public.visits (business_id, client_id, pet_id, staff_id, station_id,
      service_package, total_amount, scheduled_time, duration_minutes, booking_buffer_minutes)
    VALUES (bespoke, client_id, pet_id, g2, table_one, 'Overlap Station', 95, booked_start, 60, 15);
    RAISE EXCEPTION 'Station exclusion constraint allowed double-booking Table 1';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;
  -- Slice 2 Operational RPC Tests (WF01, WF09, WF10, WF18)
  PERFORM public.manager_open_day((booked_start AT TIME ZONE 'America/Chicago')::date, '{"staff_present": true, "stations_ready": true}'::jsonb);
  IF (SELECT status FROM public.daily_salon_days WHERE business_id = bespoke LIMIT 1) <> 'open' THEN
    RAISE EXCEPTION 'manager_open_day did not set status to open';
  END IF;

  DECLARE
    v_id uuid;
    v_checked_in jsonb;
    v_stage jsonb;
    v_released jsonb;
    v_ver int;
    v_tx jsonb;
    v_tx_id uuid;
    v_refund jsonb;
    v2_id uuid;
    v_surcharge jsonb;
    v_surcharge_id uuid;
    v_incident jsonb;
    v_inc_id uuid;
    v3_id uuid;
    v_card jsonb;
    v_card_id uuid;
    v_closeout jsonb;
    v_comm jsonb;
    v_payroll jsonb;
    v_period_id uuid;
    v_staff_count int;
    v_wl_entry jsonb;
    v_wl_entry_id uuid;
    v_wl_offer jsonb;
    v_wl_offer_id uuid;
    v_wl_claim jsonb;
    v_wl_token text;
    v_wl_entry2 jsonb;
    v_wl_entry2_id uuid;
    v_wl_offer2 jsonb;
    v_wl_offer2_id uuid;
    v_wl_token2 text;
    v_wl_expired jsonb;
    v_van_id uuid;
    v_van_res jsonb;
    v_stop_res jsonb;
    v_sibling_salon uuid;
    v_cfg_res jsonb;
    v_import_res jsonb;
    v_import_job_id uuid;
    v_rollback_res jsonb;
  BEGIN
    SELECT id, version INTO v_id, v_ver FROM public.visits WHERE business_id = bespoke LIMIT 1;

    -- Check-in
    v_checked_in := public.check_in_visit(v_id, 'Alice Parent', '555-0199', 42.5, NULL, 'verified', false, 0);
    IF (v_checked_in->>'status') <> 'checked_in' THEN
      RAISE EXCEPTION 'check_in_visit did not set status to checked_in';
    END IF;

    -- Advance stage before safety notes acknowledged must fail with PW030
    BEGIN
      PERFORM public.advance_visit_stage(v_id, 'bathing');
      RAISE EXCEPTION 'advance_visit_stage allowed bathing without safety notes acknowledged';
    EXCEPTION WHEN SQLSTATE 'PW030' THEN NULL;
    END;

    -- Acknowledge safety notes
    PERFORM public.acknowledge_safety_notes(v_id);

    -- Optimistic concurrency mismatch must fail with PW029
    BEGIN
      PERFORM public.advance_visit_stage(v_id, 'bathing', 'Shampoo applied', 0);
      RAISE EXCEPTION 'advance_visit_stage allowed stale version';
    EXCEPTION WHEN SQLSTATE 'PW029' THEN NULL;
    END;

    -- Advance to bathing with current version
    SELECT version INTO v_ver FROM public.visits WHERE id = v_id;
    v_stage := public.advance_visit_stage(v_id, 'bathing', 'Gentle oatmeal bath', v_ver);
    IF (v_stage->>'status') <> 'bathing' THEN
      RAISE EXCEPTION 'advance_visit_stage did not set status to bathing';
    END IF;

    -- Advance through drying, styling, ready
    SELECT version INTO v_ver FROM public.visits WHERE id = v_id;
    PERFORM public.advance_visit_stage(v_id, 'drying', 'High velocity dryer', v_ver);
    SELECT version INTO v_ver FROM public.visits WHERE id = v_id;
    PERFORM public.advance_visit_stage(v_id, 'styling', 'Teddy bear face scissor', v_ver);
    SELECT version INTO v_ver FROM public.visits WHERE id = v_id;
    v_stage := public.advance_visit_stage(v_id, 'ready', 'Pet is styled and ready', v_ver);
    IF (v_stage->>'status') <> 'ready' THEN
      RAISE EXCEPTION 'advance_visit_stage did not set status to ready';
    END IF;

    -- Unpaid release without manager override must fail with PW035
    BEGIN
      PERFORM public.release_visit(v_id, 'Alice Parent', false, NULL);
      RAISE EXCEPTION 'release_visit allowed unpaid release without manager override';
    EXCEPTION WHEN SQLSTATE 'PW035' THEN NULL;
    END;

    -- Release with manager unpaid override
    v_released := public.release_visit(v_id, 'Alice Parent', true, 'Client will settle by card online');
    IF (v_released->>'status') <> 'released_unpaid' THEN
      RAISE EXCEPTION 'release_visit did not set status to released_unpaid';
    END IF;

    -- ========================================================================
    -- SLICE 3: POS CHECKOUT, SETTLEMENT, SURCHARGES & EXCEPTIONS
    -- ========================================================================
    -- 1. POS Checkout Math Mismatch invariant (PW041)
    BEGIN
      PERFORM public.record_pos_checkout(v_id, 95.00, 0.00, 5.00, 10.00, 100.00, 'cash', NULL, true);
      RAISE EXCEPTION 'record_pos_checkout allowed unbalanced breakdown';
    EXCEPTION WHEN SQLSTATE 'PW041' THEN NULL;
    END;

    -- 2. Valid POS Cash Checkout on released_unpaid visit -> settles immediately and completes visit
    v_tx := public.record_pos_checkout(v_id, 95.00, 0.00, 5.00, 10.00, 110.00, 'cash', NULL, true);
    v_tx_id := (v_tx->>'id')::uuid;

    IF (v_tx->>'settlement_status') <> 'settled' THEN
      RAISE EXCEPTION 'record_pos_checkout did not mark cash transaction as settled';
    END IF;

    IF (SELECT status FROM public.visits WHERE id = v_id) <> 'completed' THEN
      RAISE EXCEPTION 'record_pos_checkout did not complete released_unpaid visit upon cash settlement';
    END IF;

    -- 3. Refund with short/missing explanation fails (PW046)
    BEGIN
      PERFORM public.process_visit_refund(v_tx_id, 50.00, 'too short');
      RAISE EXCEPTION 'process_visit_refund allowed refund without valid explanation';
    EXCEPTION WHEN SQLSTATE 'PW046' THEN NULL;
    END;

    -- 4. Valid Refund (WF15) -> transaction refunded, visit refunded
    v_refund := public.process_visit_refund(v_tx_id, 110.00, 'Customer dissatisfied with styling after coat inspection');
    IF (SELECT status FROM public.transactions WHERE id = v_tx_id) <> 'refunded' THEN
      RAISE EXCEPTION 'process_visit_refund did not mark transaction as refunded';
    END IF;
    IF (SELECT status FROM public.visits WHERE id = v_id) <> 'refunded' THEN
      RAISE EXCEPTION 'process_visit_refund did not mark visit as refunded';
    END IF;

    -- 5. Surcharges (WF11) & Safety Stop (WF05/WF14) on a second visit
    INSERT INTO public.visits (business_id, client_id, pet_id, staff_id, station_id,
      service_package, total_amount, scheduled_time, duration_minutes, booking_buffer_minutes, status)
    VALUES (bespoke, client_id, pet_id, g2, table_one, 'Bath & Brush', 60.00, booked_start + interval '4 hours', 45, 15, 'styling')
    RETURNING id INTO v2_id;

    -- Request Surcharge
    v_surcharge := public.request_visit_surcharge(v2_id, 25.00, 'matted_coat', 20, 'Severe matting behind ears', 'https://example.test/matting.jpg');
    v_surcharge_id := (v_surcharge->>'id')::uuid;

    IF (SELECT status FROM public.visits WHERE id = v2_id) <> 'change_pending' THEN
      RAISE EXCEPTION 'request_visit_surcharge did not set visit status to change_pending';
    END IF;

    -- Resolve Surcharge without client consent must fail with PW044
    BEGIN
      PERFORM public.resolve_visit_surcharge(v_surcharge_id, true, false, 'Attempting approval without consent');
      RAISE EXCEPTION 'resolve_visit_surcharge allowed approval without client consent';
    EXCEPTION WHEN SQLSTATE 'PW044' THEN NULL;
    END;

    -- Resolve Surcharge with client consent -> total updated, extra time added, status restored to styling
    PERFORM public.resolve_visit_surcharge(v_surcharge_id, true, true, 'Client approved via SMS confirmation');
    IF (SELECT total_amount FROM public.visits WHERE id = v2_id) <> 85.00 THEN
      RAISE EXCEPTION 'Approved surcharge did not add to visit total_amount';
    END IF;
    IF (SELECT duration_minutes FROM public.visits WHERE id = v2_id) <> 65 THEN
      RAISE EXCEPTION 'Approved surcharge did not add extra time to duration_minutes';
    END IF;
    IF (SELECT status FROM public.visits WHERE id = v2_id) <> 'styling' THEN
      RAISE EXCEPTION 'Approved surcharge did not restore visit status to styling';
    END IF;

    -- Double resolution fails with PW043
    BEGIN
      PERFORM public.resolve_visit_surcharge(v_surcharge_id, false, false, 'Already resolved');
      RAISE EXCEPTION 'resolve_visit_surcharge allowed resolving already resolved surcharge';
    EXCEPTION WHEN SQLSTATE 'PW043' THEN NULL;
    END;

    -- 6. Safety Stop & Incident Report (WF05 / WF14)
    v_incident := public.stop_service_safety_concern(
      v2_id, 'Pet snapped suddenly during face scissoring', 'dog_bite', 'severe',
      'Puncture wound cleaned and bandaged with antiseptic', false, 40.00
    );
    v_inc_id := (v_incident->>'incident_id')::uuid;

    IF (SELECT status FROM public.visits WHERE id = v2_id) <> 'partly_completed' THEN
      RAISE EXCEPTION 'stop_service_safety_concern did not set visit status to partly_completed';
    END IF;
    IF (SELECT total_amount FROM public.visits WHERE id = v2_id) <> 40.00 THEN
      RAISE EXCEPTION 'stop_service_safety_concern did not adjust visit total_amount';
    END IF;

    -- Incident Report Immutability (PW040)
    BEGIN
      UPDATE public.incident_reports SET severity = 'minor' WHERE id = v_inc_id;
      RAISE EXCEPTION 'Allowed updating locked incident report';
    EXCEPTION WHEN SQLSTATE 'PW040' THEN NULL;
    END;

    BEGIN
      DELETE FROM public.incident_reports WHERE id = v_inc_id;
      RAISE EXCEPTION 'Allowed deleting locked incident report';
    EXCEPTION WHEN SQLSTATE 'PW040' THEN NULL;
    END;

    -- ========================================================================
    -- SLICE 4: COMMUNICATIONS, REPORT CARDS & DAY CLOSEOUT
    -- ========================================================================
    -- 1. Create a 3rd visit on the same day in 'bathing' status (in-progress)
    INSERT INTO public.visits (business_id, client_id, pet_id, staff_id, station_id,
      service_package, total_amount, scheduled_time, duration_minutes, booking_buffer_minutes, status)
    VALUES (bespoke, client_id, pet_id, g2, table_one, 'Deluxe Bath', 50.00, booked_start + interval '6 hours', 45, 15, 'bathing')
    RETURNING id INTO v3_id;

    -- 2. Day Closeout rejection due to in-progress visit (PW048)
    BEGIN
      PERFORM public.close_salon_day((booked_start AT TIME ZONE 'America/Chicago')::date, 0, NULL);
      RAISE EXCEPTION 'close_salon_day allowed closing day with in-progress visits';
    EXCEPTION WHEN SQLSTATE 'PW048' THEN NULL;
    END;

    -- 3. Save report card draft (WF07)
    v_card := public.save_report_card_draft(v3_id, 'good', '["cooperative", "calm"]'::jsonb, 'Handled bath very well', 'Brush twice weekly');
    v_card_id := (v_card->>'report_card_id')::uuid;
    IF (v_card->>'status') <> 'draft' THEN
      RAISE EXCEPTION 'save_report_card_draft did not create draft report card';
    END IF;

    -- 4. Publication gate: cannot publish report card while visit is in bathing (PW052)
    BEGIN
      PERFORM public.publish_report_card(v3_id, 'good', '["cooperative"]'::jsonb, 'All good', 'Brush daily');
      RAISE EXCEPTION 'publish_report_card allowed publishing while visit in bathing status';
    EXCEPTION WHEN SQLSTATE 'PW052' THEN NULL;
    END;

    -- 5. Advance v3_id to 'ready' -> now report card can be published
    UPDATE public.visits SET status = 'ready' WHERE id = v3_id;
    v_card := public.publish_report_card(v3_id, 'excellent', '["calm", "happy_tail"]'::jsonb, 'Shiny clean coat!', 'Maintenance bath in 4 weeks');
    IF (v_card->>'status') <> 'published' THEN
      RAISE EXCEPTION 'publish_report_card did not publish report card';
    END IF;
    IF (SELECT count(*) FROM public.client_communications WHERE visit_id = v3_id AND message_type = 'report_card_ready') <> 1 THEN
      RAISE EXCEPTION 'publish_report_card did not queue client communication';
    END IF;

    -- 6. POS Checkout v3_id with cash -> visit paid (awaiting physical release)
    PERFORM public.record_pos_checkout(v3_id, 45.00, 0.00, 5.00, 0.00, 50.00, 'cash', NULL, true);
    IF (SELECT status FROM public.visits WHERE id = v3_id) <> 'paid' THEN
      RAISE EXCEPTION 'Checkout did not transition v3_id to paid';
    END IF;

    -- Pet is paid but not yet released; day closeout must be blocked (PW048)
    BEGIN
      PERFORM public.close_salon_day((booked_start AT TIME ZONE 'America/Chicago')::date, 5000, NULL);
      RAISE EXCEPTION 'close_salon_day allowed closing day with unreleased paid visit';
    EXCEPTION WHEN SQLSTATE 'PW048' THEN NULL;
    END;

    -- Release pet to parent -> visit transitions to completed
    v_released := public.release_visit(v3_id, 'Alice Parent', false, NULL);
    IF (v_released->>'status') <> 'completed' THEN
      RAISE EXCEPTION 'release_visit did not complete paid visit v3_id';
    END IF;

    -- 7. Day Closeout rejection: variance without explanation (PW049)
    -- Expected cash: 5000 cents ($50). Providing counted = 6000 cents ($60) without reason:
    BEGIN
      PERFORM public.close_salon_day((booked_start AT TIME ZONE 'America/Chicago')::date, 6000, '');
      RAISE EXCEPTION 'close_salon_day allowed cash variance without explanation note';
    EXCEPTION WHEN SQLSTATE 'PW049' THEN NULL;
    END;

    -- 8. Valid Day Closeout with variance explanation (WF08)
    v_closeout := public.close_salon_day((booked_start AT TIME ZONE 'America/Chicago')::date, 6000, '$10 overage: extra cash tip placed in drawer');
    IF (v_closeout->>'status') <> 'closed' THEN
      RAISE EXCEPTION 'close_salon_day did not set status to closed';
    END IF;
    IF (v_closeout->>'expected_cash_cents')::int <> 5000 THEN
      RAISE EXCEPTION 'close_salon_day calculated wrong expected_cash_cents: %', v_closeout->>'expected_cash_cents';
    END IF;
    IF (v_closeout->>'variance_cents')::int <> 1000 THEN
      RAISE EXCEPTION 'close_salon_day calculated wrong variance_cents: %', v_closeout->>'variance_cents';
    END IF;

    -- 9. Closed Day Immutability (PW051)
    BEGIN
      UPDATE public.daily_salon_days
      SET expected_cash_cents = 0
      WHERE business_id = bespoke AND salon_date = (booked_start AT TIME ZONE 'America/Chicago')::date;
      RAISE EXCEPTION 'Allowed modifying locked daily_salon_days after closeout';
    EXCEPTION WHEN SQLSTATE 'PW051' THEN NULL;
    END;

    -- 10. Client Communication Logging (WF16 / WF17)
    v_comm := public.log_client_communication(
      client_id, 'ready_for_pickup', 'sms', 'Your pet is ready for pickup!',
      v3_id, 'sent', 'msg_tw_12345', NULL, '555-0199', NULL
    );
    IF (v_comm->>'status') <> 'sent' THEN
      RAISE EXCEPTION 'log_client_communication did not record sent communication';
    END IF;

    -- ========================================================================
    -- SLICE 5: PAYROLL, COMMISSIONS & PERIOD LOCK (WF08, WF28, WF34)
    -- ========================================================================
    -- 11. Calculate payroll summary (WF28)
    SELECT count(*) INTO v_staff_count
    FROM public.calculate_payroll_summary(
      bespoke,
      (booked_start AT TIME ZONE 'America/Chicago')::date - 7,
      (booked_start AT TIME ZONE 'America/Chicago')::date + 7,
      'direct',
      15.00
    );
    IF v_staff_count = 0 THEN
      RAISE EXCEPTION 'calculate_payroll_summary returned 0 rows for active salon';
    END IF;

    -- 12. Lock payroll period (WF08)
    v_payroll := public.lock_payroll_period(
      (booked_start AT TIME ZONE 'America/Chicago')::date - 7,
      (booked_start AT TIME ZONE 'America/Chicago')::date + 7,
      'direct',
      15.00,
      'Bi-weekly staff payroll closeout'
    );
    IF (v_payroll->>'status') <> 'locked' THEN
      RAISE EXCEPTION 'lock_payroll_period did not return status = locked';
    END IF;
    v_period_id := (v_payroll->>'period_id')::uuid;

    -- 13. Locked payroll period immutability (PW060)
    BEGIN
      UPDATE public.payroll_periods
      SET total_payout_cents = 0
      WHERE id = v_period_id;
      RAISE EXCEPTION 'Allowed modifying locked payroll period totals';
    EXCEPTION WHEN SQLSTATE 'PW060' THEN NULL;
    END;

    BEGIN
      DELETE FROM public.payroll_periods WHERE id = v_period_id;
      RAISE EXCEPTION 'Allowed deleting locked payroll period';
    EXCEPTION WHEN SQLSTATE 'PW060' THEN NULL;
    END;

    -- ========================================================================
    -- SLICE 6: WAITLIST ENGINE, AUTOMATED SLOT HOLDS & EXPIRATION (WF02, WF15)
    -- ========================================================================
    -- 14. Create Waitlist Entry (WF02)
    v_wl_entry := public.create_waitlist_entry(
      client_id,
      pet_id,
      'Full Groom',
      g2,
      ARRAY[(booked_start AT TIME ZONE 'America/Chicago')::date + 2],
      'morning',
      'Prefers quiet morning slot if possible'
    );
    IF (v_wl_entry->>'success')::boolean IS NOT TRUE THEN
      RAISE EXCEPTION 'create_waitlist_entry failed: %', v_wl_entry;
    END IF;
    v_wl_entry_id := (v_wl_entry->>'entry_id')::uuid;

    -- 15. Generate Waitlist Offer (WF15: 2-hour hold)
    v_wl_offer := public.generate_waitlist_offer(
      v_wl_entry_id,
      booked_start + interval '7 days' + interval '2 hours',
      booked_start + interval '7 days' + interval '3 hours',
      g2,
      table_one,
      120
    );
    IF (v_wl_offer->>'success')::boolean IS NOT TRUE THEN
      RAISE EXCEPTION 'generate_waitlist_offer failed: %', v_wl_offer;
    END IF;
    v_wl_offer_id := (v_wl_offer->>'offer_id')::uuid;
    v_wl_token := v_wl_offer->>'claim_token';

    IF (SELECT status FROM public.waitlist_entries WHERE id = v_wl_entry_id) <> 'offered' THEN
      RAISE EXCEPTION 'Waitlist entry status did not update to offered';
    END IF;

    -- 16. Claim Waitlist Offer with Token (WF15 / GiST re-verification)
    v_wl_claim := public.claim_waitlist_offer(v_wl_offer_id, v_wl_token);
    IF (v_wl_claim->>'success')::boolean IS NOT TRUE OR (v_wl_claim->>'status') <> 'booked' THEN
      RAISE EXCEPTION 'claim_waitlist_offer failed: %', v_wl_claim;
    END IF;
    IF (SELECT status FROM public.waitlist_entries WHERE id = v_wl_entry_id) <> 'booked' THEN
      RAISE EXCEPTION 'Waitlist entry status did not update to booked';
    END IF;
    IF (SELECT status FROM public.waitlist_offers WHERE id = v_wl_offer_id) <> 'accepted' THEN
      RAISE EXCEPTION 'Waitlist offer status did not update to accepted';
    END IF;

    -- 17. Verify Expired Offer Rejection (PW062: "Silence is never acceptance")
    v_wl_entry2 := public.create_waitlist_entry(
      client_id,
      pet_id,
      'Full Groom',
      g2,
      '{}'::date[],
      'any',
      'Second waitlist entry for expiration test'
    );
    v_wl_entry2_id := (v_wl_entry2->>'entry_id')::uuid;

    v_wl_offer2 := public.generate_waitlist_offer(
      v_wl_entry2_id,
      booked_start + interval '7 days' + interval '4 hours',
      booked_start + interval '7 days' + interval '5 hours',
      g2,
      table_one,
      120
    );
    v_wl_offer2_id := (v_wl_offer2->>'offer_id')::uuid;
    v_wl_token2 := v_wl_offer2->>'claim_token';

    -- Simulate expiration by setting offer_expires_at in the past
    UPDATE public.waitlist_offers
    SET offer_expires_at = timezone('utc'::text, now()) - interval '5 minutes'
    WHERE id = v_wl_offer2_id;

    BEGIN
      PERFORM public.claim_waitlist_offer(v_wl_offer2_id, v_wl_token2);
      RAISE EXCEPTION 'claim_waitlist_offer allowed claiming expired slot hold';
    EXCEPTION WHEN SQLSTATE 'PW062' THEN NULL;
    END;

    -- 18. Sweep Expired Offers RPC (WF38 / WF39)
    v_wl_expired := public.expire_waitlist_offers();
    IF (v_wl_expired->>'success')::boolean IS NOT TRUE OR (v_wl_expired->>'expired_offers_count')::int < 1 THEN
      RAISE EXCEPTION 'expire_waitlist_offers failed or did not sweep expired offer: %', v_wl_expired;
    END IF;

    -- Verify offer transitioned to expired and entry reverted back to active
    IF (SELECT status FROM public.waitlist_offers WHERE id = v_wl_offer2_id) <> 'expired' THEN
      RAISE EXCEPTION 'Expired offer did not transition to expired';
    END IF;
    IF (SELECT status FROM public.waitlist_entries WHERE id = v_wl_entry2_id) <> 'active' THEN
      RAISE EXCEPTION 'Expired offer did not revert entry status back to active';
    END IF;
    -- 19. Mobile Van Telemetry Tracking (WF22 / PW070)
    INSERT INTO public.salon_stations (business_id, name, station_type, is_active)
    VALUES (bespoke, 'Mobile Van 1', 'van', true)
    RETURNING id INTO v_van_id;

    v_van_res := public.update_van_telemetry(v_van_id, 88, 92, 15, 14250.5, 41.8818, -87.6231);
    IF (v_van_res->>'success')::boolean IS NOT TRUE THEN
      RAISE EXCEPTION 'update_van_telemetry failed: %', v_van_res;
    END IF;
    IF (v_van_res->>'battery_pct')::int <> 88 OR (v_van_res->>'water_tank_pct')::int <> 92 THEN
      RAISE EXCEPTION 'update_van_telemetry returned invalid levels: %', v_van_res;
    END IF;

    -- Reject telemetry update on non-van station (PW070)
    BEGIN
      PERFORM public.update_van_telemetry(table_one, 50, 50, 50, 1000.0, 0.0, 0.0);
      RAISE EXCEPTION 'update_van_telemetry allowed telemetry update on non-van station';
    EXCEPTION WHEN SQLSTATE 'PW070' THEN NULL;
    END;

    -- 20. Curbside Stop Progression (WF22 / PW071)
    v_stop_res := public.advance_curbside_stop(v_id, 'en_route');
    IF (v_stop_res->>'curbside_status') <> 'en_route' THEN
      RAISE EXCEPTION 'advance_curbside_stop failed to transition to en_route';
    END IF;

    v_stop_res := public.advance_curbside_stop(v_id, 'arrived');
    IF (v_stop_res->>'curbside_status') <> 'arrived' THEN
      RAISE EXCEPTION 'advance_curbside_stop failed to transition to arrived';
    END IF;

    v_stop_res := public.advance_curbside_stop(v_id, 'curbside_active');
    IF (v_stop_res->>'curbside_status') <> 'curbside_active' THEN
      RAISE EXCEPTION 'advance_curbside_stop failed to transition to curbside_active';
    END IF;

    v_stop_res := public.advance_curbside_stop(v_id, 'completed');
    IF (v_stop_res->>'curbside_status') <> 'completed' THEN
      RAISE EXCEPTION 'advance_curbside_stop failed to transition to completed';
    END IF;

    -- 21. Configuration Copying with Zero-Leakage (WF30 / PW072)
    INSERT INTO public.businesses (name, slug, owner_email, subscription_status, booking_status)
    VALUES ('Bespoke Suburb', 'bespoke-suburb', 'bespoke@example.test', 'active', 'draft')
    RETURNING id INTO v_sibling_salon;

    INSERT INTO public.business_configs (business_id, custom_settings)
    VALUES (v_sibling_salon, '{}'::jsonb);

    -- Dry run preview
    v_cfg_res := public.copy_salon_configuration(bespoke, v_sibling_salon, true);
    IF (v_cfg_res->>'dry_run')::boolean IS NOT TRUE OR (v_cfg_res->>'packages_count')::int < 1 THEN
      RAISE EXCEPTION 'copy_salon_configuration dry run failed: %', v_cfg_res;
    END IF;

    -- Apply real copy
    v_cfg_res := public.copy_salon_configuration(bespoke, v_sibling_salon, false);
    IF (v_cfg_res->>'dry_run')::boolean IS NOT FALSE OR (v_cfg_res->>'packages_copied')::int < 1 THEN
      RAISE EXCEPTION 'copy_salon_configuration apply failed: %', v_cfg_res;
    END IF;

    -- Verify zero-leakage invariant (PW072): zero clients or visits in target salon
    IF (SELECT count(*) FROM public.clients WHERE business_id = v_sibling_salon) <> 0 THEN
      RAISE EXCEPTION 'Zero-leakage violation: clients copied to sibling salon';
    END IF;
    IF (SELECT count(*) FROM public.visits WHERE business_id = v_sibling_salon) <> 0 THEN
      RAISE EXCEPTION 'Zero-leakage violation: visits copied to sibling salon';
    END IF;

    -- 22. Competitor Data Import & Atomic Rollback (WF33 / PW073 / PW074)
    v_import_res := public.apply_import_job(
      'moego',
      'moego_sample.csv',
      '[{"client_name": "Legacy Parent", "client_phone": "555-0999", "client_email": "legacy@test.io", "pet_name": "Legacy Dog", "breed": "Poodle", "weight_lbs": 30.5, "legacy_notes": "Needs gentle drying"}]'::jsonb
    );
    IF (v_import_res->>'success')::boolean IS NOT TRUE THEN
      RAISE EXCEPTION 'apply_import_job failed: %', v_import_res;
    END IF;
    v_import_job_id := (v_import_res->>'job_id')::uuid;

    -- Verify pet has explicit legacy provenance notes and rabies unverified (PW073)
    IF (SELECT behavior_notes FROM public.pets WHERE business_id = bespoke AND name = 'Legacy Dog') NOT LIKE '%[LEGACY IMPORT: MOEGO]%' THEN
      RAISE EXCEPTION 'Imported pet missing legacy provenance badge';
    END IF;
    IF (SELECT rabies_verified FROM public.pets WHERE business_id = bespoke AND name = 'Legacy Dog') IS NOT FALSE THEN
      RAISE EXCEPTION 'Imported pet rabies was marked verified';
    END IF;

    -- Atomic Rollback
    v_rollback_res := public.rollback_import_job(v_import_job_id);
    IF (v_rollback_res->>'success')::boolean IS NOT TRUE THEN
      RAISE EXCEPTION 'rollback_import_job failed: %', v_rollback_res;
    END IF;

    -- Verify imported entities were purged
    IF EXISTS (SELECT 1 FROM public.pets WHERE business_id = bespoke AND name = 'Legacy Dog') THEN
      RAISE EXCEPTION 'Rollback did not remove imported pet';
    END IF;
    IF EXISTS (SELECT 1 FROM public.clients WHERE business_id = bespoke AND phone = '555-0999') THEN
      RAISE EXCEPTION 'Rollback did not remove imported client';
    END IF;
    IF (SELECT status FROM public.import_jobs WHERE id = v_import_job_id) <> 'rolled_back' THEN
      RAISE EXCEPTION 'Import job status did not update to rolled_back';
    END IF;
  END;

  UPDATE public.businesses SET booking_status = 'paused' WHERE id = bespoke;
END $$;

SET ROLE anon;
DO $$
DECLARE target_day constant date := (now() AT TIME ZONE 'America/Chicago')::date + 10;
BEGIN
  IF (SELECT booking_status FROM public.booking_service_catalog WHERE slug = 'bespoke-chicago') <> 'paused' THEN
    RAISE EXCEPTION 'Paused salon did not project paused booking_status';
  END IF;
  BEGIN
    PERFORM public.public_booking_slots('bespoke-chicago', 'full-groom', target_day);
    RAISE EXCEPTION 'Paused salon returned booking slots';
  EXCEPTION WHEN SQLSTATE 'PW024' THEN NULL;
  END;
END $$;
RESET ROLE;

--Even superuser/service_role cannot directly delete audit rows for an existing salon,
--yet deleting the salon itself cascades cleanly.
DO $$
DECLARE bespoke uuid;
BEGIN
  SELECT id INTO bespoke FROM public.businesses WHERE slug = 'bespoke-chicago';
  BEGIN
    DELETE FROM public.workflow_events WHERE business_id = bespoke;
    RAISE EXCEPTION 'Direct workflow_events delete succeeded for existing salon';
  EXCEPTION WHEN SQLSTATE 'PW040' THEN NULL;
  END;
  DELETE FROM public.businesses WHERE id = bespoke;
  IF (SELECT count(*) FROM public.workflow_events WHERE business_id = bespoke) <> 0 THEN
    RAISE EXCEPTION 'Deleting a salon did not cascade its workflow_events';
  END IF;
END $$;
SQL
printf 'Migration execution and basic tenant/RPC checks passed.\n'
