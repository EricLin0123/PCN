# PCN Workbench data schema

The application uses SQLite as its sole runtime source of truth. Source
spreadsheets are not part of the running system.

## Normalized entity relationships

```mermaid
erDiagram
    CHANGE_TYPE ||--o{ PCN : classifies
    PCN ||--o{ PCN_TI_PART : affects
    TI_PART ||--o{ PCN_TI_PART : appears_in
    TI_PART ||--o| TI_PART_SBE1 : owned_by
    SBE1 ||--o{ TI_PART_SBE1 : owns
    TI_PART ||--o| TI_PART_SBE1_INFERENCE : records
    SBE1 ||--o{ TI_PART_SBE1_INFERENCE : inferred_as
    TI_PART ||--o| TI_PART_ORGANIZATION : classified_as
    SBE ||--o{ TI_PART_ORGANIZATION : contains
    SBE1 ||--o{ TI_PART_ORGANIZATION : contains
    SBE2 ||--o{ TI_PART_ORGANIZATION : contains

    PCN o|--o{ DELTA_FORM : matched_by_base
    DELTA_FORM ||--o{ DELTA_FORM_ITEM : contains
    DELTA_PART o|--o{ DELTA_FORM_ITEM : identifies

    PCN ||--o{ RISK_ASSESSMENT : has
    RISK_ASSESSMENT ||--o{ RISK_ASSESSMENT_TI_PART : covers
    TI_PART ||--o{ RISK_ASSESSMENT_TI_PART : assessed_by

    CHANGE_TYPE {
        INTEGER id PK
        TEXT name UK
        TEXT default_risk "MAJOR | MINOR | EOL | UNKNOWN"
    }

    PCN {
        INTEGER id PK
        TEXT pcn_number_base UK "normalized 11-digit TI PCN"
        TEXT notification_date
        TEXT title
        INTEGER change_type_id FK
        TEXT risk_override "optional manual override"
        TEXT notes
        TEXT created_at
        TEXT updated_at
    }

    TI_PART {
        INTEGER id PK
        TEXT normalized_part_number UK
        TEXT display_part_number
    }

    SBE1 {
        INTEGER id PK
        TEXT name UK
        TEXT champion_email "nullable when source is blank"
    }

    SBE {
        INTEGER id PK
        TEXT name UK
    }

    SBE2 {
        INTEGER id PK
        TEXT name UK
    }

    TI_PART_SBE1 {
        INTEGER ti_part_id PK,FK
        INTEGER sbe1_id FK
    }

    TI_PART_SBE1_INFERENCE {
        INTEGER ti_part_id PK,FK
        INTEGER sbe1_id FK
        TEXT reference_file
        TEXT matched_prefix
        INTEGER evidence_count
        TEXT inferred_at
    }

    TI_PART_ORGANIZATION {
        INTEGER ti_part_id PK,FK
        INTEGER sbe_id FK
        INTEGER sbe1_id FK
        INTEGER sbe2_id FK
        TEXT source_file
        TEXT source_sheet
        INTEGER source_row
        TEXT updated_at
    }

    PCN_TI_PART {
        INTEGER pcn_id PK,FK
        INTEGER ti_part_id PK,FK
    }

    DELTA_FORM {
        INTEGER id PK
        INTEGER pcn_id FK "nullable when unmatched"
        TEXT delta_pcn_number_base "normalized 11-digit base"
        TEXT delta_pcn_number_raw "complete value with suffix"
        TEXT delta_pcn_suffix ".1, .1A, group notation, etc."
        TEXT form_no UK
        TEXT apply_date
        TEXT notify "MAJOR | MINOR"
        TEXT form_status "CANCEL | PROCESSING | REJECT | COMPLETE"
        TEXT main_change_reason
        INTEGER total_pns
        INTEGER source_row
        TEXT created_at
        TEXT updated_at
    }

    DELTA_PART {
        INTEGER id PK
        TEXT normalized_part_number UK
        TEXT display_part_number
    }

    DELTA_FORM_ITEM {
        INTEGER id PK
        INTEGER delta_form_id FK
        INTEGER sequence_number
        INTEGER delta_part_id FK "nullable"
        TEXT ti_part_number
        TEXT ti_part_number_normalized
        TEXT raw_line
        TEXT parse_status "PARSED | UNRESOLVED"
    }

    RISK_ASSESSMENT {
        INTEGER id PK
        TEXT ra_number UK
        INTEGER pcn_id FK "one PCN per RA"
        TEXT pcn_number_base
        TEXT workbook_filename
        INTEGER source_row
        TEXT created_at
        TEXT updated_at
    }

    RISK_ASSESSMENT_TI_PART {
        INTEGER risk_assessment_id PK,FK
        INTEGER ti_part_id PK,FK
    }
```

## Calculated operational model

The dashboard does not store spreadsheet-derived status columns. SQLite views
calculate them from normalized facts whenever the application queries them.

```mermaid
flowchart LR
    PCN[(pcn)]
    CT[(change_type)]
    PTP[(pcn_ti_part)]
    TP[(ti_part)]
    DF[(delta_form)]
    DFI[(delta_form_item)]
    RA[(risk_assessment)]
    RAP[(risk_assessment_ti_part)]

    UPLOAD[[pcn_upload_coverage]]
    OPS[[pcn_operational_status]]
    RAC[[pcn_ra_coverage]]
    EXEC[[pcn_executive_status]]

    PCN --> UPLOAD
    PTP --> UPLOAD
    TP --> UPLOAD
    DF --> UPLOAD
    DFI --> UPLOAD

    PCN --> OPS
    CT --> OPS
    UPLOAD --> OPS
    DF --> OPS

    PCN --> RAC
    CT --> RAC
    UPLOAD --> RAC
    RA --> RAC
    RAP --> RAC

    PCN --> EXEC
    OPS --> EXEC
    RAC --> EXEC
    DF --> EXEC

    UPLOAD --> U1["All / partly / not uploaded"]
    OPS --> O1["Expected risk and Delta risk alignment"]
    RAC --> R1["NA / missing / partial / full RA"]
    EXEC --> E1["Executive owner, status, and action queue"]
```

## Important integrity rules

- A normalized TI PCN base is unique and contains exactly 11 digits.
- A PCN can affect many TI parts, and a TI part can appear in many PCNs.
- A TI part belongs to at most one SBE-1; each SBE-1 supplies a champion email
  used to request missing risk assessments. Unknown ownership and blank contact
  data remain null rather than being inferred.
- The BU contact list may be used to infer only missing ownership. An inference
  is accepted when its workbook product-family rule and a non-conflicting
  authoritative part-number prefix agree; existing assignments are preserved.
- A PCN can have many Delta forms while preserving each complete suffixed Delta
  PCN number.
- One risk assessment belongs to at most one PCN; one PCN can have many risk
  assessments.
- A risk assessment can cover multiple authoritative TI parts.
- Database triggers prevent an RA from covering a part outside its PCN and
  prevent removal of a TI relationship while an RA depends on it.
- Executive, upload, RA-coverage, and risk-alignment states are calculated rather
  than copied from Excel.
