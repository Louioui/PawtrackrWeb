-- Enforce cent-exact balance and one completed checkout per visit at the database
-- layer so concurrent requests or direct Data API writes cannot create duplicate
-- completed checkouts or unbalanced transaction totals.
ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_discount_and_amount_balance
    CHECK (discount <= subtotal AND amount = subtotal - discount + tax + tip);

CREATE UNIQUE INDEX transactions_one_completed_per_visit
    ON public.transactions (visit_id)
    WHERE (status = 'completed');
