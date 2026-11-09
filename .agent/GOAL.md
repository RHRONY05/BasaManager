# Goals

The project is built goal by goal, one Antigravity session per goal. Open `D:\Projects\BasaManager` in Antigravity (Gemini 3.8 Flash High, turbo) and paste one line. Start a new session for each goal.

| Goal | Tasks | What you get | Paste this |
|---|---|---|---|
| 1 | V5 | Auth and accounts | `/goal Complete goal 1 from .agent/GOAL.md` |
| 2 | V6–V7 | Organisations, buildings, units, tenants, leases | `/goal Complete goal 2 from .agent/GOAL.md` |
| 3 | V8–V10 | Billing engine, manual payments, SSLCommerz | `/goal Complete goal 3 from .agent/GOAL.md` |
| 4 | V11–V13 | Notifications, maintenance, notices and documents | `/goal Complete goal 4 from .agent/GOAL.md` |
| 5 | V14–V17 | Dashboards, move-out and deletion, hardening, release | `/goal Complete goal 5 from .agent/GOAL.md` |

If a session gets interrupted, paste the same line again. It continues from `.agent/PROGRESS.md` and git.

## Instructions for the lead

You are the lead for this goal. Read `AGENTS.md`, `.agent/rules/basamanager.md`, the "Now" section of `.agent/PROGRESS.md` and `.agent/11-AGENT-TEAM.md`, then run `.agent/workflows/next-task.md` for each unticked task in this goal, in order.

Don't ask the owner anything: decide by the docs, choose the simpler option, and log the decision in `PROGRESS.md`. Stop early only for a Human step that blocks all remaining work.

**A goal is done when:**
1. Every task in the goal is ticked and merged, and the staging deploy is green.
2. The bug hunt for the goal has run (see `11-AGENT-TEAM.md`), and the lead triages and handles every confirmed bug:
   - **Current goal defects (shipped code regressions/flaws):** The lead opens a `fix/<goal>-bugs` branch, implements the fixes with regression tests, passes CI and Claude review, merges to `main`, and closes the GitHub issues. No code shipped in this goal may remain known-broken.
   - **Future-task bugs (features planned in later tasks):** If a bug touches code/logic scheduled for a later task, the lead explicitly attaches the GitHub issue number to that task's description and acceptance criteria in `.agent/08-TASKS.md`, noting the reason in `PROGRESS.md`.
3. `PROGRESS.md` and `METRICS.md` are current.

**Then stop. Do not start the next goal.** Tell the owner what was built, the merged PRs, how to try it on staging, each Claude call made and what it found, and anything left open. At the end of goal 5, also give the URLs, the demo logins, the Lighthouse table, the first steps of `docs/learning-path.md`, and `RETRO.md`.
