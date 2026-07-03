#!/bin/sh
# Creates a dedicated database for n8n alongside the application database.
# Runs only on first startup of the postgres container (empty data volume).
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE n8n OWNER "$POSTGRES_USER";
EOSQL

echo "[init] Created n8n database"
