-- Identical copy of new_project_dashboard/supabase/migrations/20261008000500_datakollecta_sync_upsert.sql
-- (the DataKollecta dashboard template). Keep the two in step.
--
-- Write only what changed.
--
-- Every sync re-reads the last ~10 minutes before where the previous run
-- stopped, so a record committed late in DataKollecta is never missed. A
-- plain upsert rewrote those re-read rows on every run, so rows_upserted
-- reported the same records hour after hour, and synced_at (the stamp
-- column) moved for rows that had not changed.
--
-- sync_upsert inserts new rows and updates an existing row only when one of
-- its values actually differs. It returns how many rows it inserted or
-- changed, which is what sync_runs.rows_upserted now records. The stamp
-- column is written with everything else but never counts as a difference,
-- so it now means "last changed", not "last re-read".
--
-- p_rows is a JSON array of objects already shaped by the sync function:
-- only real, non-generated columns, values coerced to the column types. The
-- columns written are the union of the objects' keys; a key missing from one
-- object is written as NULL, exactly as the plain upsert did.

create or replace function public.sync_upsert(p_table text, p_keys text[], p_rows jsonb, p_stamp_column text default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  cols text[];
  compare text[];
  changed integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return 0;
  end if;

  select array_agg(k order by k) into cols
    from (select distinct jsonb_object_keys(r) as k from jsonb_array_elements(p_rows) r) keys;
  if not (p_keys <@ cols) then
    raise exception 'sync_upsert into %: every row must carry the key column(s) %', p_table, p_keys;
  end if;
  compare := array(select c from unnest(cols) c
                    where not (c = any(p_keys)) and c is distinct from p_stamp_column);

  execute format(
    'insert into public.%1$I as t (%2$s)
     select %2$s from jsonb_populate_recordset(null::public.%1$I, $1)
     on conflict (%3$s) %4$s',
    p_table,
    (select string_agg(format('%I', c), ', ') from unnest(cols) c),
    (select string_agg(format('%I', c), ', ') from unnest(p_keys) c),
    -- Nothing but the key (and stamp) to compare: an existing row can never
    -- differ, so it is left alone.
    case when cardinality(compare) = 0 then 'do nothing'
         else format('do update set %s where (%s) is distinct from (%s)',
                     (select string_agg(format('%1$I = excluded.%1$I', c), ', ')
                        from unnest(cols) c where not (c = any(p_keys))),
                     (select string_agg(format('t.%I', c), ', ') from unnest(compare) c),
                     (select string_agg(format('excluded.%I', c), ', ') from unnest(compare) c))
    end)
  using p_rows;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.sync_upsert(text, text[], jsonb, text) from public, anon, authenticated;
grant execute on function public.sync_upsert(text, text[], jsonb, text) to service_role;
