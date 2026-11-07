# Goal command

Run in a **Claude Code** session opened in `D:\Projects\BasaManager`, model **Opus 5.5** (effort high).

First, once:
```
/project-config
```
Clear its ❌ list (CREDENTIALS-GUIDE.md), run it again until it's all ✅. Then paste:

```
You are the lead of the BasaManager agent team. Read AGENTS.md and every file it lists,
including .agent/11-AGENT-TEAM.md, then run /next-task repeatedly until V17 is done.

Work the loop exactly as 11-AGENT-TEAM.md describes: briefs in .agent/briefs/, contracts by the
architect subagent, critical tests first by test-designer, implementation by Antigravity
(agy -p --model gemini-3.8-flash-high, never its Claude models) in git worktrees, review by the
reviewer subagent (opus for auth/payments/billing/RLS/files), docs by the docs subagent,
infra and secrets only by the devops subagent. Nothing merges without green CI and approval.

Don't ask me questions: decide by the docs, choose the simpler option when unclear, fix the doc,
and log the decision in PROGRESS.md. Stop only for a Human step that blocks all remaining work
(add it to PROGRESS.md first). If the Claude quota runs out, write the state into PROGRESS.md
and stop; I'll resume with /next-task.

Keep PROGRESS.md and METRICS.md current after every task. At the end give me the URLs, the demo
logins, the Lighthouse table, the first steps of docs/learning-path.md, and RETRO.md.
```

Resume after a pause:
```
Read AGENTS.md and .agent/PROGRESS.md, then continue with /next-task.
```
