# Backup & restore drill

How backups work is explained in [Backups](/concepts/backups). This page is the checklist.

## Where the backups are

Azure storage account `bmbackupsf1f2c5bb` (resource group `rg-basamanager`), private container `backups`:
`staging/YYYY-MM-DD.dump` and `prod/YYYY-MM-DD.dump`. Files older than 30 days are deleted automatically.
Pre-deploy dumps are on the VM in `/opt/basamanager/state/pre-deploy/` (last 5 per environment).

## Take a backup right now

```bash
ssh -i ~/.ssh/basamanager_deploy_ed25519 deploy@<ip>
/opt/basamanager/bin/backup.sh staging before-experiment     # label is optional
```

The last line says `OK ... verified`. Check the nightly log: `tail /opt/basamanager/logs/backup.log`.

## See what is in the container

With the Azure CLI on your laptop (`az login` once):
`az storage blob list --account-name bmbackupsf1f2c5bb --container-name backups --auth-mode key -o table`
(or use the Azure portal: Storage accounts, `bmbackupsf1f2c5bb`, Containers, `backups`).

## Restore drill (safe, nothing live is touched)

```bash
/opt/basamanager/bin/restore.sh staging latest
```

It downloads the newest dump, starts a throwaway Postgres container, restores into it and prints
`RESTORE OK`. The container is deleted at the end. The same runs automatically every Monday in
GitHub (`weekly` workflow, job `restore-drill`); a red run means the backups are broken: fix it first.

## Real restore into a live environment (disaster only)

1. Decide the time: users will see errors while it runs. 2. Run
   `/opt/basamanager/bin/restore.sh staging <blob-name> --into-live` (e.g. `2026-11-08.dump`). It asks you to type
   the environment name, stops api and worker, replaces the database, and tells you to start them again:
   `docker start bm-staging-api-1 bm-staging-worker-1`. 3. Check `/api/ready` and the smoke test. 4. Write down
   what was lost: everything after the dump's time.

## The 60-day SAS token

The upload permission expires about every 60 days (the first one: 2027-01-06). To renew:
`bash infra/azure/create-backup-storage.sh .secrets/backup-sas`, then
`AZURE_BACKUP_ACCOUNT=bmbackupsf1f2c5bb DEPLOY_HOST=<ip> bash infra/scripts/provision-secrets.sh staging` and
`... production`, then push the new value to the VM **without deploying code**: Actions, **deploy**, Run workflow,
branch `main`, tick **env only** (staging); run it again with the current `v*` tag selected instead of a branch
(production). Put a calendar reminder at day 50.

Soft delete is on for the storage account (7 days): a dump that was overwritten or deleted (the SAS can write) can
be undeleted in the Azure portal under the container, "Show deleted blobs".
