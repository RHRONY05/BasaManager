# Reference

Lookup pages, taken straight from the code. Use them to answer "what does this variable do" or "what does
this error code mean" without reading source.

- [Environment variables](/reference/env-vars): every variable `apps/api/src/config/env.ts` accepts.
- [Error codes](/reference/error-codes): every code in `packages/shared/src/errors.ts` and its HTTP status.

## The OpenAPI file

`docs/reference/openapi.json` is the machine-readable API contract. It is generated from the Zod schemas in
`packages/shared` by `scripts/openapi.mjs` (`pnpm openapi` writes it, `pnpm openapi:check` fails if the
committed file is stale, and `pnpm lint` runs that check). Do not edit it by hand. It is a repo file, not a
page of this site; the human-readable version of each route is in `.agent/04-API.md`.
