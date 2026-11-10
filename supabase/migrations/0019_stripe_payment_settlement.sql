-- A recorded checkout says what the salon rang up. Settlement says whether the
-- money actually arrived, and only a signature-verified Stripe webhook may
-- change it. The two are kept as separate facts so revenue is never reported
-- as settled on the app's word alone.
--
--   unsettled  no card payment has been started (cash, or card not yet charged)
--   pending    a PaymentIntent exists and Stripe has not confirmed it
--   settled    Stripe confirmed the full amount
--   failed     Stripe reported failure, or confirmed a different amount
--   refunded   Stripe reported a refund

ALTER TABLE public.transactions
    ADD COLUMN settlement_status text NOT NULL DEFAULT 'unsettled'
        CHECK (settlement_status IN ('unsettled', 'pending', 'settled', 'failed', 'refunded')),
    ADD COLUMN settled_at timestamptz,
    ADD COLUMN settlement_note text;

CREATE UNIQUE INDEX transactions_stripe_payment_intent_unique
    ON public.transactions (stripe_payment_intent_id)
    WHERE stripe_payment_intent_id IS NOT NULL;

-- Staff may link a PaymentIntent to their own salon's transaction, moving it
-- from unsettled to pending. They may not write any other settlement state:
-- settled, failed and refunded come only from the webhook path below. The
-- guard binds the API roles (anon, authenticated). The webhook function runs
-- as its owner and the server's service role is trusted, so neither is bound.
CREATE OR REPLACE FUNCTION private.guard_transaction_settlement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF current_user NOT IN ('anon', 'authenticated') THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF NEW.settlement_status <> 'unsettled' OR NEW.settled_at IS NOT NULL THEN
            RAISE EXCEPTION 'Settlement state is set only by verified payment events'
                USING ERRCODE = 'PW030';
        END IF;
        RETURN NEW;
    END IF;
    IF NEW.settlement_status IS DISTINCT FROM OLD.settlement_status
        OR NEW.settled_at IS DISTINCT FROM OLD.settled_at
        OR NEW.settlement_note IS DISTINCT FROM OLD.settlement_note
        OR NEW.stripe_payment_intent_id IS DISTINCT FROM OLD.stripe_payment_intent_id THEN
        IF OLD.settlement_status = 'unsettled' AND NEW.settlement_status = 'pending'
            AND OLD.stripe_payment_intent_id IS NULL AND NEW.stripe_payment_intent_id IS NOT NULL
            AND NEW.settled_at IS NULL AND NEW.settlement_note IS NOT DISTINCT FROM OLD.settlement_note THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'Settlement state is set only by verified payment events'
            USING ERRCODE = 'PW030';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_transaction_settlement() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_transaction_settlement_guard
BEFORE INSERT OR UPDATE
ON public.transactions
FOR EACH ROW EXECUTE FUNCTION private.guard_transaction_settlement();

-- Every Stripe event id is recorded once, so a redelivered webhook is a no-op.
CREATE TABLE public.stripe_webhook_events (
    event_id text PRIMARY KEY,
    event_type text NOT NULL,
    payment_intent_id text,
    outcome text NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_webhook_events FROM PUBLIC, anon, authenticated;

-- Called by the webhook route with the service role, only after the Stripe
-- signature has been verified. Returns the outcome it recorded:
--   duplicate | unknown_payment | settled | amount_mismatch | failed | refunded | ignored
CREATE OR REPLACE FUNCTION public.apply_stripe_payment_event(
    p_event_id text, p_event_type text, p_payment_intent_id text,
    p_amount_cents bigint, p_currency text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    target record;
    result_outcome text;
BEGIN
    IF p_event_id IS NULL OR p_event_type IS NULL OR p_payment_intent_id IS NULL THEN
        RAISE EXCEPTION 'Event id, type and payment intent are required' USING ERRCODE = 'PW031';
    END IF;

    INSERT INTO public.stripe_webhook_events (event_id, event_type, payment_intent_id, outcome)
    VALUES (p_event_id, p_event_type, p_payment_intent_id, 'processing')
    ON CONFLICT (event_id) DO NOTHING;
    IF NOT FOUND THEN
        RETURN 'duplicate';
    END IF;

    SELECT id, amount, settlement_status INTO target
    FROM public.transactions
    WHERE stripe_payment_intent_id = p_payment_intent_id
    FOR UPDATE;

    IF target.id IS NULL THEN
        result_outcome := 'unknown_payment';
    ELSIF p_event_type = 'payment_intent.succeeded' THEN
        IF target.settlement_status = 'refunded' THEN
            result_outcome := 'ignored';
        ELSIF lower(COALESCE(p_currency, '')) = 'usd' AND p_amount_cents = (target.amount * 100)::bigint THEN
            UPDATE public.transactions
            SET settlement_status = 'settled', settled_at = now(), settlement_note = NULL
            WHERE id = target.id;
            result_outcome := 'settled';
        ELSE
            UPDATE public.transactions
            SET settlement_status = 'failed', settled_at = NULL,
                settlement_note = 'Stripe confirmed a different amount or currency than the recorded checkout'
            WHERE id = target.id;
            result_outcome := 'amount_mismatch';
        END IF;
    ELSIF p_event_type = 'payment_intent.payment_failed' THEN
        IF target.settlement_status IN ('settled', 'refunded') THEN
            result_outcome := 'ignored';
        ELSE
            UPDATE public.transactions
            SET settlement_status = 'failed', settled_at = NULL, settlement_note = 'Stripe reported the payment failed'
            WHERE id = target.id;
            result_outcome := 'failed';
        END IF;
    ELSIF p_event_type = 'charge.refunded' THEN
        UPDATE public.transactions
        SET settlement_status = 'refunded', settlement_note = 'Stripe reported a refund'
        WHERE id = target.id;
        result_outcome := 'refunded';
    ELSE
        result_outcome := 'ignored';
    END IF;

    UPDATE public.stripe_webhook_events SET outcome = result_outcome
    WHERE event_id = p_event_id;
    RETURN result_outcome;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_stripe_payment_event(text, text, text, bigint, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stripe_payment_event(text, text, text, bigint, text) TO service_role;
