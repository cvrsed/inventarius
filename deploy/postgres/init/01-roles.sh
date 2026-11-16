#!/bin/bash
# Se ejecuta una sola vez, al inicializar el volumen de datos de Postgres (sección 10.1).
# Crea los dos usuarios: migrador (DDL, dueño de la BD) y app (solo DML, otorgado por la migración).
set -euo pipefail

: "${APP_DB_PASSWORD:?falta APP_DB_PASSWORD}"
: "${MIGRATOR_DB_PASSWORD:?falta MIGRATOR_DB_PASSWORD}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v app_pw="$APP_DB_PASSWORD" -v mig_pw="$MIGRATOR_DB_PASSWORD" <<'SQL'
CREATE ROLE inventarius_migrator LOGIN PASSWORD :'mig_pw';
CREATE ROLE inventarius_app LOGIN PASSWORD :'app_pw';
CREATE DATABASE inventarius OWNER inventarius_migrator;
SQL
