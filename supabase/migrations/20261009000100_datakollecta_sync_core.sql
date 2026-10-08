-- Identical copy of new_project_dashboard/supabase/migrations/20261008000200_datakollecta_sync_core.sql
-- (the DataKollecta dashboard template). Keep the two in step.
--
-- DataKollecta sync: the scheduling and bookkeeping behind the
-- pull-datakollecta Edge Function. Shared, unchanged, by every project
-- dashboard (the PRISM CSS dashboard carries an identical copy); only the
-- tables the rows land in differ, and those are in a separate migration.
--
-- How it runs:
--   pg_cron  --(schedule from sync_config)-->  run_sync_now()
--   run_sync_now()  --pg_net POST + shared secret-->  pull-datakollecta
--   pull-datakollecta  --data feed key-->  DataKollecta, then upserts here
--
-- The schedule lives in this database, so nothing depends on GitHub, Vercel or
-- anyone's computer. The DataKollecta key never enters the database: it is an
-- Edge Function secret. What the database holds (in Vault) is only the
-- function's URL and the shared secret that lets cron call it.
--
-- Everything here is service-role / SQL Editor only. Dashboard users never
-- see sync state; they see last_sync(), defined per dashboard.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- One-row configuration. Change it through set_sync_interval /
-- set_sync_enabled, not by hand: those also reschedule the cron job.
create table public.sync_config (
  id integer primary key default 1 check (id = 1),
  interval_text text not null default '4 hours',
  cron_expression text not null default '0 */4 * * *',
  enabled boolean not null default true,
  running_since timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.sync_config default values;

-- Progress per feed resource ('submissions:<form>' or 'formchanges'), so a run
-- resumes where the last one stopped and a backfill can span several runs.
create table public.sync_state (
  resource text primary key,
  last_changed_at timestamptz,
  last_success_at timestamptz,
  last_rows integer,
  updated_at timestamptz not null default now()
);

create table public.sync_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'error')),
  rows_upserted integer not null default 0,
  rows_deleted integer not null default 0,
  warnings jsonb not null default '[]',
  error text
);
create index sync_runs_started_idx on public.sync_runs (started_at desc);

alter table public.sync_config enable row level security;
alter table public.sync_state enable row level security;
alter table public.sync_runs enable row level security;
revoke all on public.sync_config, public.sync_state, public.sync_runs from anon, authenticated;
grant select, insert, update, delete on public.sync_config, public.sync_state, public.sync_runs to service_role;

-- Column types of a table, so the sync function can turn the feed's text
-- values into the right types. Also used by the CSV import script.
create or replace function public.import_column_types(p_table text)
returns table (column_name text, data_type text, is_generated boolean)
language sql
stable
set search_path = ''
as $$
  select c.column_name::text, c.data_type::text, c.is_generated = 'ALWAYS'
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = p_table
  order by c.ordinal_position;
$$;
revoke all on function public.import_column_types(text) from public, anon, authenticated;
grant execute on function public.import_column_types(text) to service_role;

-- '15 minutes', '4 hours', '1 day' -> a cron expression. Anything with five
-- space-separated fields is taken as a cron expression already (UTC).
create or replace function public.sync_interval_to_cron(p_interval text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  m text[];
  n integer;
  unit text;
begin
  if p_interval is null then
    raise exception 'An interval is required, e.g. ''4 hours''';
  end if;
  if array_length(regexp_split_to_array(btrim(p_interval), '\s+'), 1) = 5 then
    return btrim(p_interval);
  end if;
  m := regexp_match(lower(btrim(p_interval)), '^(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$');
  if m is null then
    raise exception 'Unrecognised interval "%". Use e.g. ''30 minutes'', ''4 hours'', ''1 day'' or a cron expression.', p_interval;
  end if;
  n := m[1]::integer;
  unit := left(m[2], 1);
  if unit = 'm' then
    if n < 5 or n > 59 then raise exception 'Minutes must be from 5 to 59; use hours for longer'; end if;
    return format('*/%s * * * *', n);
  elsif unit = 'h' then
    if n < 1 or n > 23 then raise exception 'Hours must be from 1 to 23; use days for longer'; end if;
    return format('7 */%s * * *', n);
  else
    if n < 1 or n > 28 then raise exception 'Days must be from 1 to 28'; end if;
    return case when n = 1 then '7 2 * * *' else format('7 2 */%s * *', n) end;
  end if;
end;
$$;

-- Posts to the sync function. Called by cron, or by hand to sync right now.
create or replace function public.run_sync_now()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  fn_url text;
  secret text;
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'datakollecta_sync_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'datakollecta_sync_secret';
  if fn_url is null or secret is null then
    raise exception 'Sync is not configured yet. Run scripts/setup.sh (it calls the function with action=configure).';
  end if;
  return net.http_post(
    url := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', secret),
    body := '{"action":"run"}'::jsonb,
    timeout_milliseconds := 5000
  );
end;
$$;

create or replace function public.apply_sync_schedule()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.sync_config;
begin
  select * into c from public.sync_config where id = 1;
  if c.enabled then
    perform cron.schedule('pull-datakollecta', c.cron_expression, 'select public.run_sync_now()');
  elsif exists (select 1 from cron.job where jobname = 'pull-datakollecta') then
    perform cron.unschedule('pull-datakollecta');
  end if;
end;
$$;

-- The one call that changes how often the dashboard syncs.
create or replace function public.set_sync_interval(p_interval text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  expr text := public.sync_interval_to_cron(p_interval);
begin
  update public.sync_config
     set interval_text = btrim(p_interval), cron_expression = expr, updated_at = now()
   where id = 1;
  perform public.apply_sync_schedule();
  return format('Sync schedule: %s (cron "%s", UTC)%s', btrim(p_interval), expr,
                case when (select enabled from public.sync_config where id = 1) then '' else ' -- currently paused' end);
end;
$$;

create or replace function public.set_sync_enabled(p_enabled boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.sync_config set enabled = p_enabled, updated_at = now() where id = 1;
  perform public.apply_sync_schedule();
  return case when p_enabled then 'Sync resumed' else 'Sync paused' end;
end;
$$;

-- Called once by the function itself (action=configure, from setup.sh): stores
-- where cron should POST and with what secret, and schedules the job.
create or replace function public.sync_configure(p_function_url text, p_secret text, p_interval text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing uuid;
begin
  select id into existing from vault.secrets where name = 'datakollecta_sync_url';
  if existing is null then
    perform vault.create_secret(p_function_url, 'datakollecta_sync_url');
  else
    perform vault.update_secret(existing, p_function_url);
  end if;
  select id into existing from vault.secrets where name = 'datakollecta_sync_secret';
  if existing is null then
    perform vault.create_secret(p_secret, 'datakollecta_sync_secret');
  else
    perform vault.update_secret(existing, p_secret);
  end if;
  return public.set_sync_interval(coalesce(nullif(btrim(p_interval), ''),
                                           (select interval_text from public.sync_config where id = 1)));
end;
$$;

-- Run bookkeeping for the function. sync_begin refuses to start while another
-- run holds the flag, unless that run has been silent for 15 minutes (an
-- Edge Function cannot outlive that, so it died).
create or replace function public.sync_begin()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_id bigint;
begin
  update public.sync_config
     set running_since = now()
   where id = 1 and (running_since is null or running_since < now() - interval '15 minutes');
  if not found then
    return null;
  end if;
  update public.sync_runs set status = 'error', finished_at = now(), error = 'abandoned'
   where status = 'running';
  insert into public.sync_runs default values returning id into run_id;
  return run_id;
end;
$$;

create or replace function public.sync_save_progress(p_resource text, p_last_changed_at timestamptz, p_rows integer)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.sync_state (resource, last_changed_at, last_rows, updated_at)
  values (p_resource, p_last_changed_at, p_rows, now())
  on conflict (resource) do update
     set last_changed_at = greatest(public.sync_state.last_changed_at, excluded.last_changed_at),
         last_rows = excluded.last_rows,
         updated_at = now();
  update public.sync_config set running_since = now() where id = 1;
$$;

create or replace function public.sync_finish(p_run_id bigint, p_status text, p_upserted integer,
                                              p_deleted integer, p_warnings jsonb, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.sync_runs
     set finished_at = now(), status = p_status, rows_upserted = p_upserted, rows_deleted = p_deleted,
         warnings = coalesce(p_warnings, '[]'), error = p_error
   where id = p_run_id;
  -- `where true`: API requests run with pg-safeupdate, which refuses an
  -- UPDATE without a WHERE clause.
  if p_status in ('success', 'partial') then
    update public.sync_state set last_success_at = now() where true;
  end if;
  update public.sync_config set running_since = null where id = 1;
  -- Keep a year of history.
  delete from public.sync_runs where started_at < now() - interval '1 year';
end;
$$;

-- Project-specific data checks run after each sync, returned as warnings in
-- sync_runs. A dashboard replaces this with its own (PRISM checks MRC codes
-- and households). Must stay cheap: it runs every sync.
create or replace function public.sync_quality_warnings()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$ select '{}'::text[] $$;

-- Most recent successful sync, for the dashboard header.
create or replace function public.last_sync_success()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$ select max(finished_at) from public.sync_runs where status in ('success', 'partial') $$;

do $$
declare f text;
begin
  foreach f in array array[
    'sync_interval_to_cron(text)', 'run_sync_now()', 'apply_sync_schedule()', 'set_sync_interval(text)',
    'set_sync_enabled(boolean)', 'sync_configure(text,text,text)', 'sync_begin()',
    'sync_save_progress(text,timestamptz,integer)', 'sync_finish(bigint,text,integer,integer,jsonb,text)',
    'sync_quality_warnings()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
revoke all on function public.last_sync_success() from public, anon;
grant execute on function public.last_sync_success() to authenticated, service_role;
