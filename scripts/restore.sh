#!/usr/bin/env bash
# Restore a backup made by scripts/backup.sh into an EMPTY Supabase database
# (a new project, or the throwaway stack from scripts/restore-test.sh) (9.6).
#
#   scripts/restore.sh DB_URL BACKUP_DIR
#
# Runs in one transaction: either everything is restored or nothing is.
# Uses the host's psql if there is one, otherwise psql from the Supabase
# Postgres image.
set -euo pipefail

DB_URL="${1:?usage: scripts/restore.sh DB_URL BACKUP_DIR}"
DIR="$(cd "${2:?usage: scripts/restore.sh DB_URL BACKUP_DIR}" && pwd)"
PG_IMAGE="${PG_IMAGE:-public.ecr.aws/supabase/postgres:17.12.0.000}"

for f in roles.sql schema.sql data.sql; do
  [[ -f "$DIR/$f" ]] || { echo "Missing $DIR/$f" >&2; exit 1; }
done

args=(--single-transaction --variable ON_ERROR_STOP=1
  --file /backup/roles.sql
  --file /backup/schema.sql
  --command 'SET session_replication_role = replica'
  --file /backup/data.sql
  --dbname "$DB_URL")

if command -v psql >/dev/null; then
  # Point the /backup paths at the real directory.
  psql "${args[@]//\/backup/$DIR}"
else
  docker run --rm --network host -v "$DIR:/backup:ro" --entrypoint psql "$PG_IMAGE" "${args[@]}"
fi
echo "Restored $DIR"
