#!/usr/bin/env bash
# One-time setup: connects this dashboard's Supabase project to a DataKollecta
# project's data feed and schedules the sync. Safe to re-run, for example to
# change the key or the interval.
#
#   ./scripts/setup.sh
#
# Needs the Supabase CLI (logged in with `supabase login`), curl and openssl.
# Nothing it asks for is written to a file in this repo: the feed key and the
# cron secret go straight into the project's Edge Function secrets.
set -euo pipefail

cd "$(dirname "$0")/.."

for tool in supabase curl openssl; do
  command -v "$tool" >/dev/null || { echo "Missing $tool. Install it and re-run." >&2; exit 1; }
done

echo "== DataKollecta dashboard setup =="
echo
read -rp "Supabase project ref (from https://supabase.com/dashboard/project/<ref>): " PROJECT_REF
read -rp "DataKollecta feed URL (Settings -> Data feeds in DataKollecta): " DK_FEED_URL
read -rsp "DataKollecta data feed key (dkf_..., input hidden): " DK_FEED_KEY
echo
read -rp "Sync interval [4 hours] (e.g. 30 minutes, 4 hours, 1 day): " INTERVAL
INTERVAL=${INTERVAL:-4 hours}

[[ "$PROJECT_REF" =~ ^[a-z0-9]{20}$ ]] || { echo "That does not look like a project ref (20 lowercase letters/digits)." >&2; exit 1; }
[[ "$DK_FEED_URL" =~ ^https://.+/functions/v1/project-data-feed$ ]] || { echo "The feed URL should end in /functions/v1/project-data-feed." >&2; exit 1; }
[[ "$DK_FEED_KEY" =~ ^dkf_[0-9a-f]{8}_[0-9a-f]{64}$ ]] || { echo "That does not look like a data feed key (dkf_...)." >&2; exit 1; }

echo
echo "-> Checking the key against DataKollecta..."
status=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $DK_FEED_KEY" "$DK_FEED_URL?resource=forms")
[[ "$status" == 200 ]] || { echo "The feed answered $status. Check the URL and that the key is active." >&2; exit 1; }

echo "-> Linking the Supabase project..."
supabase link --project-ref "$PROJECT_REF"

echo "-> Applying database migrations..."
supabase db push

# Secrets go through a private temp file, not the command line, so they never
# appear in the process list or shell history.
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
chmod 600 "$tmp"
CRON_SECRET=$(openssl rand -hex 32)
printf 'DK_FEED_URL=%s\nDK_FEED_KEY=%s\nCRON_SECRET=%s\n' "$DK_FEED_URL" "$DK_FEED_KEY" "$CRON_SECRET" > "$tmp"
echo "-> Storing Edge Function secrets..."
supabase secrets set --env-file "$tmp" --project-ref "$PROJECT_REF"

echo "-> Deploying the sync function..."
supabase functions deploy pull-datakollecta --no-verify-jwt --project-ref "$PROJECT_REF"

FN_URL="https://$PROJECT_REF.supabase.co/functions/v1/pull-datakollecta"
printf 'x-sync-secret: %s\n' "$CRON_SECRET" > "$tmp"

echo "-> Scheduling the sync ($INTERVAL)..."
# A freshly deployed function can take a few seconds to answer.
for attempt in 1 2 3 4 5; do
  if response=$(curl -sf -X POST "$FN_URL" -H @"$tmp" -H 'Content-Type: application/json' \
      -d "{\"action\":\"configure\",\"interval\":\"$INTERVAL\"}"); then
    break
  fi
  [[ $attempt == 5 ]] && { echo "Could not reach the function. Check: supabase functions logs pull-datakollecta" >&2; exit 1; }
  sleep 5
done
echo "   $response"

echo "-> Running the first sync (copies everything collected so far)..."
curl -s -X POST "$FN_URL" -H @"$tmp" -H 'Content-Type: application/json' -d '{"action":"run"}'
echo
echo
echo "Done. Check the result in the SQL Editor:"
echo "  select started_at, status, rows_upserted, warnings from sync_runs order by started_at desc limit 5;"
echo "A large project may need a few runs to finish its first copy (status 'partial'); the schedule continues it."
echo "Change the schedule any time with:  select set_sync_interval('6 hours');"
