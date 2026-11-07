# Logging (Pino)

## What problem it solves

When something goes wrong in production you cannot attach a debugger. The only witness is what the app wrote
down. Good logs answer three questions fast: **what happened, to which request, and how bad was it**. Bad
logs either say nothing, or say too much (a password in a log file is a data breach).

**Analogy.** A ship's logbook. Every entry has a timestamp, a severity, and the voyage number (the request
id), so you can pull out every line that belongs to one incident. And the captain never writes the vault
combination in it.

## How it works here

### Structured, not sentences

Logs are **JSON, one object per line, written to stdout** by Pino. The app never opens a log file; Docker
collects stdout and decides where it goes. JSON means a machine can filter it (`level`, `req.id`, `msg`)
instead of someone grepping prose.

`createLogger()` in `apps/api/src/lib/logger.ts` builds the logger:

- level from `LOG_LEVEL` (default `info`; `silent` in unit tests via `isTest`),
- ISO timestamps (`pino.stdTimeFunctions.isoTime`),
- the redaction list below.

Levels, from loudest problem to chattiest detail: `fatal`, `error`, `warn`, `info`, `debug`, `trace`.
Setting `LOG_LEVEL=warn` shows `warn` and above only.

### One line per request, with an id

`createHttpLogger()` in `apps/api/src/middleware/logger.ts` wraps the `pino-http` library. When a response
finishes it writes a single line containing the request (`req.id`, method, url, headers, remote address) and
response (`statusCode`, headers) plus `responseTime` in milliseconds.

- **The id.** `req.id` is the same value that `requestId` put in the `X-Request-Id` response header and that
  `errorHandler` puts in the error body. One id ties together the user's screenshot, the HTTP exchange and the
  log lines. See [Request lifecycle](/overview/request-lifecycle).
- **Level by outcome.** 5xx or an error is `error`, 4xx is `warn`, everything else `info`.
- **Skipped.** `/api/health` is not logged (it is polled constantly).
- **Bodies are never logged.** pino-http does not log request or response bodies, and this project keeps it
  that way: auth, file and payment bodies hold secrets.

An unexpected error is logged **twice** on purpose: once by `errorHandler` (`req.log.error`, message
"Unhandled internal server error", with the full error and stack trace) and once by pino-http when the
response finishes ("request errored"). Search for the `req.id` to see both.

### What is redacted

Redaction replaces a value with `[REDACTED]` _before_ the line is written. The list is `REDACT_PATHS` in
`apps/api/src/lib/logger.ts`:

| Path                                                                  | Why                                                                                                   |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `req.headers.cookie`                                                  | Holds the session and refresh cookies                                                                 |
| `req.headers.authorization`                                           | Bearer tokens                                                                                         |
| `req.headers["x-csrf-token"]`                                         | The CSRF token                                                                                        |
| `res.headers["set-cookie"]`                                           | Cookies the server sets (new session tokens)                                                          |
| `password`, `newPassword`, `currentPassword`, `token`, `refreshToken` | A secret at the top level, one level down (`body.password`) or two levels down (`body.user.password`) |

The request URL is also sanitised: the values of the query keys `token`, `sig`, `signature`, `code`, `state` and
`exp` become `[REDACTED]` (`redactUrl`), and the raw `req.query` object is not logged at all.

A real request line, shortened, with the redaction applied:

```json
{
  "level": 30,
  "time": "2026-11-08T10:15:02.331Z",
  "req": {
    "id": "b7ca1fe5-ec19-4a1b-9fcc-9e861337850e",
    "method": "GET",
    "url": "/api/things?page=2",
    "headers": { "cookie": "[REDACTED]", "authorization": "[REDACTED]" }
  },
  "res": { "statusCode": 200 },
  "responseTime": 4,
  "msg": "request completed"
}
```

### The worker

`apps/worker/src/index.ts` builds its logger with the same `createLogger` factory as the API, so the worker
has the same redaction list and the same ISO timestamps.

## Diagram

```mermaid
flowchart LR
  req["HTTP request"] --> rid["requestId<br/>sets req.id"]
  rid --> http["pino-http<br/>one line per request"]
  http --> pino["Pino logger<br/>level, ISO time, redact"]
  eh["errorHandler<br/>req.log.error + requestId"] --> pino
  pino --> out["stdout<br/>JSON lines"]
  out --> docker["Docker logs<br/>(from V3)"]
  docker --> you["you: filter by req.id"]
  classDef ours fill:#BFE3FD,stroke:none,color:#1f1f1f
  classDef outp fill:#C9F2D6,stroke:none,color:#1f1f1f
  classDef ext fill:#FEC8C3,stroke:none,color:#1f1f1f
  class rid,http,pino,eh ours
  class out,docker outp
  class req,you ext
```

## Gotchas

- **Redaction is by explicit path, and `*` is exactly one level.** The list covers each secret key at the top
  level, one level and two levels deep, because pino has no deep wildcard. A `password` three levels down is
  **not** hidden. Never put a secret in a log call and rely on redaction to save you; do not log it.
- **Only listed query keys are masked.** `redactUrl` hides `token`, `sig`, `signature`, `code`, `state` and
  `exp`. A secret in any other query key, or in a path segment, would still be logged: choose those names
  carefully (signed file URLs from V9 use `sig` and `exp`).
- **`/api/health` and `/api/ready` are not logged**, so probes do not fill the logs. A failing readiness probe
  is visible through the 503 and the uptime monitor, not through a log line.
- **Do not use `console.log`.** ESLint (`no-console`) fails the build. Use the logger; in a route, `req.log`
  already carries the request id.
- **Logs are not an audit trail.** They rotate and are filtered by level. Anything the business must keep
  (who voided a payment) goes in a database table, not in a log line.

## Where in code

- `apps/api/src/lib/logger.ts`: `createLogger`, `REDACT_PATHS`, `redactUrl`
- `apps/api/src/middleware/logger.ts`: `createHttpLogger`
- `apps/api/src/middleware/errorHandler.ts`: the `req.log.error` call
- `apps/api/src/middleware/requestId.ts`: where the id comes from
- `apps/worker/src/index.ts`: the worker's logger (uses `createLogger`)
- `apps/api/src/config/env.ts`: `LOG_LEVEL`

## Self-check

1. A user says "I got _Something went wrong_ at 14:05". What do you ask for, and what do you do with it? <details><summary>Answer</summary>The <code>requestId</code> from the error message or the <code>X-Request-Id</code> header. Search the logs for that id: you will find the request line and, because it was a 500, the "Unhandled internal server error" line with the stack trace.</details>
2. Why is the Cookie header logged as `[REDACTED]`? <details><summary>Answer</summary>It contains the session and refresh tokens. Anyone with log access could replay them to impersonate the user. The path <code>req.headers.cookie</code> is in <code>REDACT_PATHS</code>.</details>
3. What happens if a developer writes `logger.info({ password })`? <details><summary>Answer</summary>It is redacted: <code>REDACT_PATHS</code> lists <code>password</code> at the top level and one and two levels deep, so the value is written as <code>[REDACTED]</code>. Three levels down it would be written in clear text, because <code>*</code> matches exactly one level. Redaction is a safety net, not a licence: never log secrets.</details>
4. What is `LOG_LEVEL=silent` for? <details><summary>Answer</summary>Unit tests use it (through <code>createLogger({ isTest: true })</code>) so test output stays readable.</details>
5. Why is `/api/health` excluded from request logging? <details><summary>Answer</summary>It is polled by Docker, the load balancer and the uptime monitor all day. Logging every probe would bury real requests in noise.</details>
