#!/usr/bin/env bash
# Creates the BasaManager VM and its network in resource group rg-basamanager.
# Idempotent: every resource is looked up first and only created when missing.
# Nothing outside rg-basamanager is read or changed. Requires: az login (Azure for Students).
#
# Usage: bash infra/azure/create-vm.sh
# Output: prints the public IP. Cost: Standard_B2s (~US$30/month) + a 64 GB StandardSSD disk + a static IP.
set -euo pipefail

RG="${RG:-rg-basamanager}"
LOCATION="${LOCATION:-indiasouthcentral}"   # the only allowed region that offers Standard_B2s (see PROGRESS.md)
VM="${VM:-vm-basamanager}"
SIZE="${SIZE:-Standard_B2s}"
PIP="${PIP:-pip-basamanager}"
NSG="${NSG:-nsg-basamanager}"
VNET="${VNET:-vnet-basamanager}"
SUBNET="${SUBNET:-snet-basamanager}"
ADMIN_USER="${ADMIN_USER:-azureuser}"
SSH_PUB="${SSH_PUB:-$HOME/.ssh/basamanager_ed25519.pub}"
TAGS="project=basamanager managed-by=infra/azure/create-vm.sh"

[ -f "$SSH_PUB" ] || { echo "SSH public key not found: $SSH_PUB" >&2; exit 1; }

exists() { az "$@" --query name -o tsv >/dev/null 2>&1; }

echo "== resource group $RG ($LOCATION)"
if [ "$(az group exists -n "$RG")" = "true" ]; then
  echo "   exists"
else
  az group create -n "$RG" -l "$LOCATION" --tags $TAGS -o none
  echo "   created"
fi

echo "== network security group $NSG"
if exists network nsg show -g "$RG" -n "$NSG"; then
  echo "   exists"
else
  az network nsg create -g "$RG" -n "$NSG" -l "$LOCATION" --tags $TAGS -o none
  echo "   created"
fi
# 22 stays open to the world but only accepts SSH keys (GitHub runners deploy from changing IPs).
add_rule() { # name priority port
  if exists network nsg rule show -g "$RG" --nsg-name "$NSG" -n "$1"; then
    echo "   rule $1 exists"
  else
    az network nsg rule create -g "$RG" --nsg-name "$NSG" -n "$1" --priority "$2" --direction Inbound \
      --access Allow --protocol Tcp --source-address-prefixes '*' --source-port-ranges '*' \
      --destination-address-prefixes '*' --destination-port-ranges "$3" -o none
    echo "   rule $1 created"
  fi
}
add_rule allow-ssh 1000 22
add_rule allow-http 1010 80
add_rule allow-https 1020 443

echo "== virtual network $VNET"
if exists network vnet show -g "$RG" -n "$VNET"; then
  echo "   exists"
else
  az network vnet create -g "$RG" -n "$VNET" -l "$LOCATION" --address-prefixes 10.20.0.0/16 \
    --subnet-name "$SUBNET" --subnet-prefixes 10.20.1.0/24 --network-security-group "$NSG" --tags $TAGS -o none
  echo "   created"
fi

echo "== static public IP $PIP"
if exists network public-ip show -g "$RG" -n "$PIP"; then
  echo "   exists"
else
  az network public-ip create -g "$RG" -n "$PIP" -l "$LOCATION" --sku Standard --allocation-method Static \
    --version IPv4 --tags $TAGS -o none
  echo "   created"
fi

echo "== VM $VM ($SIZE, Ubuntu 24.04)"
if exists vm show -g "$RG" -n "$VM"; then
  echo "   exists"
else
  az vm create -g "$RG" -n "$VM" -l "$LOCATION" --size "$SIZE" \
    --image Canonical:ubuntu-24_04-lts:server:latest \
    --admin-username "$ADMIN_USER" --ssh-key-values "$SSH_PUB" --authentication-type ssh \
    --os-disk-size-gb 64 --storage-sku StandardSSD_LRS \
    --vnet-name "$VNET" --subnet "$SUBNET" --nsg "$NSG" --public-ip-address "$PIP" \
    --tags $TAGS -o none
  echo "   created"
fi

IP="$(az network public-ip show -g "$RG" -n "$PIP" --query ipAddress -o tsv)"
echo "PUBLIC_IP=$IP"
