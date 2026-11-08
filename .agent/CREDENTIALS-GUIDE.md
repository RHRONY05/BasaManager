# Credentials guide — what Rony collects before kickoff

The agents can do everything except create accounts and click "I agree" on other companies' sites.
This guide is the full list of what to collect. It takes about **1.5–2 hours** in one sitting.

## Ground rules
1. Every secret goes into **one file outside the repo**: `D:\Projects\Project_credentials\BasaManager.env`
   (template at the bottom). Never paste a secret into chat, a doc, an issue or a commit.
2. Agents read that file by variable name, copy values into GitHub Environment secrets and the VPS
   `.env` files, and only ever report "present (length N)".
3. **Only Claude agents (DevOps) touch secrets.** Gemini/Antigravity coding sessions run without the
   credentials file and only see `.env.example` names.
4. Use **sandbox/test** credentials everywhere they exist. Nothing here can move real money.
5. After the test month, do the **cleanup** at the bottom (revoke tokens, delete the VM).

## Overview
| # | Platform | What you do | What goes in the env file | Free? |
|---|---|---|---|---|
| 0 | This laptop | Install/log in CLIs | nothing | ✅ |
| 1 | GitHub | `gh auth login` | nothing (CLI holds the token) | ✅ |
| 2 | Azure | `az login` | nothing (CLI holds the session) | student credit |
| 3 | Cloudflare | API token for `rhrony05.me` DNS | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID` | ✅ |
| 4 | Cloudinary | API key + PDF delivery setting | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | ✅ 25 credits/mo |
| 5 | Resend | API key | `RESEND_API_KEY` | ✅ 3,000/mo, 100/day |
| 6 | Google Cloud | OAuth client for "Sign in with Google" | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | ✅ |
| 7 | Sentry | CI token + create 3 projects | `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_DSN_WEB`, `SENTRY_DSN_API`, `SENTRY_DSN_WORKER` | ✅ Developer plan |
| 8 | SSLCommerz | Sandbox store | `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD` | ✅ sandbox |
| 9 | UptimeRobot *(optional)* | API key | `UPTIMEROBOT_API_KEY` | ✅ |

---

## 0. This laptop
Check each command works:
```bash
node -v
```
Needs v22.x. If not, install Node 22 LTS.
```bash
corepack enable && pnpm -v
```
```bash
docker info
```
Docker Desktop must be running.
```bash
agy models
```
You already have this working (Gemini 3.8 Flash listed).

## 1. GitHub
```bash
gh auth login --scopes "repo,workflow,write:packages,delete_repo"
```
Choose GitHub.com → HTTPS → log in with a browser as **RHRONY05**. Then check:
```bash
gh auth status
```
*Why these scopes:* `repo` creates the private repo, `workflow` lets agents edit GitHub Actions files,
`write:packages` pushes Docker images to GHCR. `delete_repo` is only so you can ask an agent to clean
up; drop it if you prefer.

## 2. Azure (the VPS)
```bash
az login
```
A browser opens. Log in with the account that has **Azure for Students**. Then:
```bash
az account show --query "{name:name, state:state}" -o table
```
It must say "Azure for Students" and "Enabled". If you have several subscriptions:
```bash
az account set --subscription "Azure for Students"
```
**Gotcha:** student subscriptions only allow some regions and a small vCPU quota. The DevOps agent
checks B2s availability (it prefers Southeast Asia → Central India → East Asia) and records the
region in PROGRESS.md. You don't create the VM yourself.

## 3. Cloudflare (DNS for the subdomains)
1. dash.cloudflare.com → open **rhrony05.me** → on the right side of Overview copy **Zone ID**
   → `CLOUDFLARE_ZONE_ID`.
2. Top right profile icon → **My Profile → API Tokens → Create Token → Custom token**.
   - Name: `basamanager-agents`
   - Policies: one **Zone policy** on **rhrony05.me** with two permissions: **DNS → Write** (older UI: "Edit")
     and **Zone Settings → Read**. (Click the pencil on the zone policy to add the second permission.)
     Agents only *read* zone settings (e.g. the SSL mode) and never change them, because they're shared with your other sites.
   - Token expiration: **Custom → 31 Dec 2026** (the token dies by itself after the test; 90 days also works).
   - Client IP address filtering: **leave empty** (your home IP can change, and a stale filter would silently block the agents).
3. Continue → Create → copy the token once → `CLOUDFLARE_API_TOKEN`.

The agents will create `basamanager`, `staging.basamanager`, `docs.basamanager` (A records to the VM)
and the Resend email records. **Your other records (portfolio, vocab) are not touched**; the rules
forbid editing or deleting any record they didn't create.

## 4. Cloudinary (file storage)
Used for every uploaded file: maintenance photos, payment proofs, NID/agreement scans, and the PDFs the app
generates. Files are uploaded as **authenticated** (never public), and the app hands out download links that
expire after 5 minutes. Database backups do **not** go here; they go to Azure Blob Storage, which the DevOps
agent creates from your student credit (nothing for you to do).

1. cloudinary.com → **Sign up for free** (no card). If you already have an account (e.g. from another
   project), you can reuse it: the agents only touch the folder `basamanager/` and never anything else.
2. Dashboard (home) → **Product Environment** card, or **Settings → API Keys**:
   - **Cloud name** → `CLOUDINARY_CLOUD_NAME`
   - **API Key** → `CLOUDINARY_API_KEY`
   - **API Secret** (click the eye / "Reveal") → `CLOUDINARY_API_SECRET`
   Optional but cleaner: **Settings → API Keys → Generate New API Key**, name it `basamanager-agents`, and use
   that pair, so you can revoke it after the test without touching your other projects.
3. **Settings → Security** → turn on **"Allow delivery of PDF and ZIP files"** → Save. Free accounts block PDF
   delivery by default, and receipts/statements are PDFs.

**Gotchas:** never paste the API Secret anywhere but the env file (it can delete every asset in the account).
The free plan gives 25 credits/month (1 credit ≈ 1 GB storage or bandwidth), which is far more than this app needs.

## 5. Resend (email)
1. resend.com → sign up (GitHub login is fine).
2. **API Keys → Create API key** → name `basamanager`, permission **Sending access**, domain: all
   (the domain doesn't exist yet) → copy → `RESEND_API_KEY`.

The agent adds the domain `notify.basamanager.rhrony05.me` in Resend and writes its SPF/DKIM DNS
records through your Cloudflare token. Until it's verified, Resend only delivers to **your own email**,
which is fine for the first tasks.

## 6. Google Cloud (Sign in with Google)
1. console.cloud.google.com → project picker → **New project** `BasaManager`.
2. **APIs & Services → OAuth consent screen** (newer UI: **Google Auth Platform → Branding**):
   - App name `BasaManager`, support email = yours, audience **External**.
   - Scopes: only `openid`, `email`, `profile` (the defaults, no sensitive scopes, so no Google review).
   - Leave it in **Testing**. Under **Audience → Test users** add your Gmail and any account you'll test with
     (max 100). In Testing mode, only these accounts can use Google login, which is exactly what we want.
3. **Credentials → Create credentials → OAuth client ID** → type **Web application**, name `basamanager-web`.
   - Authorized JavaScript origins:
     `http://localhost:5173`, `https://staging.basamanager.rhrony05.me`, `https://basamanager.rhrony05.me`
   - Authorized redirect URIs:
     `http://localhost:5173/api/auth/google/callback`
     `https://staging.basamanager.rhrony05.me/api/auth/google/callback`
     `https://basamanager.rhrony05.me/api/auth/google/callback`
4. Create → copy **Client ID** → `GOOGLE_OAUTH_CLIENT_ID`, **Client secret** → `GOOGLE_OAUTH_CLIENT_SECRET`.

**Gotcha:** a redirect URI must match *exactly* (scheme, host, path, no trailing slash) or Google
shows `redirect_uri_mismatch`. If the agents ever change the callback path, they must ask you to update it here.

## 7. Sentry (error monitoring — new for you)
What it is, in one line: when the app throws an error in production, Sentry records it with the stack
trace, the request, the user ID and the release, and emails you, so you don't have to hunt through logs.
1. sentry.io → sign up → plan **Developer (free)** → create an organization, e.g. `rhrony`.
   The org **slug** (in the URL `sentry.io/organizations/<slug>/`) → `SENTRY_ORG`.
2. **Settings → Developer Settings → Organization Tokens → Create New Token**, name `basamanager-agents`
   → copy it right away (shown only once) → `SENTRY_AUTH_TOKEN`. Its scope is fixed to `org:ci` and can't be
   edited. That's intended: it only lets CI create releases and upload source maps, nothing else.
3. Create the three projects yourself (about 5 minutes, and a good first look at Sentry). **Projects → Create
   Project** → choose **"Set up manually"**, not "Set up with your coding agent" (that installs an extra
   Sentry plugin into Claude Code and edits code, but this project uses a fixed tool set and the repo doesn't exist
   yet). Skip "Connect a repo" and ignore the SDK instructions shown after creating (the agents write that code):
   | Platform | Project name | DSN goes into |
   |---|---|---|
   | **React** | `basamanager-web` | `SENTRY_DSN_WEB` |
   | **Express** | `basamanager-api` | `SENTRY_DSN_API` |
   | **Node.js** | `basamanager-worker` | `SENTRY_DSN_WORKER` |
   Alert frequency: "Alert me on every new issue". The DSN is in each project's **Settings → Client Keys (DSN)**
   and looks like `https://<key>@o<org-id>.ingest.sentry.io/<project-id>`.

Why not let the agent create the projects? Organization tokens can't, and a personal token that can would
also have access to every other organisation and project on your account. This way the agents hold only the
narrow CI token. You'll get a first test error email from Sentry during the build. That's expected.

## 8. SSLCommerz (sandbox payments)
1. Go to **developer.sslcommerz.com** → **Sandbox registration** (check that the address bar shows an
   `sslcommerz.com` domain). It's a test store, so no trade licence or company is needed; register as yourself:
   - Application Domain / URL: `https://staging.basamanager.rhrony05.me` (it doesn't have to exist yet)
   - Company / Business Name: `BasaManager (sandbox)`
   - Business location: your own address. Contact info: your **real** email and phone (they verify the phone
     by OTP and email you the credentials). Don't invent details.
2. They email you a **Store ID** and **Store Password** (sometimes it takes from minutes up to a day,
   so do this one first). → `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD`.
3. The sandbox merchant panel login (also in that email) lets you look at test transactions. Keep it,
   but it doesn't go in the env file.

The test card numbers and the sandbox mobile banking flow are in their developer docs; the QA agent uses those.
The IPN URL (`https://staging…/api/payments/sslcommerz/ipn`) is sent with each payment request, so you
don't need to configure it in the panel.

## 9. UptimeRobot (optional)
uptimerobot.com → free account → **Integrations & API → Main API key** → `UPTIMEROBOT_API_KEY`.
The agent creates monitors for prod and staging `/health`, alerting your email.

---

## Generated by the agents (you do nothing)
JWT signing keys, cookie and CSRF secrets, Postgres and Redis passwords (separate per environment),
VAPID keys for web push, the VM's SSH deploy key, the local-storage URL secret, the Azure backup storage account and its SAS token. They're generated
with a cryptographic random generator and stored only in GitHub Environment secrets and the VPS
`.env` files (mode 600).

## Template — `D:\Projects\Project_credentials\BasaManager.env`
```dotenv
# Cloudflare
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ZONE_ID=
# Cloudinary (file storage)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
# Email
RESEND_API_KEY=
# Google OAuth
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
# Sentry
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_DSN_WEB=
SENTRY_DSN_API=
SENTRY_DSN_WORKER=
# SSLCommerz sandbox
SSLCOMMERZ_STORE_ID=
SSLCOMMERZ_STORE_PASSWORD=
# Optional
UPTIMEROBOT_API_KEY=
```

## Done check
Ask the lead agent to run `/project-config`. It reports ✅ present (length) / ❌ missing for every variable
and every CLI login. Fix the ❌ items, run it again, then paste the goal command.

## Cleanup after the test month
- [ ] Ask the DevOps agent to take a final backup and export it to your laptop, then **delete the Azure resource group** `rg-basamanager` (stops all charges).
- [ ] Cloudflare: delete the `basamanager` records (or let the agent do it), then **delete the API token**.
- [ ] Cloudinary: delete the `basamanager/` folder (Media Library) and revoke the `basamanager-agents` API key.
- [ ] Revoke: Resend API key, Sentry org token (and delete the 3 `basamanager-*` projects if you won't reuse them), Google OAuth client (or keep it in Testing), UptimeRobot monitors.
- [ ] `gh auth refresh` to drop the `delete_repo` scope if you added it.
- [ ] GitHub: delete the Environment secrets (`staging`, `production`) and the GHCR packages `basamanager-*` if you archive the repo; remove the deploy public key line from nothing else (the VM is deleted with the resource group).
- [ ] Azure: the backup storage account `bmbackupsf1f2c5bb` is inside `rg-basamanager`, so deleting the resource group removes it and the SAS token with it.
- [ ] Delete `BasaManager.env` or move it to an encrypted archive.
