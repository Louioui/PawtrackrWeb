-- Publish visit changes to Supabase Realtime so the staff calendar can refetch
-- when a booking is created or its status changes.
--
-- Realtime evaluates the existing "Tenant isolation for visits" SELECT policy
-- for each subscriber before delivering an event, so a staff member receives
-- only their own salon's changes and anonymous subscribers receive none. The
-- default replica identity is kept on purpose: UPDATE and DELETE events carry
-- only the primary key of the old row, never its previous contents.
--
-- The publication exists on Supabase projects. A plain PostgreSQL database
-- (local migration tests) does not have it, and this migration is then a no-op.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'visits'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.visits;
  END IF;
END
$$;
