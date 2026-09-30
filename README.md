# PRISM CSS Surveillance Dashboard

Next.js (App Router, TypeScript) + Supabase (Postgres, Auth, RLS) dashboard for the PRISM cross-sectional survey (CSS) across the 26 MRC surveillance sites. Deployed on Vercel.

- **Survey progress**: the "26 MRC Surveillance CSS Updates" table (per MRC, district subtotals, CSV export) plus cumulative/weekly charts
- **Malaria**: fever, RDT positivity, AL, Hb in under-5s, treatment in last 6 months
- **Bed nets**: ownership, UCC nets, 1 net per 2 people, slept under a net, brands
- **Vaccines**: R21 and Hib coverage in children under 3
- Filters (district, MRC, date range, week/month) are kept in the URL, so views can be shared.

Data is loaded by the separate upload repo, `../prism_css_upload_to_dashboard`.

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
| Target HH | `mrc.target_hh` (from `sites_final.csv`; edit in the Table Editor) |
| HHs with samples drawn | enrolled HH with at least one member with any sample collected |
| HH pending clinical surveys | enrolled HH with fewer member records than `nmembers` |
| Samples – BS / FP | members whose `samples_collected` includes 1 (blood smear) / 2 (filter paper) |
| HH visited by Entomology | not in the survey data, so not shown |

The `mrc` table holds exactly the 26 surveillance sites (from `sites_final.csv`). Survey records with any other MRC code are stored but never shown.

## Project layout

```
supabase/migrations/   schema, reference data, RLS, views, dashboard functions (run in order)
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

To load data locally, run the upload repo against `http://127.0.0.1:54321`.

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

## Changing metrics

- Change a definition: edit the view in a **new** migration (`create or replace view ...`), then `supabase db push`.
- Add a column to the Surveys table: add it to `survey_summary()` (functions migration), `SurveyRow` in `src/lib/types.ts` and `COLUMNS` in `src/components/surveys-tab.tsx`.
