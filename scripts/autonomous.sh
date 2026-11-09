#!/usr/bin/env bash
# Autonomous build. Antigravity (agy, Gemini) does all the work; this script is the manager.
# Claude runs only when this script calls it: one review per ready PR, DevOps requests, unsticking, and one
# bug hunt at the end of each goal. Waiting for CI uses no Claude at all, because this script does the waiting.
#
# Usage: scripts/autonomous.sh [V<n>]   e.g. V5 stops once every task up to and including V5 is ticked.
# With no argument the goal is V17 (everything). A usage limit only pauses it.
# To stop it: create the file ../bm-runs/STOP.
cd "$(dirname "$0")/.." || exit 1
GOAL=${1:-V17}
case "$GOAL" in V[0-9]|V1[0-7]) ;; *) echo "Usage: scripts/autonomous.sh [V0..V17]   (e.g. V5; default V17 = everything)"; exit 2;; esac
GOAL_N=${GOAL#V}
R=../bm-runs; RUNS=$R/lead; STOP=$R/STOP; READY=$R/READY; DEVOPS=$R/NEEDS_DEVOPS.md
mkdir -p "$RUNS"; rm -f "$STOP"
AGY_PROMPT='Follow .agent/workflows/next-task.md exactly.'
MAX_REVIEW_ROUNDS=3

say() { echo "[$(date '+%a %H:%M:%S')] $*"; }
stop_check() { [ -f "$STOP" ] && { say "Stopped: $STOP exists."; exit 0; }; }
# True while some task numbered up to the goal is still unticked in 08-TASKS.md.
pending() { grep -oE '^- \[ \] \*\*V[0-9]+' .agent/08-TASKS.md | grep -oE '[0-9]+$' | awk -v n="$GOAL_N" '$1+0<=n' | grep -q .; }
fingerprint() { { git rev-parse origin/main; for w in ../bm-wt/*/; do git -C "$w" rev-parse HEAD; git -C "$w" status --short; done; cat .agent/08-TASKS.md; } 2>/dev/null | sha256sum; }
sync_main() { git fetch -q origin; git pull -q --ff-only origin main 2>/dev/null; }

# Runs Claude once and sets $clog. Only the end of the log counts as a limit or network error: a report can
# mention "limit" or "429" freely.
run_claude() { # model prompt name
  while :; do
    clog="$RUNS/$(date +%Y%m%d-%H%M%S)-claude-$3.log"
    claude -p "$2" --model "$1" --effort medium --permission-mode bypassPermissions > "$clog" 2>&1
    reason=$(tail -n 3 "$clog" | grep -iE "^(you.ve hit your|you have hit your|claude usage limit|not logged in|api error|.*ENOTFOUND|.*ECONNRESET|.*ETIMEDOUT|.*overloaded_error)" | head -n 1)
    [ -z "$reason" ] && return 0
    say "Claude is unavailable, waiting 15 min: $reason"; sleep 900; stop_check
  done
}

merge_pr() { # pr
  branch=$(gh pr view "$1" --json headRefName --jq .headRefName)
  gh pr update-branch "$1" >/dev/null 2>&1 && sleep 30
  gh pr checks "$1" --watch --interval 60 >/dev/null 2>&1 || { say "PR #$1: CI went red after updating; back to Antigravity."; return; }
  gh pr merge "$1" --squash >/dev/null 2>&1 || { say "PR #$1: merge failed; back to Antigravity."; return; }
  say "PR #$1 merged."
  sync_main
  wt=$(git worktree list --porcelain | grep -B2 "refs/heads/$branch\$" | head -n 1 | cut -d' ' -f2-)
  [ -n "$wt" ] && git worktree remove --force "$wt" 2>/dev/null
  sleep 30
  run=$(gh run list --branch main --workflow deploy --limit 1 --json databaseId --jq '.[0].databaseId')
  if [ -n "$run" ] && ! gh run watch "$run" --exit-status >/dev/null 2>&1; then
    say "Staging deploy failed (run $run); asking Claude DevOps."
    run_claude sonnet "Follow .claude/agents/devops.md. The staging deploy run $run failed after PR #$1 merged. Find the root cause and fix it; open a PR for any repo change and do not merge it. Keep your final report under 15 lines." devops
  else
    say "Staging deploy is green."
  fi
}

review_pr() {
  pr=$(tr -dc '0-9' < "$READY"); rm -f "$READY"
  [ -n "$pr" ] || return
  say "PR #$pr is ready; waiting for CI."
  gh pr checks "$pr" --watch --interval 60 >/dev/null 2>&1 || { say "PR #$pr: CI is red; back to Antigravity."; return; }
  model=sonnet
  gh pr diff "$pr" --name-only 2>/dev/null | grep -qiE 'auth|payment|billing|migration|rls|storage|document' && model=opus
  say "Claude ($model) is reviewing PR #$pr."
  run_claude "$model" "Follow .claude/agents/reviewer.md and review PR #$pr. Post the result with gh pr review --comment. Do not change code and do not merge. The last line of your final message must be exactly VERDICT: APPROVE or VERDICT: CHANGES." review
  if tail -n 3 "$clog" | grep -q '^VERDICT: APPROVE'; then
    say "Claude approved PR #$pr."; rm -f "$R/rounds-$pr"; merge_pr "$pr"
  else
    rounds=$(( $(cat "$R/rounds-$pr" 2>/dev/null || echo 0) + 1 )); echo "$rounds" > "$R/rounds-$pr"
    say "Claude requested changes on PR #$pr (round $rounds of $MAX_REVIEW_ROUNDS): $clog"
    [ "$rounds" -ge "$MAX_REVIEW_ROUNDS" ] && { say "Stopping: PR #$pr failed $MAX_REVIEW_ROUNDS reviews. See the PR comments."; exit 1; }
  fi
}

bug_hunt() {
  report="$R/bughunt-$GOAL.md"
  [ -f "$report" ] && return
  say "Goal reached. Claude is running one bug hunt."
  run_claude sonnet "Bug hunt for BasaManager, up to and including task $GOAL. Read AGENTS.md and .agent/rules/basamanager.md, then the code merged for the most recent tasks. Look for real defects: broken authorisation or tenant isolation, wrong money maths, missing error handling, tests that prove nothing. Change no code. Open one GitHub issue per confirmed bug, labelled bug-hunt, with file, line, how it fails and the fix, at most 10. Keep your final report under 15 lines." bughunt
  cp "$clog" "$report"
}

stuck=0; sync_main; last=$(fingerprint)
while :; do
  stop_check
  if [ -f "$READY" ]; then review_pr; continue; fi
  if [ -f "$DEVOPS" ]; then
    say "Antigravity asked for Claude DevOps: $DEVOPS"
    run_claude sonnet "Follow .claude/agents/devops.md and do this request. Keep your final report under 15 lines. Request: $(cat "$DEVOPS")" devops
    rm -f "$DEVOPS"; continue
  fi
  sync_main
  pending || { bug_hunt; say "Goal reached: every task up to $GOAL is ticked. Done."; exit 0; }

  log="$RUNS/$(date +%Y%m%d-%H%M%S)-agy.log"
  say "Antigravity session started -> $log"
  agy -p "$AGY_PROMPT" --model gemini-3.8-flash-high --dangerously-skip-permissions --output-format json --print-timeout 90m > "$log" 2>&1
  # A success or a timeout means carry on. Anything else (quota, network) means wait.
  if ! grep -qE '"status": *"SUCCESS"|print_timeout' "$log"; then
    say "Antigravity is unavailable, waiting 15 min: $(tail -n 1 "$log" | cut -c1-200)"; sleep 900; continue
  fi
  say "Antigravity session finished."
  git fetch -q origin
  now=$(fingerprint)
  if [ -f "$READY" ] || [ -f "$DEVOPS" ] || [ "$now" != "$last" ]; then stuck=0; last=$now; else stuck=$((stuck+1)); fi
  if [ "$stuck" -eq 3 ]; then
    say "3 Antigravity sessions changed nothing; asking Claude to unstick it."
    run_claude sonnet "Follow .claude/agents/debugger.md. Antigravity is stuck on the next unticked task in .agent/08-TASKS.md: 3 sessions in a row changed nothing. Its last log is $log. Find out why and write exact instructions under the heading 'Unstick' at the top of .agent/PROGRESS.md, or fix it if the fix is small. Keep your final report under 15 lines." unstick
  fi
  [ "$stuck" -ge 6 ] && { say "Stopping: still stuck after Claude's help. See $log"; exit 1; }
  sleep 30
done
