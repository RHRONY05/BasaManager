# METRICS — the experiment log

One row per task part. The lead fills it after each merge. `agy` token numbers come from the JSON result;
Claude numbers from the session usage where available (else "—").

| Date | Task | Part | Agent / model | Attempts | Review rounds | CI failures | Tokens in/out | Wall time | Human interventions (why) | Bugs found later |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-11-08 | V0 | agy loop proof (throwaway) | agy gemini-3.8-flash-high | 7 runs (5 denied: probing permission modes; 2 edit-only succeeded) | — | — | edit run 19,177/1,977 (+1,060 thinking); follow-up 32,580/2,247 (+1,047 thinking) | 63 s + 59 s agy; ~25 min preflight total | 0 (permission blocks resolved by switching to edit-only, no human) | — |
| 2026-11-08 | V0 | preflight checks | lead (Opus 5.5) | 1 | — | — | — | ~25 min | 0 | — |
| 2026-11-08 | V1 | contracts | architect (Opus 5.5) | 1 | — | — | 155k total (subagent) | 8 min | 0 | — |
| 2026-11-08 | V1 | ci + repo | devops (Sonnet 5.5) | 2 (+ branch protection by lead after owner approved public repo) | — | — | ~100k total | 4 min + 1 min | 1 (owner: allow public repo so branch protection works) | — |
| 2026-11-08 | V1 | tooling | agy gemini-3.8-flash-high | 1 | — | — | 329k/70k (+59k thinking) | 16 min | 0 | prettier CRLF on Windows files (fixed in style commit) |
| 2026-11-08 | V1 | api + worker | agy gemini-3.8-flash-high | 2 | — | — | 721k/141k (+96k thinking) over 2 rounds | 12 + 18 min | 0 | body-parser errors → 500, URL/query not redacted, worker logger unredacted, validate untested (found by docs agent; fixed by debugger) |
| 2026-11-08 | V1 | web | agy gemini-3.8-flash-high | 3 + debugger | — | — | 1,792k/404k (+248k thinking) over 3 rounds | 19 + 38 + 43 min | 0 | route `lazy` froze the old page during chunk loads (ui-states check 2); fixed by debugger |
| 2026-11-08 | V1 | debug: states spec | debugger (Sonnet 5.5) | 1 | — | — | 80k total | 3 min | 0 | — |
| 2026-11-08 | V1 | debug: docs-found defects + coverage | debugger (Sonnet 5.5) | 2 | — | — | ~115k+ total | 7 min + ~10 min | 0 | — |
| 2026-11-08 | V1 | docs | docs (Sonnet 5.5) | 1 | — | — | 294k total | 17 min | 0 | — |
| 2026-11-09 | V3 | infra (VM, Docker, Caddy, deploy, backups, Sentry) | devops (Sonnet 5.5) | initial build + 2 fix rounds | 3 (Opus: CHANGES REQUESTED ×2, then APPROVE) | 1 (openssl missing in image, found by review, not CI; CI `images` job added) | devops 337k + 91k; reviewers 137k + 67k | — (PR #3 merged feddf21; staging green; v0.1.0 prod green) | 0 | weekly `audit` job red (17 vulns, 8 high, dev-only deps) |
| 2026-11-09 | V2 | visual system + 24 screens (design) | designer (Opus) | 1 build + review fix | 1 (designer review: APPROVE, 0 blockers) | 0 | designer 571k + 101k | — (PR #4 merged afe9217; staging + main ci green) | 0 | settlement-preview artboard missing; caretaker nav label mismatch |

## Totals (updated at each milestone)
| Milestone | Tasks | Agy sessions | Claude subagent runs | Human interventions | Escaped bugs |
|---|---|---|---|---|---|
