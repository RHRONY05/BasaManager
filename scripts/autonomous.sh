#!/usr/bin/env bash
# Autonomous relay: one fresh lead session per step until the goal is reached.
# Usage: scripts/autonomous.sh [V<n>]   e.g. V5 stops once every task up to and including V5 is ticked.
# With no argument the goal is V17, so it runs until every task in 08-TASKS.md is ticked.
# A usage limit only pauses it; it retries until the limit resets.
# To stop it: create the file ../bm-runs/STOP (a lead also creates it for a Human step that blocks everything).
cd "$(dirname "$0")/.." || exit 1
GOAL=${1:-V17}
case "$GOAL" in V[0-9]|V1[0-7]) ;; *) echo "Usage: scripts/autonomous.sh [V0..V17]   (e.g. V5; default V17 = everything)"; exit 2;; esac
GOAL_N=${GOAL#V}
RUNS=../bm-runs/lead; STOP=../bm-runs/STOP; mkdir -p "$RUNS"; rm -f "$STOP"
PROMPT='Follow .agent/workflows/next-task.md exactly. Do one step, update PROGRESS.md, then stop.'
# Prints the error line if the session ended on a usage limit or network error. Only the end of the log
# counts, and the line must look like the CLI's own error: a lead's report can mention "limit" or "429" freely.
wait_reason() { tail -n 3 "$1" | grep -iE "^(you.ve hit your|you have hit your|claude usage limit|api error|.*ENOTFOUND|.*ECONNRESET|.*ETIMEDOUT|.*overloaded_error)" | head -n 1; }
# True while some task numbered up to the goal is still unticked in 08-TASKS.md.
pending() { grep -oE '^- \[ \] \*\*V[0-9]+' .agent/08-TASKS.md | grep -oE '[0-9]+$' | awk -v n="$GOAL_N" '$1+0<=n' | grep -q .; }
fingerprint() { { git rev-parse origin/main; for w in ../bm-wt/*/; do git -C "$w" rev-parse HEAD; git -C "$w" status --short; done; cat .agent/08-TASKS.md .agent/PROGRESS.md; } 2>/dev/null | sha256sum; }
stuck=0; last=$(fingerprint)
while :; do
  [ -f "$STOP" ] && { echo "Stopped: $STOP exists. See .agent/PROGRESS.md."; exit 0; }
  pending || { echo "Goal reached: every task up to $GOAL is ticked. Done."; exit 0; }
  log="$RUNS/$(date +%Y%m%d-%H%M%S).log"
  echo "[$(date)] new lead session -> $log"
  BASH_MAX_TIMEOUT_MS=3000000 claude -p "$PROMPT" --model sonnet --effort medium --permission-mode bypassPermissions > "$log" 2>&1
  reason=$(wait_reason "$log")
  if [ -n "$reason" ]; then echo "[$(date)] waiting 15 min, then retrying: $reason"; sleep 900; continue; fi
  echo "[$(date)] session finished -> $log"
  git fetch -q origin
  now=$(fingerprint)
  if [ "$now" = "$last" ]; then stuck=$((stuck+1)); else stuck=0; last=$now; fi
  [ "$stuck" -ge 3 ] && { echo "3 sessions in a row changed nothing. Stopping; see $log"; exit 1; }
  sleep 30
done
