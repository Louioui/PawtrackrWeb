-- Salon subscription billing.
--
-- 1. Billing state on public.businesses becomes writable only by verified
--    Stripe events. Before this migration the "Tenant staff can update own
--    business" policy let any signed-in staff member set their own salon's
--    subscription_status to 'active' through the Data API.
-- 2. public.apply_stripe_subscription_event records each Stripe event once and
--    is the only writer of plan, status, customer and subscription ids.

ALTER TABLE public.businesses
    ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
    ADD COLUMN IF NOT EXISTS subscription_event_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS businesses_stripe_customer_key
    ON public.businesses (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS businesses_stripe_subscription_key
    ON public.businesses (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- The API roles may still edit a salon's name and other profile fields, but
-- not its billing state. Functions that run as their owner (provisioning, the
-- event function below) and the service role are not bound.
CREATE OR REPLACE FUNCTION private.guard_business_billing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF current_user NOT IN ('anon', 'authenticated') THEN
        RETURN NEW;
    END IF;
    IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
        OR NEW.subscription_plan IS DISTINCT FROM OLD.subscription_plan
        OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
        OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
        OR NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id
        OR NEW.subscription_event_at IS DISTINCT FROM OLD.subscription_event_at THEN
        RAISE EXCEPTION 'Billing state is set only by verified Stripe events'
            USING ERRCODE = 'PW040';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_business_billing() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_business_billing_guard ON public.businesses;
CREATE TRIGGER trg_business_billing_guard
BEFORE UPDATE ON public.businesses
FOR EACH ROW EXECUTE FUNCTION private.guard_business_billing();

-- Subscription events have no payment intent.
ALTER TABLE public.stripe_webhook_events
    ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS stripe_webhook_events_business_idx
    ON public.stripe_webhook_events (business_id) WHERE business_id IS NOT NULL;

-- Called by the webhook route with the service role, only after the Stripe
-- signature has been verified. Returns the outcome it recorded:
--   duplicate | unknown_business | customer_mismatch | stale | linked | updated
--
-- p_status NULL means "link the customer and subscription ids only" (a
-- completed Checkout session does not say what state the subscription is in).
-- p_event_created is Stripe's own event time; an event older than the last one
-- applied is recorded as stale and changes nothing, so a late 'trialing' can
-- never overwrite a newer 'canceled'.
CREATE OR REPLACE FUNCTION public.apply_stripe_subscription_event(
    p_event_id text, p_event_type text, p_event_created timestamptz,
    p_business_id uuid, p_customer_id text, p_subscription_id text,
    p_status text, p_plan text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    target public.businesses%ROWTYPE;
    result_outcome text;
BEGIN
    IF p_event_id IS NULL OR p_event_type IS NULL OR p_event_created IS NULL THEN
        RAISE EXCEPTION 'Event id, type and creation time are required' USING ERRCODE = 'PW041';
    END IF;
    IF p_status IS NOT NULL AND p_status NOT IN ('active', 'trialing', 'past_due', 'canceled') THEN
        RAISE EXCEPTION 'Unsupported subscription status' USING ERRCODE = 'PW041';
    END IF;
    IF p_plan IS NOT NULL AND p_plan NOT IN ('solo_van', 'salon_pro') THEN
        RAISE EXCEPTION 'Unsupported subscription plan' USING ERRCODE = 'PW041';
    END IF;

    INSERT INTO public.stripe_webhook_events (event_id, event_type, outcome)
    VALUES (p_event_id, p_event_type, 'processing')
    ON CONFLICT (event_id) DO NOTHING;
    IF NOT FOUND THEN
        RETURN 'duplicate';
    END IF;

    -- The salon named in our own Checkout metadata wins; otherwise fall back to
    -- ids a previous event already linked.
    SELECT * INTO target FROM public.businesses b
    WHERE (p_business_id IS NOT NULL AND b.id = p_business_id)
       OR (p_business_id IS NULL AND p_subscription_id IS NOT NULL AND b.stripe_subscription_id = p_subscription_id)
       OR (p_business_id IS NULL AND p_subscription_id IS NULL AND p_customer_id IS NOT NULL AND b.stripe_customer_id = p_customer_id)
    ORDER BY (b.id = p_business_id) DESC NULLS LAST
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        result_outcome := 'unknown_business';
    ELSIF target.stripe_customer_id IS NOT NULL AND p_customer_id IS NOT NULL
          AND target.stripe_customer_id <> p_customer_id THEN
        result_outcome := 'customer_mismatch';
    ELSIF target.subscription_event_at IS NOT NULL AND p_event_created < target.subscription_event_at THEN
        result_outcome := 'stale';
    ELSE
        UPDATE public.businesses SET
            stripe_customer_id = COALESCE(p_customer_id, stripe_customer_id),
            stripe_subscription_id = CASE
                WHEN p_status = 'canceled' THEN NULL
                ELSE COALESCE(p_subscription_id, stripe_subscription_id) END,
            subscription_status = COALESCE(p_status, subscription_status),
            subscription_plan = COALESCE(p_plan, subscription_plan),
            subscription_event_at = p_event_created
        WHERE id = target.id;
        result_outcome := CASE WHEN p_status IS NULL THEN 'linked' ELSE 'updated' END;
    END IF;

    UPDATE public.stripe_webhook_events
    SET outcome = result_outcome, business_id = target.id
    WHERE event_id = p_event_id;
    RETURN result_outcome;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_stripe_subscription_event(text, text, timestamptz, uuid, text, text, text, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stripe_subscription_event(text, text, timestamptz, uuid, text, text, text, text)
    TO service_role;
