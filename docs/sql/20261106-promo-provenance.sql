-- Samsung Kalteng: internal November 2026 promo bulletin provenance + structured offers.
-- Avoid misattribution: user-supplied internal bulletin is NOT verified on Samsung.com.
-- Existing official-web campaigns keep their source and verification unchanged.
ALTER TABLE public.sales_promotions ALTER COLUMN source_url DROP NOT NULL;
ALTER TABLE public.sales_promotions
 ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'official_web'
   CHECK (source_type IN ('official_web','internal_bulletin')),
 ADD COLUMN IF NOT EXISTS source_reference text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS source_date date,
 ADD COLUMN IF NOT EXISTS verified_basis text NOT NULL DEFAULT 'official_site',
 ADD COLUMN IF NOT EXISTS program_category text NOT NULL DEFAULT 'general'
   CHECK (program_category IN ('general','smartphone','tablet','wearable','audio','financing','price','information')),
 ADD COLUMN IF NOT EXISTS sku_variant text NOT NULL DEFAULT 'Semua varian',
 ADD COLUMN IF NOT EXISTS channel_code text NOT NULL DEFAULT 'unspecified'
   CHECK (channel_code IN ('unspecified','all','offline','traditional','organized','e_store','online')),
 ADD COLUMN IF NOT EXISTS offer_items jsonb NOT NULL DEFAULT '[]'::jsonb
   CHECK (jsonb_typeof(offer_items)='array' AND pg_column_size(offer_items) <= 12288),
 ADD COLUMN IF NOT EXISTS record_kind text NOT NULL DEFAULT 'offer'
   CHECK (record_kind IN ('offer','price_update','no_offer','information','financing')),
 ADD COLUMN IF NOT EXISTS review_notes text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS requires_review boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS import_key text UNIQUE;
ALTER TABLE public.sales_promotions
 ADD CONSTRAINT sales_promotions_source_provenance_chk
 CHECK (
   (source_type='official_web' AND source_url IS NOT NULL AND source_url ~ '^https://')
   OR
   (source_type='internal_bulletin' AND length(trim(source_reference)) > 0)
 );
CREATE INDEX IF NOT EXISTS sales_promotions_internal_source_idx
 ON public.sales_promotions(source_type,source_date);
CREATE INDEX IF NOT EXISTS sales_promotions_channel_idx
 ON public.sales_promotions(channel_code,program_category,start_date,end_date);
-- Existing RLS still requires active app role and published + verified state.
-- 'verified' for internal bulletin means faithfully transcribed from supplied document,
-- not endorsed or publicly verified by Samsung Indonesia.
