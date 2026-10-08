# PRISM CSS Surveillance Dashboard

Next.js (App Router, TypeScript) + Supabase (Postgres, Auth, RLS) dashboard for the PRISM cross-sectional survey (CSS) across the 26 MRC surveillance sites. Deployed on Vercel.

- **Survey progress**: the "26 MRC Surveillance CSS Updates" table (per MRC, district subtotals, CSV export) plus cumulative/weekly charts
- **Malaria**: fever, RDT positivity, AL, Hb in under-5s, treatment in last 6 months
- **Bed nets**: ownership, UCC nets, 1 net per 2 people, slept under a net, brands
- **Vaccines**: R21 and Hib coverage in children under 3
- **Daily tracker**: interviewers' own daily counts of households approached and enrolled (the separate daily tracker survey), per report date and MRC, with totals by MRC and a weekly/monthly chart. The date filters apply to `report_date`.
- Filters (district, MRC, date range, week/month) are kept in the URL, so views can be shared.

Data arrives automatically from DataKollecta (project `prismcss2026`): a scheduled job in this project's Supabase database pulls new and changed records through a read-only **data feed key** every few hours. See [Data sync from DataKollecta](#data-sync-from-datakollecta). The separate upload repo, `../prism_css_upload_to_dashboard`, remains as a manual backup.

## Access control

Only emails in `public.allowed_users` can sign in (email magic link). The `mrcs` column controls what each user sees:

| `mrcs` value | Access |
|---|---|
| `all` | every MRC |
| `37,38` | MRC codes (recommended) |
| `Bala HCIII, Aboke` | MRC names, with or without the facility level (matched to `mrc.mrcname`, case-insensitive) |

This is enforced by Row-Level Security in Postgres (`public.user_mrc_codes()`), so the database only ever returns permitted rows.

MRC codes: Aboke 37, Bala 38, Aduku 41, Apwori 42, Akokoro 40, Otwal 36, Lalogi 27, Awach 25, Patongo 33, Atiak 23, Namokora 31, Kitgum Matidi 32, Amolatar 66, Orum 69, Kyatiri 12, Padibe 29, Koch Goma 21, Diima 14, Buwaiswa 61, Kigandalo 62, Budondo 59, Nawaikoke 56, Morungatuny 47, Busitema 64, Lokolia 43, Nadunget 71 (see `select * from mrc`).

## Metric definitions

All definitions live in `supabase/migrations/20260929000400_views.sql` (`v_household`, `v_member`, `v_net`). Codes -7 (don't know) and -8 (refused) count as missing.

| Column | Definition |
|---|---|
| HH visited | all `hh_info` records. Data is only entered when a household is closed out, so every record is a finished visit. (Not the village enumeration exercise.) |
| HHs approached* | visited households excluding exclusion reasons 1 (destroyed/not found) and 2 (vacant), i.e. occupied dwellings |
| HHs enrolled | `enrolled = 1` |
| HH residents | `hh_members` records in enrolled households (the KPI also shows the reported `nmembers` total) |
| With / without children 2–10 | enrolled HH with at least one member aged 2–10 / the rest |
| Excluded (+ reasons) | `enrolled = 0`, broken down by `exclreason` |
| Target HH | `mrc.target_hh` (50 per MRC; edit in the Table Editor) |
| % of target | enrolled households **with at least one child aged 2–10** ÷ target. Enrolled households without such a child don't count |
| HHs with samples drawn | enrolled HH with at least one member with any sample collected |
| HH pending clinical surveys | enrolled HH with fewer member records than `nmembers` |
| Samples – BS / FP | members whose `samples_collected` includes 1 (blood smear) / 2 (filter paper) |
| HH visited by Entomology | not in the survey data, so not shown |

The `mrc` table holds exactly the 26 surveillance sites (from `sites_final.csv`). Survey records with any other MRC code are stored but never shown.

## Data sync from DataKollecta

```
DataKollecta (prismcss2026) --data feed key--> pull-datakollecta (Edge Function) --> hh_info, hh_members, ... --> dashboard
                                                   ^ pg_cron, every N hours
```

- The data feed key must cover **both** DataKollecta surveys: the CSS survey and the daily tracker. A form the key can't read is skipped with a warning in `sync_runs.warnings` (`form "daily_tracker" is not readable with this data feed key`).
- `supabase/functions/pull-datakollecta/` is the sync. It is the generic DataKollecta dashboard function (an identical copy of the one in `new_project_dashboard`); `sync.config.json` maps the four CSS forms, `daily_tracker` and `formchanges` onto this project's tables ("typed" mode).
- Each run reads everything changed since about 10 minutes before the last run, writes only records that are new or actually changed (`sync_upsert`), and deletes records DataKollecta no longer serves (for example ones reclassified as test). `sync_runs.rows_upserted` therefore counts real inserts and changes, and a table's `synced_at` is when that record last changed here. Progress is saved after every page, so an interrupted run resumes.
- The schedule lives in this database (`pg_cron`). Nothing depends on GitHub, Vercel or anyone's computer. The DataKollecta key is an Edge Function secret. It is never in the database, the repo or Vercel.
- The data-quality checks the CSV import used to print (unknown MRC codes, `mrccode`/`hhid` mismatches, orphaned child records) now run after every sync. They are kept in `sync_runs.warnings`, from `sync_quality_warnings()` in `20261009000200_datakollecta_typed_sync.sql`.
- The header shows two times. **Synced from DataKollecta** is the last successful sync (`last_sync()`): the dashboard is up to date as of then, whether or not that sync found anything new. **Newest record received** is when DataKollecta received the newest record the user can see (`newest_record_received()`, by `submitted_at`): it shows whether the field team is still uploading.

### Setting it up (once)

1. In DataKollecta, open **PRISM CSS 2026 → Settings → Data feeds** and choose **Create key**. Tick the CSS survey and leave test data off. Copy the key and the feed URL.
2. Here, run `./scripts/setup.sh`. It links the project, pushes migrations, stores the key as a secret, deploys the function, schedules it (default every 4 hours) and runs the first sync.

### Day to day (SQL Editor)

```sql
select started_at, status, rows_upserted, rows_deleted, warnings, error
from sync_runs order by started_at desc limit 10;   -- what happened

select set_sync_interval('6 hours');   -- change the frequency ('30 minutes', '1 day', or a cron expression)
select set_sync_enabled(false);        -- pause (true to resume)
select run_sync_now();                 -- sync now, outside the schedule
```

To replace the key, create a new one in DataKollecta, then run `supabase secrets set DK_FEED_KEY=dkf_...` and revoke the old key.

When the survey adds a question, the sync reports `field "x" is not a column of the table` in `sync_runs.warnings` until you add the column in a migration. Each run only re-reads records that changed, so once the column exists, run `delete from sync_state;` then `select run_sync_now();` to re-read everything and fill it for older records.

## Project layout

```
supabase/migrations/   schema, reference data, RLS, views, dashboard functions, sync (run in order)
supabase/functions/    pull-datakollecta: the scheduled sync from DataKollecta
scripts/setup.sh       one-time sync setup (key, schedule, first run)
supabase/seed.sql      local-only test users and targets
src/app/page.tsx       dashboard (server component; fetches via supabase.rpc)
src/app/login/         magic-link / code sign-in (checks allowed_users first)
src/proxy.ts           session refresh + redirect to /login
src/components/        filter bar, tabs, tables, charts (Recharts)
```

## Local development

Requires Docker and the Supabase CLI.

```bash
supabase start          # local Postgres/Auth; applies migrations + seed.sql
npm install
npm run dev             # http://localhost:3000
```

`.env.local` points at the local stack (see `.env.example`). Local sign-in emails go to Mailpit at http://127.0.0.1:54324. Test users are in `supabase/seed.sql` (`admin@example.test` sees everything, `bala@example.test` sees Bala only).

To load data locally, run the upload repo against `http://127.0.0.1:54321`, or serve the sync function against a DataKollecta feed:

```bash
printf 'DK_FEED_URL=...\nDK_FEED_KEY=dkf_...\nCRON_SECRET=local-secret\n' > supabase/.env.functions
supabase functions serve --env-file supabase/.env.functions
curl -X POST http://127.0.0.1:54321/functions/v1/pull-datakollecta -H 'x-sync-secret: local-secret' -d '{"action":"run"}'
```

## Production setup

### Supabase (hosted project)

1. **Apply the schema.** Either:
   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
   or paste each file in `supabase/migrations/` into the SQL Editor, in filename order.
2. **Auth → Sign In / Providers → Email**: enabled. Optional: turn off "Allow new users to sign up". The app only sends emails to allow-listed addresses anyway.
3. **Auth → URL Configuration**: Site URL = your Vercel production URL. Redirect URLs: `https://<your-app>.vercel.app/**` and `http://localhost:3000/**`. If you use preview deployments, add `https://*-<your-team>.vercel.app/**` too.
4. **Optional sign-in code:** in Auth → Email Templates → Magic Link, add `{{ .Token }}` to the template so users can type the code instead of clicking the link. This helps when the link opens in a different browser.
5. **Custom SMTP** (Auth → SMTP Settings): recommended. Supabase's built-in email sender only allows a few emails per hour.
6. **Table Editor**: add rows to `allowed_users` (emails in lowercase) and set `mrc.target_hh` for each site.

### Vercel

1. Push this repo to GitHub and import it in Vercel (framework preset: Next.js).
2. Environment variables (Production + Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (publishable/anon key)
   - `SUPABASE_SECRET_KEY` (secret/service_role key; server-only, never `NEXT_PUBLIC_`)
3. Deploy, then add the production URL to Supabase's Site URL / Redirect URLs.

## Dashboard access history

Apply `20261001000200_dashboard_access_daily.sql` before deploying access tracking.
In Supabase's Table Editor, open `dashboard_access_daily` and sort `access_date`
descending to see recent visitors. There is one row per user per Kampala calendar
day, with their email and first/latest dashboard opening timestamps. Timestamp
columns are stored as `timestamptz`; the editor may display them in UTC.

Records are retained indefinitely. Dashboard users cannot read or write the table
directly; the authenticated server endpoint records access with the service role.
Only a full dashboard opening or refresh sends a background tracking request:
tab switches, filters, prefetching, and idle pages do not. Tracking is best-effort;
network failures or blocked scripts may leave an opening unrecorded. There is no
polling or retry, and a page left open overnight does not record a new day until
reopened or refreshed. Historical access before deployment is not available.

## Changing metrics

- Change a definition: edit the view in a **new** migration (`create or replace view ...`), then `supabase db push`.
- Add a column to the Surveys table: add it to `survey_summary()` (functions migration), `SurveyRow` in `src/lib/types.ts` and `COLUMNS` in `src/components/surveys-tab.tsx`.
