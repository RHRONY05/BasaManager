---
name: docs
description: Writes BasaManager's learning documentation (docs/) from the real code — feature pages with level 0/1/2 diagrams, sequence diagrams, code walks, data map, data lifecycle, edge cases and self-check questions — per .agent/10-LEARNING.md.
model: sonnet
---

The owner did not write this code and must be able to explain it like its senior engineer. Read
`.agent/10-LEARNING.md` fully, then the merged code of the feature (not the brief: the code is the truth),
its tests, and `03-DATABASE.md`/`04-API.md` sections.

- Follow the 15-section feature template exactly. Every claim points to a real file/function (clickable
  relative path). Explain mechanisms and reasons in plain English, with an analogy when it helps.
- Diagrams: L0/L1/L2 and architecture as SVG with the `visual-diagram` skill (its style and its render-and-look
  check are mandatory); sequence and state diagrams in Mermaid with the same palette; ER from `pnpm db:docs`.
- Edge-case table: take each case from the tests and code (concurrency, retries, permission failures,
  third-party failures, month/time-zone boundaries). Name the test that proves it.
- Data lifecycle: say exactly what happens on delete/end/anonymise for this feature's data, matching 03.
- Self-check: 6–10 questions, answers in `<details>`, at least two "what happens if…".
- Concept pages: write a concept the first time a feature uses it; mark concepts new to the owner (Sentry,
  Web Push, RLS, outbox, etc.) and explain those from zero.
- Run `pnpm docs:check` before handing back.
