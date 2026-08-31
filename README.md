# PCN Workbench

Local PCN tracking application for Windows. The application runs on your own
laptop and stores changes in the included SQLite database. It does not require
a shared server or access to the original Excel files.

## 1. Bring up the application

### Install the prerequisites

Install these once:

1. [Git for Windows](https://git-scm.com/download/win)
2. [Node.js 24 LTS](https://nodejs.org/en/download)

Use the default installation options. Restart Windows after installation if the
commands below are not recognized.

### Download the application

Open **PowerShell**, then run:

```powershell
cd $HOME\Documents
git clone https://github.com/EricLin0123/PCN.git
cd PCN
```

### TI colleagues: connect to VPN and configure the proxy

Before installing packages, make sure the TI company VPN is connected. Then run:

```powershell
npm config set proxy http://webproxy.ext.ti.com:80
npm config set https-proxy http://webproxy.ext.ti.com:80
```

Package installation may fail if the VPN is disconnected or the proxy has not
been configured.

### Install the application packages

Run this once after cloning:

```powershell
npm install
```

The application uses `data/pcn.db` automatically. Login is disabled by default
for `npm run dev`, so local development remains frictionless.

### Enable operator/admin login

Authentication is enabled by default in a production build. To exercise it in
development, copy `.env.example` to `.env`, replace both passwords, and start
the app. The local `.env` is ignored by Git and must never be committed.

The two accounts are created only if their usernames do not already exist;
restarting does not overwrite an existing password. Passwords are stored as
scrypt hashes. Operators can use every workflow except confirming a CSC upload,
which is restricted to admins. Sessions expire after 12 hours.

### Start the application

From the `PCN` folder, run:

```powershell
npm run dev
```

Wait until PowerShell displays a local address, normally:

```text
http://localhost:3000
```

Open that address in Edge or Chrome. Keep the PowerShell window open while
using the application. To stop it, return to PowerShell and press **Ctrl+C**.

### Start it again later

Open PowerShell and run:

```powershell
cd $HOME\Documents\PCN
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## 2. Application screenshots

### PCN records

![PCN records table](img/dashboard.PNG)

### Overview dashboard

![PCN overview dashboard](img/overview.PNG)

## 3. Data architecture

PCN Workbench uses a normalized SQLite schema with calculated operational views.
The detailed reference is also available in [docs/data-schema.md](docs/data-schema.md).

### Normalized entity relationships

```mermaid
erDiagram
    CHANGE_TYPE ||--o{ PCN : classifies
    PCN ||--o{ PCN_TI_PART : affects
    TI_PART ||--o{ PCN_TI_PART : appears_in
    PCN o|--o{ DELTA_FORM : matched_by_base
    DELTA_FORM ||--o{ DELTA_FORM_ITEM : contains
    DELTA_PART o|--o{ DELTA_FORM_ITEM : submitted_as
    DELTA_PART ||--o| DELTA_TI_PART_MAPPING : maps
    TI_PART ||--o{ DELTA_TI_PART_MAPPING : supplied_as
    PCN ||--o{ RISK_ASSESSMENT : has
    RISK_ASSESSMENT ||--o{ RISK_ASSESSMENT_TI_PART : covers
    TI_PART ||--o{ RISK_ASSESSMENT_TI_PART : assessed_by
    TI_PART ||--o| TI_PART_ORGANIZATION : assigned_to
    SBE ||--o{ TI_PART_ORGANIZATION : groups
    SBE1 ||--o{ TI_PART_ORGANIZATION : groups
    SBE2 ||--o{ TI_PART_ORGANIZATION : groups
    TI_PART ||--o| TI_PART_SBE1 : owns
    SBE1 ||--o{ TI_PART_SBE1 : owns
    TI_PART ||--o| TI_PART_SBE1_INFERENCE : inferred_for
    SBE1 ||--o{ TI_PART_SBE1_INFERENCE : inferred_owner

    CHANGE_TYPE {
        INTEGER id PK
        TEXT name UK
        TEXT default_risk
    }
    RISK_TITLE_RULE {
        INTEGER id PK
        TEXT title_contains UK
        TEXT expected_risk
        INTEGER priority
        INTEGER enabled
    }
    PCN {
        INTEGER id PK
        TEXT pcn_number_base UK
        INTEGER change_type_id FK
        TEXT risk_override
    }
    TI_PART {
        INTEGER id PK
        TEXT normalized_part_number UK
        TEXT display_part_number
    }
    PCN_TI_PART {
        INTEGER pcn_id PK,FK
        INTEGER ti_part_id PK,FK
    }
    DELTA_FORM {
        INTEGER id PK
        INTEGER pcn_id FK
        TEXT delta_pcn_number_base
        TEXT delta_pcn_suffix
        TEXT form_no UK
        TEXT form_status
    }
    DELTA_FORM_ITEM {
        INTEGER id PK
        INTEGER delta_form_id FK
        INTEGER delta_part_id FK
        TEXT ti_part_number_normalized
        TEXT raw_line
        TEXT parse_status
    }
    DELTA_PART {
        INTEGER id PK
        TEXT normalized_part_number UK
        TEXT display_part_number
    }
    DELTA_TI_PART_MAPPING {
        INTEGER delta_part_id PK,FK
        INTEGER ti_part_id FK
        TEXT source_file
        TEXT source_sheet
        INTEGER source_row
    }
    RISK_ASSESSMENT {
        INTEGER id PK
        TEXT ra_number UK
        INTEGER pcn_id FK
        TEXT workbook_filename
    }
    RISK_ASSESSMENT_TI_PART {
        INTEGER risk_assessment_id PK,FK
        INTEGER ti_part_id PK,FK
    }
    TI_PART_ORGANIZATION {
        INTEGER ti_part_id PK,FK
        INTEGER sbe_id FK
        INTEGER sbe1_id FK
        INTEGER sbe2_id FK
        TEXT source_file
    }
    TI_PART_SBE1 {
        INTEGER ti_part_id PK,FK
        INTEGER sbe1_id FK
    }
    TI_PART_SBE1_INFERENCE {
        INTEGER ti_part_id PK,FK
        INTEGER sbe1_id FK
        TEXT matched_prefix
        INTEGER evidence_count
    }
    SBE {
        INTEGER id PK
        TEXT name UK
    }
    SBE1 {
        INTEGER id PK
        TEXT name UK
        TEXT champion_email
    }
    SBE2 {
        INTEGER id PK
        TEXT name UK
    }
    MATERIAL_MONTH_REVENUE {
        TEXT normalized_part_number PK
        TEXT revenue_month PK
        REAL net_revenue
        TEXT source_file
        TEXT source_sheet
    }
```

`material_month_revenue` is intentionally keyed by normalized material and month
without a foreign key, so the complete revenue source can be retained. Delta form
items preserve submitted historical text; `delta_ti_part_mapping` holds the
authoritative current relationship from `TexasPN_20260827.xlsx`.

### Data and calculation pipeline

```mermaid
flowchart TB
    subgraph Sources[Source workbooks]
        TI["PCN From TI.xlsx"]
        DELTA["PCN From Delta.xlsx"]
        MAP["TexasPN_20260827.xlsx<br/>A: Delta PN · E: TI PN"]
        REV["Step 6 revenue workbook"]
        OWNER["Organization and SBE workbooks"]
        RAINDEX["main.xlsx · RA index"]
    end

    subgraph Importers[Validated import and normalization]
        BASE["import_source_data.py"]
        MAPPER["import_delta_ti_mapping.mjs"]
        REVENUE["import_material_revenue.mjs"]
        ORG["organization and SBE importers"]
        RAIMPORT["import_ra_index.py"]
    end

    subgraph SQLite[SQLite source of truth · data/pcn.db]
        CORE[("pcn · ti_part · pcn_ti_part")]
        FORMS[("delta_form · delta_form_item")]
        AUTHMAP[("delta_part · delta_ti_part_mapping")]
        RISK[("change_type · risk_title_rule")]
        ASSESS[("risk_assessment · assessment parts")]
        SUPPORT[("organization · ownership · revenue")]
    end

    subgraph Views[Calculated SQL views]
        EXPECTED[[pcn_expected_risk]]
        UPLOAD[[pcn_upload_coverage]]
        DELTASTATUS[[pcn_delta_status]]
        OPS[[pcn_operational_status]]
        RAC[[pcn_ra_coverage]]
        EXEC[[pcn_executive_status]]
    end

    UI["Nitro API routes → Nuxt pages and Excel export"]

    TI --> BASE
    DELTA --> BASE
    MAP --> MAPPER
    REV --> REVENUE
    OWNER --> ORG
    RAINDEX --> RAIMPORT
    BASE --> CORE
    BASE --> FORMS
    MAPPER --> AUTHMAP
    MAPPER --> CORE
    REVENUE --> SUPPORT
    ORG --> SUPPORT
    RAIMPORT --> ASSESS
    CORE --> UPLOAD
    FORMS --> UPLOAD
    AUTHMAP --> UPLOAD
    RISK --> EXPECTED
    FORMS --> DELTASTATUS
    EXPECTED --> OPS
    UPLOAD --> OPS
    FORMS --> OPS
    CORE --> RAC
    ASSESS --> RAC
    OPS --> EXEC
    RAC --> EXEC
    DELTASTATUS --> EXEC
    CORE --> UI
    FORMS --> UI
    AUTHMAP --> UI
    SUPPORT --> UI
    ASSESS --> UI
    OPS --> UI
    DELTASTATUS --> UI
    EXEC --> UI
```

The application runs `data/schema.sql` whenever it opens SQLite. The idempotent
schema creates missing objects and recreates calculated views. Upload coverage
includes only authoritative TI parts present in `delta_ti_part_mapping`; receipt
is confirmed by a Delta form item containing the mapped Delta material. Expected
risk precedence is manual override, enabled title rule, then change-type default.

## Back up your data

Each laptop has its own independent database. Changes made by one person do not
appear on another person's laptop.

Stop the application before making a backup. Then run:

```powershell
cd $HOME\Documents\PCN
New-Item -ItemType Directory -Force backups
Copy-Item data\pcn.db "backups\pcn-$(Get-Date -Format yyyyMMdd-HHmmss).db"
```

Keep important backup files somewhere outside the repository as well.

## Optional environment setting

No environment configuration is required. Advanced users can place the database
elsewhere for the current PowerShell session:

```powershell
$env:PCN_DB_PATH = "C:\PCN-Data\pcn.db"
npm run dev
```

The target database must already contain the PCN data. Do not point multiple
computers at the same SQLite file on a network drive.

## Troubleshooting

### `git` is not recognized

Install Git for Windows, close PowerShell, and open it again.

### `npm` or `node` is not recognized

Install Node.js 24 LTS, close PowerShell, and open it again.

### Port 3000 is already in use

Run the application on another port:

```powershell
$env:PORT = "3001"
npm run dev
```

Then open [http://localhost:3001](http://localhost:3001).

### The application was closed accidentally

Your saved changes remain in `data\pcn.db`. Start the application again using
the instructions above.

## Important notes

- SQLite is the only runtime source of truth.
- The application does not import or synchronize Excel/CSV files.
- TI affected parts are read-only.
- Do not delete or replace `data/pcn.db` without keeping a backup.
- Do not run `git pull` after entering new data unless you have first backed up
  `data/pcn.db`; database changes can conflict with repository updates.
