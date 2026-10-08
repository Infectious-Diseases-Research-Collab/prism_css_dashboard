-- When DataKollecta's server received the newest record this user can see,
-- shown in the header next to the last sync time. The two answer different
-- questions: last_sync() says whether the dashboard is up to date with
-- DataKollecta; this says whether the field team is still uploading.
--
-- submitted_at (server receipt) rather than collected_at (the device's own
-- clock): phone clocks can be wrong, and a device that uploads a week of
-- interviews at once should read as "new data arrived", not as old data.
--
-- security invoker on purpose: RLS applies, so a user restricted to some MRCs
-- sees their own sites' latest upload and learns nothing about other sites.
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
  ) t
$$;

revoke all on function public.newest_record_received() from public, anon;
grant execute on function public.newest_record_received() to authenticated;
