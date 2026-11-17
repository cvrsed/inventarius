#!/usr/bin/env bash
# Ejecuta gitleaks con la versión fijada, en contenedor (CLAUDE.md: lo que necesite paquetes del sistema corre en Docker).
#   scripts/gitleaks.sh staged     revisa lo que está en el índice (pre-commit)
#   scripts/gitleaks.sh history    revisa todo el historial de todas las ramas
#   scripts/gitleaks.sh <args...>  pasa los argumentos tal cual a gitleaks
# Si hay un binario `gitleaks` de la misma versión en el PATH se usa en lugar de Docker.
set -euo pipefail

GITLEAKS_VERSION="8.24.3"
IMAGE="ghcr.io/gitleaks/gitleaks:v${GITLEAKS_VERSION}"
ROOT="$(git rev-parse --show-toplevel)"
CONFIG="${GITLEAKS_CONFIG:-.gitleaks.toml}"

case "${1:-staged}" in
  staged) args=(git --staged --pre-commit --redact --no-banner --config "$CONFIG") ;;
  history) args=(git --log-opts="--all" --redact --no-banner --config "$CONFIG") ;;
  *) args=("$@") ;;
esac

if command -v gitleaks >/dev/null 2>&1 && gitleaks version 2>/dev/null | grep -q "$GITLEAKS_VERSION"; then
  cd "$ROOT"
  exec gitleaks "${args[@]}"
fi

exec docker run --rm -v "$ROOT:/repo" -w /repo "$IMAGE" "${args[@]}"
