-- STAGING/REVIEW ONLY: production definition, one added admin rotation condition.
-- Never apply to production without explicit approval.
BEGIN;
CREATE OR REPLACE FUNCTION public.commit_master_database(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_period_id uuid := nullif(p_payload->>'period_id','')::uuid;
  v_period_start date;
  v_import_id uuid;
  v_row record;
  v_manpower_id uuid;
  v_store_id uuid;
  v_profile_id uuid;
  v_is_active boolean;
  v_new_manpower integer := 0;
  v_new_stores integer := 0;
  v_new_store_assignments integer := 0;
  v_new_coverage integer := 0;
  v_target_count integer := 0;
  v_allocation_count integer := 0;
  v_total integer := 0;
begin
  if v_uid is null or not exists (
    select 1 from public.profiles where id=v_uid and role='admin' and is_active=true
      and must_change_password is false
  ) then raise exception 'Akses ditolak: hanya Admin aktif yang dapat commit Master Database'; end if;
  if v_period_id is null then raise exception 'Periode target belum dipilih'; end if;
  select period_start into v_period_start from public.target_periods where id=v_period_id;
  if v_period_start is null then raise exception 'Periode target tidak ditemukan'; end if;
  if jsonb_typeof(p_payload->'manpower') <> 'array'
    or jsonb_typeof(p_payload->'stores') <> 'array'
    or jsonb_typeof(p_payload->'targets') <> 'array'
    or jsonb_typeof(p_payload->'ec_assignments') <> 'array'
    or jsonb_typeof(p_payload->'coverage') <> 'array'
  then raise exception 'Payload Master Database tidak lengkap'; end if;

  v_total := jsonb_array_length(p_payload->'manpower')
    + jsonb_array_length(p_payload->'stores')
    + jsonb_array_length(p_payload->'targets');
  insert into public.import_history(import_type,file_name,status,total_rows,uploaded_by,details)
  values('master_database',coalesce(nullif(p_payload->>'file_name',''),'Master Database.xlsx'),
    'processing',v_total,v_uid,jsonb_build_object('period_id',v_period_id,'phase','transactional_commit'))
  returning id into v_import_id;

  for v_row in select * from jsonb_to_recordset(p_payload->'manpower') as x(
    employee_id text,full_name text,position text,fieldforce_position text,
    promoter_id text,site_id text,tl_name text,tso_name text
  ) loop
    if nullif(trim(v_row.employee_id),'') is null or nullif(trim(v_row.full_name),'') is null
      then raise exception 'Employee ID atau nama manpower kosong'; end if;
    if not exists(select 1 from public.manpower where employee_id=v_row.employee_id)
      then v_new_manpower:=v_new_manpower+1; end if;
    insert into public.manpower(employee_id,full_name,position,fieldforce_position,promoter_id,site_id,tl_name,tso_name,is_active)
    values(trim(v_row.employee_id),trim(v_row.full_name),nullif(trim(v_row.position),''),
      nullif(trim(v_row.fieldforce_position),''),nullif(trim(v_row.promoter_id),''),
      nullif(trim(v_row.site_id),''),nullif(trim(v_row.tl_name),''),nullif(trim(v_row.tso_name),''),true)
    on conflict(employee_id) do update set
      full_name=excluded.full_name,position=excluded.position,
      fieldforce_position=excluded.fieldforce_position,
      promoter_id=coalesce(public.manpower.promoter_id,excluded.promoter_id),
      site_id=excluded.site_id,tl_name=excluded.tl_name,tso_name=excluded.tso_name,updated_at=now();
  end loop;

  for v_row in select * from jsonb_to_recordset(p_payload->'stores') as x(
    site_id text,site_name text,channel_category text
  ) loop
    if nullif(trim(v_row.site_id),'') is null or nullif(trim(v_row.site_name),'') is null then continue; end if;
    if not exists(select 1 from public.stores where site_id=v_row.site_id) then v_new_stores:=v_new_stores+1; end if;
    insert into public.stores(site_id,site_name,channel_category)
    values(trim(v_row.site_id),trim(v_row.site_name),nullif(trim(v_row.channel_category),''))
    on conflict(site_id) do update set site_name=excluded.site_name,
      channel_category=coalesce(excluded.channel_category,public.stores.channel_category),updated_at=now();
  end loop;

  for v_row in select * from jsonb_to_recordset(p_payload->'targets') as x(
    site_id text,target_qty numeric,target_amt numeric
  ) loop
    select id into v_store_id from public.stores where site_id=v_row.site_id;
    if v_store_id is null then raise exception 'Site ID target tidak ditemukan: %',v_row.site_id; end if;
    insert into public.store_targets(period_id,store_id,target_qty,target_amt)
    values(v_period_id,v_store_id,coalesce(v_row.target_qty,0),coalesce(v_row.target_amt,0))
    on conflict(period_id,store_id) do update set target_qty=excluded.target_qty,target_amt=excluded.target_amt,updated_at=now();
    v_target_count:=v_target_count+1;
  end loop;

  for v_row in select * from jsonb_to_recordset(p_payload->'ec_assignments') as x(employee_id text,site_id text) loop
    select id,is_active into v_manpower_id,v_is_active
      from public.manpower where employee_id=v_row.employee_id and fieldforce_position='EC';
    if v_manpower_id is null then raise exception 'Manpower EC tidak ditemukan: %',v_row.employee_id; end if;
    if not coalesce(v_is_active,false) then continue; end if;
    select id into v_store_id from public.stores where site_id=v_row.site_id;
    if v_store_id is null then raise exception 'Store assignment Site ID tidak ditemukan: %',v_row.site_id; end if;
    update public.store_assignments set valid_to=v_period_start-1
      where manpower_id=v_manpower_id and valid_to is null and store_id<>v_store_id;
    if not exists(select 1 from public.store_assignments where manpower_id=v_manpower_id and store_id=v_store_id and valid_to is null) then
      insert into public.store_assignments(manpower_id,store_id,valid_from,valid_to)
      values(v_manpower_id,v_store_id,v_period_start,null);
      v_new_store_assignments:=v_new_store_assignments+1;
    end if;
  end loop;

  for v_row in select * from jsonb_to_recordset(p_payload->'coverage') as x(site_id text,tl_name text) loop
    select id into v_store_id from public.stores where site_id=v_row.site_id;
    select id into v_profile_id from public.profiles
      where role='tl' and is_active=true and lower(trim(full_name))=lower(trim(v_row.tl_name)) limit 1;
    if v_store_id is null or v_profile_id is null then
      raise exception 'Mapping coverage TL tidak valid untuk Site ID % / TL %',v_row.site_id,v_row.tl_name;
    end if;
    update public.coverage_assignments set valid_to=v_period_start-1
      where store_id=v_store_id and coverage_role='tl' and valid_to is null and profile_id<>v_profile_id;
    if not exists(select 1 from public.coverage_assignments where profile_id=v_profile_id and store_id=v_store_id and coverage_role='tl' and valid_to is null) then
      insert into public.coverage_assignments(profile_id,store_id,coverage_role,valid_from,valid_to)
      values(v_profile_id,v_store_id,'tl',v_period_start,null);
      v_new_coverage:=v_new_coverage+1;
    end if;
  end loop;

  insert into public.ec_target_allocations(period_id,store_id,manpower_id,target_qty,target_amt)
  select st.period_id,st.store_id,sa.manpower_id,
    st.target_qty/ec_counts.ec_count,st.target_amt/ec_counts.ec_count
  from public.store_targets st
  join (
    select sa.store_id,count(distinct sa.manpower_id)::numeric as ec_count
    from public.store_assignments sa join public.manpower m on m.id=sa.manpower_id
    where sa.valid_to is null and m.is_active=true and m.fieldforce_position='EC'
    group by sa.store_id
  ) ec_counts on ec_counts.store_id=st.store_id
  join public.store_assignments sa on sa.store_id=st.store_id and sa.valid_to is null
  join public.manpower m on m.id=sa.manpower_id and m.is_active=true and m.fieldforce_position='EC'
  where st.period_id=v_period_id
  on conflict(period_id,manpower_id) do update set store_id=excluded.store_id,
    target_qty=excluded.target_qty,target_amt=excluded.target_amt,updated_at=now();
  get diagnostics v_allocation_count=row_count;

  update public.import_history set status='completed',
    inserted_rows=v_new_manpower+v_new_stores+v_new_store_assignments+v_new_coverage,
    updated_rows=greatest(v_total-(v_new_manpower+v_new_stores+v_new_store_assignments+v_new_coverage),0),
    invalid_rows=0,conflict_rows=0,
    details=jsonb_build_object('period_id',v_period_id,'manpower_rows',jsonb_array_length(p_payload->'manpower'),
      'new_manpower',v_new_manpower,'new_stores',v_new_stores,'target_store_rows',v_target_count,
      'new_ec_assignments',v_new_store_assignments,'new_tl_coverage',v_new_coverage,
      'ec_allocations_upserted',v_allocation_count,'login_accounts_created',0,
      'mt_ec_without_login',(select count(*) from public.manpower where employee_id like 'MT-%' and fieldforce_position='EC' and is_active=true)),
    completed_at=now()
  where id=v_import_id;

  return jsonb_build_object('success',true,'import_id',v_import_id,
    'manpower_rows',jsonb_array_length(p_payload->'manpower'),'new_manpower',v_new_manpower,
    'new_stores',v_new_stores,'target_store_rows',v_target_count,
    'new_ec_assignments',v_new_store_assignments,'new_tl_coverage',v_new_coverage,
    'ec_allocations_upserted',v_allocation_count,'login_accounts_created',0);
end;
$function$

COMMIT;
