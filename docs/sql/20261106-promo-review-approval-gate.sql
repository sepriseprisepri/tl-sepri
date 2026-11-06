-- Samsung Kalteng Promo Center: fail-closed approval gate for six uncertain
-- internal bulletin records. Adds metadata, does not approve or publish any row.
ALTER TABLE public.sales_promotions
  ADD COLUMN IF NOT EXISTS initial_review_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_evidence text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- Seed the gate on original unresolved information; do NOT modify publication.
UPDATE public.sales_promotions SET initial_review_required=true
WHERE source_type='internal_bulletin'
  AND requires_review=true
  AND import_key LIKE 'master-20261030-%';

ALTER TABLE public.sales_promotions
  ADD CONSTRAINT sales_promotions_no_publish_pending_review
  CHECK (NOT published OR NOT requires_review);
ALTER TABLE public.sales_promotions
  ADD CONSTRAINT sales_promotions_gate_requires_evidence
  CHECK (
    NOT initial_review_required
    OR NOT published
    OR (
      NOT requires_review
      AND length(trim(review_evidence)) BETWEEN 25 AND 2000
      AND reviewed_by IS NOT NULL
      AND reviewed_at IS NOT NULL
    )
  );
ALTER TABLE public.sales_promotions
  ADD CONSTRAINT sales_promotions_review_evidence_length
  CHECK (length(review_evidence)<=2000);

-- Require evidence and keep the original need-for-review flag immutable.
-- SECURITY INVOKER; existing Admin-only RLS policies retain authorization.
CREATE OR REPLACE FUNCTION public.guard_promo_review_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $guard$
BEGIN
  IF TG_OP='UPDATE'
     AND OLD.initial_review_required
     AND NOT NEW.initial_review_required THEN
    RAISE EXCEPTION 'Original promo review gate cannot be disabled';
  END IF;
  IF NEW.published AND NEW.requires_review THEN
    RAISE EXCEPTION 'Promo with unresolved review must remain unpublished';
  END IF;
  IF NEW.published AND NEW.initial_review_required
     AND (length(trim(NEW.review_evidence)) < 25
       OR NEW.reviewed_at IS NULL
       OR NEW.reviewed_by IS NULL) THEN
    RAISE EXCEPTION 'Review evidence and reviewer required before publication';
  END IF;
  RETURN NEW;
END
$guard$;
REVOKE ALL ON FUNCTION public.guard_promo_review_gate() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_promo_review_gate ON public.sales_promotions;
CREATE TRIGGER guard_promo_review_gate
BEFORE INSERT OR UPDATE ON public.sales_promotions
FOR EACH ROW EXECUTE FUNCTION public.guard_promo_review_gate();

-- No new tables, permissions, or non-Admin write grants.
