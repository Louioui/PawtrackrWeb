-- Single-column foreign keys prove existence but do not prove that linked
-- records belong to the same business. Check every tenant-owned reference.
CREATE OR REPLACE FUNCTION public.assert_same_business_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    reference_id uuid;
    reference_business_id uuid;
BEGIN
    EXECUTE format('SELECT ($1).%I', TG_ARGV[0]) INTO reference_id USING NEW;
    IF reference_id IS NULL THEN
        RETURN NEW;
    END IF;

    EXECUTE format('SELECT business_id FROM public.%I WHERE id = $1', TG_ARGV[1])
        INTO reference_business_id USING reference_id;

    IF reference_business_id IS DISTINCT FROM NEW.business_id THEN
        RAISE EXCEPTION 'Cross-business reference in %.% to %',
            TG_TABLE_NAME, TG_ARGV[0], TG_ARGV[1]
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_same_business_reference() FROM PUBLIC;

-- Reject an upgrade if historical rows already cross the business boundary.
-- Resolve those rows explicitly before applying this migration.
DO $$
DECLARE
    relation record;
    invalid_count bigint;
BEGIN
    FOR relation IN
        SELECT * FROM (VALUES
            ('pets', 'client_id', 'clients'),
            ('visits', 'client_id', 'clients'),
            ('visits', 'pet_id', 'pets'),
            ('visits', 'staff_id', 'staff_members'),
            ('transactions', 'visit_id', 'visits'),
            ('digital_waivers', 'client_id', 'clients'),
            ('digital_waivers', 'pet_id', 'pets'),
            ('digital_waivers', 'visit_id', 'visits'),
            ('gift_cards_and_credits', 'client_id', 'clients'),
            ('staff_shifts', 'staff_id', 'staff_members'),
            ('review_requests', 'visit_id', 'visits'),
            ('review_requests', 'client_id', 'clients')
        ) AS refs(table_name, column_name, parent_name)
    LOOP
        EXECUTE format(
            'SELECT count(*) FROM public.%I child JOIN public.%I parent ON parent.id = child.%I WHERE child.business_id <> parent.business_id',
            relation.table_name, relation.parent_name, relation.column_name
        ) INTO invalid_count;
        IF invalid_count > 0 THEN
            RAISE EXCEPTION 'Found % cross-business references in %.%',
                invalid_count, relation.table_name, relation.column_name;
        END IF;
    END LOOP;
END;
$$;

CREATE TRIGGER pets_client_business
BEFORE INSERT OR UPDATE OF business_id, client_id ON public.pets
FOR EACH ROW EXECUTE FUNCTION public.assert_same_business_reference('client_id', 'clients');

CREATE TRIGGER visits_client_business
BEFORE INSERT OR UPDATE OF business_id, client_id ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.assert_same_business_reference('client_id', 'clients');
CREATE TRIGGER visits_pet_business
BEFORE INSERT OR UPDATE OF business_id, pet_id ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.assert_same_business_reference('pet_id', 'pets');
CREATE TRIGGER visits_staff_business
BEFORE INSERT OR UPDATE OF business_id, staff_id ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.assert_same_business_reference('staff_id', 'staff_members');

CREATE TRIGGER transactions_visit_business
BEFORE INSERT OR UPDATE OF business_id, visit_id ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.assert_same_business_reference('visit_id', 'visits');

CREATE TRIGGER waivers_client_business
BEFORE INSERT OR UPDATE OF business_id, client_id ON public.digital_waivers
FOR EACH ROW EXECUTE FUNCTION public.assert_same_business_reference('client_id', 'clients');
CREATE TRIGGER waivers_pet_business
BEFORE INSERT OR UPDATE OF business_id, pet_id ON public.digital_waivers
FOR EACH ROW EXECUTE FUNCTION public.assert_same_business_reference('pet_id', 'pets');
CREATE TRIGGER waivers_visit_business
BEFORE INSERT OR UPDATE OF business_id, visit_id ON public.digital_waivers
FOR EACH ROW EXECUTE FUNCTION public.assert_same_business_reference('visit_id', 'visits');

CREATE TRIGGER credits_client_business
BEFORE INSERT OR UPDATE OF business_id, client_id ON public.gift_cards_and_credits
FOR EACH ROW EXECUTE FUNCTION public.assert_same_business_reference('client_id', 'clients');
CREATE TRIGGER shifts_staff_business
BEFORE INSERT OR UPDATE OF business_id, staff_id ON public.staff_shifts
FOR EACH ROW EXECUTE FUNCTION public.assert_same_business_reference('staff_id', 'staff_members');
CREATE TRIGGER reviews_visit_business
BEFORE INSERT OR UPDATE OF business_id, visit_id ON public.review_requests
FOR EACH ROW EXECUTE FUNCTION public.assert_same_business_reference('visit_id', 'visits');
CREATE TRIGGER reviews_client_business
BEFORE INSERT OR UPDATE OF business_id, client_id ON public.review_requests
FOR EACH ROW EXECUTE FUNCTION public.assert_same_business_reference('client_id', 'clients');
