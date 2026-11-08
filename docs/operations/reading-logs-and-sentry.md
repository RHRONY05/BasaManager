# Reading logs & Sentry

Two places tell you what the app did: **logs** (everything, one line per event) and **Sentry** (only errors,
grouped, with context). Use Sentry to find _that_ something broke, logs to see _what happened around it_.

## Logs on the server

Every container writes JSON lines to its standard output; Docker keeps the last 5 files of 20 MB.

```bash
ssh -i ~/.ssh/basamanager_ed25519 deploy@<ip>
docker logs --tail 100 bm-staging-api-1            # last 100 lines of the staging API
docker logs -f bm-staging-api-1                    # follow live (Ctrl+C to stop)
docker logs --since 30m bm-prod-worker-1           # last 30 minutes
docker logs bm-edge-caddy-1 --tail 50              # the front door: access log and certificate messages
```

Container names: `bm-<staging|prod>-<api|worker|web|postgres|redis>-1`, `bm-edge-caddy-1`, `bm-edge-docs-1`.

### Find one request

Every response has an `X-Request-Id` header and every error body carries the same `requestId`. Ask the user for
it (or find it in Sentry), then:

```bash
docker logs bm-prod-api-1 2>&1 | grep '"id":"<request id>"'
```

Pretty-print a line: `... | jq .` (`jq` is installed). Useful fields: `level` (30 info, 40 warn, 50 error),
`msg`, `req.url`, `res.statusCode`, `responseTime`. Cookies, tokens and passwords are redacted, and
request bodies are never logged.

## Sentry

1. Open sentry.io, the organisation from the credentials file, projects `basamanager-api`, `-worker`, `-web`.
2. **Issues** lists each distinct error once, with a count. Filter by `environment:prod` (or `staging`).
3. Open an issue: the stack trace, the **release** (git SHA: compare with `/api/health` to know if the bug is in
   the running version), the breadcrumbs (what happened before), the request id tag.
4. Mark it **Resolved** when fixed; Sentry reopens it if it comes back in a later release.
5. Set an alert rule once: Alerts, Create, "A new issue is created" in each project, notify by email.

The CI token (`org:ci`) cannot read issues; use the website.

## Proving Sentry works

Staging only, never in production: V3 temporarily had a test route/hook per app. They were removed after the
proof. To prove it again, throw a deliberate error in a staging-only branch and look for it in Issues.

## Uptime

An external monitor (UptimeRobot, optional) pings `/api/health` every 5 minutes and emails when it fails; see
PROGRESS.md for whether it is configured.
