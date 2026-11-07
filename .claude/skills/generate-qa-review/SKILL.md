---
name: generate-qa-review
description: Analyzes project implementation and automatically generates a high-yield Active Recall Q&A revision guide with collapsible answers for self-testing.
---

## BasaManager override (read first — wins over everything below)
- Ignore the concept list in Step 1 (it's from an older project). Generate questions from **this** codebase and `docs/`: auth, RLS/multi-tenancy, billing rules, transactions/locking, idempotency, outbox, payments/IPN, web push, files, deploy/backups. Output `docs/revision-guide.md`.


# Active Recall Q&A Generator Workflow

When the user triggers this skill (e.g. by asking to generate revision questions or typing `/generate-qa-review`), execute the following procedure:

---

## Step 1: Scan & Extract Key Learning Concepts

Inspect the repository across these key areas:
1. **Architecture & Startup:** Fail-fast DB checks, server structure, middlewares (`asyncHandler`, `ApiError`, `ApiResponse`).
2. **Database & Concurrency:** Migrations, ACID transactions, locking strategies (`FOR UPDATE`), schema relationship decisions (e.g. 1:N history).
3. **Logging & Observability:** Pino configuration, `stdout` vs file rotation, req/res capture, ISO timestamps.
4. **Security & Auth:** OAuth2 verification, JWT issuance/validation, password/OTP hashing (`bcrypt`).
5. **Automated Testing:** Jest/Supertest roles, AAA pattern, in-memory execution, API mocking / Monkey Patching, silent test configs.
6. **Docker & DevOps:** Container vs VM anatomy, container networking/DNS, named volumes vs bind mounts, layer caching, multi-stage builds.

---

## Step 2: Formulate 12 to 18 High-Yield Questions

Select the most important concepts implemented in the project. Each question must focus on:
- **"Why" a design decision was made** (e.g. *"Why did we use a transaction here?"*).
- **"How" it works under the hood** (e.g. *"How does Jest mock prototype methods in memory?"*).
- **Common pitfalls & trade-offs** (e.g. *"What happens if we make seat-to-booking 1-to-1?"*).

---

## Step 3: Format with Collapsible `<details>` Dropdowns

Generate or append the guide directly in the centralized Knowledge Vault at `E:\Learning\My_tech_knowledgebase\00-active-recall/[topic]-qna.md` (or in the project's `docs/` folder if strictly project-specific design Q&A). **Do NOT create a local `notes/` folder in the project repository.**

Use this exact interactive template:

```markdown
# [Topic / Project Name] — Active Recall Q&A Revision Guide

> **Purpose:** Test your knowledge and revise key architectural decisions.  
> **How to practice:** Read each question, test yourself mentally, then expand the dropdown to verify.

---

## 🏛️ Part 1: [Topic Name]

### Q1: [Clear, conceptual question]?
<details>
<summary><b>View Answer</b></summary>

- **Core Concept:** [Clear 1-2 sentence takeaway]
- **How it works:** [Concise explanation of the implementation]
- **Why it matters:** [The production/business reason]
</details>

---
```

---

## Step 4: Present Summary to User
- Inform the user that the revision Q&A document has been saved to the centralized vault in `00-active-recall/` (and linked in `00-active-recall/master-index.md`).
- Remind them to open it in **Markdown Preview (`Ctrl + Shift + V`)** or in **Obsidian** to interactively quiz themselves with the collapsible answers.
