-- PRISM CSS side of the automatic DataKollecta sync (pull-datakollecta in
-- "typed" mode, see supabase/functions/pull-datakollecta/sync.config.json).
-- Rows keep landing in the existing raw tables, so the views and dashboard
-- RPCs are unchanged.
--
-- 1. The leading columns every DataKollecta export and feed row carries.
--    The CSV import used to drop them with a warning. local_unique_id is
--    also how the sync deletes a record DataKollecta tombstones (for example
--    one reclassified from deployed to test).
-- 2. The edit-history columns DataKollecta added in its 2026-10-05 release.
-- 3. last_sync() reports the last successful sync rather than the newest
--    synced_at/lastmod value.
-- 4. The data-quality checks the CSV import script printed, now run after
--    every sync and kept in sync_runs.warnings.

do $$
declare t text;
begin
  foreach t in array array['hh_info', 'sleeping_structure', 'hh_members', 'nets'] loop
    execute format('alter table public.%I
      add column if not exists survey_version integer,
      add column if not exists data_status text,
      add column if not exists local_unique_id text,
      add column if not exists surveyor_id text,
      add column if not exists collected_at timestamp,
      add column if not exists submitted_at timestamptz', t);
    execute format('create index if not exists %I on public.%I (local_unique_id)', t || '_local_unique_id_idx', t);
  end loop;
end $$;

alter table public.formchanges
  add column if not exists event_time_utc timestamptz,
  add column if not exists device_utc_offset_minutes integer,
  add column if not exists reason_for_change text;

create or replace function public.last_sync()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select coalesce(public.last_sync_success(),
                  (select coalesce(max(h.synced_at), max(h.lastmod)::timestamptz) from public.hh_info h))
$$;

-- hhid = surveynum(1) + mrccode(2) + villagecode(2) + hhnum(4)
create or replace function public.sync_quality_warnings()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  with off_site as (
    select coalesce(h.mrccode::text, 'missing') as code, count(*) as n
      from public.hh_info h
     where h.mrccode is null or not exists (select 1 from public.mrc m where m.mrccode = h.mrccode)
     group by 1
  ),
  mismatched as (
    select h.uniqueid, h.mrccode, h.hhid
      from public.hh_info h
     where h.hhid ~ '^[0-9]{9}$' and h.mrccode is not null
       and substring(h.hhid from 2 for 2)::integer <> h.mrccode
     order by h.uniqueid
     limit 50
  ),
  orphans as (
    select 'sleeping_structure' as t, count(*) as n from public.sleeping_structure c
     where not exists (select 1 from public.hh_info h where h.uniqueid = c.parent_uniqueid)
    union all
    select 'hh_members', count(*) from public.hh_members c
     where not exists (select 1 from public.hh_info h where h.uniqueid = c.parent_uniqueid)
    union all
    select 'nets', count(*) from public.nets c
     where not exists (select 1 from public.hh_info h where h.uniqueid = c.parent_uniqueid)
  )
  select coalesce(array_agg(w), '{}') from (
    select format('%s household(s) with MRC %s, which is not in the mrc table (not a surveillance site) -> hidden on dashboard', n, code) as w
      from off_site
    union all
    select format('hh_info %s: mrccode %s does not match hhid %s', uniqueid, mrccode, hhid) from mismatched
    union all
    select format('%s: %s row(s) whose parent_uniqueid has no household', t, n) from orphans where n > 0
  ) warnings
$$;
revoke all on function public.sync_quality_warnings() from public, anon, authenticated;
grant execute on function public.sync_quality_warnings() to service_role;
