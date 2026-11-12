-- Roll back frontend to the previous release before executing this migration.
-- Preserve targets, allocations, and audit history.
BEGIN;
GRANT EXECUTE ON FUNCTION public.set_focus_model_ec_allocation(uuid,uuid,text,uuid,numeric,numeric) TO authenticated;
DROP FUNCTION IF EXISTS public.focus_model_store_summary(uuid);
COMMIT;
