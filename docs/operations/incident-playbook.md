# Incident playbook

Something is broken in production. Stay calm; work top to bottom and stop at the first fix that works.

## 0. Is it really down?

```bash
curl -si https://basamanager.rhrony05.me/api/health | head -1       # expect HTTP/2 200
curl -si https://basamanager.rhrony05.me/api/ready | head -1        # 200 = database and Redis reachable
```

## 1. Decide quickly: did a deploy just happen?

GitHub → Actions → **deploy**. If the last green deploy is minutes old and the symptoms started then:
**roll back first, investigate later** ([Roll back](/operations/rollback)).

## 2. Look at the containers

```bash
ssh -i ~/.ssh/basamanager_deploy_ed25519 deploy@<ip>
docker ps --format '{{.Names}}  {{.Status}}'
```

Every container should say `Up ... (healthy)` (the worker has no health check: just `Up`). Common cases:

| You see                          | Do                                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| a container `Restarting`         | `docker logs --tail 100 bm-prod-api-1`: usually a missing env value or an unreachable database            |
| `bm-edge-caddy-1` not healthy    | `docker logs --tail 100 bm-edge-caddy-1`; a Caddyfile mistake or certificate problem                      |
| all up, site gives 502/503       | Caddy cannot reach `prod-api`: `docker network inspect bm-edge`; restart the api container                |
| site fine, errors for some users | Sentry first ([Reading logs & Sentry](/operations/reading-logs-and-sentry))                               |
| disk full (`df -h /` near 100%)  | `docker image prune -a` (asks before deleting; keeps running containers' images), then `docker system df` |
| out of memory (`free -m`)        | `docker stats --no-stream`; restart the biggest container; look for a runaway job                         |

Restart one service: `docker restart bm-prod-api-1`. Never use `docker compose down -v` (it deletes the database).

## 3. Data problem (wrong data, lost data)

Stop the writes if you can (`docker stop bm-prod-api-1 bm-prod-worker-1`), then
[restore](/operations/backup-and-restore). Use the **pre-deploy dump** for "the last release broke data" and
the nightly Azure dump otherwise.

## 4. Suspected leak or break-in

1. [Rotate](/operations/rotate-a-secret) the exposed secret (database passwords, `JWT_SECRET`, the deploy key).
2. `last` and `sudo journalctl -u ssh` (as `azureuser`) for unknown logins; `fail2ban-client status sshd`.
3. Rotate third-party keys that were on the VM (Cloudinary, Resend, SSLCommerz sandbox).
4. Write down what happened, when, and what you changed.

## 5. After it is fixed

Write 5 lines in PROGRESS.md "Decisions" or a new ADR: what broke, why, how you found it, what stops it
happening again. If an alert would have caught it sooner, add the alert.

## Useful addresses

Staging health: `https://staging.basamanager.rhrony05.me/api/health` · Docs: `https://docs.basamanager.rhrony05.me`
· GitHub Actions: https://github.com/RHRONY05/BasaManager/actions · Sentry: sentry.io (organisation in the credentials file)
