# Roll back

Rolling back means: run the **previous** version again. The pipeline does it by itself when a deploy or its
smoke test fails. You can also do it by hand.

## What a rollback does and does not do

- It restarts the previous release's **images** (they stay on the VM). Takes about a minute.
- It does **not** undo database migrations. That is safe by rule: migrations only _add_ things (expand then
  contract), so an older app still works. If you ever ship a migration that removes or renames something, a
  rollback is no longer enough: restore the pre-deploy dump ([Backup & restore](/operations/backup-and-restore)).

## Automatic

In the `deploy` job: if `deploy.sh` or the smoke test fails, the next step runs `rollback.sh <env>`, then a
second smoke test proves the old version answers with the old SHA. The job stays **red** on purpose, with the
message "Release X FAILED and was rolled back to Y". The first-ever deploy of an environment has nothing to roll
back to and just fails.

**Proof (V3):** workflow run with "force smoke fail" on staging, see PROGRESS.md for the run link and output.

## By hand

```bash
ssh -i ~/.ssh/basamanager_ed25519 deploy@<ip>
cat /opt/basamanager/state/staging.current /opt/basamanager/state/staging.previous   # what runs, what is next
/opt/basamanager/bin/rollback.sh staging    # or: prod
curl -s https://staging.basamanager.rhrony05.me/api/health      # release must now be the previous SHA
```

To go to an older version than "previous":
`/opt/basamanager/releases/<sha>/infra/scripts/deploy.sh staging <sha> --rollback` (needs that folder; the last 5
releases are kept).

After a rollback the bad SHA is saved in `state/<env>.bad`. Fix forward: merge a fix to `main`; it deploys as a
normal release.

## Check it worked

`/api/health` shows the older `release`, `docker ps` shows all containers `healthy`, and the Actions run says
which SHA it returned to.
