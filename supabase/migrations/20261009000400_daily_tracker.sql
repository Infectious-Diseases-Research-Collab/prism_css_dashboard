-- Daily tracker: a short DataKollecta survey (prism_css_daily_tracker) in
-- which each interviewer -- each assigned to one MRC -- reports how many
-- households they approached and enrolled on a given day. Synced like the
-- main survey forms (pull-datakollecta, typed mode; see sync.config.json)
-- and shown on the dashboard's "Daily tracker" tab.
--
-- These are the interviewers' own counts, separate from the household
-- records in hh_info, so the two can be compared.

create table public.daily_tracker (
  uniqueid text primary key,
  report_date date,
  regioncode integer,
  mrccode integer,
  num_approached integer,
  num_enrolled integer,
  starttime timestamp,
  startdate date,
  stoptime timestamp,
  lastmod timestamp,
  swver text,
  survey_id text,
  -- DataKollecta export metadata, as on the other raw tables.
  survey_version integer,
  data_status text,
  local_unique_id text,
  surveyor_id text,
  collected_at timestamp,
  submitted_at timestamptz,
  synced_at timestamptz
);
create index daily_tracker_mrc_date_idx on public.daily_tracker (mrccode, report_date);
create index daily_tracker_local_unique_id_idx on public.daily_tracker (local_unique_id);

alter table public.daily_tracker enable row level security;
create policy "read permitted daily tracker reports" on public.daily_tracker
  for select to authenticated
  using ((select public.user_mrc_codes()) @> array[mrccode]);

revoke all on public.daily_tracker from anon, authenticated;
grant select on public.daily_tracker to authenticated;
grant select, insert, update, delete on public.daily_tracker to service_role;

-- One row per report date and MRC (several interviewers can report for the
-- same MRC on the same day; `reports` says how many). Same filter arguments
-- as the other dashboard functions, with p_from/p_to on report_date.
-- security invoker: RLS limits it to the caller's MRCs.
create or replace function public.tracker_daily(
  p_mrcs integer[] default null, p_districts text[] default null,
  p_from date default null, p_to date default null
)
returns table (
  report_date date, mrccode integer, mrc text, district text,
  reports bigint, approached bigint, enrolled bigint
)
language sql
stable
as $$
  select t.report_date, m.mrccode, m.mrcname, m.district,
         count(*), coalesce(sum(t.num_approached), 0), coalesce(sum(t.num_enrolled), 0)
  from public.filtered_mrcs(p_mrcs, p_districts) m
  join public.daily_tracker t on t.mrccode = m.mrccode
  where t.report_date is not null
    and (p_from is null or t.report_date >= p_from)
    and (p_to is null or t.report_date <= p_to)
  group by t.report_date, m.mrccode, m.mrcname, m.district
  order by t.report_date desc, m.district, m.mrcname
$$;

-- Totals per MRC over the filtered period; every permitted MRC appears, with
-- zeros where nothing was reported, so missing sites stand out.
create or replace function public.tracker_summary(
  p_mrcs integer[] default null, p_districts text[] default null,
  p_from date default null, p_to date default null
)
returns table (
  mrccode integer, mrc text, district text,
  days_reported bigint, reports bigint, approached bigint, enrolled bigint, last_report date
)
language sql
stable
as $$
  select m.mrccode, m.mrcname, m.district,
         count(distinct t.report_date), count(t.uniqueid),
         coalesce(sum(t.num_approached), 0), coalesce(sum(t.num_enrolled), 0),
         max(t.report_date)
  from public.filtered_mrcs(p_mrcs, p_districts) m
  left join public.daily_tracker t
    on t.mrccode = m.mrccode
   and t.report_date is not null
   and (p_from is null or t.report_date >= p_from)
   and (p_to is null or t.report_date <= p_to)
  group by m.mrccode, m.mrcname, m.district
  order by m.district, m.mrcname
$$;

create or replace function public.tracker_timeseries(
  p_mrcs integer[] default null, p_districts text[] default null,
  p_from date default null, p_to date default null, p_grain text default 'week'
)
returns table (period date, approached bigint, enrolled bigint)
language sql
stable
as $$
  select public.f_period(t.report_date, p_grain),
         coalesce(sum(t.num_approached), 0), coalesce(sum(t.num_enrolled), 0)
  from public.daily_tracker t
  join public.mrc m on m.mrccode = t.mrccode
  where t.report_date is not null
    and public.f_match(t.mrccode, m.district, t.report_date, p_mrcs, p_districts, p_from, p_to)
  group by 1
  order by 1
$$;

-- Tracker uploads are field activity too, so they count towards the header's
-- "Newest record received".
create or replace function public.newest_record_received()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select max(t.submitted_at) from (
    select max(submitted_at) as submitted_at from public.hh_info
    union all select max(submitted_at) from public.sleeping_structure
    union all select max(submitted_at) from public.hh_members
    union all select max(submitted_at) from public.nets
    union all select max(submitted_at) from public.daily_tracker
  ) t
$$;

revoke all on function public.tracker_daily(integer[], text[], date, date) from public, anon;
revoke all on function public.tracker_summary(integer[], text[], date, date) from public, anon;
revoke all on function public.tracker_timeseries(integer[], text[], date, date, text) from public, anon;
grant execute on function public.tracker_daily(integer[], text[], date, date) to authenticated;
grant execute on function public.tracker_summary(integer[], text[], date, date) to authenticated;
grant execute on function public.tracker_timeseries(integer[], text[], date, date, text) to authenticated;
