#!/usr/bin/env bash
# Shared helpers for the VM scripts (sourced, not run). Layout on the VM is documented in docs/operations/deploy.md.
BASE="${BM_BASE:-/opt/basamanager}"
STATE="$BASE/state"
log() { printf '%s [%s] %s\n' "$(date -u +%FT%TZ)" "${SCRIPT_NAME:-bm}" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }
env_file() { echo "$BASE/env/$1.env"; }
