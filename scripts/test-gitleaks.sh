#!/usr/bin/env bash
# Prueba las reglas de .gitleaks.toml: un archivo con cada patrón DEBE hacer fallar gitleaks, y los fixtures
# inventados de e2e/ y de *.test.ts NO. Los patrones se arman por partes para que este script no los contenga
# literales (si no, el propio repo fallaría). Los archivos de prueba se crean en un directorio temporal.
set -euo pipefail

GITLEAKS_VERSION="8.24.3"
IMAGE="ghcr.io/gitleaks/gitleaks:v${GITLEAKS_VERSION}"
ROOT="$(git rev-parse --show-toplevel)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/src" "$WORK/e2e/tests"

dot="."
sep="" # separador vacío: parte los hex para que el script no los contenga literales
# cada línea: id de la regla | contenido del archivo de prueba
declare -A CASES=(
  [red-privada-192-168]="const host = '192${dot}168${dot}1${dot}20';"
  [red-privada-10]="const host = '10${dot}1${dot}2${dot}3';"
  [dominio-supporti]="const url = 'https://app${dot}supporti${dot}cl';"
  [dominio-zensi]="const url = 'https://app${dot}zensi${dot}ai';"
  [lorawan-deveui-hex16]="const deveui = '70b3d57e${sep}d005a1c4';"
  [lorawan-appkey-hex32]="const appKey = '2b7e1516${sep}28aed2a6${sep}abf71588${sep}09cf4f3c';"
)

run() { # run <dir> <reporte>: devuelve el código de salida de gitleaks (1 = hallazgos)
  docker run --rm -v "$ROOT/.gitleaks.toml:/cfg/.gitleaks.toml:ro" -v "$1:/scan" -v "$WORK:/out" \
    "$IMAGE" dir /scan --config /cfg/.gitleaks.toml --no-banner --report-format json --report-path "/out/$2" >/dev/null 2>&1
}

fail=0
for id in "${!CASES[@]}"; do
  d="$WORK/case-$id"; mkdir -p "$d/src"
  printf '%s\n' "${CASES[$id]}" >"$d/src/ejemplo.ts"
  if run "$d" "r-$id.json"; then
    echo "FALLO: el patrón de $id no hizo fallar gitleaks"; fail=1
  elif ! grep -q "\"RuleID\": \"$id\"" "$WORK/r-$id.json"; then
    echo "FALLO: gitleaks falló pero no por la regla $id"; fail=1
  else
    echo "ok: $id detectada"
  fi
done

# Los fixtures inventados en e2e/ y en *.test.ts (hex de LoRaWAN) están permitidos.
ok="$WORK/permitido"; mkdir -p "$ok/e2e/tests" "$ok/src"
printf '%s\n' "${CASES[lorawan-deveui-hex16]}" "${CASES[lorawan-appkey-hex32]}" >"$ok/e2e/tests/fixture.ts"
printf '%s\n' "${CASES[lorawan-deveui-hex16]}" "${CASES[lorawan-appkey-hex32]}" >"$ok/src/dispositivo.test.ts"
if run "$ok" "r-permitido.json"; then
  echo "ok: fixtures de e2e/ y *.test.ts permitidos"
else
  echo "FALLO: los fixtures de e2e/ o *.test.ts no deberían fallar"; fail=1
fi

exit "$fail"
