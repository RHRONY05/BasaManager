---
description: Antigravity lead — take one task from start to merged and deployed on staging, calling Claude for the checks in 11-AGENT-TEAM.md
---

Do this for the first unticked task in `.agent/08-TASKS.md`. If its PR or worktree already exists, continue from where it stands, and read the PR's latest review with `gh pr view <n> --comments`.

1. **Set up.** `git worktree add ../bm-wt/<task> -b feat/<task>` from `origin/main`. Work only there, never on `main`.
2. **Critical logic: Claude writes the tests first.** If the task touches auth, permissions/RLS, billing, allocation, payments or file access, call the Claude test designer (`11-AGENT-TEAM.md`) before you write the code. Do not edit its tests to make them pass. If you believe one is wrong, ask Claude to check it.
3. **Build.** Write the code and the remaining tests, then the learning docs per `.agent/10-LEARNING.md`. Use `.claude/skills/mobile-layout-qa` and `.claude/skills/ui-states` for any UI. Commit and push often.
4. **Verify.** Run typecheck, lint, unit, integration and e2e for the area, and fix your own failures. Same failure after 3 rounds: call the Claude debugger.
5. **Record, on the same branch.** Tick the task in `08-TASKS.md`, add its row to `METRICS.md`, and update `PROGRESS.md`. Never push notes to `main`: that puts open PRs behind and restarts their CI.
6. **PR.** Open it with evidence (test summary, screenshots desktop + mobile). Wait with `gh pr checks <n> --watch`, and fix anything red. Do not poll in a loop.
7. **Review.** When CI is green, call the Claude reviewer. On `VERDICT: CHANGES`, fix every blocker and should, go back to step 6, and call it again. After 3 rounds without approval, stop and tell the owner.
8. **Merge, only after `VERDICT: APPROVE`.** `gh pr update-branch <n>`, wait for CI again, then `gh pr merge <n> --squash`. In the main checkout: `git switch main`, `git pull --ff-only origin main`, then remove the worktree.
9. **Staging.** Watch the `deploy` run with `gh run watch <id> --exit-status`. If it fails, call Claude DevOps.

**Never** read `BasaManager.env` or the credentials folder, or run `az`, `ssh` or deploy scripts: those go to Claude DevOps. If something would cost money or is destructive on shared things, skip that part and add a Human step to `PROGRESS.md`.
