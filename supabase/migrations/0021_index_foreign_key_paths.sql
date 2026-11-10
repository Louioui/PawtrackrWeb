-- Cover foreign-key paths used by tenant cleanup, client/pet history, staff
-- schedules, waivers, and review workflows. PostgreSQL does not create these
-- indexes automatically when a foreign key is declared.

CREATE INDEX IF NOT EXISTS businesses_parent_franchise_id_idx
    ON public.businesses (parent_franchise_id);

CREATE INDEX IF NOT EXISTS digital_waivers_client_id_idx
    ON public.digital_waivers (client_id);
CREATE INDEX IF NOT EXISTS digital_waivers_pet_id_idx
    ON public.digital_waivers (pet_id);
CREATE INDEX IF NOT EXISTS digital_waivers_visit_id_idx
    ON public.digital_waivers (visit_id);

CREATE INDEX IF NOT EXISTS gift_cards_and_credits_client_id_idx
    ON public.gift_cards_and_credits (client_id);

CREATE INDEX IF NOT EXISTS intake_questionnaires_business_id_idx
    ON public.intake_questionnaires (business_id);

CREATE INDEX IF NOT EXISTS review_requests_business_id_idx
    ON public.review_requests (business_id);
CREATE INDEX IF NOT EXISTS review_requests_client_id_idx
    ON public.review_requests (client_id);
CREATE INDEX IF NOT EXISTS review_requests_visit_id_idx
    ON public.review_requests (visit_id);

CREATE INDEX IF NOT EXISTS staff_shifts_staff_id_idx
    ON public.staff_shifts (staff_id);

CREATE INDEX IF NOT EXISTS visits_client_id_idx
    ON public.visits (client_id);
CREATE INDEX IF NOT EXISTS visits_pet_id_idx
    ON public.visits (pet_id);
CREATE INDEX IF NOT EXISTS visits_staff_id_idx
    ON public.visits (staff_id);
