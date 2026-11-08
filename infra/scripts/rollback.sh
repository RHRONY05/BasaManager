#!/usr/bin/env bash
# Puts a working version of an environment back. Run ON THE VM as the deploy user (or by the pipeline):
#   /opt/basamanager/bin/rollback.sh <staging|prod> <failed-sha> [deploy|smoke]
# The optional third argument is the pipeline step that failed. Without it the step is guessed from the state files.
# Which version it goes back to depends on how far the failed deploy got:
#   * deploy.sh failed early (pull error, failed migration, never healthy): the state files were NOT updated, so the
#     version that was current before is still recorded as "current": go back to THAT.
#   * deploy.sh finished but the smoke test failed: the failed release is already "current": go to "previous".
# It re-runs deploy.sh from the target release folder with --rollback: the older images (still on the disk) are
# started again; no migration is run and no dump is taken. The database is never rolled back: migrations are
# expand-then-contract (docs/concepts/environments.md), so an older image works with a newer schema.
# The failed SHA is written to state/<env>.bad.
set -euo pipefail
SCRIPT_NAME=rollback
. "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

# Everything is inside a function and ends in `exit`: bash reads a script while it runs, and the script file can be
# replaced by deploy.sh (it installs bin/) before this one has finished.
main() {
  TARGET="${1:?usage: rollback.sh <staging|prod> <failed-sha>}"
  FAILED="${2:?usage: rollback.sh <staging|prod> <failed-sha>}"
  case "$TARGET" in staging|prod) ;; *) die "target must be staging or prod" ;; esac

  CUR="$(cat "$STATE/$TARGET.current" 2>/dev/null || true)"
  PREV="$(cat "$STATE/$TARGET.previous" 2>/dev/null || true)"
  STEP="${3:-}"
  case "$STEP" in
    deploy) GOTO="$CUR" ;;  # deploy.sh failed: state was not updated, "current" is the last good release (may equal $FAILED on a re-deploy)
    smoke) GOTO="$PREV" ;;  # the failed release is already "current": go one release down
    *) if [ -n "$CUR" ] && [ "$CUR" != "$FAILED" ]; then GOTO="$CUR"; else GOTO="$PREV"; fi ;;
  esac
  [ -n "$GOTO" ] || die "nothing to roll back to for $TARGET (this was its first deploy). To go to a specific commit: $BASE/releases/<sha>/infra/scripts/deploy.sh $TARGET <sha> --rollback"
  [ -x "$BASE/releases/$GOTO/infra/scripts/deploy.sh" ] || die "release folder for $GOTO is gone ($BASE/releases/$GOTO)"

  log "$TARGET: rolling back (failed $FAILED, current $CUR) -> $GOTO"
  TARGET_DEPLOY="$BASE/releases/$GOTO/infra/scripts/deploy.sh"
  # Releases made before the --failed flag existed do not know it: for those, record the failed SHA here.
  if [ "$GOTO" = "$FAILED" ]; then
    # A re-deploy of the release that is already running failed: it is still the good one, do not mark it bad.
    exec "$TARGET_DEPLOY" "$TARGET" "$GOTO" --rollback
  fi
  if grep -q -- '--failed' "$TARGET_DEPLOY"; then
    exec "$TARGET_DEPLOY" "$TARGET" "$GOTO" --rollback --failed "$FAILED"
  fi
  "$TARGET_DEPLOY" "$TARGET" "$GOTO" --rollback
  echo "$FAILED" > "$STATE/$TARGET.bad"
}
main "$@"
exit $?
