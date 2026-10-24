-- Which enrolled households count towards an MRC's 50-household target.
--
-- Before: enrolled, with at least one member record aged 2-10.
-- Now (confirmed by the study team, 2026-10-24): enrolled, with at least one
-- member aged 2-10 who
--   * was available at the interview and enrolled -- for children this is
--     recorded by `consent` (2 = "Not at home"; motheravail is only asked of
--     women 11-51), and the app only accepts consent = 1 from someone present;
--   * consented to laboratory testing (consent = 1); and
--   * had at least one sample drawn (samples_collected includes 1-4:
--     blood smear, filter paper, RNA protect, plasma; 99 = none).
-- All three must hold for the SAME child; a sample from another member does
-- not count.
--
-- v_household gains qualifies_target (appended, as create or replace view
-- requires). has_child_2_10 keeps its plain meaning. survey_summary and
-- survey_timeseries keep their column names (hh_with_child = qualifying
-- enrolled households, hh_without_child = the other enrolled households), so
-- the dashboard code only changes its labels.

create or replace view public.v_household
with (security_invoker = true) as
select
  h.uniqueid,
  h.hhid,
  m.mrccode,
  m.mrcname as mrc,
  m.district,
  h.villagecode,
  h.startdate,
  h.synced_at,
  public.nz(h.enrolled) as enrolled,
  public.nz(h.exclreason) as exclreason,
  public.nz(h.nmembers) as nmembers_reported,
  -- Surveys table flags
  coalesce(public.nz(h.exclreason), 0) not in (1, 2) as approached,
  coalesce(public.nz(h.enrolled) = 1, false) as is_enrolled,
  coalesce(public.nz(h.enrolled) = 0, false) as is_excluded,
  coalesce(public.nz(h.exclreason) = 3 and coalesce(public.nz(h.totvisit), 0) < 3, false)
    or public.nz(h.enrolled) is null as not_closed_out,
  coalesce(mem.n_recorded, 0) as members_recorded,
  coalesce(mem.n_child_2_10, 0) > 0 as has_child_2_10,
  coalesce(mem.n_any_sample, 0) > 0 as has_samples,
  coalesce(mem.n_bs, 0) as samples_bs,
  coalesce(mem.n_fp, 0) as samples_fp,
  coalesce(public.nz(h.enrolled) = 1
    and coalesce(mem.n_recorded, 0) < coalesce(public.nz(h.nmembers), 0), false) as pending_clinical,
  -- Net indicators
  public.nz(h.havenets) = 1 as has_net,
  public.nz(h.receivenet) = 1 as received_ucc,
  coalesce(public.nz(h.nnets), 0) as nnets,
  coalesce(public.nz(h.manynet), 0) as ucc_nets_received,
  -- Counts towards the target: see the header of this migration.
  coalesce(public.nz(h.enrolled) = 1 and coalesce(mem.n_child_2_10_sampled, 0) > 0, false) as qualifies_target
from public.hh_info h
join public.mrc m on m.mrccode = h.mrccode
left join lateral (
  select
    count(*) as n_recorded,
    count(*) filter (where vm.age between 2 and 10) as n_child_2_10,
    count(*) filter (where vm.any_sample) as n_any_sample,
    count(*) filter (where vm.sample_bs) as n_bs,
    count(*) filter (where vm.sample_fp) as n_fp,
    count(*) filter (where vm.age between 2 and 10 and vm.consent = 1 and vm.any_sample) as n_child_2_10_sampled
  from (
    select
      public.nz(p.age) as age,
      public.nz(p.consent) as consent,
      public.checkbox(p.samples_collected) && array['1', '2', '3', '4'] as any_sample,
      '1' = any (public.checkbox(p.samples_collected)) as sample_bs,
      '2' = any (public.checkbox(p.samples_collected)) as sample_fp
    from public.hh_members p
    where p.parent_uniqueid = h.uniqueid
  ) vm
) mem on true;

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
    m.mrccode, m.mrcname, m.district, m.target_hh,
    count(h.uniqueid),
    count(*) filter (where h.approached),
    count(*) filter (where h.is_enrolled),
    coalesce(sum(h.members_recorded) filter (where h.is_enrolled), 0),
    coalesce(sum(h.nmembers_reported) filter (where h.is_enrolled), 0),
    count(*) filter (where h.qualifies_target),
    count(*) filter (where h.is_enrolled and not h.qualifies_target),
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
  group by m.mrccode, m.mrcname, m.district, m.target_hh
  order by m.district, m.mrcname
$$;

create or replace function public.survey_timeseries(
  p_mrcs integer[] default null, p_districts text[] default null,
  p_from date default null, p_to date default null, p_grain text default 'week'
)
returns table (
  period date, enumerated bigint, enrolled bigint, hh_with_child bigint, excluded bigint,
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
    count(*) filter (where h.qualifies_target),
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
