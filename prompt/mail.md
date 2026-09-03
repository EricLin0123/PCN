## Task: Generate 14 Outlook-Importable Emails Requesting RA and PPAP from SBE-1 Champions

I am preparing emails to the **SBE-1 champions** to request outstanding **Risk Assessment (RA)** and **PPAP** documents required for Delta PCNs.

### 1. Scope

Use the current PCN dataset/business logic to identify the required requests.

A part should be included when it has a **sales record within the past 12 months** and requires either:

- **RA** because it is associated with a **Major PCN**, or
- **PPAP** because it is an **automotive part** subject to Delta's automotive PCN requirements.

There are **16 SBE-1 organizations** in total.

**AUDIO** and **BMS** currently have no pending RA or PPAP requests, so no email is required for them.

Therefore, generate **14 separate emails**, one for each remaining SBE-1 organization that has at least one pending RA or PPAP item.

Before generating the emails, verify from the underlying data that each of these 14 SBE-1 organizations actually has an outstanding RA and/or PPAP request. Do not create an email for an SBE-1 with no actionable items.

---

## 2. Email Purpose and Tone

The emails should sound like they are written by a professional TI sales representative coordinating an important customer requirement.

The tone should be:

- Professional
- Concise
- Persuasive
- Respectful but firm
- Action-oriented

Avoid making the email sound like a generic administrative request.

Explain that **Delta is one of TI's worldwide Top 10 customers** and is actively requesting TI to complete the outstanding Product Change Notification (PCN) documentation and uploads in Delta's PCN management system.

Frame the request as an important customer commitment and cross-BU coordination item.

---

## 3. Briefly Refresh the Delta PCN Process

My manager has previously discussed the Delta PCN process with the SBE-1 champions, so this section should be a **brief refresher rather than a detailed tutorial**.

Explain the business logic approximately as follows, but rewrite it naturally and professionally:

- **Minor PCN:** generally follows the normal PCN notification/upload process.
- **Major PCN:** Delta requires additional **Risk Assessment (RA)** documentation before the PCN can be fully processed/accepted.
- **Automotive parts:** additional **PPAP documentation** may be required to support Delta's automotive quality/change-control process.
- Therefore, for the PCNs listed in this email, we need the corresponding RA and/or PPAP documents from the responsible SBE-1 team before we can complete the remaining Delta PCN actions.

Keep this explanation short because the recipients are already familiar with the overall process.

---

## 4. RA Request Table

For each SBE-1, if there are outstanding RA items, include an HTML table directly inside the email body.

At minimum, show:

| TI PCN Number | Part Number |
| ------------- | ----------- |

Include all applicable parts belonging to that SBE-1 that currently require RA.

If multiple parts belong to the same PCN, list them clearly. Do not accidentally omit or deduplicate distinct part numbers.

If that SBE-1 has **no RA requirement**, do not include an empty RA table. Instead, omit the RA section entirely.

---

## 5. PPAP Request Table

For each SBE-1, if there are outstanding PPAP items, include a second HTML table directly inside the email body.

At minimum, show:

| TI PCN Number | Automotive Part Number |
| ------------- | ---------------------- |

Include all applicable automotive parts belonging to that SBE-1 requiring PPAP.

If that SBE-1 has **no PPAP requirement**, omit the PPAP section entirely.

---

## 6. Template Requirement

Tell the recipients that the required **RA and PPAP templates will be attached to the email**.

I will manually attach these template files later, so **do not attempt to locate, generate, or attach the templates**.

Clearly communicate that the provided templates must be followed **strictly**.

Explain professionally that these are **Delta-standard templates applied consistently to its suppliers**, and following the required format helps Delta review and digest PCN information efficiently and avoids unnecessary back-and-forth or rejection caused by formatting/content differences.

Do not make this wording unnecessarily confrontational.

---

## 7. Call to Action

End each email with a clear request for the SBE-1 champion to:

1. Review the listed PCNs and parts under their organization.
2. Coordinate with the appropriate BU/product-line owner if necessary.
3. Complete the required RA and/or PPAP using the provided Delta template.
4. Return the completed documents to us so we can proceed with the Delta PCN submission.

Where appropriate, ask them to let me know if any listed ownership, part, or PCN information appears incorrect.

---

## 8. Personalize Each Email

Do **not** generate 14 identical emails with only the tables changed.

Personalize each email based on its actual situation:

- RA only → discuss only RA.
- PPAP only → discuss only PPAP.
- Both RA and PPAP → clearly separate the two requests.
- Adjust singular/plural wording according to the number of PCNs and parts involved.

Use the relevant **SBE-1 champion's name** as the greeting if the dataset contains it.

Do not invent recipient names, email addresses, ownership, PCN numbers, part numbers, or document requirements.

---

## 9. Subject Line

Use a concise and actionable subject line. For example:

**[Delta PCN Action Required] RA / PPAP Request – <SBE-1 Name>**

Adjust it according to the actual request:

- RA only: `[Delta PCN Action Required] RA Request – <SBE-1>`
- PPAP only: `[Delta PCN Action Required] PPAP Request – <SBE-1>`
- Both: `[Delta PCN Action Required] RA & PPAP Request – <SBE-1>`

---

## 10. File Output Requirements

Create a folder such as:

`Delta_PCN_RA_PPAP_Emails/`

Generate **one email file per SBE-1**, for a total of **14 email files**.

The files must be in a format that can be **imported/opened directly in Microsoft Outlook** while preserving:

- Subject
- Email body
- HTML formatting
- In-email tables
- Line breaks
- Professional formatting

Prefer **`.eml`** unless there is a technically better Outlook-compatible format available in the current environment.

Use safe, descriptive filenames such as:

`Delta_PCN_RA_PPAP_<SBE-1>.eml`

Do not send the emails. Only generate the files for my review and later manual use in Outlook.

---

## 11. Email Structure

Use approximately this structure for every email:

**Greeting**

**Opening / business importance**

- Delta is a worldwide Top 10 TI customer.
- Delta is requesting closure of outstanding PCN documentation.
- We need the SBE-1 team's support to complete the remaining items.

**Short Delta PCN process refresher**

- Major PCN → RA
- Automotive parts → PPAP
- Keep this concise because the process has already been discussed previously.

**RA required**

- Short introduction
- HTML RA table
- Omit if not applicable.

**PPAP required**

- Short introduction
- HTML PPAP table
- Omit if not applicable.

**Template requirement**

- Templates will be attached manually.
- Follow the Delta templates strictly.
- Explain why standardized formatting is important.

**Call to action**

- Complete and return the documents.
- Contact me if ownership/data appears incorrect or clarification is needed.

**Professional closing**

---

## 12. Validation Before Completion

Before considering the task complete, perform a consistency check:

- Exactly **14 emails** should be generated, assuming the current data confirms the expected 14 actionable SBE-1s.
- AUDIO and BMS should not receive emails if they have no pending items.
- Every RA row must correspond to a valid Major-PCN RA requirement.
- Every PPAP row must correspond to an applicable automotive part.
- Every listed part must have sales activity within the required past-12-month window.
- Each part must appear under the correct SBE-1.
- No fabricated PCN, part, champion, or recipient information.
- No empty RA or PPAP tables.
- No duplicate rows unless the underlying business logic genuinely requires them.
- HTML tables must render correctly when the `.eml` file is opened in Outlook.

Also generate a short summary showing:

| SBE-1 | RA PCNs | RA Parts | PPAP PCNs | PPAP Parts | Email File |
| ----- | ------: | -------: | --------: | ---------: | ---------- |

Use this summary as a final cross-check against the 14 generated email files.
