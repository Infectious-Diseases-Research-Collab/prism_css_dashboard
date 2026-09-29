-- Access control.
--
-- allowed_users lists who may sign in and which MRCs they can see.
--   mrcs = 'all'            -> every MRC
--   mrcs = '37,38'          -> MRC codes (recommended)
--   mrcs = 'Bala, Aboke'    -> MRC names also work (matched case-insensitively
--                              against mrc.short_name or mrc.mrcname)
-- Rows are managed in the Supabase Table Editor (service role); signed-in users
-- can only read their own row.

create table public.allowed_users (
  email text primary key check (email = lower(email)),
  mrcs text not null default '',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- MRC codes the current user may see. security definer so it can read
-- allowed_users/mrc regardless of their RLS; search_path pinned for safety.
create or replace function public.user_mrc_codes()
returns integer[]
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select u.mrcs
    from public.allowed_users u
    where u.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  ),
  tokens as (
    select lower(trim(t)) as tok
    from me, unnest(string_to_array(me.mrcs, ',')) as t
    where trim(t) <> ''
  )
  select coalesce(array_agg(distinct m.mrccode), '{}')
  from public.mrc m
  where exists (
    select 1 from tokens
    where tok = 'all'
       or tok = m.mrccode::text
       or tok = lower(m.short_name)
       or tok = lower(m.mrcname)
  );
$$;

revoke all on function public.user_mrc_codes() from public, anon;
grant execute on function public.user_mrc_codes() to authenticated;

-- Row-level security ---------------------------------------------------------

alter table public.allowed_users enable row level security;
alter table public.region enable row level security;
alter table public.mrc enable row level security;
alter table public.village enable row level security;
alter table public.hh_info enable row level security;
alter table public.hh_members enable row level security;
alter table public.nets enable row level security;
alter table public.sleeping_structure enable row level security;
alter table public.formchanges enable row level security;

create policy "read own allow-list row" on public.allowed_users
  for select to authenticated
  using (email = lower(coalesce(auth.jwt() ->> 'email', '')));

create policy "read regions" on public.region
  for select to authenticated using (true);

-- (select ...) wrapper lets Postgres evaluate the function once per query.
create policy "read permitted mrcs" on public.mrc
  for select to authenticated
  using ((select public.user_mrc_codes()) @> array[mrccode]);

create policy "read permitted villages" on public.village
  for select to authenticated
  using ((select public.user_mrc_codes()) @> array[mrccode]);

create policy "read permitted households" on public.hh_info
  for select to authenticated
  using ((select public.user_mrc_codes()) @> array[mrccode]);

create policy "read permitted members" on public.hh_members
  for select to authenticated
  using ((select public.user_mrc_codes()) @> array[mrccode]);

create policy "read permitted nets" on public.nets
  for select to authenticated
  using ((select public.user_mrc_codes()) @> array[mrccode]);

create policy "read permitted structures" on public.sleeping_structure
  for select to authenticated
  using ((select public.user_mrc_codes()) @> array[mrccode]);

-- formchanges: audit trail, no dashboard access (service role only).

-- No insert/update/delete policies: writes happen only through the service
-- role (upload script), which bypasses RLS.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;

-- Used by the upload script (service role) to coerce CSV values to column types.
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
