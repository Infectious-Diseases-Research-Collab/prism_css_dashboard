-- A household counts towards an MRC's target (mrc.target_hh) only if it is
-- enrolled AND has at least one member aged 2-10 inclusive (v_household.has_child_2_10).
-- survey_summary already returns this as hh_with_child; add it to the time series
-- (return type changes, so the function is dropped and recreated).

drop function if exists public.survey_timeseries(integer[], text[], date, date, text);

create function public.survey_timeseries(
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
    count(*) filter (where h.is_enrolled and h.has_child_2_10),
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

revoke all on function public.survey_timeseries(integer[], text[], date, date, text) from public, anon;
grant execute on function public.survey_timeseries(integer[], text[], date, date, text) to authenticated;
