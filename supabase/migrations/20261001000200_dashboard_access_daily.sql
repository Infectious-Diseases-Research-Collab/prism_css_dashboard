-- Private daily access history, visible only to database administrators.
create table public.dashboard_access_daily (
  user_id uuid not null,
  email text not null check (email = lower(email)),
  access_date date not null,
  first_access_at timestamptz not null,
  last_access_at timestamptz not null,
  primary key (user_id, access_date),
  check (first_access_at <= last_access_at)
);

create index dashboard_access_daily_date_idx
  on public.dashboard_access_daily (access_date desc);

alter table public.dashboard_access_daily enable row level security;
revoke all on public.dashboard_access_daily from public, anon, authenticated;
grant select, insert, update on public.dashboard_access_daily to service_role;

create function public.record_dashboard_access(p_user_id uuid, p_email text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  accessed_at timestamptz := clock_timestamp();
begin
  insert into public.dashboard_access_daily as existing
    (user_id, email, access_date, first_access_at, last_access_at)
  values
    (p_user_id, lower(p_email), (accessed_at at time zone 'Africa/Kampala')::date,
     accessed_at, accessed_at)
  on conflict (user_id, access_date) do update
    set email = excluded.email,
        first_access_at = least(existing.first_access_at, excluded.first_access_at),
        last_access_at = greatest(existing.last_access_at, excluded.last_access_at);
end;
$$;

revoke all on function public.record_dashboard_access(uuid, text) from public, anon, authenticated;
grant execute on function public.record_dashboard_access(uuid, text) to service_role;
