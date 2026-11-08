#!/usr/bin/env bash
# Deploys one commit to one environment on the VM. Run it ON THE VM as the deploy user, from the release folder
# the pipeline uploaded:  /opt/basamanager/releases/<sha>/infra/scripts/deploy.sh <staging|prod|edge> <sha> [flags]
#   edge   = Caddy (HTTPS front door) + the docs site
# Flags: --skip-backup (no pre-deploy dump)  --no-migrate  --rollback (used by rollback.sh)
# Steps: lock -> pull images -> start postgres+redis -> (re)apply DB roles -> pre-deploy dump -> migrate -> start
#        api/worker/web and wait until healthy -> record state. Any failure exits non-zero; the pipeline then calls rollback.sh.
set -euo pipefail
SCRIPT_NAME=deploy
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # .../releases/<sha>/infra
. "$HERE/scripts/_lib.sh"

TARGET="${1:?usage: deploy.sh <staging|prod|edge> <sha> [flags]}"
SHA="${2:?usage: deploy.sh <staging|prod|edge> <sha> [flags]}"
shift 2
SKIP_BACKUP=0; NO_MIGRATE=0; ROLLBACK=0
for f in "$@"; do
  case "$f" in
    --skip-backup) SKIP_BACKUP=1 ;;
    --no-migrate) NO_MIGRATE=1 ;;
    --rollback) ROLLBACK=1 ;;
    *) die "unknown flag $f" ;;
  esac
done
case "$TARGET" in staging|prod|edge) ;; *) die "target must be staging, prod or edge" ;; esac

mkdir -p "$STATE/pre-deploy" "$BASE/logs" "$BASE/bin" "$BASE/edge"
exec 9>"$STATE/deploy.lock"
flock -w 600 9 || die "another deploy is running (waited 10 min)"

ENVFILE="$(env_file "$TARGET")"
[ -f "$ENVFILE" ] || die "missing $ENVFILE (the pipeline uploads it; see docs/operations/deploy.md)"
getv() { grep -m1 "^$1=" "$ENVFILE" | cut -d= -f2-; }   # read ONE value; the env file is never sourced or printed

docker network inspect bm-edge >/dev/null 2>&1 || { log "creating docker network bm-edge"; docker network create bm-edge >/dev/null; }

# Refresh the stable copies of the helper scripts (cron and manual runs use these), then the cron entries.
install_bin() {
  cp "$HERE"/scripts/{_lib,deploy,rollback,backup,restore}.sh "$BASE/bin/"
  cp "$HERE/postgres/server-roles.sql" "$BASE/bin/server-roles.sql"
  chmod 755 "$BASE"/bin/*.sh
  local tmp
  tmp="$(mktemp)"
  {
    crontab -l 2>/dev/null | grep -v '# basamanager' || true
    echo "0 3 * * * $BASE/bin/backup.sh staging >> $BASE/logs/backup.log 2>&1 # basamanager"
    echo "10 3 * * * $BASE/bin/backup.sh prod >> $BASE/logs/backup.log 2>&1 # basamanager"
  } > "$tmp"
  crontab "$tmp"
  rm -f "$tmp"
}

if [ "$TARGET" = edge ]; then
  log "edge: Caddy + docs @ $SHA"
  compose() { IMAGE_TAG="$SHA" docker compose -p bm-edge --env-file "$ENVFILE" -f "$HERE/compose.edge.yml" "$@"; }
  CADDY_WAS_UP="$(compose ps -q caddy 2>/dev/null | head -1 || true)"
  cat "$HERE/caddy/Caddyfile" > "$BASE/edge/Caddyfile"   # same inode: the bind mount sees the change
  compose pull docs
  compose up -d --remove-orphans --wait --wait-timeout 120
  if [ -n "$CADDY_WAS_UP" ]; then
    compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null
    compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile
    log "caddy reloaded"
  fi
  install_bin
  echo "$SHA" > "$STATE/edge.current"
  log "edge deployed"
  exit 0
fi

compose() { IMAGE_TAG="$SHA" docker compose -p "bm-$TARGET" --env-file "$ENVFILE" -f "$HERE/compose.server.yml" "$@"; }
POSTGRES_DB="$(getv POSTGRES_DB)"

log "$TARGET: deploying $SHA"
PREVIOUS="$(cat "$STATE/$TARGET.current" 2>/dev/null || true)"

compose pull api worker web
compose up -d --wait --wait-timeout 120 postgres redis

log "applying database roles"
{
  printf "\\\\set app_pw '%s'\n" "$(getv BM_APP_PASSWORD)"
  printf "\\\\set worker_pw '%s'\n" "$(getv BM_WORKER_PASSWORD)"
  printf "\\\\set readonly_pw '%s'\n" "$(getv BM_READONLY_PASSWORD)"
  cat "$HERE/postgres/server-roles.sql"
} | compose exec -T postgres psql -q -U bm_owner -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 >/dev/null

if [ "$SKIP_BACKUP" -eq 0 ] && [ "$ROLLBACK" -eq 0 ]; then
  DUMP="$STATE/pre-deploy/$TARGET-$(date -u +%Y%m%dT%H%M%SZ)-${SHA:0:8}.dump"
  log "pre-deploy backup -> $(basename "$DUMP")"
  compose exec -T postgres pg_dump -U bm_owner -Fc "$POSTGRES_DB" > "$DUMP"
  [ -s "$DUMP" ] || die "pre-deploy dump is empty"
  ls -1t "$STATE/pre-deploy/$TARGET-"*.dump 2>/dev/null | tail -n +6 | xargs -r rm -f --
fi

if [ "$NO_MIGRATE" -eq 0 ] && [ "$ROLLBACK" -eq 0 ]; then
  log "running migrations (prisma migrate deploy)"
  compose run --rm -T migrate
fi

log "starting api, worker, web"
compose up -d --remove-orphans --wait --wait-timeout 180 api worker web

if [ "$ROLLBACK" -eq 1 ]; then
  echo "$SHA" > "$STATE/$TARGET.current"
  if [ -n "$PREVIOUS" ]; then echo "$PREVIOUS" > "$STATE/$TARGET.bad"; fi
  rm -f "$STATE/$TARGET.previous"
else
  if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$SHA" ]; then echo "$PREVIOUS" > "$STATE/$TARGET.previous"; fi
  echo "$SHA" > "$STATE/$TARGET.current"
fi

# Housekeeping: keep the 5 newest release folders (never the ones in use), drop images no environment uses any more.
install_bin
KEEP="$(cat "$STATE"/*.current "$STATE"/*.previous 2>/dev/null | sort -u | tr '\n' ' ' || true)"
ls -1t "$BASE/releases" | tail -n +6 | while read -r old; do
  case " $KEEP " in *" $old "*) ;; *) rm -rf -- "${BASE:?}/releases/$old" ;; esac
done
docker image ls --format '{{.Repository}}:{{.Tag}}' 'ghcr.io/rhrony05/basamanager-*' | while read -r img; do
  tag="${img##*:}"
  case " $KEEP " in *" $tag "*) ;; *) docker image rm "$img" >/dev/null 2>&1 || true ;; esac
done
docker image prune -f >/dev/null

log "$TARGET: $SHA is up"
