#!/usr/bin/env bash
# Prepara la VM de desarrollo de Inventarius (Debian 13).
# Correr como root, una sola vez. Idempotente: se puede volver a correr sin romper nada.
# Instala desde repos APT oficiales con llave firmada (sin `curl | sh`):
#   Docker Engine + Compose, Node.js (NodeSource), GitHub CLI, utilidades base.
# Claude Code se instala aparte, como el usuario de trabajo (ver el final del script).
set -Eeuo pipefail

DEV_USER="${DEV_USER:-dev}"
NODE_MAJOR="${NODE_MAJOR:-26}"
KEYRINGS=/etc/apt/keyrings

log() { printf '\n==> %s\n' "$*"; }

[[ $EUID -eq 0 ]] || { echo "Correr como root"; exit 1; }
id "$DEV_USER" >/dev/null 2>&1 || { echo "No existe el usuario $DEV_USER"; exit 1; }

. /etc/os-release
CODENAME="${VERSION_CODENAME:?no se pudo detectar la versión de Debian}"

log "Paquetes base"
apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl gnupg git tmux jq unzip build-essential qemu-guest-agent
systemctl enable --now qemu-guest-agent
install -m 0755 -d "$KEYRINGS"

log "Repo de Docker ($CODENAME)"
if [[ ! -f $KEYRINGS/docker.asc ]]; then
  curl -fsSL https://download.docker.com/linux/debian/gpg -o "$KEYRINGS/docker.asc"
  chmod a+r "$KEYRINGS/docker.asc"
fi
echo "deb [arch=$(dpkg --print-architecture) signed-by=$KEYRINGS/docker.asc] https://download.docker.com/linux/debian $CODENAME stable" \
  > /etc/apt/sources.list.d/docker.list

log "Repo de Node.js $NODE_MAJOR (NodeSource)"
if [[ ! -f $KEYRINGS/nodesource.gpg ]]; then
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o "$KEYRINGS/nodesource.gpg"
fi
echo "deb [signed-by=$KEYRINGS/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
  > /etc/apt/sources.list.d/nodesource.list

log "Repo de GitHub CLI"
if [[ ! -f $KEYRINGS/githubcli-archive-keyring.gpg ]]; then
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o "$KEYRINGS/githubcli-archive-keyring.gpg"
  chmod a+r "$KEYRINGS/githubcli-archive-keyring.gpg"
fi
echo "deb [arch=$(dpkg --print-architecture) signed-by=$KEYRINGS/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  > /etc/apt/sources.list.d/github-cli.list

log "Instalando Docker, Node y gh"
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin nodejs gh

log "Docker para $DEV_USER (equivale a root dentro de la VM; aceptado porque la VM está aislada)"
usermod -aG docker "$DEV_USER"
systemctl enable --now docker

log "Logs de Docker con rotación"
cat > /etc/docker/daemon.json <<'JSON'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }
JSON
systemctl restart docker

log "corepack (pnpm según packageManager del repo)"
command -v corepack >/dev/null 2>&1 || npm install -g corepack
corepack enable

log "Versiones"
docker --version; docker compose version; node --version; gh --version | head -1

cat <<EOF

Listo. Pasos siguientes, como $DEV_USER (cerrar sesión y volver a entrar para tomar el grupo docker):
  1. Claude Code (instalador nativo, descargado y revisado antes de ejecutarlo):
       curl -fsSLo /tmp/claude-install.sh https://claude.ai/install.sh
       less /tmp/claude-install.sh
       bash /tmp/claude-install.sh
  2. gh auth login   (con el token fine-grained limitado al repo inventarius)
  3. git clone y arranque según KICKOFF.md
EOF
