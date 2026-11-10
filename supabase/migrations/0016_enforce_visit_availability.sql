-- The staff reservation API checks salon operating hours and groomer shifts
-- before it inserts a visit, but any caller holding a staff token can write
-- public.visits through the Data API and skip that check. This trigger makes
-- the database the final gate for the same rules.
--
-- Scope, deliberately narrow:
--   * Only active reservations are checked (booked .. ready). Completed and
--     cancelled rows, including imported history, are never rejected.
--   * An update is rechecked only when it moves the reservation (time,
--     duration, buffer, groomer, salon) or reactivates it. Advancing the status
--     of a visit that is already on the books always succeeds, so a later
--     change to hours or shifts cannot strand a dog that is mid-groom.
--   * Rows that already exist are not revalidated by this migration.
--
-- Rules mirror src/lib/live-reservations.ts:
--   * A missing time zone means UTC. An unknown zone or unusable operating
--     hours rejects the reservation rather than guessing.
--   * Service plus buffer must start and end on one salon-local day, inside
--     operating hours.
--   * If the groomer has shift rows for that local day, any time_off row blocks
--     the day and a scheduled row must contain the whole reservation. A day
--     with no shift rows falls back to operating hours.
--
-- SQLSTATEs: PW001 outside operating hours, PW002 groomer shift or time off,
-- PW003 salon availability settings unusable.

-- Resolves a salon wall-clock time to one instant. Returns NULL for a malformed
-- clock, a time skipped by a daylight-saving jump, or a time repeated when the
-- clocks go back, so an ambiguous shift boundary can never grant availability.
CREATE OR REPLACE FUNCTION private.salon_local_instant(local_date date, clock text, zone text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    wall timestamp;
    resolved timestamptz;
    step interval;
BEGIN
    IF local_date IS NULL OR clock IS NULL OR clock !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
        RETURN NULL;
    END IF;
    wall := local_date + clock::time;
    resolved := wall AT TIME ZONE zone;
    IF (resolved AT TIME ZONE zone) <> wall THEN
        RETURN NULL;
    END IF;
    FOREACH step IN ARRAY ARRAY[interval '30 minutes', interval '1 hour', interval '2 hours'] LOOP
        IF ((resolved + step) AT TIME ZONE zone) = wall OR ((resolved - step) AT TIME ZONE zone) = wall THEN
            RETURN NULL;
        END IF;
    END LOOP;
    RETURN resolved;
END;
$$;
REVOKE ALL ON FUNCTION private.salon_local_instant(date, text, text) FROM PUBLIC, anon, authenticated;

-- Reads and validates a salon's schedule settings once. Raises PW003 when the
-- time zone is unknown or operating hours are unusable. buffer_minutes is NULL
-- when the configured buffer is missing or out of range; callers that need it
-- (public booking) must reject that themselves.
CREATE OR REPLACE FUNCTION private.salon_schedule(
    p_business_id uuid,
    OUT zone text, OUT open_clock text, OUT close_clock text, OUT buffer_minutes integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    clock_pattern constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
    settings jsonb;
BEGIN
    SELECT custom_settings INTO settings
    FROM public.business_configs
    WHERE business_id = p_business_id;

    zone := COALESCE(settings ->> 'time_zone', 'UTC');
    open_clock := settings #>> '{operating_hours,open}';
    close_clock := settings #>> '{operating_hours,close}';
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = zone)
        OR open_clock IS NULL OR close_clock IS NULL
        OR open_clock !~ clock_pattern OR close_clock !~ clock_pattern
        OR open_clock >= close_clock THEN
        RAISE EXCEPTION 'Salon time zone or operating hours are not configured for reservations'
            USING ERRCODE = 'PW003';
    END IF;
    IF jsonb_typeof(settings -> 'booking_buffer_mins') = 'number'
        AND (settings ->> 'booking_buffer_mins') ~ '^[0-9]{1,3}$'
        AND (settings ->> 'booking_buffer_mins')::integer <= 240 THEN
        buffer_minutes := (settings ->> 'booking_buffer_mins')::integer;
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.salon_schedule(uuid) FROM PUBLIC, anon, authenticated;

-- Returns NULL when [p_start, p_end) is bookable for the groomer, otherwise the
-- SQLSTATE that explains why not. The zone and clocks must come from
-- private.salon_schedule. SECURITY DEFINER so the check reads the salon's
-- shifts even when the caller's own row-level access would hide them: with
-- caller permissions, a role that could insert visits but not read shifts would
-- see "no shifts" and be let through. Every lookup is pinned to p_business_id.
CREATE OR REPLACE FUNCTION private.visit_window_error(
    p_business_id uuid, p_staff_id uuid, p_zone text, p_open text, p_close text,
    p_start timestamptz, p_end timestamptz
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    local_start timestamp := p_start AT TIME ZONE p_zone;
    local_end timestamp := p_end AT TIME ZONE p_zone;
    shift_rows integer;
    has_time_off boolean;
    fits_shift boolean;
BEGIN
    IF local_start::date <> local_end::date
        OR local_start::time < p_open::time
        OR local_end::time > p_close::time THEN
        RETURN 'PW001';
    END IF;
    IF p_staff_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT count(*),
           COALESCE(bool_or(status = 'time_off'), false),
           COALESCE(bool_or(
               status = 'scheduled'
               AND private.salon_local_instant(shift_date, start_time, p_zone) <= p_start
               AND private.salon_local_instant(shift_date, end_time, p_zone) >= p_end
           ), false)
    INTO shift_rows, has_time_off, fits_shift
    FROM public.staff_shifts
    WHERE business_id = p_business_id
      AND staff_id = p_staff_id
      AND shift_date = local_start::date;

    IF shift_rows > 0 AND (has_time_off OR NOT fits_shift) THEN
        RETURN 'PW002';
    END IF;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.visit_window_error(uuid, uuid, text, text, text, timestamptz, timestamptz)
    FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.enforce_visit_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    active_statuses constant text[] := ARRAY['booked', 'dropped_off', 'bathing', 'styling', 'ready'];
    schedule record;
    failure text;
BEGIN
    IF NEW.status IS NULL OR NOT (NEW.status = ANY (active_statuses)) THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE'
        AND OLD.status = ANY (active_statuses)
        AND NEW.business_id = OLD.business_id
        AND NEW.staff_id IS NOT DISTINCT FROM OLD.staff_id
        AND NEW.scheduled_time = OLD.scheduled_time
        AND NEW.duration_minutes = OLD.duration_minutes
        AND NEW.booking_buffer_minutes = OLD.booking_buffer_minutes THEN
        RETURN NEW;
    END IF;

    SELECT * INTO schedule FROM private.salon_schedule(NEW.business_id);
    failure := private.visit_window_error(
        NEW.business_id, NEW.staff_id, schedule.zone, schedule.open_clock, schedule.close_clock,
        NEW.scheduled_time,
        NEW.scheduled_time + (NEW.duration_minutes + NEW.booking_buffer_minutes) * interval '1 minute');
    IF failure = 'PW001' THEN
        RAISE EXCEPTION 'Reservation is outside salon operating hours (% to % %)',
            schedule.open_clock, schedule.close_clock, schedule.zone
            USING ERRCODE = 'PW001';
    ELSIF failure = 'PW002' THEN
        RAISE EXCEPTION 'Groomer is on time off or not scheduled for the full reservation'
            USING ERRCODE = 'PW002';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_visit_availability() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_visit_availability
BEFORE INSERT OR UPDATE
ON public.visits
FOR EACH ROW EXECUTE FUNCTION private.enforce_visit_availability();
