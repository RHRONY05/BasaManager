#!/usr/bin/env bash
# Prints the env file for one environment to stdout. Values come from the CALLER'S environment (in CI: the GitHub
# Environment secrets; on a laptop: whatever you exported). Nothing is read from disk, nothing is echoed to a log.
#   render-env.sh staging|prod|edge | ssh deploy@vm 'umask 077; cat > /opt/basamanager/env/staging.env'
set -euo pipefail
TARGET="${1:?usage: render-env.sh staging|prod|edge}"

emit() { printf '%s=%s\n' "$1" "${!1:-}"; }

if [ "$TARGET" = edge ]; then
  echo "ACME_EMAIL=${ACME_EMAIL:-muhammadrony147@gmail.com}"
  exit 0
fi

case "$TARGET" in
  staging) APP_ENV=staging; APP_URL=https://staging.basamanager.rhrony05.me ;;
  prod)    APP_ENV=prod;    APP_URL=https://basamanager.rhrony05.me ;;
  *) echo "unknown target $TARGET" >&2; exit 1 ;;
esac

# Fail loudly (by NAME only) when a required value is missing.
for n in POSTGRES_PASSWORD BM_APP_PASSWORD BM_WORKER_PASSWORD BM_READONLY_PASSWORD REDIS_PASSWORD JWT_SECRET STORAGE_URL_SECRET; do
  [ -n "${!n:-}" ] || { echo "render-env: missing required value $n" >&2; exit 1; }
done

echo "ENV_NAME=$TARGET"
echo "APP_ENV=$APP_ENV"
echo "APP_URL=$APP_URL"
echo "LOG_LEVEL=info"
echo "POSTGRES_DB=basamanager_$TARGET"
echo "STORAGE_FOLDER=basamanager/$TARGET"
echo 'MAIL_FROM=BasaManager <no-reply@notify.basamanager.rhrony05.me>'
echo "VAPID_SUBJECT=mailto:muhammadrony147@gmail.com"
if [ -n "${RESEND_API_KEY:-}" ]; then echo "SMTP_URL=smtps://resend:${RESEND_API_KEY}@smtp.resend.com:465"; else echo "SMTP_URL="; fi
for n in POSTGRES_PASSWORD BM_APP_PASSWORD BM_WORKER_PASSWORD BM_READONLY_PASSWORD REDIS_PASSWORD \
  JWT_SECRET STORAGE_URL_SECRET SEED_PASSWORD VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY \
  CLOUDINARY_CLOUD_NAME CLOUDINARY_API_KEY CLOUDINARY_API_SECRET \
  GOOGLE_OAUTH_CLIENT_ID GOOGLE_OAUTH_CLIENT_SECRET SSLCOMMERZ_STORE_ID SSLCOMMERZ_STORE_PASSWORD \
  SENTRY_DSN_API SENTRY_DSN_WORKER SENTRY_DSN_WEB AZURE_BACKUP_ACCOUNT AZURE_BACKUP_SAS; do
  emit "$n"
done
