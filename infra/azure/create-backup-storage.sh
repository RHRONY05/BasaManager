#!/usr/bin/env bash
# Creates the backup storage in rg-basamanager: Standard_LRS account, private container "backups", a lifecycle rule
# that deletes blobs older than 30 days, and a container-scoped SAS token valid for 60 days.
# Idempotent. The SAS is written to the file given as $1 (default: ./.backup-sas, git-ignored) and NEVER printed;
# put it into the GitHub environment secrets and the VM env files with infra/scripts/provision-secrets.sh.
# Cost: cents per month (a few hundred MB of dumps).
set -euo pipefail
RG="${RG:-rg-basamanager}"
LOCATION="${LOCATION:-indiasouthcentral}"
CONTAINER="backups"
OUT="${1:-.backup-sas}"
SUB_ID="$(az account show --query id -o tsv)"
ACCOUNT="${AZURE_BACKUP_ACCOUNT:-bmbackups$(printf '%s' "$SUB_ID" | tr -d '-' | cut -c1-8)}"  # globally unique, 3-24 lowercase

echo "== storage account $ACCOUNT"
if az storage account show -g "$RG" -n "$ACCOUNT" --query name -o tsv >/dev/null 2>&1; then
  echo "   exists"
else
  az storage account create -g "$RG" -n "$ACCOUNT" -l "$LOCATION" --sku Standard_LRS --kind StorageV2 \
    --access-tier Cool --min-tls-version TLS1_2 --allow-blob-public-access false \
    --tags project=basamanager -o none
  echo "   created"
fi

KEY="$(az storage account keys list -g "$RG" -n "$ACCOUNT" --query '[0].value' -o tsv)"

echo "== private container $CONTAINER"
az storage container create --account-name "$ACCOUNT" --account-key "$KEY" -n "$CONTAINER" --public-access off -o none
echo "   ok (public access: off)"

echo "== lifecycle rule (delete after 30 days)"
POLICY="$(mktemp)"
cat > "$POLICY" <<'JSON'
{ "rules": [ { "enabled": true, "name": "delete-backups-after-30-days", "type": "Lifecycle",
  "definition": {
    "filters": { "blobTypes": ["blockBlob"], "prefixMatch": ["backups/"] },
    "actions": { "baseBlob": { "delete": { "daysAfterModificationGreaterThan": 30 } } } } } ] }
JSON
az storage account management-policy create -g "$RG" --account-name "$ACCOUNT" --policy "@$POLICY" -o none
rm -f "$POLICY"
echo "   ok"

echo "== container SAS (create/write/read/list, 60 days) -> $OUT"
EXPIRY="$(date -u -d '+60 days' +%Y-%m-%dT%H:%MZ)"
az storage container generate-sas --account-name "$ACCOUNT" --account-key "$KEY" -n "$CONTAINER" \
  --permissions rlcw --expiry "$EXPIRY" --https-only -o tsv > "$OUT"
chmod 600 "$OUT"
echo "   SAS length $(wc -c < "$OUT") bytes, expires $EXPIRY"
echo "AZURE_BACKUP_ACCOUNT=$ACCOUNT"
