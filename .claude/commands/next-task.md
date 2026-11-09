---
description: Antigravity lead — take the next task from start to a CI-green PR, then stop (scripts/autonomous.sh reviews, merges and starts the next session)
---

You do all the work on this task yourself, in this one session. No human is expected. Never ask anyone anything.

1. Read `AGENTS.md`, `.agent/rules/basamanager.md`, the "Now" section of `.agent/PROGRESS.md` (plus any "Unstick" heading) and `.agent/11-AGENT-TEAM.md`. Read other docs only where the task needs them. Use `.claude/skills/mobile-layout-qa` and `.claude/skills/ui-states` for any UI, and `.agent/10-LEARNING.md` for the docs.
2. Pick the work, in this order:
   - An open PR for the first unticked task in `.agent/08-TASKS.md`: read its latest review (`gh pr view <n> --comments`) and CI state, and fix every blocker and should.
   - Open GitHub issues labelled `bug-hunt` (`gh issue list --label bug-hunt`): fix them in one PR with "Closes #n" lines.
   - Otherwise the first unticked task. Create `git worktree add ../bm-wt/<task> -b feat/<task>` from `origin/main`. If that worktree already exists, continue in it.
3. Build it inside the worktree, on the task branch, never on `main`: tests first for critical logic (billing, auth, payments, permissions/RLS, using the examples in the docs), then code, then the learning docs for the feature. Run typecheck, lint, unit, integration and e2e for the area and fix your own failures. Run commands in the foreground and wait for them. Commit and push often.
4. On the same branch: tick the task in `.agent/08-TASKS.md`, add its row to `.agent/METRICS.md`, and update `.agent/PROGRESS.md` ("Now", and where the task stands). This is how the task gets ticked when the PR merges, so do it before step 6.
5. Open the PR with evidence (test summary, screenshots desktop + mobile), or push to the existing one. Wait for CI with `gh pr checks <n> --watch`. If it goes red, fix it and wait again.
6. When every check is green, write only the PR number to the file `../bm-runs/READY` (relative to the main checkout `D:/Projects/BasaManager`, so `D:/Projects/bm-runs/READY`). Then stop. The script gets the review, merges and deploys.

**Never:** merge a PR, push to `main`, tag a release, read `BasaManager.env` or the credentials folder, or run `az`, `ssh` or deploy scripts. If a task needs secrets, the VM or a release tag, write exactly what is needed to `D:/Projects/bm-runs/NEEDS_DEVOPS.md` and stop; Claude DevOps handles it and the next session continues.

If you run low on time, commit, push, write in `.agent/PROGRESS.md` on the branch exactly where you stopped, and stop. Decide everything else yourself by the docs, choose the simpler option, and log it in PROGRESS.md. If something would cost money or is destructive on shared things, skip that part and add a Human step to PROGRESS.md.
