# PCN Workbench

A Nuxt application for managing product change notifications. SQLite is the
only runtime source of truth. The application does not read, watch, import, or
synchronize spreadsheets.

## Setup

Requirements: Node.js 22 or newer and npm.

```bash
npm install
npm run dev
```

The app opens `data/pcn.db` by default. Set `PCN_DB_PATH` to use a different
SQLite file. The schema in `data/schema.sql` is verified when the server first
opens the database, but source data is never imported during startup.

Useful checks:

```bash
npm run typecheck
npm run build
sqlite3 data/pcn.db "PRAGMA integrity_check; PRAGMA foreign_key_check;"
```

## One-time source migration

The initial database has already been populated. The retained migration is for
development reproducibility only; the Nuxt application never calls it.

It accepts only:

- `source of truth/PCN From TI.csv`
- `source of truth/PCN From Delta.xlsx`

Run it in a Python environment with `openpyxl`:

```bash
uv run --with openpyxl python scripts/import_source_data.py
```

The normal command refuses to run once PCN data exists. To deliberately delete
and rebuild a development database, stop the app and explicitly run:

```bash
uv run --with openpyxl python scripts/import_source_data.py --reset
```

`--reset` prints the database path before deleting it. Never use it against a
production database. A committed migration writes `data/import-report.json`.

## Editing and calculated data

Create and edit PCNs from the web interface. Metadata, risk overrides, TI part
relationships, and Delta form workflow changes are written directly to SQLite.
Expected risk is calculated from `change_type.default_risk` unless the PCN has
an explicit `risk_override`. Dashboard values are live database queries, not
imported spreadsheet calculations.

## Backups

SQLite's online backup command creates a consistent copy even when WAL mode is
enabled:

```bash
mkdir -p backups
sqlite3 data/pcn.db ".backup 'backups/pcn-$(date +%Y%m%d-%H%M%S).db'"
```

Keep backups outside the application deployment and test restoration
periodically. To restore, stop the app, preserve the current database, place the
chosen backup at `data/pcn.db`, and run the integrity checks above before
restarting.
