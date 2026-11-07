# Lesson Standard (Phase 3: `start`)

The lesson is the product. The student reads it in Markdown Preview **next to the
code**, clicking each link and following along. It should feel like a senior
engineer walking them through the system: fast to grasp, concrete, never generic.

If `examples/` contains a reference lesson, match its tone, depth and pacing. It
beats any rule below when they disagree.

---

## Ordering (used by `plan`)

Order by **what a concept needs**, not by folder or by feature list:

1. M0.1 The Map (stack, folders, startup, life of one request).
2. Platform basics the rest relies on: config/env, startup, error handling,
   logging, health. Usually short; batch 2-3 per session.
3. Identity before anything protected: sign-up → sign-in → session/token →
   protected routes → roles.
4. Read before write (list/detail before create/update/delete), simple before
   transactional (cart before checkout).
5. Background jobs, DB triggers and integrations after the features they serve.
6. AI/agent features after the data and APIs their tools call.

A feature is ready to teach when every concept it needs is ✅ in `CONCEPTS.md` or
taught in the same session.

---

## Before writing

1. Read `CONCEPTS.md` → which concepts are new today, which only need a link.
2. Read **every file on the path**, in execution order, from trigger to response
   and back to the UI update. Note exact line numbers.
3. **Capture real data** (ask before starting containers or writing to the DB):
   the request and response (curl or DevTools), relevant log lines, the DB row
   before/after. Save raw output to `.learn/captures/` and paste trimmed versions
   with the date.
4. Plan 1-3 **break-it** experiments; where safe, verify the symptom yourself (and
   revert) so the predicted answer is true.
5. Pick **one rebuild challenge** per feature: small (5-30 lines), central, and
   checkable (a test, a curl, or a visible UI result).

---

## Structure (in this order)

### 1. Header
```markdown
# M2.1 · Sign up & sign in

> **Module 2: Identity** · [Back to the map](lessons/M0.1-the-map.md) · [Tracker](TRACKER.md)
> **Time:** ~2-3 h (read ~40 min, trace ~40 min, hands-on ~60 min)
> **By the end you can:** <2-4 concrete abilities: trace X, explain why Y, debug Z, change W>
```

### 2. 🗺️ Where we are
The Map's request-life steps with `►` on today's zoom-in. "Last time ... Today ...
We stop at ..." (the cliffhanger into the next session).

### 3. 🔑 Keywords
Only the words this lesson introduces, plain meaning, one line each. Concepts from
earlier sessions get a link to `CONCEPTS.md`, not a re-definition.

### 4. Per feature: one Part each

**4a. 🎯 Try it first** – exact steps to trigger it in the app, and exactly where to
look (DevTools → Network → which request, which tab). For 👻 features: the command.

**4b. 🎯 Check your guess** – a collapsed block with the real file map in execution
order. The student guessed before opening it.
```markdown
<details><summary><b>🎯 Check your guess: the files, in the order they run</b></summary>

| # | Layer | File | What happens here |
|---|---|---|---|
| 1 | UI | [SignupForm.tsx:31](../frontend/src/...#L31) | form submit handler |
| ... |

</details>
```

**4c. 🗺️ The flow** – a Mermaid `sequenceDiagram` (or ASCII fallback per
`blueprint.md`) from the trigger to the UI update. Participants are the real
layers (Browser, React component, API client, Express route, middleware,
controller, service, DB, external API). Label arrows with real function names and
HTTP methods/paths. Include the error path with `alt`/`else` when it matters.
Then a 3-5 line plain-words summary of the diagram.

**4d. 🔍 The trace** – numbered steps matching the diagram. Each step:
````markdown
#### Step 3 · The route validates the body
[auth.routes.ts:18](../backend/src/auth/auth.routes.ts#L18)

```ts
// real lines, trimmed with "// ..." where code is skipped
```

**What it does:** one or two sentences.
**Why it's built this way:** the decision and the alternative.
**Without it:** the concrete bug or risk.
````
Keep each step short. If a step needs a big explanation, that's a concept (4e).

**4e. 🧠 Concepts** – for each concept new today (per `CONCEPTS.md`):
problem → mental model → how this codebase does it (link back to the step) →
alternatives & trade-offs (a small table is ideal) → how it fails in production.
Already-known concepts: one-line reminder + link.

**4f. 🧰 Tool cards** – for each library/tool new today:
```markdown
> 🧰 **Zod** · *What problem:* ... · *Without it:* ... · *Used here:* [x](..#L), [y](..#L) · *Gotcha:* ...
```

**4g. 📦 Real data** – the captured request, response, log lines, DB row, annotated
(`← this is the hashed password, never the raw one`). Dated.

**4h. 💥 Break it** – 1-3 experiments, one at a time: the exact change (file:line),
"predict first", the symptom collapsed in `<details>`, and the revert command
(`git restore <file>`). Prefer breaks that teach debugging: wrong status code,
missing middleware, expired token, failing validation, a DB constraint.

**4i. 🔨 Rebuild** – which function to delete and rewrite, the spec in 3-5 bullets,
how to check it works, and a collapsed hint ladder (hint 1 → hint 2 → approach),
not the answer.

### 5. 🎤 Interview angle
"Explain this in 60 seconds" model answer (collapsed), plus 2 likely follow-up
questions an interviewer would ask about these features' design.

### 6. ⚠️ Common confusions (3-5)
Things a beginner mixes up here, each with a one-paragraph correction.

### 7. 🧪 Active recall
5 questions (predict, explain why, diagnose a symptom → file, apply a change, one
debugging question), answers in `<details>`.

### 8. Close the loop
What is now understood on the Map, which concepts move to ✅, and the cliffhanger
into the next session.

### 9. Previous versions (only if rewritten)
Never delete a version. Move the old one here inside
`<details><summary><b>v1 · YYYY-MM-DD · label</b>. Why it was replaced.</summary>`.

---

## Quality bar ("premium", concretely)

- **Concrete beats general.** "The JWT lands in an `httpOnly` cookie at
  [auth.controller.ts:57] so JavaScript can't read it, which is why XSS can't steal
  it" beats "JWTs are used for authentication".
- **Every "why" names the alternative.** Without the alternative it's not a reason.
- **Show the moving parts moving.** Real request/response, real logs, a breakpoint
  to pause at, a value to watch change.
- **Short sections, strong headings.** The student should be able to skim the
  headings and know the story.
- **No filler.** No "In this lesson we will explore...", no "It's important to
  note...", no recap of what was just said.
- **Pace for one sitting per Part.** If a Part would take more than ~1 hour, split
  the session.

---

## Self-review (mandatory, before telling the student it's ready)

Read the lesson as the beginner student:

- [ ] Every `file:line` link opens the right line (check each one against the file).
- [ ] Every code excerpt matches the file character for character (apart from `// ...` trims).
- [ ] Every output, request, response and row is real and dated.
- [ ] Every new word is in Keywords or explained where it first appears; known concepts link to `CONCEPTS.md`.
- [ ] No Part names a mechanism before showing its problem.
- [ ] Every "why" names an alternative.
- [ ] The diagram matches the trace step for step.
- [ ] Break-it predictions are verified or clearly marked "predicted, not run".
- [ ] Hands-on is one experiment at a time, with "reply with exactly this".
- [ ] Stays inside today's features; later topics are 🔵 one-liners.
- [ ] No LaTeX. Mermaid/`<details>` blocks have blank lines so they render.
- [ ] Could the student now explain the flow back, and do they know exactly what to do next?
