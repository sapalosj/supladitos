#!/usr/bin/env bash
# Dump a Supabase database to three SQL files (9.5): roles, schema, data.
#
#   scripts/backup.sh [DB_URL] [OUT_DIR]
#
# DB_URL   Postgres connection string (e.g. the production "Session pooler" URL).
#          Leave it out to dump the local stack.
# OUT_DIR  Where to write the files (default: backup/<UTC timestamp>).
#
# Uses the Supabase CLI's `db dump`, which runs pg_dump in Docker with the
# right version and leaves out Supabase-managed schemas and migration tables,
# so the files restore cleanly into a new project (see scripts/restore.sh).
set -euo pipefail

DB_URL="${1:-}"
OUT_DIR="${2:-backup/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$OUT_DIR"

target=()
if [[ -n "$DB_URL" ]]; then
  target=(--remote="$DB_URL")
fi

echo "Dumping roles…"
npx supabase db dump "${target[@]}" --role-only -f "$OUT_DIR/roles.sql"
echo "Dumping schema…"
npx supabase db dump "${target[@]}" -f "$OUT_DIR/schema.sql"
echo "Dumping data…"
# Storage's internal bookkeeping tables belong to the storage service of the
# target project (and the restore role can't write them). Bucket and object
# metadata are kept; file contents are never in a database dump.
exclude=()
for t in buckets_vectors vector_indexes buckets_analytics iceberg_namespaces iceberg_tables \
  bucket_lifecycle_states lifecycle_abandoned_artifacts s3_multipart_uploads s3_multipart_uploads_parts; do
  exclude+=(-x "storage.$t")
done
npx supabase db dump "${target[@]}" --data-only --use-copy "${exclude[@]}" -f "$OUT_DIR/data.sql"

# A dump with no data is a failed backup, not an empty shop.
if ! grep -q 'COPY "public"."orders"' "$OUT_DIR/data.sql"; then
  echo "Backup looks wrong: no orders table in data.sql" >&2
  exit 1
fi

ls -l "$OUT_DIR"
echo "Backup written to $OUT_DIR"
