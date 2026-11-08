# Brief V5-backend (for: agy gemini-3.8-flash-high)

Read first: `AGENTS.md`, `.agent/rules/basamanager.md`, `.agent/01-PRODUCT.md` (A1–A7), `.agent/02-ARCHITECTURE.md` (Auth model, Request lifecycle, Real-time, Observability), `.agent/03-DATABASE.md` (identity tables), `.agent/04-API.md` (Auth & account, `GET/PATCH /org`, conventions, error codes, `session:revoked`), `.agent/PROGRESS.md` "Decisions" (db.$tx usage, error statuses, outbox `createMany`, bigint money), `.claude/skills/backend-standards/SKILL.md` (override first).

**You cannot run shell commands in this session (they are denied); do not try. Use only your file read/write/edit tools.** The lead installs packages, runs every command, and sends you the exact failures. Read type definitions under `node_modules/<pkg>` for these versions: argon2 0.45, jose 6, arctic 3.7, express-rate-limit 8, rate-limit-redis 6, ioredis 6, nodemailer 10, socket.io 4.8, @socket.io/redis-adapter 8, Prisma 7 client in `apps/api/src/generated/prisma`.

## Goal
Make every test in `apps/api/test/auth/*.int.test.ts` (written by the test-designer; **don't edit them** — if one looks wrong, stop and explain) pass, plus the routine unit tests you add.

## Scope — files you may create or change
- `apps/api/src/modules/auth/**`, `apps/api/src/modules/users/**`, `apps/api/src/modules/invites/**`, `apps/api/src/modules/orgs/**` (only `GET/PATCH /org` for now)
- `apps/api/src/middleware/{auth,org,csrf,rateLimit}.ts`, `apps/api/src/realtime/{io,emit}.ts`, `apps/api/src/config/mailer.ts`, `apps/api/src/emails/**` (plain HTML templates for verify / reset / security alert / invite for now; React Email comes in V11 — keep them in one place so V11 swaps them), `apps/api/src/app.ts` + `server.ts` (wire routes, sockets), `apps/api/src/lib/**` (tokens, passwords, cookies helpers), `apps/api/prisma/seed-repo.ts` (users through the auth service's password hashing)
- `packages/shared/src/api/auth.ts` — **request/response Zod schemas for these routes** (the architect normally owns shared; for V5 you write them following 04 exactly and the reviewer checks them)
**Do not touch:** `apps/api/test/**` (except adding new unit tests next to source as `*.test.ts`), `apps/api/prisma/schema.prisma` + migrations, `apps/web/**`, infra, CI.

## Rules (from 02 Auth model — exact)
argon2id `m=19456,t=2,p=1`; password min 10 chars + not in a top-10k common list (ship the list as `apps/api/src/modules/auth/common-passwords.txt`, loaded once); access JWT HS256 15 min (`JWT_SECRET`, claims `sub`, `sid`, `adm`) in `bm_at`; refresh = 32 random bytes, stored as SHA-256 in `sessions.token_hash`, cookie `bm_rt` Path=/api/auth SameSite=Strict; every refresh rotates (`rotated_at` on the old row, new row same `family_id`); presenting a rotated token → revoke the family (`revoke_reason='reuse'`), outbox `user.security_alert`, 401 `SESSION_REVOKED`; CSRF double submit `bm_csrf` + `X-CSRF-Token` + `Origin === APP_URL` on unsafe methods (exempt: SSLCommerz IPN later); login rate limit 10/min/IP via Redis; 5 failed logins → `locked_until = now+15m`; error messages never reveal whether an email exists; tokens (verify 24 h, reset 30 min, invite 7 days) stored hashed, single-use via `update … where used_at is null and expires_at > now() returning`; Google OAuth with arctic (PKCE + state in a 10-minute signed cookie), link only when `email_verified` and emails match; `X-Org-Id` → `requireMembership` (active membership, loads role; never trust a client role) → `requireRole(...)`; sockets authenticate from the `bm_at` cookie in the handshake, join `user:<id>`; logout-all / reset emit `session:revoked` and `disconnectSockets()`. All org-table queries through `db.$tx(ctx, …)`; user/session/token tables directly on `db`. Emails go through the **outbox** (`tx.outboxMessage.createMany`) in the same transaction; until the V11 worker delivers them, a small in-process dev/test deliverer may send them straight via nodemailer to Mailpit — put it behind `deliverOutboxNow()` in `config/mailer.ts` so V11 replaces it. Never log passwords, tokens, cookies or auth bodies. Time via `clock.now()`.

## Must pass
`pnpm typecheck && pnpm lint && pnpm test:cov && pnpm test:int` (the lead runs them).

## When done, reply with
1. Files written. 2. Anything ambiguous. 3. Anything unfinished and why.
