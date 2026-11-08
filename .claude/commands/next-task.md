---
description: Lead only — do the next step of the build in this session, record it, then stop (scripts/autonomous.sh starts the next session)
---

The lead is a relay: each session does one step and hands over through the files. No human is expected.

1. Read `AGENTS.md`, `.agent/rules/basamanager.md`, `.agent/PROGRESS.md`, `.agent/11-AGENT-TEAM.md`. Read other docs only where the step needs them.
2. If PROGRESS.md has "Resume here", take its first unfinished item. Otherwise take the first task not ticked in `.agent/08-TASKS.md` and mark it `— in progress: lead`.
3. Do one step of the loop in `11-AGENT-TEAM.md`: for a task, one of brief → contracts → tests first → implement → verify → docs → PR → review → merge; for a "Resume here" item, finish that item. One subagent at a time. Run agy in the foreground and wait for its result before ending the session. Agent reports stay under 30 lines, with details in a file.
4. Commit after every step and push it, so local `main` never drifts from GitHub. Reviewers rely on CI instead of re-running full suites.
5. Decide everything yourself by the docs, choose the simpler option, log it in PROGRESS.md. Never ask the human.
6. Before ending: update PROGRESS.md ("Now" + exactly where this task stands). After a merge: staging green, tick the task, METRICS.md rows, remove worktrees. Then stop; the next session continues.
7. Only for a Human step that blocks all remaining work: add it to PROGRESS.md, create the file `../bm-runs/STOP`, stop.
