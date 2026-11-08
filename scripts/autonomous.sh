#!/usr/bin/env bash
# Autonomous relay: one fresh lead session per step until every task in 08-TASKS.md is ticked.
# A usage limit only pauses it; it retries until the limit resets.
# To stop it: create the file ../bm-runs/STOP (a lead also creates it for a Human step that blocks everything).
cd "$(dirname "$0")/.." || exit 1
RUNS=../bm-runs/lead; STOP=../bm-runs/STOP; mkdir -p "$RUNS"; rm -f "$STOP"
PROMPT='Follow .agent/workflows/next-task.md exactly. Do one step, update PROGRESS.md, then stop.'
fingerprint() { { git rev-parse origin/main; for w in ../bm-wt/*/; do git -C "$w" rev-parse HEAD; git -C "$w" status --short; done; cat .agent/08-TASKS.md .agent/PROGRESS.md; } 2>/dev/null | sha256sum; }
stuck=0; last=$(fingerprint)
while :; do
  [ -f "$STOP" ] && { echo "Stopped: $STOP exists. See .agent/PROGRESS.md."; exit 0; }
  grep -q '^- \[ \] \*\*V' .agent/08-TASKS.md || { echo "All tasks are ticked. Done."; exit 0; }
  log="$RUNS/$(date +%Y%m%d-%H%M%S).log"
  echo "[$(date)] new lead session -> $log"
  BASH_MAX_TIMEOUT_MS=3000000 claude -p "$PROMPT" --model sonnet --effort medium --permission-mode bypassPermissions > "$log" 2>&1
  if grep -qiE "hit your .*limit|usage limit|rate.?limit|429|ENOTFOUND|overloaded" "$log"; then echo "[$(date)] limit or network; retrying in 15 min"; sleep 900; continue; fi
  git fetch -q origin
  now=$(fingerprint)
  if [ "$now" = "$last" ]; then stuck=$((stuck+1)); else stuck=0; last=$now; fi
  [ "$stuck" -ge 3 ] && { echo "3 sessions in a row changed nothing. Stopping; see $log"; exit 1; }
  sleep 30
done
