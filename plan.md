## Permanent database rule

The only source files are:

```text
source of truth/PCN From TI.csv
source of truth/PCN From Delta.xlsx
```

Use these files once during initial development to populate:

```text
data/pcn.db
```

After the initial migration:

- SQLite becomes the only source of truth.
- The application must never read, monitor or synchronize these files again.
- Do not build an Excel/CSV import page.
- Do not provide recurring import, refresh or synchronization features.
- All future PCN changes must be made through the web GUI and stored directly in SQLite.
- The running Nuxt application must not depend on `openpyxl`, pandas, Excel, CSV parsers or spreadsheet files.
- Spreadsheet-related Python packages are allowed only in the one-time development migration script.

Keep the migration script for reproducibility, but never call it from the web application.

## One-time data migration

Create:

```text
scripts/import_source_data.py
```

Use:

- Python’s built-in `csv` module for `PCN From TI.csv`
- `openpyxl` with `read_only=True` and `data_only=True` for `PCN From Delta.xlsx`

Do not use the previous combined correspondence workbook.

### Import only relevant columns

Inspect the actual headers first and map them by header name.

Only import columns needed by the database schema or business logic. Safely discard all unrelated columns.

### Relevant TI columns

Import only fields that provide:

- TI PCN number
- Notification/revision date
- PCN title
- TI Change Type
- TI orderable part number or Material
- Any field required to determine the PCN’s authoritative TI-affected parts

Use the TI source to populate:

```text
pcn
change_type
ti_part
pcn_ti_part
```

Do not import unrelated sold-to, reporting, formatting, temporary calculation or Excel-helper columns unless they are genuinely required by the schema.

Rules:

- Store PCN numbers as text.
- Require a normalized 11-digit PCN base.
- One TI PCN base should have one Change Type.
- If one PCN has conflicting Change Types, record a migration warning.
- Normalize TI parts using trimmed uppercase text.
- Preserve the original TI part-number display value.
- Create only one `pcn_ti_part` relationship per PCN and TI part.

### Relevant Delta columns

Import only fields that provide:

- Original Delta `PCN_NO`
- Delta form number
- Delta apply date
- Delta `NOTIFY`
- Delta `FORM_STATUS`
- Rejection reason or main change reason
- `TOTAL_PNS`
- `AFFECTED_PNS`
- Any source-row identifier needed to distinguish Delta forms

Use the Delta source to populate:

```text
delta_form
delta_part
delta_form_item
```

Safely discard unrelated Delta columns that are not used by the schema, matching logic, workflow calculations or GUI.

Normalize the Delta PCN base using:

```python
r"(?<!\d)(20\d{9})(?!\d)"
```

Preserve the complete original Delta PCN value in:

```text
delta_pcn_number_raw
```

Store any remaining suffix or group notation separately when possible.

Examples:

```text
20230707001.1
20230707001.2A
PCN20230707001.2(group 1)
```

must all normalize to:

```text
20230707001
```

### Parse Delta affected parts

Parse the multiline `AFFECTED_PNS` field.

Example:

```text
1 2510842614 LM25069PMMX-1/NOPB
```

Interpret as:

```text
sequence_number = 1
Delta part = 2510842614
TI part = LM25069PMMX-1/NOPB
```

Example:

```text
6 null ISO1430BDWR
```

Interpret as:

```text
sequence_number = 6
Delta part = NULL
TI part = ISO1430BDWR
```

Rules:

- Split by line breaks.
- Remove unnecessary quotes and whitespace.
- First token is the sequence number.
- Second token is the Delta internal material number.
- Remaining text is the TI part number.
- Do not split TI part numbers at `/`, `-` or other punctuation.
- Treat blank values and the text `null` as SQL `NULL`.
- Preserve the original line in `raw_line`.
- Compare the parsed line count with `TOTAL_PNS`.
- Record a warning when the counts differ.
- Preserve malformed lines as `UNRESOLVED`; do not silently discard them.

### Do not import derived Excel values

Do not import spreadsheet-calculated values such as:

- Overall upload status
- Expected risk
- RA requirement
- Primary workflow category
- Required action
- Risk agreement
- Material coverage
- Dashboard counts

Calculate these from normalized database facts.

Expected risk must come from:

```text
change_type.default_risk
```

or an explicit manual:

```text
pcn.risk_override
```

### Import behavior

Run the import inside one SQLite transaction.

The script must:

1. Create or verify the schema.
2. Confirm that both source files exist.
3. Inspect and validate required headers.
4. Read only relevant columns.
5. Normalize PCNs and part numbers.
6. Insert TI PCNs and authoritative TI-affected parts.
7. Insert Delta forms and form material lines.
8. Match Delta forms to PCNs by normalized base number.
9. Produce an import report.
10. Commit only when fatal validation checks pass.
11. Roll back the entire transaction on a fatal error.

The import report should show:

- TI source rows read
- Delta source rows read
- Unique PCN bases
- Unique TI parts
- Unique Delta parts
- PCN-to-TI-part relationships
- Delta forms created
- Delta form items created
- Delta-only PCN bases
- Invalid PCN numbers
- Conflicting TI Change Types
- `TOTAL_PNS` parsing mismatches
- Unresolved affected-part lines
- Duplicate records skipped

### Prevent accidental re-import

The script must refuse to import when the database already contains PCN data.

Do not implement automatic upsert or synchronization behavior for the MVP.

If a development reset is needed, require an explicit command such as:

```bash
python scripts/import_source_data.py --reset
```

The `--reset` option must clearly warn that it deletes the development database before rebuilding it.

Normal application startup must never execute this script.

## Revised implementation order

1. Create the Nuxt application.
2. Create the SQLite schema.
3. Create the one-time migration script.
4. Import only relevant fields from the two source files.
5. Validate the database and migration report.
6. Build server-side database queries.
7. Build the PCN list and detail/edit pages.
8. Build the dashboard.
9. Confirm all edits are saved directly to SQLite.
10. Confirm the application works after the entire `source of truth` folder is removed or made unavailable.
11. Add setup and backup instructions to the README.

## Additional completion criteria

The MVP is complete only when:

- `PCN From TI.csv` and `PCN From Delta.xlsx` have been loaded once.
- Unrelated source columns were not copied into the database.
- The web application works without access to either source file.
- There is no import or synchronization feature in the GUI.
- Application startup does not inspect or load spreadsheet files.
- All future edits use SQLite exclusively.
- Dashboard results are calculated from normalized database records.
