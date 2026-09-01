# How to use PCN Workbench

## 1. Start

Run `npm run dev`, open `http://localhost:3000`, and sign in if requested.

## 2. Find a PCN

- Use **PCN records** to search and filter by PCN, title, part, risk, status, or change type.
- Click a row to open the PCN details.
- Use **Executive summary** for items needing attention.
- Use **Parts** or **SBE** to look up ownership and organization information.

## 3. Read the statuses

- **Expected risk**: the risk level calculated for the PCN. A manual override takes priority.
- **Upload state**: **All uploaded** means every relevant part is present; **Partly uploaded** means some are present; **Not uploaded** means none are present.
- **Delta status**: the latest Delta result. **COMPLETE** is finished, **PROCESSING** is waiting, **REJECT** needs correction, **CANCEL** is cancelled, and **MIXED** means suffixes have different statuses.
- **Risk alignment**: **Match** means the Delta risk agrees with the expected risk; **Mismatch** needs review.
- **CSC verification**: records whether CSC has reported the upload and whether an admin has confirmed it.

## 4. Update information

Open a PCN to update editable details, Delta form information, risk assessments, or CSC upload information. Save each change and refresh the page to confirm it.

Use the Excel export on the PCN records page when a spreadsheet is needed. Treat the application and its displayed calculations as the current source of truth.
