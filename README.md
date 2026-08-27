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

### One-time risk-assessment migration

The 184 reports in the `RA index` worksheet of `main.xlsx` were imported once
with:

```bash
uv run --with openpyxl python scripts/import_ra_index.py
```

This script is also development-only and is never called by Nuxt. It refuses to
run when RA data already exists. The explicit `--reset-ra` option deletes and
rebuilds only RA records and their part links. Its validation report is written
to `data/ra-import-report.json`.

Each risk assessment belongs to at most one PCN. A PCN can have multiple risk
assessments, and each assessment can cover one or more of that PCN's
authoritative TI parts. After this one-time migration, RA changes must be made
through the PCN detail page and are stored directly in SQLite; `main.xlsx` is
not a runtime data source.

## Editing and calculated data

Create and edit PCNs from the web interface. Metadata, risk overrides, risk
assessments, and Delta form workflow changes are written directly to SQLite.
Authoritative TI affected parts are read-only in the application.
Expected risk is calculated from `change_type.default_risk` unless the PCN has
an explicit `risk_override`. Dashboard values are live database queries, not
imported spreadsheet calculations.

### Operational PCN states

Upload state is calculated by comparing each PCN's authoritative TI parts with
the TI part numbers present on Delta forms having the same normalized PCN base:

- **All uploaded**: every authoritative TI part is represented on Delta.
- **Partly uploaded**: at least one, but not every, authoritative part is represented.
- **Not uploaded**: none of the authoritative parts are represented on Delta.

These calculations reproduce the `PCN upload status` worksheet totals without
reading `main.xlsx` at runtime. Expected risk follows the approved change-type
mapping in `scripts/import_source_data.py`; unlisted change types are marked
`UNKNOWN` for review. The risk-alignment state compares expected `MAJOR` or
`MINOR` risk with Delta `NOTIFY`, flags disagreements as `MISMATCH`, distinguishes
PCNs not seen on Delta, and treats EOL PCNs as not applicable.

Dashboard state cards link directly to the matching PCN list. Upload state,
expected risk, risk alignment, and Delta form status filters can be combined.

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
