# Error codes

Every non-2xx answer from the API has the same body, built by `apps/api/src/middleware/errorHandler.ts`:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Validation failed",
    "details": [{ "path": "limit", "message": "Too big: expected number to be <=100" }],
    "requestId": "9f0c2b8e-6a1d-4c57-9d52-1f5f3f0f0a11"
  }
}
```

- `code` is the machine-readable part. The web client branches on **`code`, never on the HTTP status**,
  because several codes share a status (for example three different 401s).
- `message` is a human sentence the UI may show.
- `details` appears only for validation problems: one entry per bad field. `path` is the Zod path joined with
  dots (`items.0.amountPoisha`); an empty string means the whole input is wrong.
- `requestId` is the same value as the `X-Request-Id` response header, so a user can quote it and you can find
  the log lines (see [Logging](/concepts/logging)).

The codes live in `packages/shared/src/errors.ts` (`ErrorCode` and `errorStatus`). One code always maps to
one status. Adding a code means editing both objects and the list in `.agent/04-API.md`; the test
`packages/shared/src/errors.test.ts` fails if the two objects get out of step.

| Code                          | Status | Meaning                                                                                     |
| ----------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| `VALIDATION_FAILED`           | 400    | The input did not match its Zod schema. `details` lists the fields.                         |
| `TOKEN_INVALID`               | 400    | A verify, reset or invite token is expired, used or unknown (one code for all three).       |
| `READING_LOWER_THAN_PREVIOUS` | 400    | A meter reading is lower than the last one.                                                 |
| `UNAUTHENTICATED`             | 401    | No valid session. The web client tries one token refresh, and only for this code.           |
| `INVALID_CREDENTIALS`         | 401    | Wrong email or password. Never triggers a refresh.                                          |
| `SESSION_REVOKED`             | 401    | The refresh token was reused or the session was ended. Never triggers a refresh.            |
| `FORBIDDEN`                   | 403    | Signed in, but this role may not do this.                                                   |
| `INVITE_EMAIL_MISMATCH`       | 403    | A signed-in user opened an invite for a different email.                                    |
| `NOT_FOUND`                   | 404    | Missing, **or exists but not yours**. The API never reveals that something exists.          |
| `CONFLICT`                    | 409    | Generic clash with current state.                                                           |
| `LANDLORD_MUST_TRANSFER`      | 409    | A landlord tried to delete their account while still owning an organisation.                |
| `READING_REQUIRED`            | 409    | A bill that needs a meter reading cannot be issued yet.                                     |
| `DUPLICATE_REFERENCE`         | 409    | The same payment reference (for example a bKash TrxID) was already used.                    |
| `INVALID_TRANSITION`          | 409    | A state change that is not allowed (for example a maintenance request jumping to closed).   |
| `ORG_SUSPENDED`               | 423    | The organisation is suspended by an admin.                                                  |
| `ACCOUNT_LOCKED`              | 423    | Too many wrong passwords; the account is temporarily locked.                                |
| `RATE_LIMITED`                | 429    | Too many requests.                                                                          |
| `INTERNAL`                    | 500    | Anything unexpected. The body is always the generic "Something went wrong"; no stack trace. |

Most of these are produced by features that do not exist yet (V5 onwards). Today only `VALIDATION_FAILED`,
`NOT_FOUND` and `INTERNAL` can actually be returned: see [Request lifecycle](/overview/request-lifecycle).

## Probe endpoints are the exception

`GET /api/health` and `GET /api/ready` answer with a bare body (`{ status, ... }`), not the `{ data }`
envelope, and a not-ready answer is a 503 with that same bare shape, not an error body. Load balancers and
Docker health checks read them, so they keep the simplest possible format.
