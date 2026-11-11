-- Retains the production role and assignment rules; only calendar timezone changes.
CREATE OR REPLACE FUNCTION public.can_access_store(p_store_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  select
    coalesce(public.current_app_role() = 'admin', false)
    or exists (
      select 1 from public.profiles p
      join public.manpower m on m.id = p.manpower_id
      join public.store_assignments sa on sa.manpower_id = m.id
      where p.id = (select auth.uid()) and p.is_active = true
        and public.current_app_role() = 'ec' and sa.store_id = p_store_id
        and (now() at time zone 'Asia/Pontianak')::date between sa.valid_from and coalesce(sa.valid_to, 'infinity'::date)
    )
    or exists (
      select 1 from public.coverage_assignments ca
      where ca.profile_id = (select auth.uid()) and ca.store_id = p_store_id
        and (now() at time zone 'Asia/Pontianak')::date between ca.valid_from and coalesce(ca.valid_to, 'infinity'::date)
        and (ca.coverage_role = public.current_app_role()
          or (public.current_app_role() = 'tso' and ca.coverage_role = 'tl'))
    )
$function$;
