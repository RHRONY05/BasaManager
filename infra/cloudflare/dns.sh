#!/usr/bin/env bash
# Creates the A records for BasaManager on Cloudflare (only names that start with "basamanager").
#   CLOUDFLARE_API_TOKEN / CLOUDFLARE_ZONE_ID must be in the environment (load them from the credentials file;
#   this script never prints them). Usage: bash infra/cloudflare/dns.sh <vm-public-ip>
#
# Safety rules (rules/basamanager.md): create only; an existing record is changed only when its comment says
# "basamanager" (i.e. this script made it); zone settings are READ, never written.
# Proxied (orange cloud) when the zone's SSL mode is full or strict AND the name is covered by Cloudflare's free
# Universal certificate (apex or one level: *.rhrony05.me). staging.basamanager.rhrony05.me and
# docs.basamanager.rhrony05.me are two levels deep, so the free edge certificate does not cover them
# (browsers would show a certificate error) -> those stay DNS-only and Caddy serves them directly.
# Otherwise DNS-only (grey cloud).
set -euo pipefail
IP="${1:?usage: dns.sh <ip>}"
: "${CLOUDFLARE_API_TOKEN:?}" "${CLOUDFLARE_ZONE_ID:?}"
API="https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID"
ZONE_NAME="rhrony05.me"
NAMES=("basamanager.$ZONE_NAME" "staging.basamanager.$ZONE_NAME" "docs.basamanager.$ZONE_NAME")

cf() { curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" "$@"; }
jqr() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(eval(process.argv[1]))})' "$1"; }

MODE="$(cf "$API/settings/ssl" | jqr 'j.result.value')"
case "$MODE" in full|strict) ZONE_PROXY=true ;; *) ZONE_PROXY=false ;; esac
echo "zone SSL mode (read only): $MODE -> proxy allowed=$ZONE_PROXY"

for NAME in "${NAMES[@]}"; do
  case "$NAME" in basamanager.*|*.basamanager.*) ;; *) echo "refusing $NAME" >&2; exit 1 ;; esac
  PREFIX="${NAME%.$ZONE_NAME}"
  if [ "$ZONE_PROXY" = true ] && [[ "$PREFIX" != *.* ]]; then PROXIED=true; else PROXIED=false; fi
  EXISTING="$(cf "$API/dns_records?name=$NAME" )"
  COUNT="$(printf '%s' "$EXISTING" | jqr 'j.result.length')"
  BODY="{\"type\":\"A\",\"name\":\"$NAME\",\"content\":\"$IP\",\"ttl\":1,\"proxied\":$PROXIED,\"comment\":\"basamanager (infra/cloudflare/dns.sh)\"}"
  if [ "$COUNT" = "0" ]; then
    cf -X POST "$API/dns_records" --data "$BODY" | jqr '"created " + j.result.name + " -> " + j.result.content + " proxied=" + j.result.proxied'
  else
    ID="$(printf '%s' "$EXISTING" | jqr 'j.result[0].id')"
    CMT="$(printf '%s' "$EXISTING" | jqr 'j.result[0].comment || ""')"
    case "$CMT" in
      basamanager*) cf -X PUT "$API/dns_records/$ID" --data "$BODY" | jqr '"updated " + j.result.name + " -> " + j.result.content + " proxied=" + j.result.proxied' ;;
      *) echo "SKIP $NAME: record exists and was not created by this script" ;;
    esac
  fi
done
