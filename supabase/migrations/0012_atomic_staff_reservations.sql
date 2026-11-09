-- The exclusion constraint is the final concurrency gate for an assigned
-- groomer's active reservation. A read-before-write availability check alone
-- cannot protect simultaneous inserts from separate app processes.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.visits
    ADD COLUMN booking_buffer_minutes integer NOT NULL DEFAULT 0,
    ADD COLUMN reservation_end timestamptz;

ALTER TABLE public.visits
    ADD CONSTRAINT visits_duration_bounds CHECK (duration_minutes > 0 AND duration_minutes <= 1440),
    ADD CONSTRAINT visits_buffer_bounds CHECK (booking_buffer_minutes >= 0 AND booking_buffer_minutes <= 240);

CREATE OR REPLACE FUNCTION private.set_visit_reservation_end()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.reservation_end := NEW.scheduled_time +
        (NEW.duration_minutes + NEW.booking_buffer_minutes) * interval '1 minute';
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.set_visit_reservation_end() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_visit_reservation_end
BEFORE INSERT OR UPDATE
ON public.visits
FOR EACH ROW EXECUTE FUNCTION private.set_visit_reservation_end();

UPDATE public.visits
SET reservation_end = scheduled_time +
    (duration_minutes + booking_buffer_minutes) * interval '1 minute';
ALTER TABLE public.visits ALTER COLUMN reservation_end SET NOT NULL;
ALTER TABLE public.visits
    ADD CONSTRAINT visits_reservation_end_after_start CHECK (reservation_end > scheduled_time);

ALTER TABLE public.visits
    ADD CONSTRAINT visits_no_overlapping_active_staff_reservations
    EXCLUDE USING gist (
        business_id WITH =,
        staff_id WITH =,
        tstzrange(scheduled_time, reservation_end, '[)') WITH &&
    ) WHERE (staff_id IS NOT NULL AND status IN ('booked', 'dropped_off', 'bathing', 'styling', 'ready'));
