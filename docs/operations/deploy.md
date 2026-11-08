# Deploy

You almost never deploy by hand: the pipeline does it. This page explains what happens, how to start it, how
to check it, and how to do it manually if GitHub is down.

New to servers? Three words. A **VM** is a rented computer that is always on. **Docker** runs our programs in
sealed boxes ("containers"). **SSH** is a way to type commands on that computer from yours, with a key
instead of a password.

## Facts you need

| Thing         | Value                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| VM            | `vm-basamanager`, resource group `rg-basamanager`, region `indiasouthcentral`                          |
| Staging URL   | https://staging.basamanager.rhrony05.me                                                                |
| Production    | https://basamanager.rhrony05.me                                                                        |
| Docs          | https://docs.basamanager.rhrony05.me                                                                   |
| SSH           | `ssh -i ~/.ssh/basamanager_deploy_ed25519 deploy@<VM public IP>` (IP: PROGRESS.md "Environment facts") |
| Server folder | `/opt/basamanager` (`bin/` scripts, `env/` secrets files, `releases/<sha>/` code, `state/`)            |

## Deploy to staging (normal)

1. Open a pull request, wait for the six CI checks to be green, merge (squash).
2. The merge starts the **deploy** workflow (GitHub, Actions tab). Watch it: `meta`, `build` (4), `sentry-release`, `deploy`.
3. It is done when the `deploy` job is green. The last step prints `SMOKE PASSED`.
4. Check by hand: `curl -s https://staging.basamanager.rhrony05.me/api/health`. The `release` must equal the
   commit SHA you merged (`git rev-parse origin/main`).

If a step fails the pipeline **rolls back by itself** (see [Roll back](/operations/rollback)) and the job is red.
Read the red step's log first.

## Deploy to production

Only after staging is green **for the same commit**:

```bash
git checkout main && git pull
git tag v0.1.0            # use the next version number
git push origin v0.1.0
```

The tag starts the same workflow with target production. It refuses to run if staging does not report this
exact SHA. After it is green check `https://basamanager.rhrony05.me/api/health`.

## Redeploy staging without a code change

GitHub → Actions → **deploy** → Run workflow (branch `main`). Leave "force smoke fail" and "fail deploy step"
unticked. Tick **env only** to refresh just the env files on the VM (no containers are touched).

## What `deploy.sh` does, in order

1. Takes a lock (only one deploy at a time).
2. Pulls the new images.
3. Starts Postgres and Redis if needed.
4. Re-applies the database roles and passwords from the env file.
5. Writes a **pre-deploy dump** to `/opt/basamanager/state/pre-deploy/`.
6. Runs `prisma migrate deploy` in a one-off container.
7. Starts api, worker, web and waits until they report healthy.
8. Records `current` and `previous` SHA in `state/` (only now, on success).
9. Removes old release folders and unused images.

## Manual deploy (GitHub is down)

You need the repo on your laptop and the SSH key.

```bash
SHA=$(git rev-parse HEAD)
ssh deploy@<ip> "mkdir -p /opt/basamanager/releases/$SHA"
tar czf - infra | ssh deploy@<ip> "tar xzf - -C /opt/basamanager/releases/$SHA"
ssh deploy@<ip> "/opt/basamanager/releases/$SHA/infra/scripts/deploy.sh staging $SHA"
```

The images for `$SHA` must exist in GHCR (a build ran). The env file `/opt/basamanager/env/staging.env` is
already on the VM from the last pipeline run.

## First-time setup of a brand-new VM

In this order, from the repo root (see [Docker & the VPS](/concepts/docker-and-vps) for what each does):
`bash infra/azure/create-vm.sh` → copy and run `infra/server/bootstrap.sh` on the VM →
`bash infra/cloudflare/dns.sh <ip>` → `bash infra/azure/create-backup-storage.sh .secrets/backup-sas` →
`DEPLOY_HOST=<ip> bash infra/scripts/provision-secrets.sh staging` (and `production`) → merge to `main`.

Details that trip people up:

1. Make the pipeline key first: `ssh-keygen -t ed25519 -N "" -f ~/.ssh/basamanager_deploy_ed25519`. It is a different key from the admin key.
2. Run bootstrap with the **public** half of that key: `ssh -i ~/.ssh/basamanager_ed25519 azureuser@<ip> "sudo bash /tmp/bootstrap.sh '$(cat ~/.ssh/basamanager_deploy_ed25519.pub)'"`.
3. `provision-secrets.sh` connects with strict host-key checking, so the VM must already be in your `known_hosts`. Run `ssh -i ~/.ssh/basamanager_deploy_ed25519 deploy@<ip>` once and compare the fingerprint it shows with the VM's own: `az vm run-command invoke -g rg-basamanager -n vm-basamanager --command-id RunShellScript --scripts "ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub"`. Only then type `yes`.
4. Once, in GitHub (Settings, Environments), restrict deployment branches: `staging` to branch `main` only, `production` to tags `v*` only. Without this, any branch's workflow could read the production secrets.

## Smoke test and auth

`tests/smoke.ts` checks health (with SHA), ready, public config, the web page and (staging) docs. When auth
exists (V5) add "log in as the smoke user" to it and to this page.

## If something looks wrong

| Symptom                                 | Look at                                                                                                                                |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Job red at `build`                      | The Docker build log in that job (usually a lockfile or type error)                                                                    |
| Job red at `deploy`, "unhealthy"        | [Reading logs](/operations/reading-logs-and-sentry): `docker logs bm-staging-api-1`                                                    |
| Smoke red, SHA mismatch                 | The old containers are still running. On the VM run `docker ps` and `docker logs bm-staging-api-1`; the rollback step says what it did |
| Browser certificate error on a new name | Caddy is still getting its certificate (wait 1 minute); `docker logs bm-edge-caddy-1`                                                  |
