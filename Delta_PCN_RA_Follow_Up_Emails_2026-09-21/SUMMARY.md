# Delta PCN RA Follow-up Summary

Generated on 2026-09-21 from the AWS-synced database. Revenue window: 2025-10 through 2026-09.

Only exact PCN-part rows from the original `Delta_PCN_RA_PPAP_Emails` batch are reconciled. `FOLLOW_UP` uses the application pending-RA rule: rolling-12-month sales, MAJOR/MAJOR_D risk, no exact RA coverage, and not already uploaded to Delta.

| SBE-1 | Champion Email | Originally Requested | Acquired | Uploaded Without Mapped RA | Follow-up Rows | Follow-up PCNs | Follow-up Parts | Email File |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| ASM | mjaredwilson@ti.com | 9 | 3 | 0 | 6 | 5 | 6 | Delta_PCN_RA_Follow_Up_ASM.eml |
| CONNECT | g-sivakumar@ti.com | 1 | 0 | 0 | 1 | 1 | 1 | Delta_PCN_RA_Follow_Up_CONNECT.eml |
| DCC | m-chan1@ti.com | 24 | 5 | 0 | 19 | 4 | 18 | Delta_PCN_RA_Follow_Up_DCC.eml |
| HVP | d-snook@ti.com | 18 | 5 | 7 | 6 | 5 | 6 | Delta_PCN_RA_Follow_Up_HVP.eml |
| INT | s-rameshbabu2@ti.com | 174 | 1 | 0 | 173 | 72 | 145 | Delta_PCN_RA_Follow_Up_INT.eml |
| IPP | v-trambadiya@ti.com | 2 | 1 | 0 | 1 | 1 | 1 | Delta_PCN_RA_Follow_Up_IPP.eml |
| LAMPS | tom.b@ti.com | 47 | 2 | 0 | 45 | 24 | 42 | Delta_PCN_RA_Follow_Up_LAMPS.eml |
| LP | j-caton@ti.com | 60 | 0 | 0 | 60 | 35 | 52 | Delta_PCN_RA_Follow_Up_LP.eml |
| MD |  | 1 | 0 | 0 | 1 | 1 | 1 | Delta_PCN_RA_Follow_Up_MD.eml |
| MSP | 2WYO@ti.com | 9 | 0 | 0 | 9 | 3 | 8 | Delta_PCN_RA_Follow_Up_MSP.eml |
| PROCESSORS | jhelber@ti.com | 3 | 1 | 0 | 2 | 1 | 2 | Delta_PCN_RA_Follow_Up_PROCESSORS.eml |
| SENSING | rye@ti.com | 26 | 0 | 0 | 26 | 8 | 25 | Delta_PCN_RA_Follow_Up_SENSING.eml |
| SR | aten-li@ti.com | 19 | 7 | 0 | 12 | 9 | 10 | Delta_PCN_RA_Follow_Up_SR.eml |

- Original requested PCN-part rows: 393
- Exact RA coverage acquired: 25
- Uploaded to Delta without mapped RA: 7
- No longer eligible: 0
- Actionable follow-up rows: 361
- Follow-up email files: 13

See `RECONCILIATION.csv` for every original requested row, its current status, and any mapped RA number/workbook.
