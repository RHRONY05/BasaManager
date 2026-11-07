---
description: Report project status from PROGRESS.md, the task list and GitHub
---

1. Read `.agent/PROGRESS.md`, `.agent/08-TASKS.md`, `.agent/METRICS.md`.
2. Run `git status`, `git log --oneline -10`, `gh pr list --state open`, `gh run list --limit 5`.
3. Reply in at most 12 lines: tasks ticked (x / 18), done since the last session entry, in progress (with open PRs and CI state), next task, blockers, open Human steps, staging/prod SHA.
4. Do not change any files.
