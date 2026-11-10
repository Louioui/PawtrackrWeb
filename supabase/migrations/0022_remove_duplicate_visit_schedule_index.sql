-- Migration 0001 already created idx_visits_business_scheduled on the same
-- (business_id, scheduled_time) columns. Keep the original index and remove
-- the redundant copy introduced by migration 0018.
DROP INDEX IF EXISTS public.visits_business_schedule_idx;
