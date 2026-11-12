-- Restore the previous frontend before applying this rollback.
-- Keep correction history intact for audit. Existing sales are not modified.
BEGIN;
REVOKE UPDATE (brand,model,variant,qty,unit_price,notes), DELETE ON public.competitor_sellout FROM authenticated;
DROP POLICY IF EXISTS competitor_ec_update_today ON public.competitor_sellout;
DROP POLICY IF EXISTS competitor_ec_delete_today ON public.competitor_sellout;
-- INSERT remains limited to input fields; created_at stays server-controlled.
COMMIT;
