#!/usr/bin/env bash
# Prepares a fresh Ubuntu 24.04 VM for BasaManager. Run as root (sudo) on the VM; safe to run again.
#
#   scp -i ~/.ssh/basamanager_ed25519 infra/server/bootstrap.sh azureuser@<ip>:/tmp/
#   ssh -i ~/.ssh/basamanager_ed25519 azureuser@<ip> 'sudo bash /tmp/bootstrap.sh "$(cat ~/.ssh/authorized_keys)"'
#
# What it does: updates packages, 2 GB swap, ufw (22/80/443), fail2ban, SSH hardening (keys only, no root),
# unattended security upgrades, Docker Engine + Compose plugin, the `deploy` user and /opt/basamanager.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run with sudo" >&2; exit 1; }

DEPLOY_KEYS="${1:-}"   # authorized_keys content for the deploy user (public keys only)
export DEBIAN_FRONTEND=noninteractive

echo "== packages"
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq ca-certificates curl gnupg ufw fail2ban unattended-upgrades jq rsync cron \
  postgresql-client-16 >/dev/null

echo "== swap 2 GB"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
echo 'vm.swappiness=10' > /etc/sysctl.d/99-basamanager.conf
sysctl -q -p /etc/sysctl.d/99-basamanager.conf

echo "== timezone (cron times are Asia/Dhaka)"
timedatectl set-timezone Asia/Dhaka

echo "== docker"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
fi
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "5" }
}
JSON
systemctl enable --now docker
systemctl restart docker

echo "== deploy user"
if ! id deploy >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" deploy
fi
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
if [ -n "$DEPLOY_KEYS" ]; then
  printf '%s\n' "$DEPLOY_KEYS" | grep -E '^ssh-' | sort -u > /home/deploy/.ssh/authorized_keys
  chown deploy:deploy /home/deploy/.ssh/authorized_keys
  chmod 600 /home/deploy/.ssh/authorized_keys
fi
install -d -m 755 -o deploy -g deploy /opt/basamanager /opt/basamanager/releases
install -d -m 700 -o deploy -g deploy /opt/basamanager/env /opt/basamanager/state

echo "== ssh hardening"
cat > /etc/ssh/sshd_config.d/99-basamanager.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
MaxAuthTries 3
AllowUsers azureuser deploy
CONF
sshd -t
systemctl reload ssh

echo "== firewall (ufw)"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

echo "== fail2ban"
cat > /etc/fail2ban/jail.d/basamanager.local <<'CONF'
[sshd]
enabled = true
maxretry = 4
findtime = 10m
bantime = 1h
CONF
systemctl enable --now fail2ban
systemctl restart fail2ban

echo "== unattended upgrades"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF

echo "bootstrap done: $(docker --version), $(docker compose version)"
