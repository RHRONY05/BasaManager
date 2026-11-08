# Architecture (level 1)

Level 0 is the one-line story ([System context](/overview/system-context)). Level 1, below, shows the
containers that run, where they run, and what they talk to. Level 2 diagrams live on each feature page.

![Architecture level 1](/diagrams/architecture/level-1-system.svg)

## Reading the picture

- **One VM, two environments.** `bm-staging` and `bm-prod` are the same set of containers with different
  databases and secrets. A third group, `bm-edge`, holds **Caddy** (HTTPS and routing) and the docs site.
- **Same origin.** The browser only talks to one host per environment. Caddy sends `/api/*` and `/socket.io/*`
  to the **api**, everything else to the **web** container (static React build). No CORS, simple cookies.
- **api** handles HTTP and websockets. **worker** runs schedules, delivers notifications and renders PDFs. Both
  use **Postgres 17** (data) and **Redis 7** (locks, rate limits, socket adapter). Neither is reachable from outside.
- **Outside world** (pink): Cloudinary stores files (authenticated, expiring links), Resend sends email, Web
  Push services deliver notifications, SSLCommerz (sandbox) takes payments, Sentry receives errors, Azure Blob
  keeps nightly database backups.
- **Delivery:** GitHub Actions builds images, pushes them to GHCR, and runs the deploy script on the VM over SSH.

## Where to read more

[Docker & the VPS](/concepts/docker-and-vps) · [CI/CD](/concepts/ci-cd) · [Backups](/concepts/backups) ·
[Sentry](/concepts/sentry-from-zero) · [Environments](/concepts/environments) · [Request lifecycle](/overview/request-lifecycle)
