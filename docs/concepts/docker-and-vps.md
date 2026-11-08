# Docker & the VPS setup

## What problem it solves

Your laptop and a server are different computers: different operating system, installed software and
versions. "It works on my machine" is the oldest bug in the book. A server also has to keep running when you
close the laptop, restart by itself after a crash, and speak HTTPS to strangers.

**Docker** packs an app and everything it needs (Node, libraries, the exact files) into an **image**. A
running copy of an image is a **container**. The same image behaves the same on any machine that runs Docker.
**Docker Compose** describes a group of containers in one YAML file ("a database, a cache, an API, a worker
and a web server, wired together") so one command starts the whole group.

**Analogy.** A shipping container. The crane (the server) does not care what is inside; it only needs the
standard box. Compose is the loading plan for one ship (one environment).

## How it works here

### The VM

`infra/azure/create-vm.sh` makes the machine in the resource group `rg-basamanager` (region
`indiasouthcentral`): a Standard_B2s (2 vCPU, 4 GB), Ubuntu 24.04, a **static public IP** and an Azure firewall
(a "network security group") that opens only ports 22 (SSH), 80 and 443. It is safe to run twice: it looks each
thing up before creating it.

`infra/server/bootstrap.sh` then prepares the empty machine once: package updates, 2 GB swap, the `ufw`
firewall, `fail2ban` (bans IPs that guess SSH logins), SSH keys only (no passwords, no root login), automatic
security updates, Docker, and a `deploy` user. The `deploy` user has **no sudo**, but it is in the `docker`
group, and **membership of the docker group is root-equivalent** on this VM (`docker run -v /:/host ...` gives a
root shell on the whole disk). So "no sudo" is not a real wall. What actually limits a leaked pipeline key:
(1) it is a **separate key** (`basamanager_deploy_ed25519`) that opens only the `deploy` user; the admin key
(`basamanager_ed25519`, for `azureuser`) is never uploaded to GitHub; (2) GitHub **environment** rules decide
which branches and tags can read the key at all; (3) the Azure firewall and `fail2ban` limit who can even try to
log in. Treat a leaked deploy key as a leaked server: rotate it and rebuild if in doubt.

### Images

Four Dockerfiles in `infra/docker/`, all **multi-stage** (a big "build" stage with compilers and dev tools,
then a small "runtime" stage that copies only the result) and all running as a **non-root** user:

| Image    | Contains                                                         | Runs as           |
| -------- | ---------------------------------------------------------------- | ----------------- |
| `api`    | the API code plus production dependencies (`pnpm deploy --prod`) | `node` (uid 1000) |
| `worker` | the worker plus the `apps/api` code it imports                   | `node`            |
| `web`    | the Vite build, served by a tiny Caddy file server on 8080       | uid 1000          |
| `docs`   | the VitePress site, served the same way                          | uid 1000          |

The api and worker run TypeScript directly through `tsx` (a small runtime that strips types). Decision (V3):
no bundler to maintain, and stack traces point at the real source files. Images are tagged with the **git
SHA** and pushed to GitHub's registry (GHCR) as `ghcr.io/rhrony05/basamanager-<name>:<sha>`.

### Compose files

- `infra/compose.server.yml` is **one** stack: postgres, redis, api, worker, web. It runs twice, as the
  Compose projects `bm-staging` and `bm-prod`, with different env files, so the two are fully separate (own
  database container, own volume, own passwords).
- `infra/compose.edge.yml` (project `bm-edge`) holds **Caddy** and the docs site.
- Only Caddy publishes ports. Postgres and Redis publish nothing: they are reachable only from containers on
  the project's private network. The api and web containers also join a shared network called `bm-edge` under
  the names `staging-api`, `prod-web` and so on; that is how Caddy finds them.

### Caddy and HTTPS

`infra/caddy/Caddyfile` lists the three hostnames. Caddy asks Let's Encrypt for a certificate for each one
automatically (it proves it owns the name by answering a challenge on port 80) and renews it before expiry.
It adds the security headers (HSTS, CSP, nosniff, referrer policy), compresses responses, caches hashed assets
for a year and never caches `index.html` or the service worker.

### Cloudflare in front

The zone's SSL mode (we only read it) is _Full_, so `basamanager.rhrony05.me` is **proxied** (orange cloud):
visitors talk to Cloudflare, Cloudflare talks to Caddy over HTTPS. But Cloudflare's free certificate covers
only `rhrony05.me` and `*.rhrony05.me`, **not names two levels deep**. `staging.basamanager…` and
`docs.basamanager…` are therefore **DNS-only** (grey cloud): visitors reach Caddy directly and get its Let's
Encrypt certificate. Caddy trusts the `CF-Connecting-IP` header only when the connection really comes from a
Cloudflare address, so the API sees the real visitor IP either way.

## Diagram

![Architecture level 1](/diagrams/architecture/level-1-system.svg)

## Gotchas

- **`docker compose down -v` deletes the database volume.** Never type `-v` on the server.
- **Published ports skip `ufw`.** Docker writes its own firewall rules, so a stray `ports:` on Postgres would
  expose it even though `ufw` says "deny". That is why only Caddy has `ports:`.
- **Container names** are `<project>-<service>-1` (`bm-staging-postgres-1`); `backup.sh` depends on that.
- **A full disk stops everything.** `deploy.sh` removes old images; check `df -h` if a deploy fails.
- **Time zone.** The VM runs in `Asia/Dhaka` so cron times mean what they say; Postgres and logs stay in UTC.
- **Memory.** 4 GB is shared by two stacks: Postgres 128 MB shared buffers, Redis 128 MB, Node 384 MB each.

## Where in code

- `infra/azure/create-vm.sh`, `infra/server/bootstrap.sh`, `infra/cloudflare/dns.sh`
- `infra/docker/api.Dockerfile`, `worker.Dockerfile`, `web.Dockerfile`, `docs.Dockerfile`, `static.Caddyfile`
- `infra/compose.server.yml`, `infra/compose.edge.yml`, `infra/caddy/Caddyfile`
- Runbooks: [Deploy](/operations/deploy), [Reading logs](/operations/reading-logs-and-sentry)

## Self-check

1. What is the difference between an image and a container?
2. The `deploy` user has no `sudo`. Why is that still not a security boundary, and what three things really limit a leaked pipeline key?
3. Why are `staging.` and `docs.` not proxied by Cloudflare while production is?
4. Postgres is "private". What makes it so, and what single mistake in the Compose file would undo it?
5. Where does the HTTPS certificate for `staging.basamanager.rhrony05.me` come from, and who renews it?
