-- Aggregation functions called by the dashboard via supabase.rpc().
-- All are security invoker, so RLS limits them to the caller's MRCs.
--
-- Common filter arguments (NULL or empty array = no filter):
--   p_mrcs      integer[]  MRC codes
--   p_districts text[]     district names
--   p_from/p_to date       inclusive range on startdate
-- Timeseries functions also take p_grain: 'week' | 'month'.

create or replace function public.f_match(
  v_mrccode integer, v_district text, v_date date,
  p_mrcs integer[], p_districts text[], p_from date, p_to date
)
returns boolean
language sql
immutable
as $$
  select (coalesce(cardinality(p_mrcs), 0) = 0 or v_mrccode = any (p_mrcs))
     and (coalesce(cardinality(p_districts), 0) = 0 or v_district = any (p_districts))
     and (p_from is null or v_date >= p_from)
     and (p_to is null or v_date <= p_to)
$$;

create or replace function public.f_period(v_date date, p_grain text)
returns date
language sql
immutable
as $$
  select date_trunc(case when p_grain = 'month' then 'month' else 'week' end, v_date)::date
$$;

-- MRCs the caller can see after applying MRC/district filters (for left joins,
-- so sites with no data still show as zero rows).
create or replace function public.filtered_mrcs(p_mrcs integer[], p_districts text[])
returns setof public.mrc
language sql
stable
as $$
  select * from public.mrc m
  where m.active
    and public.f_match(m.mrccode, m.district, null, p_mrcs, p_districts, null, null)
$$;

-- Surveys table ---------------------------------------------------------------

create or replace function public.survey_summary(
  p_mrcs integer[] default null, p_districts text[] default null,
  p_from date default null, p_to date default null
)
returns table (
  mrccode integer, mrc text, district text, target_hh integer,
  enumerated bigint, approached bigint, enrolled bigint,
  residents bigint, residents_reported bigint,
  hh_with_child bigint, hh_without_child bigint,
  excluded bigint, excl_1 bigint, excl_2 bigint, excl_3 bigint,
  excl_4 bigint, excl_5 bigint, excl_6 bigint,
  not_closed_out bigint, hh_with_samples bigint, hh_pending_clinical bigint,
  samples_bs bigint, samples_fp bigint
)
language sql
stable
as $$
  select
    m.mrccode, m.short_name, m.district, m.target_hh,
    count(h.uniqueid),
    count(*) filter (where h.approached),
    count(*) filter (where h.is_enrolled),
    coalesce(sum(h.members_recorded) filter (where h.is_enrolled), 0),
    coalesce(sum(h.nmembers_reported) filter (where h.is_enrolled), 0),
    count(*) filter (where h.is_enrolled and h.has_child_2_10),
    count(*) filter (where h.is_enrolled and not h.has_child_2_10),
    count(*) filter (where h.is_excluded),
    count(*) filter (where h.is_excluded and h.exclreason = 1),
    count(*) filter (where h.is_excluded and h.exclreason = 2),
    count(*) filter (where h.is_excluded and h.exclreason = 3),
    count(*) filter (where h.is_excluded and h.exclreason = 4),
    count(*) filter (where h.is_excluded and h.exclreason = 5),
    count(*) filter (where h.is_excluded and h.exclreason = 6),
    count(*) filter (where h.not_closed_out),
    count(*) filter (where h.is_enrolled and h.has_samples),
    count(*) filter (where h.pending_clinical),
    coalesce(sum(h.samples_bs), 0),
    coalesce(sum(h.samples_fp), 0)
  from public.filtered_mrcs(p_mrcs, p_districts) m
  left join public.v_household h
    on h.mrccode = m.mrccode
   and (p_from is null or h.startdate >= p_from)
   and (p_to is null or h.startdate <= p_to)
  group by m.mrccode, m.short_name, m.district, m.target_hh
  order by m.district, m.short_name
$$;

create or replace function public.survey_timeseries(
  p_mrcs integer[] default null, p_districts text[] default null,
  p_from date default null, p_to date default null, p_grain text default 'week'
)
returns table (
  period date, enumerated bigint, enrolled bigint, excluded bigint,
  not_closed_out bigint, residents bigint, hh_with_samples bigint,
  samples_bs bigint, samples_fp bigint
)
language sql
stable
as $$
  select
    public.f_period(h.startdate, p_grain),
    count(*),
    count(*) filter (where h.is_enrolled),
    count(*) filter (where h.is_excluded),
    count(*) filter (where h.not_closed_out),
    coalesce(sum(h.members_recorded) filter (where h.is_enrolled), 0),
    count(*) filter (where h.is_enrolled and h.has_samples),
    coalesce(sum(h.samples_bs), 0),
    coalesce(sum(h.samples_fp), 0)
  from public.v_household h
  where h.startdate is not null
    and public.f_match(h.mrccode, h.district, h.startdate, p_mrcs, p_districts, p_from, p_to)
  group by 1
  order by 1
$$;

-- Malaria ---------------------------------------------------------------------

create or replace function public.malaria_summary(
  p_mrcs integer[] default null, p_districts text[] default null,
  p_from date default null, p_to date default null
)
returns table (
  mrccode integer, mrc text, district text,
  members bigint, febrile bigint, rdt_done bigint, rdt_pos bigint,
  rdt_pf bigint, rdt_pan bigint, rdt_mixed bigint,
  febrile_al bigint, rdt_pos_al bigint,
  u5_hb_tested bigint, u5_hb_mean numeric, u5_anaemic bigint,
  treated_6m bigint, treated_at_mrc bigint
)
language sql
stable
as $$
  select
    m.mrccode, m.short_name, m.district,
    count(p.uniqueid),
    count(*) filter (where p.febrile),
    count(*) filter (where p.rdt_done),
    count(*) filter (where p.rdt_done and p.rdt_pos),
    count(*) filter (where p.rdt_done and p.rdt_pf),
    count(*) filter (where p.rdt_done and p.rdt_pan),
    count(*) filter (where p.rdt_done and p.rdt_mixed),
    count(*) filter (where p.febrile and p.al_prescribed),
    count(*) filter (where p.rdt_pos and p.al_prescribed),
    count(p.hemoglobin) filter (where p.age < 5),
    round(avg(p.hemoglobin) filter (where p.age < 5), 1),
    count(*) filter (where p.age < 5 and p.hemoglobin < 11),
    count(*) filter (where p.treated_malaria_6m),
    count(*) filter (where p.treated_malaria_6m and p.treated_at_mrc)
  from public.filtered_mrcs(p_mrcs, p_districts) m
  left join public.v_member p
    on p.mrccode = m.mrccode
   and (p_from is null or p.startdate >= p_from)
   and (p_to is null or p.startdate <= p_to)
  group by m.mrccode, m.short_name, m.district
  order by m.district, m.short_name
$$;

create or replace function public.malaria_timeseries(
  p_mrcs integer[] default null, p_districts text[] default null,
  p_from date default null, p_to date default null, p_grain text default 'week'
)
returns table (
  period date, members bigint, febrile bigint, rdt_done bigint, rdt_pos bigint
)
language sql
stable
as $$
  select
    public.f_period(p.startdate, p_grain),
    count(*),
    count(*) filter (where p.febrile),
    count(*) filter (where p.rdt_done),
    count(*) filter (where p.rdt_done and p.rdt_pos)
  from public.v_member p
  where p.startdate is not null
    and public.f_match(p.mrccode, p.district, p.startdate, p_mrcs, p_districts, p_from, p_to)
  group by 1
  order by 1
$$;

-- Nets ------------------------------------------------------------------------

create or replace function public.net_summary(
  p_mrcs integer[] default null, p_districts text[] default null,
  p_from date default null, p_to date default null
)
returns table (
  mrccode integer, mrc text, district text,
  hh_enrolled bigint, hh_with_net bigint, hh_received_ucc bigint,
  hh_universal_coverage bigint, nets_reported bigint,
  residents bigint, slept_under_net bigint,
  nets_recorded bigint, nets_observed bigint, nets_hanging bigint,
  nets_ucc bigint, nets_used bigint
)
language sql
stable
as $$
  with hh as (
    select h.mrccode,
      count(*) filter (where h.is_enrolled) as hh_enrolled,
      count(*) filter (where h.is_enrolled and h.has_net) as hh_with_net,
      count(*) filter (where h.is_enrolled and h.received_ucc) as hh_received_ucc,
      -- Universal coverage: at least 1 net per 2 residents
      count(*) filter (where h.is_enrolled and h.nnets > 0
                         and h.nnets * 2 >= coalesce(h.nmembers_reported, h.members_recorded)) as hh_uc,
      coalesce(sum(h.nnets) filter (where h.is_enrolled), 0) as nets_reported
    from public.v_household h
    where public.f_match(h.mrccode, h.district, h.startdate, p_mrcs, p_districts, p_from, p_to)
    group by h.mrccode
  ),
  mem as (
    select p.mrccode,
      count(*) as residents,
      count(*) filter (where p.slept_under_net) as slept_under_net
    from public.v_member p
    where public.f_match(p.mrccode, p.district, p.startdate, p_mrcs, p_districts, p_from, p_to)
    group by p.mrccode
  ),
  nt as (
    select n.mrccode,
      count(*) as nets_recorded,
      count(*) filter (where n.observed) as nets_observed,
      count(*) filter (where n.observed and n.hanging) as nets_hanging,
      count(*) filter (where n.ucc_net) as nets_ucc,
      count(*) filter (where n.used_last_night) as nets_used
    from public.v_net n
    where public.f_match(n.mrccode, n.district, n.startdate, p_mrcs, p_districts, p_from, p_to)
    group by n.mrccode
  )
  select
    m.mrccode, m.short_name, m.district,
    coalesce(hh.hh_enrolled, 0), coalesce(hh.hh_with_net, 0), coalesce(hh.hh_received_ucc, 0),
    coalesce(hh.hh_uc, 0), coalesce(hh.nets_reported, 0),
    coalesce(mem.residents, 0), coalesce(mem.slept_under_net, 0),
    coalesce(nt.nets_recorded, 0), coalesce(nt.nets_observed, 0), coalesce(nt.nets_hanging, 0),
    coalesce(nt.nets_ucc, 0), coalesce(nt.nets_used, 0)
  from public.filtered_mrcs(p_mrcs, p_districts) m
  left join hh on hh.mrccode = m.mrccode
  left join mem on mem.mrccode = m.mrccode
  left join nt on nt.mrccode = m.mrccode
  order by m.district, m.short_name
$$;

create or replace function public.net_brands(
  p_mrcs integer[] default null, p_districts text[] default null,
  p_from date default null, p_to date default null
)
returns table (brandnet integer, nets bigint)
language sql
stable
as $$
  select n.brandnet, count(*)
  from public.v_net n
  where public.f_match(n.mrccode, n.district, n.startdate, p_mrcs, p_districts, p_from, p_to)
  group by n.brandnet
  order by 2 desc
$$;

create or replace function public.net_timeseries(
  p_mrcs integer[] default null, p_districts text[] default null,
  p_from date default null, p_to date default null, p_grain text default 'week'
)
returns table (
  period date, hh_enrolled bigint, hh_with_net bigint, residents bigint, slept_under_net bigint
)
language sql
stable
as $$
  with hh as (
    select public.f_period(h.startdate, p_grain) as period,
      count(*) filter (where h.is_enrolled) as hh_enrolled,
      count(*) filter (where h.is_enrolled and h.has_net) as hh_with_net
    from public.v_household h
    where h.startdate is not null
      and public.f_match(h.mrccode, h.district, h.startdate, p_mrcs, p_districts, p_from, p_to)
    group by 1
  ),
  mem as (
    select public.f_period(p.startdate, p_grain) as period,
      count(*) as residents,
      count(*) filter (where p.slept_under_net) as slept_under_net
    from public.v_member p
    where p.startdate is not null
      and public.f_match(p.mrccode, p.district, p.startdate, p_mrcs, p_districts, p_from, p_to)
    group by 1
  )
  select coalesce(hh.period, mem.period),
    coalesce(hh.hh_enrolled, 0), coalesce(hh.hh_with_net, 0),
    coalesce(mem.residents, 0), coalesce(mem.slept_under_net, 0)
  from hh full join mem on mem.period = hh.period
  order by 1
$$;

-- Vaccines (children under 3) -------------------------------------------------

create or replace function public.vaccine_summary(
  p_mrcs integer[] default null, p_districts text[] default null,
  p_from date default null, p_to date default null
)
returns table (
  mrccode integer, mrc text, district text,
  children_u3 bigint, with_card bigint, r21_any bigint,
  r21_1 bigint, r21_2 bigint, r21_3 bigint, r21_4 bigint,
  r21_card_verified bigint, hib_any bigint, hib_3 bigint
)
language sql
stable
as $$
  select
    m.mrccode, m.short_name, m.district,
    count(p.uniqueid),
    count(*) filter (where p.vx_card),
    count(*) filter (where p.r21_any),
    count(*) filter (where p.r21_doses >= 1),
    count(*) filter (where p.r21_doses >= 2),
    count(*) filter (where p.r21_doses >= 3),
    count(*) filter (where p.r21_doses >= 4),
    count(*) filter (where p.r21_any and p.r21_card_verified),
    count(*) filter (where p.hib_any),
    count(*) filter (where p.hib_doses >= 3)
  from public.filtered_mrcs(p_mrcs, p_districts) m
  left join public.v_member p
    on p.mrccode = m.mrccode
   and p.age between 0 and 2
   and (p_from is null or p.startdate >= p_from)
   and (p_to is null or p.startdate <= p_to)
  group by m.mrccode, m.short_name, m.district
  order by m.district, m.short_name
$$;

create or replace function public.vaccine_timeseries(
  p_mrcs integer[] default null, p_districts text[] default null,
  p_from date default null, p_to date default null, p_grain text default 'week'
)
returns table (period date, children_u3 bigint, r21_any bigint, hib_any bigint)
language sql
stable
as $$
  select
    public.f_period(p.startdate, p_grain),
    count(*),
    count(*) filter (where p.r21_any),
    count(*) filter (where p.hib_any)
  from public.v_member p
  where p.startdate is not null
    and p.age between 0 and 2
    and public.f_match(p.mrccode, p.district, p.startdate, p_mrcs, p_districts, p_from, p_to)
  group by 1
  order by 1
$$;

-- Misc ------------------------------------------------------------------------

-- Most recent sync time (falls back to last-modified when synced_at is blank).
create or replace function public.last_sync()
returns timestamptz
language sql
stable
as $$ select coalesce(max(synced_at), max(lastmod)::timestamptz) from public.hh_info $$;

-- Dashboard functions are for signed-in users only.
do $$
declare f text;
begin
  foreach f in array array[
    'survey_summary(integer[],text[],date,date)',
    'survey_timeseries(integer[],text[],date,date,text)',
    'malaria_summary(integer[],text[],date,date)',
    'malaria_timeseries(integer[],text[],date,date,text)',
    'net_summary(integer[],text[],date,date)',
    'net_brands(integer[],text[],date,date)',
    'net_timeseries(integer[],text[],date,date,text)',
    'vaccine_summary(integer[],text[],date,date)',
    'vaccine_timeseries(integer[],text[],date,date,text)',
    'filtered_mrcs(integer[],text[])',
    'last_sync()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
