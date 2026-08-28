# Repository Guidelines

## Start Here

This is a single Nuxt 4/Vue 3 application with Nitro API routes and SQLite. Before editing, run `git status --short` and preserve all existing changes; the worktree and database may contain recent user data not yet committed. Read `data/schema.sql` before changing risk, upload, RA, Delta-status, or executive logic.

SQLite is the runtime source of truth. Never rebuild, reset, or replace `data/pcn.db` during routine development. Back it up and test schema changes on an explicit copy under `/tmp`. The application executes `data/schema.sql` when opening the database, so schema changes must be idempotent and safe for populated databases.

## Project Map

- `app/pages/`: page UI; `pcns/index.vue` owns filtering and Excel export.
- `app/components/`: reusable badges and empty states.
- `app/assets/css/`: global, high-contrast, rectangular Excel-style presentation.
- `server/api/`: Nitro endpoints grouped by resource.
- `server/utils/db.ts`: shared SQLite connection and query helpers.
- `data/schema.sql`: tables, triggers, calculated views, and seeded title-risk rules.
- `data/pcn.db`: populated production dataset.
- `scripts/` and `source of truth/`: one-time migration/audit resources, never runtime inputs.

## Business Invariants

Derived states belong in SQL views, not editable UI fields. Manual risk override precedes title rules, which precede change-type defaults. Title rules are rows in `risk_title_rule`; `RBAF` currently means `MAJOR`. Delta status uses only the latest application per normalized suffix; differing current suffix statuses produce `MIXED`. Delta-received parts must remain a subset of authoritative TI parts, and missed parts are their set difference. RA parts must belong to the RA’s PCN.

## Commands and Validation

- `npm install`: install pinned dependencies.
- `npm run dev`: start at `http://localhost:3000`.
- `npm run typecheck`: validate Vue and TypeScript.
- `npm run build`: create the production Nitro build.
- `npm run preview`: serve the built application.

No automated test runner is configured. Every change must pass `npm run typecheck`, `npm run build`, and `git diff --check`. For database work, additionally run `PRAGMA integrity_check` and representative SQL checks against a copied database. If adding tests, use `tests/*.test.ts` and add `npm test` in the same change.

## Style and Reviews

Use two-space indentation, single-quoted TypeScript, semicolon-free style, Vue `<script setup>`, PascalCase components, and Nuxt file-based route naming. Keep changes narrowly scoped. Use imperative commit subjects such as `Add part-number search`. Pull requests should explain user-visible behavior, schema/data impact, validation performed, rollback steps, and include screenshots or sample workbooks when applicable. Never commit `.output/`, temporary databases, Excel lock files, or machine-specific paths.
