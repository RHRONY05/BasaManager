#!/usr/bin/env bash
# Restores a backup from Azure Blob Storage into a database. By default into a THROWAWAY Postgres container
# (this is what the weekly drill does and what you should do first to look at data). It can also restore into a
# live environment, but only when you pass --into-live and type the environment name.
#
#   restore.sh <staging|prod> [blob-name|latest]            # throwaway container, then row counts
#   restore.sh <staging|prod> <blob-name|latest> --into-live # REPLACES the live database (asks you to confirm)
#
# Needs: AZURE_BACKUP_ACCOUNT and AZURE_BACKUP_SAS in the environment (CI) or in /opt/basamanager/env/<env>.env (VM),
# docker, curl. Prints only names, sizes and row counts.
set -euo pipefail
SCRIPT_NAME=restore
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/_lib.sh"

TARGET="${1:?usage: restore.sh <staging|prod> [blob|latest] [--into-live]}"
WHICH="${2:-latest}"
LIVE=0; [ "${3:-}" = "--into-live" ] && LIVE=1
case "$TARGET" in staging|prod) ;; *) die "target must be staging or prod" ;; esac

if [ -z "${AZURE_BACKUP_ACCOUNT:-}" ] || [ -z "${AZURE_BACKUP_SAS:-}" ]; then
  ENVFILE="$(env_file "$TARGET")"
  [ -f "$ENVFILE" ] || die "set AZURE_BACKUP_ACCOUNT and AZURE_BACKUP_SAS, or run on the VM"
  AZURE_BACKUP_ACCOUNT="$(grep -m1 '^AZURE_BACKUP_ACCOUNT=' "$ENVFILE" | cut -d= -f2-)"
  AZURE_BACKUP_SAS="$(grep -m1 '^AZURE_BACKUP_SAS=' "$ENVFILE" | cut -d= -f2-)"
fi
CONTAINER_URL="https://$AZURE_BACKUP_ACCOUNT.blob.core.windows.net/backups"

if [ "$WHICH" = latest ]; then
  # List blobs under <env>/ (XML), take the newest by name (names start with the ISO date).
  LIST="$(curl -fsS -H "x-ms-version: 2022-11-02" "$CONTAINER_URL?restype=container&comp=list&prefix=$TARGET/&$AZURE_BACKUP_SAS")"
  WHICH="$(printf '%s' "$LIST" | grep -o "<Name>$TARGET/[^<]*</Name>" | sed -E 's#</?Name>##g; s#^[^/]*/##' | sort | tail -1)"
  [ -n "$WHICH" ] || die "no backups found under backups/$TARGET/"
fi
BLOB="$TARGET/$WHICH"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"; docker rm -f bm-restore-drill >/dev/null 2>&1 || true' EXIT

log "downloading backups/$BLOB"
curl -fsS --retry 3 -H "x-ms-version: 2022-11-02" "$CONTAINER_URL/$BLOB?$AZURE_BACKUP_SAS" -o "$WORK/db.dump"
log "downloaded $(stat -c %s "$WORK/db.dump") bytes"

if [ "$LIVE" -eq 1 ]; then
  ENVFILE="$(env_file "$TARGET")"
  DB="$(grep -m1 '^POSTGRES_DB=' "$ENVFILE" | cut -d= -f2-)"
  printf 'This REPLACES the live %s database (%s) with %s.\nType the environment name (%s) to continue: ' "$TARGET" "$DB" "$BLOB" "$TARGET"
  read -r CONFIRM
  [ "$CONFIRM" = "$TARGET" ] || die "not confirmed"
  CT="bm-$TARGET-postgres-1"
  log "stopping api and worker"
  docker stop "bm-$TARGET-api-1" "bm-$TARGET-worker-1" >/dev/null
  docker exec -i "$CT" pg_restore -U bm_owner -d "$DB" --clean --if-exists --no-owner --role=bm_owner < "$WORK/db.dump"
  log "restored into live $TARGET. Start the services again: docker start bm-$TARGET-api-1 bm-$TARGET-worker-1"
  exit 0
fi

# Throwaway container with the same major version and the same roles as the server (dev passwords: it is deleted at the end).
docker rm -f bm-restore-drill >/dev/null 2>&1 || true
docker run -d --name bm-restore-drill -e POSTGRES_USER=bm_owner -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=drill postgres:17 >/dev/null
for _ in $(seq 1 40); do docker exec bm-restore-drill pg_isready -U bm_owner -d drill >/dev/null 2>&1 && break; sleep 1; done
SQL_ROLES="$HERE/../postgres/init/01-roles.sql"
[ -f "$SQL_ROLES" ] || SQL_ROLES="$HERE/server-roles.sql"
if [ "$(basename "$SQL_ROLES")" = "01-roles.sql" ]; then
  docker exec -i bm-restore-drill psql -q -U bm_owner -d drill -v ON_ERROR_STOP=1 < "$SQL_ROLES" >/dev/null
else
  { printf "\\\\set app_pw 'x'\n\\\\set worker_pw 'x'\n\\\\set readonly_pw 'x'\n"; cat "$SQL_ROLES"; } \
    | docker exec -i bm-restore-drill psql -q -U bm_owner -d drill -v ON_ERROR_STOP=1 >/dev/null
fi
log "restoring into the throwaway container"
docker exec -i bm-restore-drill pg_restore -U bm_owner -d drill --no-owner --role=bm_owner --exit-on-error < "$WORK/db.dump"

log "row counts (all tables in schema public):"
docker exec bm-restore-drill psql -U bm_owner -d drill -At -F ' = ' -c "
  SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname" || true
TABLES="$(docker exec bm-restore-drill psql -U bm_owner -d drill -At -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
# pg_restore ran with --exit-on-error, so reaching this line means every object in the dump was restored.
# V3 has no application tables yet (V4 adds them), so also prove the archive itself is a real, non-trivial dump.
ENTRIES="$(docker exec -i bm-restore-drill pg_restore --list < "$WORK/db.dump" | grep -vc '^;' || true)"
[ "$ENTRIES" -gt 5 ] || die "the dump has only $ENTRIES entries - looks empty"
log "RESTORE OK: backups/$BLOB restored ($ENTRIES objects in the dump, $TABLES tables in schema public)"
