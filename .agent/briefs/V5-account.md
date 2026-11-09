# V5 — frontend part 2: `/account` page and org switcher

Work in the worktree `D:/Projects/bm-wt/V5` (branch `feat/V5`). Do not run `git push`, `gh`, `az`, `ssh`, deploy scripts, and do not read the credentials folder.

Read first: `AGENTS.md`, `.agent/rules/basamanager.md`, `.agent/06-UI.md` (Shared, top bar), `.agent/04-API.md` (Auth & account: `/me`, `/me/change-password`, `/me/sessions`, `/auth/logout`, `/auth/logout-all`, `DELETE /me`), the design `.agent/design/{desktop,mobile}/23-account.html`, `.agent/design/states.html`, and the skills `frontend-implementation`, `mobile-layout-qa`, `ui-states` (their BasaManager override sections win). Request/response schemas: `packages/shared/src/api/auth.ts` and neighbours. Reuse the existing API client, `AuthProvider`/`useAuth`, `PasswordInput`/`PasswordStrength` from part 1. Do not touch `apps/api`, `packages/shared`, infra, CI.

## Build
1. Replace the placeholder `apps/web/src/pages/shared/AccountPage.tsx` (route `/account`, also used by `/t/account`) with sections, exactly as the artboards:
   - **Profile**: full name + phone form (`PATCH /me`), email shown read-only, success toast, pending state.
   - **Change password**: current + new password (`POST /me/change-password`); hide this section for Google-only users if `/me` says there is no password (check the shared schema; if unknown, show it and map the API error). `INVALID_CREDENTIALS` shows an inline error on the current-password field.
   - **Sessions / devices**: list from `GET /me/sessions` (device, last used, "This device" badge), revoke one (`DELETE /me/sessions/:id`, confirm dialog), "Sign out everywhere" (`POST /auth/logout-all`, then go to `/login`).
   - **Delete account**: dialog, type `DELETE` + password; `LANDLORD_MUST_TRANSFER` shows a clear message. On success go to `/`.
   - **Notification preferences**: NOT in this part (V12). Render nothing.
2. **Org switcher** in the top bar (only when the user has more than one membership): lists memberships from `useAuth`, sets the active org (use the existing `X-Org-Id` mechanism from the client), invalidates the query cache, navigates to `homeFor(role)`. Single-membership users see the org name without a menu.
3. **Sign out** item in the account menu (`POST /auth/logout`, clear query cache, go to `/login`) if not already present.
4. All strings under `account.*` in `src/locales/en/common.json`; tokens only; labels never wrap; each section has skeleton/error/empty states per `ui-states`; query keys via `lib/api/keys.ts`; mutations show pending and disable the button.
5. **Tests** (Vitest + Testing Library): profile save, change-password error mapping, session revoke confirm, sign out everywhere, delete dialog requires the typed word, org switcher hidden with one membership and switching clears the cache.

## Must pass
`pnpm --filter @bm/web typecheck`, `pnpm --filter @bm/web test`, `pnpm lint` (Prettier, token lint, size-limit; keep pages lazy), root `pnpm typecheck`.

## Not in this part
Notification preferences, socket wiring, e2e specs, docs pages.

## When done, reply (under 30 lines)
1. Files written. 2. Ambiguities and decisions. 3. Anything unfinished and why. 4. Exact results of the commands above.
