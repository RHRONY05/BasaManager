# METRICS — the experiment log

One row per task part. The lead fills it after each merge. `agy` token numbers come from the JSON result;
Claude numbers from the session usage where available (else "—").

| Date | Task | Part | Agent / model | Attempts | Review rounds | CI failures | Tokens in/out | Wall time | Human interventions (why) | Bugs found later |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-11-08 | V0 | agy loop proof (throwaway) | agy gemini-3.8-flash-high | 7 runs (5 denied: probing permission modes; 2 edit-only succeeded) | — | — | edit run 19,177/1,977 (+1,060 thinking); follow-up 32,580/2,247 (+1,047 thinking) | 63 s + 59 s agy; ~25 min preflight total | 0 (permission blocks resolved by switching to edit-only, no human) | — |
| 2026-11-08 | V0 | preflight checks | lead (Opus 5.5) | 1 | — | — | — | ~25 min | 0 | — |

## Totals (updated at each milestone)
| Milestone | Tasks | Agy sessions | Claude subagent runs | Human interventions | Escaped bugs |
|---|---|---|---|---|---|
