#!/usr/bin/env bash
# Backs up one environment's database to Azure Blob Storage (container "backups").
#   backup.sh <staging|prod> [label]
# Cron runs it nightly at 03:00 / 03:10 (Dhaka time, the VM's timezone). The file is
#   backups/<env>/YYYY-MM-DD.dump        (nightly; a re-run on the same day replaces it)
#   backups/<env>/YYYY-MM-DD-<label>.dump (manual, with a label)
# It is a `pg_dump -Fc` (compressed custom format) taken inside the postgres container, uploaded with one HTTPS PUT
# using the container-scoped SAS token from the env file (no az CLI needed), then verified by reading the size back.
# The container's lifecycle rule deletes blobs after 30 days.
set -euo pipefail
SCRIPT_NAME=backup
. "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

TARGET="${1:?usage: backup.sh <staging|prod> [label]}"
LABEL="${2:-}"
case "$TARGET" in staging|prod) ;; *) die "target must be staging or prod" ;; esac
ENVFILE="$(env_file "$TARGET")"
[ -f "$ENVFILE" ] || die "missing $ENVFILE"
getv() { grep -m1 "^$1=" "$ENVFILE" | cut -d= -f2-; }

ACCOUNT="$(getv AZURE_BACKUP_ACCOUNT)"
SAS="$(getv AZURE_BACKUP_SAS)"
DB="$(getv POSTGRES_DB)"
[ -n "$ACCOUNT" ] && [ -n "$SAS" ] || die "AZURE_BACKUP_ACCOUNT / AZURE_BACKUP_SAS are not set in $ENVFILE"

NAME="$(date +%F)${LABEL:+-$LABEL}.dump"
BLOB="$TARGET/$NAME"
URL="https://$ACCOUNT.blob.core.windows.net/backups/$BLOB"
TMP="$(mktemp -p "$STATE" "backup-$TARGET-XXXXXX.dump")"
trap 'rm -f "$TMP"' EXIT

log "dumping $DB"
docker exec "bm-$TARGET-postgres-1" pg_dump -U bm_owner -Fc "$DB" > "$TMP"
SIZE="$(stat -c %s "$TMP")"
[ "$SIZE" -gt 0 ] || die "dump is empty"

log "uploading $BLOB ($SIZE bytes)"
curl -fsS --retry 3 --retry-delay 5 -X PUT -H "x-ms-blob-type: BlockBlob" -H "x-ms-version: 2022-11-02" \
  --data-binary "@$TMP" "$URL?$SAS" -o /dev/null

REMOTE="$(curl -fsSI -H "x-ms-version: 2022-11-02" "$URL?$SAS" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-length"{print $2}')"
[ "$REMOTE" = "$SIZE" ] || die "size mismatch after upload (local $SIZE, remote ${REMOTE:-none})"
log "OK $BLOB verified ($SIZE bytes)"
