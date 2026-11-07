---
description: Lead only — pick the next unticked task and run it through the team loop, then keep going
---

1. Read `AGENTS.md`, `.agent/rules/basamanager.md`, `.agent/PROGRESS.md`, `.agent/11-AGENT-TEAM.md`.
2. In `.agent/08-TASKS.md`, find the first task not ticked `[x]`. Mark it `— in progress: lead`.
3. Read every doc and design file the task references. If something is ambiguous, decide now, fix the doc, log it.
4. Split the task into parts (contracts / tests-first / backend / frontend / e2e / docs / infra). Write one brief per part in `.agent/briefs/<task>-<part>.md` from `.agent/briefs/_TEMPLATE.md`.
5. Run the loop in `11-AGENT-TEAM.md`: architect → test-designer → implementers (`agy` in worktrees, ∥ where allowed) → verify → docs → PR → reviewer → merge.
6. After merge: staging deploy green, AC checked on staging where the task says so. Tick the task with a one-line note; PROGRESS.md "Now" + session entry; METRICS.md rows; remove worktrees.
7. Continue with the next task. Stop only for a Human step that blocks everything (then work on any task that isn't blocked) or when V17 is done.
