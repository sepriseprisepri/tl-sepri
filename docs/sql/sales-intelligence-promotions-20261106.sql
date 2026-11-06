-- Samsung Kalteng Sales Intelligence: role-scoped promotions and personal preferences.
-- This migration creates only new tables. Existing sellout, target and coverage data remain unchanged.
CREATE TABLE IF NOT EXISTS public.sales_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 4 AND 160),
  model_code text NOT NULL CHECK (length(trim(model_code)) BETWEEN 1 AND 100),
  model_name text NOT NULL CHECK (length(trim(model_name)) BETWEEN 1 AND 160),
  benefit text NOT NULL CHECK (length(trim(benefit)) BETWEEN 4 AND 600),
  terms text NOT NULL DEFAULT '',
  channel_label text NOT NULL DEFAULT 'Samsung Indonesia',
  scope_type text NOT NULL DEFAULT 'national' CHECK (scope_type IN ('national','selected_stores')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  source_url text NOT NULL CHECK (source_url ~ '^https://'),
  verification_state text NOT NULL DEFAULT 'draft' CHECK (verification_state IN ('draft','verified')),
  verified_at timestamptz,
  published boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_promotions_date_order CHECK (end_date >= start_date),
  CONSTRAINT sales_promotions_verified_publication CHECK (
    published = false OR (verification_state = 'verified' AND verified_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS sales_promotions_dates_idx
 ON public.sales_promotions (start_date,end_date) WHERE published=true;
CREATE INDEX IF NOT EXISTS sales_promotions_model_idx
 ON public.sales_promotions (model_code,published);
CREATE TABLE IF NOT EXISTS public.sales_promotion_stores (
 promo_id uuid NOT NULL REFERENCES public.sales_promotions(id) ON DELETE CASCADE,
 store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
 PRIMARY KEY (promo_id, store_id)
);
CREATE INDEX IF NOT EXISTS sales_promotion_stores_store_idx
 ON public.sales_promotion_stores(store_id);
CREATE TABLE IF NOT EXISTS public.user_saved_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE
      DEFAULT auth.uid(),
  feature text NOT NULL CHECK (feature IN ('sellout','coverage','promo','alerts','charts')),
  filter_name text NOT NULL CHECK (length(trim(filter_name)) BETWEEN 2 AND 60),
  filter_state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(filter_state)='object' AND pg_column_size(filter_state)<=4096),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, feature, filter_name)
);
CREATE INDEX IF NOT EXISTS user_saved_filters_user_idx ON public.user_saved_filters(user_id,feature);
CREATE TABLE IF NOT EXISTS public.user_ui_preferences (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE DEFAULT auth.uid(),
 table_density text NOT NULL DEFAULT 'comfortable' CHECK (table_density IN ('compact','comfortable')),
 updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_promotion_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_saved_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_ui_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sales_promotions,public.sales_promotion_stores,
 public.user_saved_filters,public.user_ui_preferences FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.sales_promotions,public.sales_promotion_stores,
 public.user_saved_filters,public.user_ui_preferences TO authenticated;

DROP POLICY IF EXISTS sales_promos_admin_manage ON public.sales_promotions;
CREATE POLICY sales_promos_admin_manage ON public.sales_promotions FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS sales_promos_read_verified ON public.sales_promotions;
CREATE POLICY sales_promos_read_verified ON public.sales_promotions FOR SELECT TO authenticated
USING (
  (SELECT public.current_app_role()) IN ('admin','tso','tl','ec')
  AND published AND verification_state='verified' AND verified_at IS NOT NULL
  AND (scope_type='national' OR EXISTS (
    SELECT 1 FROM public.sales_promotion_stores pst
    WHERE pst.promo_id=sales_promotions.id AND public.can_access_store(pst.store_id)
  ))
);

DROP POLICY IF EXISTS sales_promo_stores_admin_manage ON public.sales_promotion_stores;
CREATE POLICY sales_promo_stores_admin_manage ON public.sales_promotion_stores FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS sales_promo_stores_read_scoped ON public.sales_promotion_stores;
CREATE POLICY sales_promo_stores_read_scoped ON public.sales_promotion_stores FOR SELECT TO authenticated
  USING (
    (SELECT public.current_app_role()) IN ('admin','tl','tso','ec')
    AND public.can_access_store(store_id)
  );

DROP POLICY IF EXISTS user_saved_filters_own_select ON public.user_saved_filters;
CREATE POLICY user_saved_filters_own_select ON public.user_saved_filters FOR SELECT TO authenticated
  USING (user_id=(SELECT auth.uid()) AND (SELECT public.current_app_role()) IS NOT NULL);
DROP POLICY IF EXISTS user_saved_filters_own_insert ON public.user_saved_filters;
CREATE POLICY user_saved_filters_own_insert ON public.user_saved_filters FOR INSERT TO authenticated
  WITH CHECK (user_id=(SELECT auth.uid()) AND (SELECT public.current_app_role()) IS NOT NULL);
DROP POLICY IF EXISTS user_saved_filters_own_update ON public.user_saved_filters;
CREATE POLICY user_saved_filters_own_update ON public.user_saved_filters FOR UPDATE TO authenticated
  USING (user_id=(SELECT auth.uid()) AND (SELECT public.current_app_role()) IS NOT NULL)
  WITH CHECK (user_id=(SELECT auth.uid()) AND (SELECT public.current_app_role()) IS NOT NULL);
DROP POLICY IF EXISTS user_saved_filters_own_delete ON public.user_saved_filters;
CREATE POLICY user_saved_filters_own_delete ON public.user_saved_filters FOR DELETE TO authenticated
  USING (user_id=(SELECT auth.uid()) AND (SELECT public.current_app_role()) IS NOT NULL);

DROP POLICY IF EXISTS user_ui_pref_own_select ON public.user_ui_preferences;
CREATE POLICY user_ui_pref_own_select ON public.user_ui_preferences FOR SELECT TO authenticated
  USING (user_id=(SELECT auth.uid()) AND (SELECT public.current_app_role()) IS NOT NULL);
DROP POLICY IF EXISTS user_ui_pref_own_insert ON public.user_ui_preferences;
CREATE POLICY user_ui_pref_own_insert ON public.user_ui_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id=(SELECT auth.uid()) AND (SELECT public.current_app_role()) IS NOT NULL);
DROP POLICY IF EXISTS user_ui_pref_own_update ON public.user_ui_preferences;
CREATE POLICY user_ui_pref_own_update ON public.user_ui_preferences FOR UPDATE TO authenticated
  USING (user_id=(SELECT auth.uid()) AND (SELECT public.current_app_role()) IS NOT NULL)
  WITH CHECK (user_id=(SELECT auth.uid()) AND (SELECT public.current_app_role()) IS NOT NULL);

-- Verified national Samsung.com campaign, not an offer for *every* Galaxy model.
-- Source: https://www.samsung.com/id/offer/black-friday/
-- Official Samsung Indonesia page specifies 2026-10-30 through 2026-11-30.
INSERT INTO public.sales_promotions
(title,model_code,model_name,benefit,terms,channel_label,scope_type,
 start_date,end_date,source_url,verification_state,verified_at,published)
SELECT
 'Year-End Sale Starts Early','*','Penawaran umum Samsung Indonesia',
 'Pilihan promosi akhir tahun, cicilan 0% hingga 24 bulan, dan penawaran trade-in pada produk yang memenuhi ketentuan.',
 'Promo umum di situs resmi Samsung Indonesia; jenis produk, stok, kanal, bank, dan syarat masing-masing penawaran perlu dicek langsung pada halaman resmi. Ini bukan jaminan promo bagi setiap model.',
 'Samsung.com Indonesia','national',DATE '2026-10-30',DATE '2026-11-30',
 'https://www.samsung.com/id/offer/black-friday/','verified',now(),true
WHERE NOT EXISTS (
 SELECT 1 FROM public.sales_promotions
 WHERE source_url='https://www.samsung.com/id/offer/black-friday/' AND model_code='*'
);
