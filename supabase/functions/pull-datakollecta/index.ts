// Identical copy of new_project_dashboard/supabase/functions/pull-datakollecta/index.ts
// (the DataKollecta dashboard template). Keep the two in step; what is
// PRISM-specific is in sync.config.json and in the database.
//
// pull-datakollecta: copies new and changed records from a DataKollecta
// project into this dashboard's database, through the project's data feed.
//
// Called by pg_cron (via run_sync_now) on the schedule in sync_config, or by
// hand. Each run reads, per form, everything changed since a little before
// where the last run stopped, upserts it, and deletes tombstoned records.
// Progress is saved after every page, so a run that is cut short (or a large
// first backfill) simply continues next time.
//
// Generic: what is project-specific lives in sync.config.json (where rows
// land) and in the database (sync_quality_warnings). The same file runs in
// every project dashboard.
//
// Secrets (supabase secrets set ...): DK_FEED_URL, DK_FEED_KEY, CRON_SECRET.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
//
// Requests (POST, header x-sync-secret: <CRON_SECRET>):
//   {"action":"run"}                                     sync now (default)
//   {"action":"configure","interval":"4 hours"}         store the cron target and schedule
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.115.0";
import config from "./sync.config.json" with { type: "json" };

type Row = Record<string, unknown>;
type Column = { column_name: string; data_type: string; is_generated: boolean };

interface TypedTable {
  /** The DataKollecta form (table_name). */
  form: string;
  /** The table in this database it lands in. */
  table: string;
  /** Its primary key; also the conflict target for upserts. */
  key: string;
}

interface SyncConfig {
  mode: "jsonb" | "typed";
  /** typed mode: forms to sync, in load order (parents first). */
  tables?: TypedTable[];
  /** Where edit history lands; null to skip it. */
  formchanges?: { table: string; key: string } | null;
  /** typed mode: a timestamptz column set to now() whenever a row is inserted
   *  or changes (not on edit-history rows, which keep DataKollecta's own). */
  stamp_column?: string | null;
}

const CONFIG = config as SyncConfig;
const PAGE_SIZE = 1000;
const WRITE_BATCH = 500;
/** Each run re-reads this far back, so a record committed late is not missed. */
const OVERLAP_MS = 10 * 60 * 1000;
/** Stop starting new pages after this long; the next run continues. */
const TIME_BUDGET_MS = 110 * 1000;
const MAX_WARNINGS = 200;

const META_COLUMNS = ["survey_version", "data_status", "local_unique_id", "surveyor_id", "collected_at", "submitted_at"];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

class Run {
  upserted = 0;
  deleted = 0;
  warnings: string[] = [];
  started = Date.now();
  partial = false;
  warn(message: string) {
    if (this.warnings.length < MAX_WARNINGS) this.warnings.push(message);
  }
  outOfTime() {
    return Date.now() - this.started > TIME_BUDGET_MS;
  }
}

/** Feed values arrive as JSON (mostly strings from the device); convert each
 *  to the target column's type, NULL with a warning when it does not fit.
 *  Same rules as the CSV import script. */
function coerce(value: unknown, type: string, where: string, run: Run): unknown {
  if (value === null || value === undefined) return null;
  if (type === "jsonb" || type === "json") return value;
  const v = (typeof value === "object" ? JSON.stringify(value) : String(value)).trim();
  if (v === "") return null;
  const bad = () => {
    run.warn(`${where} = "${v}" is not a valid ${type} -> stored as NULL`);
    return null;
  };
  switch (type) {
    case "integer":
    case "bigint":
    case "smallint":
      return /^-?\d+(\.0+)?$/.test(v) ? parseInt(v, 10) : bad();
    case "numeric":
    case "double precision":
    case "real":
      return Number.isFinite(Number(v)) ? Number(v) : bad();
    case "date":
      return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : bad();
    case "timestamp without time zone":
    case "timestamp with time zone":
      return Number.isNaN(Date.parse(v)) ? bad() : v;
    case "boolean":
      return ["1", "true", "t", "yes"].includes(v.toLowerCase());
    default:
      return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
}

const columnCache = new Map<string, Map<string, Column>>();
async function columnsOf(db: SupabaseClient, table: string): Promise<Map<string, Column>> {
  const cached = columnCache.get(table);
  if (cached) return cached;
  const { data, error } = await db.rpc("import_column_types", { p_table: table });
  if (error) throw new Error(`Could not read columns of ${table}: ${error.message}`);
  if (!data?.length) throw new Error(`Table ${table} does not exist - have the migrations been applied?`);
  const columns = new Map((data as Column[]).map((c) => [c.column_name, c]));
  columnCache.set(table, columns);
  return columns;
}

/** Shapes rows for [table]: known, non-generated columns only, coerced.
 *  Columns the feed sends that the table lacks are reported once. */
async function shape(
  db: SupabaseClient, table: string, key: string, rows: Row[], run: Run, reported: Set<string>, stamp: string | null,
): Promise<Row[]> {
  const columns = await columnsOf(db, table);
  const out = new Map<string, Row>();
  for (const row of rows) {
    const id = row[key];
    if (id === null || id === undefined || String(id).trim() === "") {
      run.warn(`${table}: a record has no ${key} -> skipped (local_unique_id ${row.local_unique_id ?? "?"})`);
      continue;
    }
    const shaped: Row = {};
    for (const [name, value] of Object.entries(row)) {
      const column = columns.get(name);
      if (!column) {
        if (!name.startsWith("_") && !reported.has(`${table}.${name}`)) {
          reported.add(`${table}.${name}`);
          run.warn(`${table}: field "${name}" is not a column of the table -> ignored (add it in a migration to keep it)`);
        }
        continue;
      }
      if (column.is_generated) continue;
      shaped[name] = coerce(value, column.data_type, `${table}.${name} (${key} ${id})`, run);
    }
    if (stamp && columns.has(stamp)) shaped[stamp] = new Date().toISOString();
    out.set(String(id), shaped);
  }
  return [...out.values()];
}

/** Inserts new rows and updates changed ones (sync_upsert); returns how many
 *  that was. Rows re-read by the overlap but unchanged are left alone and
 *  not counted, and their stamp column keeps the time they last changed. */
async function upsert(db: SupabaseClient, table: string, keys: string[], rows: Row[], stamp: string | null): Promise<number> {
  let changed = 0;
  for (let i = 0; i < rows.length; i += WRITE_BATCH) {
    const { data, error } = await db.rpc("sync_upsert", {
      p_table: table, p_keys: keys, p_rows: rows.slice(i, i + WRITE_BATCH), p_stamp_column: stamp,
    });
    if (error) throw new Error(`Upsert into ${table} failed: ${error.message}`);
    changed += Number(data ?? 0);
  }
  return changed;
}

async function feed(params: Record<string, string>): Promise<Record<string, unknown>> {
  const url = `${Deno.env.get("DK_FEED_URL")}?${new URLSearchParams(params)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${Deno.env.get("DK_FEED_KEY")}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`DataKollecta feed returned ${response.status}: ${body.error ?? response.statusText}`);
  }
  return body;
}

/** The forms to sync and where each lands. */
async function plan(run: Run): Promise<{ form: string; table: string; key: string }[]> {
  const { forms } = await feed({ resource: "forms" }) as { forms: { table_name: string; is_base: boolean }[] };
  if (CONFIG.mode === "typed") {
    // A configured form the key cannot read would otherwise just sync
    // nothing, forever, without a word -- the usual cause is a key made
    // before that survey existed, or without its survey ticked.
    const readable = new Set(forms.map((f) => f.table_name));
    for (const t of CONFIG.tables ?? []) {
      if (!readable.has(t.form)) {
        run.warn(`form "${t.form}" is not readable with this data feed key -> skipped (create a key that includes its survey)`);
      }
    }
    return (CONFIG.tables ?? []).filter((t) => readable.has(t.form));
  }
  // Parents first; one entry per form even if several surveys declare it.
  const ordered = [...forms].sort((a, b) => Number(b.is_base) - Number(a.is_base));
  return [...new Map(ordered.map((f) => [f.table_name, f])).values()]
    .map((f) => ({ form: f.table_name, table: "dk_submissions", key: "local_unique_id" }));
}

async function startOf(db: SupabaseClient, resource: string): Promise<string | null> {
  const { data, error } = await db.from("sync_state").select("last_changed_at").eq("resource", resource).maybeSingle();
  if (error) throw new Error(`Could not read sync_state: ${error.message}`);
  if (!data?.last_changed_at) return null;
  return new Date(Date.parse(data.last_changed_at) - OVERLAP_MS).toISOString();
}

async function syncForm(db: SupabaseClient, target: { form: string; table: string; key: string }, run: Run) {
  const resource = `submissions:${target.form}`;
  const since = await startOf(db, resource);
  const reported = new Set<string>();
  let cursor: string | null = null;
  do {
    if (run.outOfTime()) {
      run.partial = true;
      return;
    }
    const params: Record<string, string> = { resource: "submissions", table: target.form, limit: String(PAGE_SIZE) };
    if (cursor) params.cursor = cursor;
    else if (since) params.since = since;
    const page = await feed(params) as { rows: Row[]; next_cursor: string | null; last_changed_at: string | null; has_more: boolean };

    const live = page.rows.filter((r) => !r._deleted);
    const gone = page.rows.filter((r) => r._deleted).map((r) => String(r.local_unique_id));

    const rows = target.table === "dk_submissions"
      ? live.map((r) => {
        const data: Row = {};
        for (const [k, v] of Object.entries(r)) if (!META_COLUMNS.includes(k)) data[k] = v;
        return {
          table_name: target.form,
          local_unique_id: r.local_unique_id,
          data,
          survey_version: r.survey_version,
          data_status: r.data_status,
          surveyor_id: r.surveyor_id,
          collected_at: r.collected_at,
          submitted_at: r.submitted_at,
          synced_at: new Date().toISOString(),
        };
      })
      : live;
    const landing = target.table === "dk_submissions";
    // dk_submissions rows carry synced_at already (built above).
    const stamp = landing ? "synced_at" : CONFIG.stamp_column ?? null;
    const shaped = landing
      ? await shape(db, target.table, "local_unique_id", rows, run, reported, null)
      : await shape(db, target.table, target.key, rows, run, reported, stamp);
    run.upserted += landing
      ? await upsert(db, target.table, ["table_name", "local_unique_id"], shaped, stamp)
      : await upsert(db, target.table, [target.key], shaped, stamp);

    if (gone.length > 0) {
      let del = db.from(target.table).delete({ count: "exact" }).in("local_unique_id", gone);
      if (target.table === "dk_submissions") del = del.eq("table_name", target.form);
      const { error, count } = await del;
      if (error) throw new Error(`Delete from ${target.table} failed: ${error.message}`);
      run.deleted += count ?? 0;
    }

    if (page.last_changed_at) {
      const { error } = await db.rpc("sync_save_progress", {
        p_resource: resource, p_last_changed_at: page.last_changed_at, p_rows: page.rows.length,
      });
      if (error) throw new Error(`Could not save progress: ${error.message}`);
    }
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
}

async function syncFormchanges(db: SupabaseClient, run: Run) {
  const target = CONFIG.formchanges === undefined
    ? { table: "dk_formchanges", key: "formchanges_uuid" }
    : CONFIG.formchanges;
  if (!target) return;
  const resource = "formchanges";
  const since = await startOf(db, resource);
  const reported = new Set<string>();
  let cursor: string | null = null;
  do {
    if (run.outOfTime()) {
      run.partial = true;
      return;
    }
    const params: Record<string, string> = { resource, limit: String(PAGE_SIZE) };
    if (cursor) params.cursor = cursor;
    else if (since) params.since = since;
    const page = await feed(params) as { rows: Row[]; next_cursor: string | null; last_changed_at: string | null; has_more: boolean };
    const shaped = await shape(db, target.table, target.key, page.rows, run, reported, null);
    // No stamp here: formchanges.synced_at is DataKollecta's own receipt time.
    run.upserted += await upsert(db, target.table, [target.key], shaped, null);
    if (page.last_changed_at) {
      const { error } = await db.rpc("sync_save_progress", {
        p_resource: resource, p_last_changed_at: page.last_changed_at, p_rows: page.rows.length,
      });
      if (error) throw new Error(`Could not save progress: ${error.message}`);
    }
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
}

async function runSync(db: SupabaseClient): Promise<Response> {
  const { data: runId, error: beginError } = await db.rpc("sync_begin");
  if (beginError) throw new Error(`Could not start a run: ${beginError.message}`);
  if (runId === null) return json(409, { status: "skipped", reason: "Another sync is still running" });

  const run = new Run();
  try {
    for (const target of await plan(run)) {
      await syncForm(db, target, run);
      if (run.partial) break;
    }
    if (!run.partial) await syncFormchanges(db, run);

    const { data: checks, error: checkError } = await db.rpc("sync_quality_warnings");
    if (checkError) run.warn(`Data-quality checks failed: ${checkError.message}`);
    for (const w of (checks as string[] | null) ?? []) run.warn(w);

    const status = run.partial ? "partial" : "success";
    const { error: finishError } = await db.rpc("sync_finish", {
      p_run_id: runId, p_status: status, p_upserted: run.upserted, p_deleted: run.deleted,
      p_warnings: run.warnings, p_error: null,
    });
    if (finishError) throw new Error(`Could not record the finished run: ${finishError.message}`);
    return json(200, { status, run_id: runId, upserted: run.upserted, deleted: run.deleted, warnings: run.warnings });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("pull-datakollecta failed:", message);
    const { error: finishError } = await db.rpc("sync_finish", {
      p_run_id: runId, p_status: "error", p_upserted: run.upserted, p_deleted: run.deleted,
      p_warnings: run.warnings, p_error: message,
    });
    // The run stays 'running' until sync_begin declares it abandoned (15 min).
    if (finishError) console.error("Could not record the failed run:", finishError.message);
    return json(500, { status: "error", run_id: runId, error: message });
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST" });
  const expected = Deno.env.get("CRON_SECRET") ?? "";
  if (!expected || !sameSecret(req.headers.get("x-sync-secret") ?? "", expected)) {
    return json(401, { error: "Unauthorised" });
  }
  for (const name of ["DK_FEED_URL", "DK_FEED_KEY"]) {
    if (!Deno.env.get(name)) return json(500, { error: `Secret ${name} is not set (supabase secrets set ${name}=...)` });
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const body = await req.json().catch(() => ({})) as { action?: string; interval?: string; function_url?: string };

  if (body.action === "configure") {
    // Check the key works before scheduling anything.
    const { scope } = await feed({ resource: "forms" }).catch((e) => ({ scope: null, error: e }));
    if (!scope) return json(502, { error: "The DataKollecta feed rejected the key or URL. Check DK_FEED_URL and DK_FEED_KEY." });
    // Locally the platform URL is the container network's, which is also what
    // pg_net inside the database can reach; deployed it is the public URL.
    const functionUrl = body.function_url ?? `${Deno.env.get("SUPABASE_URL")}/functions/v1/pull-datakollecta`;
    const { data, error } = await db.rpc("sync_configure", {
      p_function_url: functionUrl, p_secret: expected, p_interval: body.interval ?? "",
    });
    if (error) return json(500, { error: `Could not configure the schedule: ${error.message}` });
    return json(200, { status: "configured", scope, schedule: data });
  }

  return await runSync(db);
});
