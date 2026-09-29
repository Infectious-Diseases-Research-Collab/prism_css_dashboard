-- Explicit privileges. Newer Supabase projects no longer grant API roles access
-- to new tables/functions automatically, so everything the app needs is listed.
-- RLS (see access_control migration) still limits which rows are visible.

-- Signed-in dashboard users: read-only.
grant select on public.region, public.mrc, public.village, public.allowed_users,
  public.hh_info, public.hh_members, public.nets, public.sleeping_structure
  to authenticated;
grant select on public.v_household, public.v_member, public.v_net to authenticated;
grant execute on function
  public.nz(integer),
  public.checkbox(text),
  public.f_match(integer, text, date, integer[], text[], date, date),
  public.f_period(date, text)
  to authenticated;

-- Upload script and server-side allow-list check (service role, bypasses RLS).
grant select, insert, update, delete on public.hh_info, public.hh_members, public.nets,
  public.sleeping_structure, public.formchanges to service_role;
grant select, insert, update, delete on public.region, public.mrc, public.village,
  public.allowed_users to service_role;
