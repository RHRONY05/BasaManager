#!/usr/bin/env bash
# Puts the previous version of an environment back. Run ON THE VM as the deploy user (or by the pipeline):
#   /opt/basamanager/bin/rollback.sh <staging|prod>
# It re-runs deploy.sh from the PREVIOUS release folder with --rollback: the older images (still on the disk) are
# started again; no migration is run and no dump is taken. The database is never rolled back: migrations are
# expand-then-contract (docs/concepts/environments.md), so an older image works with a newer schema.
set -euo pipefail
SCRIPT_NAME=rollback
. "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

TARGET="${1:?usage: rollback.sh <staging|prod>}"
case "$TARGET" in staging|prod) ;; *) die "target must be staging or prod" ;; esac

PREV="$(cat "$STATE/$TARGET.previous" 2>/dev/null || true)"
CUR="$(cat "$STATE/$TARGET.current" 2>/dev/null || true)"
[ -n "$PREV" ] || die "no previous version recorded for $TARGET (first deploy, or already rolled back). To go to a specific commit: $BASE/releases/<sha>/infra/scripts/deploy.sh $TARGET <sha> --rollback"
[ -x "$BASE/releases/$PREV/infra/scripts/deploy.sh" ] || die "release folder for $PREV is gone ($BASE/releases/$PREV)"

log "$TARGET: rolling back $CUR -> $PREV"
exec "$BASE/releases/$PREV/infra/scripts/deploy.sh" "$TARGET" "$PREV" --rollback
