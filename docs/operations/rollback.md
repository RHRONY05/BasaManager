# Roll back

Rolling back means: run the **previous** version again. The pipeline does it by itself when a deploy or its
smoke test fails. You can also do it by hand.

## What a rollback does and does not do

- It restarts the previous release's **images** (they stay on the VM). Takes about a minute.
- It does **not** undo database migrations. That is safe by rule: migrations only _add_ things (expand then
  contract), so an older app still works. If you ever ship a migration that removes or renames something, a
  rollback is no longer enough: restore the pre-deploy dump ([Backup & restore](/operations/backup-and-restore)).

## Automatic

In the `deploy` job: if `deploy.sh` or the smoke test fails, the next step runs `rollback.sh <env> <failed-sha>`,
then a second smoke test proves the working version answers with its own SHA. The job stays **red** on purpose,
with the message "Release X FAILED and was rolled back to Y". The first-ever deploy of an environment has nothing
to roll back to and just fails.

Which version does it go back to? That depends on how far the failed deploy got (`deploy.sh` writes
`state/<env>.current` and `.previous` only when it **succeeds**):

| Where it failed                                                      | `current` still says                   | Rollback goes to                  |
| -------------------------------------------------------------------- | -------------------------------------- | --------------------------------- |
| `deploy.sh` itself (pull error, failed migration, api never healthy) | the last good SHA (not the failed one) | `current` (the last good version) |
| the smoke test (the deploy finished, state already updated)          | the failed SHA                         | `previous`                        |

The pipeline tells `rollback.sh` which step failed (`rollback.sh <env> <sha> deploy|smoke`), so it never jumps two
releases back. If you run it by hand without the third argument it guesses from the state files. If a re-deploy of
the release that is already running fails (for example "Redeploy staging without a code change" failing at the
pull), the target is that same release and it is not marked bad. The failed SHA is otherwise written to
`state/<env>.bad`.

**Proof (V3, staging, 2026-11-09):**

- Deploy-step path: run 42513127173. `deploy.sh` was made to fail on purpose (`--fail-before-up`) after the migration; the log shows `rolling back (failed 5c7b1e19, current 14483f15) -> 14483f15`, then `SMOKE PASSED`. State afterwards: `current` unchanged, `previous` unchanged, `bad=5c7b1e19`.
- Smoke path: run 42513431008. The smoke test was made to fail on purpose; `rolling back (failed eae730b9, current eae730b9) -> 14483f15`, then `SMOKE PASSED`. State afterwards: `current=14483f15`, no `previous`, `bad=eae730b9`.
- Both used temporary branch triggers that were removed afterwards. (Earlier runs 42507019561 and 42507429890 only looked like drills: they failed in the migrate step on a real image bug, since fixed.)

To repeat the drills: Actions, **deploy**, Run workflow (branch `main`), tick **force smoke fail** (smoke path) or
**fail deploy step** (deploy.sh path). Both work for staging only and roll staging back, so use them sparingly.

## By hand

```bash
ssh -i ~/.ssh/basamanager_deploy_ed25519 deploy@<ip>
cat /opt/basamanager/state/staging.current /opt/basamanager/state/staging.previous   # what runs, what is next
# <bad-sha> = the release that is broken right now (usually the same as "current")
/opt/basamanager/bin/rollback.sh staging <bad-sha>    # or: prod
curl -s https://staging.basamanager.rhrony05.me/api/health      # release must now be the good SHA
```

To go to a specific older version:
`/opt/basamanager/releases/<sha>/infra/scripts/deploy.sh staging <sha> --rollback` (needs that folder; the last 5
releases are kept).

After a rollback the bad SHA is saved in `state/<env>.bad`. Fix forward: merge a fix to `main`; it deploys as a
normal release.

## A migration failed

`prisma migrate deploy` runs before the new containers start, so a failed migration stops the deploy (and the
pipeline rolls back the containers). The database may be left half-changed, and Prisma refuses every later
`migrate deploy` with error **P3009** until you resolve it. Steps, on the VM as `deploy`:

1. Read the error: `cd /opt/basamanager/releases/<failed-sha>/infra && IMAGE_TAG=<failed-sha> docker compose -p bm-staging --env-file /opt/basamanager/env/staging.env -f compose.server.yml run --rm migrate` (it prints the failing migration name and the SQL error).
2. If the migration was **partly applied**, restore the pre-deploy dump in `/opt/basamanager/state/pre-deploy/` (newest file for that environment) with `restore.sh` ([Backup & restore](/operations/backup-and-restore)). If nothing was applied, skip this.
3. Tell Prisma the migration is not applied: run the same `compose run --rm migrate` command with the command replaced by `node_modules/.bin/prisma migrate resolve --rolled-back <migration-name>`.
4. Fix forward: correct the migration in a new commit (never edit an applied migration), merge, deploy.

**Review gate for every migration from V4 on (expand then contract):** a migration may only _add_ (new tables,
nullable or defaulted columns, new indexes). Dropping or renaming something happens in a **later** release, after
no running version uses it. A reviewer rejects any migration that removes or renames in the same release as the
code that stops using it. This is what makes "roll back the image" safe.

## Check it worked

`/api/health` shows the good `release`, `docker ps` shows all containers `healthy`, and the Actions run says
which SHA it returned to.
