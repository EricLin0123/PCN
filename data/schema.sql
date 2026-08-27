PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS change_type (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  default_risk TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (default_risk IN ('MAJOR', 'MINOR', 'EOL', 'UNKNOWN'))
);

CREATE TABLE IF NOT EXISTS pcn (
  id INTEGER PRIMARY KEY,
  pcn_number_base TEXT NOT NULL UNIQUE
    CHECK (length(pcn_number_base) = 11 AND pcn_number_base GLOB '20[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
  notification_date TEXT,
  title TEXT NOT NULL DEFAULT '',
  change_type_id INTEGER REFERENCES change_type(id),
  risk_override TEXT CHECK (risk_override IS NULL OR risk_override IN ('MAJOR', 'MINOR', 'UNKNOWN')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ti_part (
  id INTEGER PRIMARY KEY,
  normalized_part_number TEXT NOT NULL UNIQUE,
  display_part_number TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pcn_ti_part (
  pcn_id INTEGER NOT NULL REFERENCES pcn(id) ON DELETE CASCADE,
  ti_part_id INTEGER NOT NULL REFERENCES ti_part(id),
  PRIMARY KEY (pcn_id, ti_part_id)
);

CREATE TABLE IF NOT EXISTS delta_form (
  id INTEGER PRIMARY KEY,
  pcn_id INTEGER REFERENCES pcn(id),
  delta_pcn_number_base TEXT,
  delta_pcn_number_raw TEXT NOT NULL,
  delta_pcn_suffix TEXT,
  form_no TEXT NOT NULL UNIQUE,
  apply_date TEXT,
  notify TEXT,
  form_status TEXT,
  main_change_reason TEXT,
  total_pns INTEGER,
  source_row INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS delta_part (
  id INTEGER PRIMARY KEY,
  normalized_part_number TEXT NOT NULL UNIQUE,
  display_part_number TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS delta_form_item (
  id INTEGER PRIMARY KEY,
  delta_form_id INTEGER NOT NULL REFERENCES delta_form(id) ON DELETE CASCADE,
  sequence_number INTEGER,
  delta_part_id INTEGER REFERENCES delta_part(id),
  ti_part_number TEXT,
  ti_part_number_normalized TEXT,
  raw_line TEXT NOT NULL,
  parse_status TEXT NOT NULL DEFAULT 'PARSED'
    CHECK (parse_status IN ('PARSED', 'UNRESOLVED')),
  UNIQUE (delta_form_id, sequence_number, raw_line)
);

CREATE TABLE IF NOT EXISTS risk_assessment (
  id INTEGER PRIMARY KEY,
  ra_number TEXT NOT NULL UNIQUE,
  pcn_id INTEGER REFERENCES pcn(id) ON DELETE CASCADE,
  pcn_number_base TEXT NOT NULL,
  workbook_filename TEXT NOT NULL DEFAULT '',
  source_row INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS risk_assessment_ti_part (
  risk_assessment_id INTEGER NOT NULL REFERENCES risk_assessment(id) ON DELETE CASCADE,
  ti_part_id INTEGER NOT NULL REFERENCES ti_part(id),
  PRIMARY KEY (risk_assessment_id, ti_part_id)
);

CREATE INDEX IF NOT EXISTS idx_pcn_date ON pcn(notification_date DESC);
CREATE INDEX IF NOT EXISTS idx_pcn_change_type ON pcn(change_type_id);
CREATE INDEX IF NOT EXISTS idx_pcn_ti_part_part ON pcn_ti_part(ti_part_id);
CREATE INDEX IF NOT EXISTS idx_delta_form_pcn ON delta_form(pcn_id);
CREATE INDEX IF NOT EXISTS idx_delta_form_base ON delta_form(delta_pcn_number_base);
CREATE INDEX IF NOT EXISTS idx_delta_form_status ON delta_form(form_status);
CREATE INDEX IF NOT EXISTS idx_delta_item_form ON delta_form_item(delta_form_id);
CREATE INDEX IF NOT EXISTS idx_delta_item_ti_part ON delta_form_item(ti_part_number_normalized);
CREATE INDEX IF NOT EXISTS idx_risk_assessment_pcn ON risk_assessment(pcn_id);
CREATE INDEX IF NOT EXISTS idx_ra_ti_part_part ON risk_assessment_ti_part(ti_part_id);

CREATE TRIGGER IF NOT EXISTS enforce_ra_part_belongs_to_pcn
BEFORE INSERT ON risk_assessment_ti_part
WHEN NOT EXISTS (
  SELECT 1
  FROM risk_assessment ra
  JOIN pcn_ti_part pp ON pp.pcn_id = ra.pcn_id
  WHERE ra.id = NEW.risk_assessment_id AND pp.ti_part_id = NEW.ti_part_id
)
BEGIN
  SELECT RAISE(ABORT, 'RA part must be an authoritative TI affected part for its PCN');
END;

CREATE TRIGGER IF NOT EXISTS prevent_removing_ra_covered_part
BEFORE DELETE ON pcn_ti_part
WHEN EXISTS (
  SELECT 1
  FROM risk_assessment ra
  JOIN risk_assessment_ti_part rp ON rp.risk_assessment_id = ra.id
  WHERE ra.pcn_id = OLD.pcn_id AND rp.ti_part_id = OLD.ti_part_id
)
BEGIN
  SELECT RAISE(ABORT, 'TI part is covered by a risk assessment');
END;

CREATE VIEW IF NOT EXISTS pcn_upload_coverage AS
SELECT
  p.id AS pcn_id,
  count(pp.ti_part_id) AS total_parts,
  sum(CASE WHEN EXISTS (
    SELECT 1
    FROM delta_form df
    JOIN delta_form_item dfi ON dfi.delta_form_id = df.id
    WHERE df.delta_pcn_number_base = p.pcn_number_base
      AND dfi.ti_part_number_normalized = tp.normalized_part_number
  ) THEN 1 ELSE 0 END) AS uploaded_parts,
  CASE
    WHEN sum(CASE WHEN EXISTS (
      SELECT 1 FROM delta_form df
      JOIN delta_form_item dfi ON dfi.delta_form_id = df.id
      WHERE df.delta_pcn_number_base = p.pcn_number_base
        AND dfi.ti_part_number_normalized = tp.normalized_part_number
    ) THEN 1 ELSE 0 END) = 0 THEN 'NOT_UPLOADED'
    WHEN sum(CASE WHEN EXISTS (
      SELECT 1 FROM delta_form df
      JOIN delta_form_item dfi ON dfi.delta_form_id = df.id
      WHERE df.delta_pcn_number_base = p.pcn_number_base
        AND dfi.ti_part_number_normalized = tp.normalized_part_number
    ) THEN 1 ELSE 0 END) < count(pp.ti_part_id) THEN 'PARTLY_UPLOADED'
    ELSE 'ALL_UPLOADED'
  END AS upload_state
FROM pcn p
LEFT JOIN pcn_ti_part pp ON pp.pcn_id = p.id
LEFT JOIN ti_part tp ON tp.id = pp.ti_part_id
GROUP BY p.id;

CREATE VIEW IF NOT EXISTS pcn_operational_status AS
SELECT
  p.id AS pcn_id,
  coverage.total_parts,
  coverage.uploaded_parts,
  coverage.upload_state,
  COALESCE(p.risk_override, ct.default_risk, 'UNKNOWN') AS expected_risk,
  (SELECT group_concat(risk, ', ')
   FROM (SELECT DISTINCT upper(df.notify) AS risk
         FROM delta_form df
         WHERE df.delta_pcn_number_base = p.pcn_number_base
           AND upper(df.notify) IN ('MAJOR', 'MINOR')
         ORDER BY risk)) AS delta_risks,
  CASE
    WHEN COALESCE(p.risk_override, ct.default_risk, 'UNKNOWN') = 'EOL' THEN 'NOT_APPLICABLE'
    WHEN COALESCE(p.risk_override, ct.default_risk, 'UNKNOWN') NOT IN ('MAJOR', 'MINOR') THEN 'REVIEW'
    WHEN NOT EXISTS (SELECT 1 FROM delta_form df WHERE df.delta_pcn_number_base = p.pcn_number_base) THEN 'NOT_ON_DELTA'
    WHEN EXISTS (
      SELECT 1 FROM delta_form df
      WHERE df.delta_pcn_number_base = p.pcn_number_base
        AND upper(COALESCE(df.notify, '')) IN ('MAJOR', 'MINOR')
        AND upper(df.notify) <> COALESCE(p.risk_override, ct.default_risk, 'UNKNOWN')
    ) THEN 'MISMATCH'
    ELSE 'MATCH'
  END AS risk_alignment
FROM pcn p
LEFT JOIN change_type ct ON ct.id = p.change_type_id
JOIN pcn_upload_coverage coverage ON coverage.pcn_id = p.id;

CREATE VIEW IF NOT EXISTS pcn_ra_coverage AS
SELECT
  p.id AS pcn_id,
  coverage.total_parts,
  count(DISTINCT rp.ti_part_id) AS ra_covered_parts,
  CASE
    WHEN COALESCE(p.risk_override, ct.default_risk, 'UNKNOWN') <> 'MAJOR' THEN 'NA'
    WHEN count(DISTINCT rp.ti_part_id) = 0 THEN 'MISS_ALL_RA'
    WHEN count(DISTINCT rp.ti_part_id) < coverage.total_parts THEN 'PARTLY_MISS_RA'
    ELSE 'FULL_RA'
  END AS ra_state
FROM pcn p
LEFT JOIN change_type ct ON ct.id = p.change_type_id
JOIN pcn_upload_coverage coverage ON coverage.pcn_id = p.id
LEFT JOIN risk_assessment ra ON ra.pcn_id = p.id
LEFT JOIN risk_assessment_ti_part rp ON rp.risk_assessment_id = ra.id
GROUP BY p.id;

CREATE VIEW IF NOT EXISTS pcn_executive_status AS
SELECT
  p.id AS pcn_id,
  CASE
    WHEN EXISTS (SELECT 1 FROM delta_form df WHERE df.pcn_id = p.id AND upper(df.form_status) = 'REJECT') THEN 'REJECTED'
    WHEN ops.expected_risk = 'EOL' THEN 'EOL_EXCLUDED'
    WHEN ops.upload_state <> 'ALL_UPLOADED' AND ops.expected_risk = 'MINOR' THEN 'MINOR_READY_UPLOAD'
    WHEN ops.upload_state <> 'ALL_UPLOADED' AND ops.expected_risk = 'MAJOR' AND rac.ra_state <> 'FULL_RA' THEN 'MAJOR_BLOCKED_RA'
    WHEN ops.upload_state <> 'ALL_UPLOADED' AND ops.expected_risk = 'MAJOR' AND rac.ra_state = 'FULL_RA' THEN 'MAJOR_READY_UPLOAD'
    WHEN ops.upload_state = 'ALL_UPLOADED'
      AND EXISTS (SELECT 1 FROM delta_form df WHERE df.pcn_id = p.id AND upper(df.form_status) = 'PROCESSING')
      AND ops.expected_risk = 'MINOR' THEN 'MINOR_PENDING_APPROVAL'
    WHEN ops.upload_state = 'ALL_UPLOADED'
      AND EXISTS (SELECT 1 FROM delta_form df WHERE df.pcn_id = p.id AND upper(df.form_status) = 'PROCESSING')
      AND ops.expected_risk = 'MAJOR' THEN 'MAJOR_PENDING_APPROVAL'
    WHEN ops.upload_state = 'ALL_UPLOADED'
      AND NOT EXISTS (SELECT 1 FROM delta_form df WHERE df.pcn_id = p.id AND upper(df.form_status) IN ('PROCESSING', 'REJECT'))
      AND EXISTS (SELECT 1 FROM delta_form df WHERE df.pcn_id = p.id AND upper(df.form_status) = 'COMPLETE') THEN 'COMPLETED'
    ELSE 'OTHER'
  END AS executive_state
FROM pcn p
JOIN pcn_operational_status ops ON ops.pcn_id = p.id
JOIN pcn_ra_coverage rac ON rac.pcn_id = p.id;
