# Knowledge Notes (`note`, `quiz`)

## Where notes live

**Central knowledge base:** `E:\Learning\My_tech_knowledgebase` (its own git repo).
Never write notes into the project. Projects get finished and never reopened, so
notes there are never revised.

Before writing, read the knowledge base's `README.md` (structure and standard) and
one or two neighbouring notes in the target folder. **Their conventions win** over
anything below if they've changed.

## One note per concept, not per project or session

- A note is about a **concept or tool** ("Managed auth with Clerk", "SSE streaming",
  "Idempotent webhooks"), named and filed by topic: `backend/express/`,
  `database/redis/`, `frontend/react/`, `ai-agents/`, `devops/docker/`, etc. Create
  a new topic folder only when nothing fits, and add it to the README's structure tree.
- One session can produce several notes, or none. A concept can grow across many
  sessions and projects. **Search first** (filenames, titles, `tags`), then:
  - **Note exists** → merge: add a section or subsection, replace weaker explanations
    with better ones, add gotchas and recall questions, bump `last_reviewed`. Don't
    rewrite parts that are already good.
  - **Closely related note exists** (e.g. custom JWT auth vs. managed auth) → write the
    new note and cross-link both ways in `related_notes`, with a comparison table in
    the new one.
- **Project-independent.** No project file paths, no "in ShopMate we...". Rewrite
  examples as small standalone snippets. One line at the end is allowed:
  `> Learned while building: <project> (<YYYY-MM>)`.

## The note format (the knowledge base's 4-question standard)

```markdown
---
tags:
  - <pillar>
  - <topic>
last_reviewed: YYYY-MM-DD
related_notes:
  - "[[other-note-filename]]"
---

# <Concept title>

> **Active Recall Self-Test:**
> 1. <question that forces a "why">
> 2. <question that forces a mechanism>
> 3. <diagnose-a-failure question>
> 4. <trade-off / when-would-you-not question>

---

## 1. The Core Problem
<what breaks or is painful without it; the naive approaches and why they fail>

## 2. The Mental Model
<diagram (Mermaid or ASCII) + plain-words model + analogy if it helps>

## 3. Production Code Breakdown
<standalone, copy-pasteable snippets with comments; the patterns worth reusing>

## 4. Production Gotchas & Best Practices
<symptom → cause → fix; security pitfalls; trade-offs and alternatives table>
```

Content comes from **the archived lesson + the whole session conversation**: every
question the student asked answered where it belongs, the explanation that finally
worked replacing the one that didn't, the student's own real outputs where they
generalize. Never shorter or shallower than the lesson on the same idea.

## The recall index

`00-active-recall/master-index.md` lists every note's self-test questions as `- [ ]`
checkboxes under collapsible pillar → folder sections, with Obsidian links
`#### [[folder/note-filename|Title]]`.

- Add the new note's questions in the matching pillar/folder section; for a merged
  note, add only the new questions. Create a folder section if missing, copying the
  neighbouring `<details>` markup exactly.
- **Encoding:** the file is UTF-8 with BOM and CRLF line endings, and some existing
  emoji headings are already garbled (mojibake). Edit it with small, targeted edits;
  never rewrite the whole file, never "fix" or re-save the garbled lines, and keep the
  BOM and CRLF. Mention the garbled headings to the student once; fix them only if asked.

## `quiz` from the knowledge base

Use the self-test questions of the notes linked in `CONCEPTS.md` (plus older notes on
related concepts) as a question pool alongside the lesson recall questions.

## After writing

- Fill the "Knowledge note" column in the project's `.learn/CONCEPTS.md`.
- Tell the student the paths written or merged, and offer to commit in the knowledge
  base repo (never commit without a yes).
