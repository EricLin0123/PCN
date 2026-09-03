export const pendingDocumentsCte = `
  WITH eligible AS (
    SELECT DISTINCT affected.pcn_id, affected.ti_part_id, organization.sbe1_id,
      lower(trim(COALESCE(part.industry, ''))) AS industry
    FROM pcn_ti_part affected
    JOIN ti_part part ON part.id = affected.ti_part_id
    JOIN ti_part_organization organization ON organization.ti_part_id = part.id
    JOIN material_month_revenue revenue ON revenue.normalized_part_number = part.normalized_part_number
    WHERE revenue.revenue_month BETWEEN strftime('%Y-%m', 'now', 'localtime', '-11 months')
      AND strftime('%Y-%m', 'now', 'localtime')
  ), pending AS (
    SELECT eligible.*, 'RA' AS document_type FROM eligible
    JOIN pcn_expected_risk risk ON risk.pcn_id = eligible.pcn_id
    WHERE risk.expected_risk IN ('MAJOR', 'MAJOR_D') AND NOT EXISTS (
      SELECT 1 FROM risk_assessment assessment
      JOIN risk_assessment_ti_part link ON link.risk_assessment_id = assessment.id
      WHERE assessment.pcn_id = eligible.pcn_id AND link.ti_part_id = eligible.ti_part_id
    )
    UNION ALL
    SELECT eligible.*, 'PPAP' AS document_type FROM eligible
    JOIN pcn_expected_risk risk ON risk.pcn_id = eligible.pcn_id
    WHERE risk.expected_risk IN ('MINOR', 'MAJOR') AND eligible.industry = 'automotive' AND NOT EXISTS (
      SELECT 1 FROM ppap document
      JOIN ppap_ti_part link ON link.ppap_id = document.id
      WHERE document.pcn_id = eligible.pcn_id AND link.ti_part_id = eligible.ti_part_id
    )
  )`
