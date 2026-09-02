PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS change_type (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  default_risk TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (default_risk IN ('MAJOR', 'MINOR', 'EOL', 'UNKNOWN'))
);

-- Ordered, data-driven title rules supplement the change-type defaults.
-- Higher priority wins when more than one phrase matches a title.
CREATE TABLE IF NOT EXISTS risk_title_rule (
  id INTEGER PRIMARY KEY,
  title_contains TEXT NOT NULL UNIQUE,
  expected_risk TEXT NOT NULL CHECK (expected_risk IN ('MAJOR', 'MINOR', 'EOL', 'UNKNOWN')),
  priority INTEGER NOT NULL DEFAULT 100,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
);

INSERT OR IGNORE INTO risk_title_rule(title_contains, expected_risk, priority)
VALUES
  ('RBAF', 'MAJOR', 100),
  ('LFAB', 'MAJOR', 100);

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

-- Application identities and sessions are intentionally local to this SQLite
-- database. Passwords and session tokens are stored only as one-way hashes.
CREATE TABLE IF NOT EXISTS app_user (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('operator', 'admin')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_session (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_session_expires ON auth_session(expires_at);

-- A CSC upload is a human claim and remains separate from imported Delta-form
-- coverage. Admin confirmation records that TI has independently verified it.
CREATE TABLE IF NOT EXISTS pcn_csc_upload (
  pcn_id INTEGER PRIMARY KEY REFERENCES pcn(id) ON DELETE CASCADE,
  apply_date TEXT NOT NULL CHECK (apply_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  form_no TEXT NOT NULL UNIQUE,
  pcn_no TEXT NOT NULL UNIQUE,
  uploaded_by_user_id INTEGER REFERENCES app_user(id),
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_by_user_id INTEGER REFERENCES app_user(id),
  confirmed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (confirmed_at IS NOT NULL OR confirmed_by_user_id IS NULL)
);

CREATE TABLE IF NOT EXISTS ti_part (
  id INTEGER PRIMARY KEY,
  normalized_part_number TEXT NOT NULL UNIQUE,
  display_part_number TEXT NOT NULL,
  industry TEXT
);

-- Monthly material revenue imported from the Step 6 current-backlog dashboard.
-- Materials are intentionally not foreign-keyed to ti_part so the source can be
-- retained in full, including materials that are not affected by a current PCN.
CREATE TABLE IF NOT EXISTS material_month_revenue (
  normalized_part_number TEXT NOT NULL,
  display_part_number TEXT NOT NULL,
  revenue_month TEXT NOT NULL CHECK (revenue_month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
  net_revenue REAL NOT NULL,
  source_file TEXT NOT NULL,
  source_sheet TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (normalized_part_number, revenue_month)
);

CREATE TABLE IF NOT EXISTS sbe1 (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  champion_email TEXT
);

CREATE TABLE IF NOT EXISTS sbe (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS sbe2 (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

-- Legacy ownership table retained only long enough to migrate populated databases.
CREATE TABLE IF NOT EXISTS ti_part_sbe1 (
  ti_part_id INTEGER PRIMARY KEY REFERENCES ti_part(id) ON DELETE CASCADE,
  sbe1_id INTEGER NOT NULL REFERENCES sbe1(id)
);

CREATE TABLE IF NOT EXISTS ti_part_sbe1_inference (
  ti_part_id INTEGER PRIMARY KEY REFERENCES ti_part(id) ON DELETE CASCADE,
  sbe1_id INTEGER NOT NULL REFERENCES sbe1(id),
  reference_file TEXT NOT NULL,
  matched_prefix TEXT NOT NULL,
  evidence_count INTEGER NOT NULL,
  inferred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ti_part_organization (
  ti_part_id INTEGER PRIMARY KEY REFERENCES ti_part(id) ON DELETE CASCADE,
  sbe_id INTEGER REFERENCES sbe(id),
  sbe1_id INTEGER REFERENCES sbe1(id),
  sbe2_id INTEGER REFERENCES sbe2(id),
  source_file TEXT NOT NULL,
  source_sheet TEXT NOT NULL,
  source_row INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Consolidate legacy SBE-1-only assignments into the organization record.
-- Existing organization assignments win when both sources contain a value.
UPDATE ti_part_organization
SET sbe1_id = (SELECT legacy.sbe1_id FROM ti_part_sbe1 legacy WHERE legacy.ti_part_id = ti_part_organization.ti_part_id),
    updated_at = CURRENT_TIMESTAMP
WHERE sbe1_id IS NULL
  AND EXISTS (SELECT 1 FROM ti_part_sbe1 legacy WHERE legacy.ti_part_id = ti_part_organization.ti_part_id);

INSERT OR IGNORE INTO ti_part_organization(
  ti_part_id, sbe_id, sbe1_id, sbe2_id, source_file, source_sheet, source_row
)
SELECT ti_part_id, NULL, sbe1_id, NULL, 'legacy ti_part_sbe1 migration', 'database', 0
FROM ti_part_sbe1;

DROP TABLE ti_part_sbe1;

-- Inference is audit evidence only. Once canonical ownership changes or is
-- removed, stale evidence must not continue to describe the current owner.
CREATE TRIGGER IF NOT EXISTS clear_sbe1_inference_after_organization_update
AFTER UPDATE OF sbe1_id ON ti_part_organization
BEGIN
  DELETE FROM ti_part_sbe1_inference WHERE ti_part_id = NEW.ti_part_id;
END;

CREATE TRIGGER IF NOT EXISTS clear_sbe1_inference_after_organization_delete
AFTER DELETE ON ti_part_organization
BEGIN
  DELETE FROM ti_part_sbe1_inference WHERE ti_part_id = OLD.ti_part_id;
END;

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

-- Authoritative Delta-to-TI material mapping. Delta form items remain the
-- historical record of what was submitted; this table also covers materials
-- that have not appeared on a form yet.
CREATE TABLE IF NOT EXISTS delta_ti_part_mapping (
  delta_part_id INTEGER PRIMARY KEY REFERENCES delta_part(id) ON DELETE CASCADE,
  ti_part_id INTEGER NOT NULL REFERENCES ti_part(id),
  source_file TEXT NOT NULL,
  source_sheet TEXT NOT NULL,
  source_row INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_delta_ti_mapping_ti_part
ON delta_ti_part_mapping(ti_part_id);

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
CREATE INDEX IF NOT EXISTS idx_material_month_revenue_month ON material_month_revenue(revenue_month);

-- Persistent lifetime-revenue snapshot for the Parts page. Revenue and part
-- changes invalidate the entire snapshot because they can change every rank.
CREATE TABLE IF NOT EXISTS part_nr_cache (
  ti_part_id INTEGER PRIMARY KEY REFERENCES ti_part(id) ON DELETE CASCADE,
  net_revenue REAL NOT NULL,
  rank_desc INTEGER NOT NULL UNIQUE,
  rank_asc INTEGER NOT NULL UNIQUE,
  calculated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS invalidate_part_nr_cache_after_revenue_insert
AFTER INSERT ON material_month_revenue
BEGIN
  DELETE FROM part_nr_cache;
END;

CREATE TRIGGER IF NOT EXISTS invalidate_part_nr_cache_after_revenue_update
AFTER UPDATE ON material_month_revenue
BEGIN
  DELETE FROM part_nr_cache;
END;

CREATE TRIGGER IF NOT EXISTS invalidate_part_nr_cache_after_revenue_delete
AFTER DELETE ON material_month_revenue
BEGIN
  DELETE FROM part_nr_cache;
END;

CREATE TRIGGER IF NOT EXISTS invalidate_part_nr_cache_after_part_insert
AFTER INSERT ON ti_part
BEGIN
  DELETE FROM part_nr_cache;
END;
CREATE INDEX IF NOT EXISTS idx_ti_part_organization_sbe ON ti_part_organization(sbe_id);
CREATE INDEX IF NOT EXISTS idx_ti_part_organization_sbe1 ON ti_part_organization(sbe1_id);
CREATE INDEX IF NOT EXISTS idx_ti_part_organization_sbe2 ON ti_part_organization(sbe2_id);
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

-- Upload coverage applies only to TI parts with a known Delta material mapping.
-- Authoritative TI parts that have never been sold to Delta remain visible, but
-- do not prevent the PCN from being considered fully uploaded.
DROP VIEW IF EXISTS pcn_executive_status;
DROP VIEW IF EXISTS pcn_ra_coverage;
DROP VIEW IF EXISTS pcn_operational_status;
DROP VIEW IF EXISTS pcn_upload_coverage;
DROP VIEW IF EXISTS pcn_expected_risk;

CREATE VIEW pcn_upload_coverage AS
SELECT
  coverage.*,
  CASE
    WHEN coverage.uploaded_parts = 0 THEN 'NOT_UPLOADED'
    WHEN coverage.uploaded_parts < coverage.delta_relevant_parts THEN 'PARTLY_UPLOADED'
    ELSE 'ALL_UPLOADED'
  END AS upload_state
FROM (
SELECT
  p.id AS pcn_id,
  count(pp.ti_part_id) AS total_parts,
  sum(CASE WHEN EXISTS (
    SELECT 1
    FROM delta_ti_part_mapping mapped_item
    WHERE mapped_item.ti_part_id = tp.id
  ) THEN 1 ELSE 0 END) AS delta_relevant_parts,
  sum(CASE WHEN EXISTS (
    SELECT 1
    FROM delta_form df
    JOIN delta_form_item dfi ON dfi.delta_form_id = df.id
    JOIN delta_ti_part_mapping mapping ON mapping.delta_part_id = dfi.delta_part_id
    WHERE df.delta_pcn_number_base = p.pcn_number_base
      AND mapping.ti_part_id = tp.id
  ) THEN 1 ELSE 0 END) AS uploaded_parts
FROM pcn p
LEFT JOIN pcn_ti_part pp ON pp.pcn_id = p.id
LEFT JOIN ti_part tp ON tp.id = pp.ti_part_id
GROUP BY p.id
) coverage;

DROP VIEW IF EXISTS pcn_executive_status;
DROP VIEW IF EXISTS pcn_ra_coverage;
DROP VIEW IF EXISTS pcn_operational_status;
DROP VIEW IF EXISTS pcn_expected_risk;

CREATE VIEW pcn_expected_risk AS
SELECT
  p.id AS pcn_id,
  COALESCE(
    p.risk_override,
    (SELECT rule.expected_risk
     FROM risk_title_rule rule
     WHERE rule.enabled = 1
       AND instr(upper(p.title), upper(rule.title_contains)) > 0
     ORDER BY rule.priority DESC, rule.id
     LIMIT 1),
    ct.default_risk,
    'UNKNOWN'
  ) AS expected_risk,
  CASE
    WHEN p.risk_override IS NOT NULL THEN 'MANUAL_OVERRIDE'
    WHEN EXISTS (
      SELECT 1 FROM risk_title_rule rule
      WHERE rule.enabled = 1
        AND instr(upper(p.title), upper(rule.title_contains)) > 0
    ) THEN 'TITLE_RULE'
    WHEN ct.default_risk IS NOT NULL THEN 'CHANGE_TYPE'
    ELSE 'UNKNOWN'
  END AS risk_source
FROM pcn p
LEFT JOIN change_type ct ON ct.id = p.change_type_id;

CREATE VIEW pcn_operational_status AS
SELECT
  p.id AS pcn_id,
  coverage.total_parts,
  coverage.delta_relevant_parts,
  coverage.uploaded_parts,
  coverage.upload_state,
  expected.expected_risk,
  (SELECT group_concat(risk, ', ')
   FROM (SELECT DISTINCT upper(df.notify) AS risk
         FROM delta_form df
         WHERE df.delta_pcn_number_base = p.pcn_number_base
           AND upper(df.notify) IN ('MAJOR', 'MINOR')
         ORDER BY risk)) AS delta_risks,
  CASE
    WHEN expected.expected_risk = 'EOL' THEN 'NOT_APPLICABLE'
    WHEN expected.expected_risk NOT IN ('MAJOR', 'MINOR') THEN 'REVIEW'
    WHEN NOT EXISTS (SELECT 1 FROM delta_form df WHERE df.delta_pcn_number_base = p.pcn_number_base) THEN 'NOT_ON_DELTA'
    WHEN EXISTS (
      SELECT 1 FROM delta_form df
      WHERE df.delta_pcn_number_base = p.pcn_number_base
        AND upper(COALESCE(df.notify, '')) IN ('MAJOR', 'MINOR')
        AND upper(df.notify) <> expected.expected_risk
    ) THEN 'MISMATCH'
    ELSE 'MATCH'
  END AS risk_alignment
FROM pcn p
LEFT JOIN change_type ct ON ct.id = p.change_type_id
JOIN pcn_expected_risk expected ON expected.pcn_id = p.id
JOIN pcn_upload_coverage coverage ON coverage.pcn_id = p.id;

CREATE VIEW pcn_ra_coverage AS
SELECT
  p.id AS pcn_id,
  coverage.total_parts,
  count(DISTINCT rp.ti_part_id) AS ra_covered_parts,
  CASE
    WHEN expected.expected_risk <> 'MAJOR' THEN 'NA'
    WHEN count(DISTINCT rp.ti_part_id) = 0 THEN 'MISS_ALL_RA'
    WHEN count(DISTINCT rp.ti_part_id) < coverage.total_parts THEN 'PARTLY_MISS_RA'
    ELSE 'FULL_RA'
  END AS ra_state
FROM pcn p
LEFT JOIN change_type ct ON ct.id = p.change_type_id
JOIN pcn_expected_risk expected ON expected.pcn_id = p.id
JOIN pcn_upload_coverage coverage ON coverage.pcn_id = p.id
LEFT JOIN risk_assessment ra ON ra.pcn_id = p.id
LEFT JOIN risk_assessment_ti_part rp ON rp.risk_assessment_id = ra.id
GROUP BY p.id;

-- Delta permits repeated submissions under the same PCN suffix. The latest
-- attempt for each suffix is authoritative; older attempts remain as history.
DROP VIEW IF EXISTS pcn_executive_status;
DROP VIEW IF EXISTS pcn_delta_status;

CREATE VIEW pcn_delta_status AS
WITH ranked_attempts AS (
  SELECT
    df.*,
    row_number() OVER (
      PARTITION BY df.pcn_id, upper(
        CASE
          WHEN instr(replace(replace(trim(COALESCE(df.delta_pcn_suffix, '')), '（', '('), ' ', ''), '(') > 0
            THEN substr(
              replace(replace(trim(COALESCE(df.delta_pcn_suffix, '')), '（', '('), ' ', ''),
              1,
              instr(replace(replace(trim(COALESCE(df.delta_pcn_suffix, '')), '（', '('), ' ', ''), '(') - 1
            )
          ELSE replace(replace(trim(COALESCE(df.delta_pcn_suffix, '')), '（', '('), ' ', '')
        END
      )
      ORDER BY
        CASE WHEN NULLIF(trim(df.apply_date), '') IS NULL THEN 0 ELSE 1 END DESC,
        df.apply_date DESC,
        df.id DESC
    ) AS attempt_rank
  FROM delta_form df
  WHERE df.pcn_id IS NOT NULL
), current_attempts AS (
  SELECT
    pcn_id,
    CASE
      WHEN upper(COALESCE(NULLIF(trim(form_status), ''), 'BLANK')) IN ('CANCEL', 'PROCESSING', 'REJECT', 'COMPLETE')
        THEN upper(COALESCE(NULLIF(trim(form_status), ''), 'BLANK'))
      ELSE 'BLANK'
    END AS current_status
  FROM ranked_attempts
  WHERE attempt_rank = 1
)
SELECT
  p.id AS pcn_id,
  CASE
    WHEN count(a.current_status) = 0 THEN 'BLANK'
    WHEN count(DISTINCT a.current_status) > 1 THEN 'MIXED'
    ELSE max(a.current_status)
  END AS delta_status,
  max(CASE WHEN a.current_status = 'REJECT' THEN 1 ELSE 0 END) AS has_reject,
  max(CASE WHEN a.current_status = 'PROCESSING' THEN 1 ELSE 0 END) AS has_processing,
  max(CASE WHEN a.current_status = 'COMPLETE' THEN 1 ELSE 0 END) AS has_complete
FROM pcn p
LEFT JOIN current_attempts a ON a.pcn_id = p.id
GROUP BY p.id;

CREATE VIEW pcn_executive_status AS
SELECT
  p.id AS pcn_id,
  CASE
    WHEN current_delta.has_reject = 1 THEN 'REJECTED'
    WHEN ops.expected_risk = 'EOL' THEN 'EOL_EXCLUDED'
    WHEN current_delta.delta_status = 'COMPLETE'
      AND ops.expected_risk IN ('MINOR', 'MAJOR') THEN 'COMPLETED'
    WHEN current_delta.has_processing = 1
      AND ops.expected_risk = 'MINOR' THEN 'MINOR_PENDING_APPROVAL'
    WHEN current_delta.has_processing = 1
      AND ops.expected_risk = 'MAJOR' THEN 'MAJOR_PENDING_APPROVAL'
    WHEN ops.upload_state <> 'ALL_UPLOADED'
      AND ops.expected_risk IN ('MINOR', 'MAJOR')
      AND COALESCE((
        SELECT sum(mmr.net_revenue)
        FROM pcn_ti_part pp
        JOIN ti_part tp ON tp.id = pp.ti_part_id
        JOIN material_month_revenue mmr ON mmr.normalized_part_number = tp.normalized_part_number
        WHERE pp.pcn_id = p.id
          AND mmr.revenue_month BETWEEN '2025-08' AND strftime('%Y-%m', 'now', 'localtime')
      ), 0) = 0 THEN 'NO_12M_SALES'
    WHEN ops.upload_state <> 'ALL_UPLOADED' AND ops.expected_risk = 'MINOR' THEN 'MINOR_READY_UPLOAD'
    WHEN ops.upload_state <> 'ALL_UPLOADED' AND ops.expected_risk = 'MAJOR' AND rac.ra_state <> 'FULL_RA' THEN 'MAJOR_BLOCKED_RA'
    WHEN ops.upload_state <> 'ALL_UPLOADED' AND ops.expected_risk = 'MAJOR' AND rac.ra_state = 'FULL_RA' THEN 'MAJOR_READY_UPLOAD'
    WHEN ops.upload_state = 'ALL_UPLOADED'
      AND current_delta.delta_status = 'COMPLETE' THEN 'COMPLETED'
    ELSE 'OTHER'
  END AS executive_state
FROM pcn p
JOIN pcn_operational_status ops ON ops.pcn_id = p.id
JOIN pcn_ra_coverage rac ON rac.pcn_id = p.id
JOIN pcn_delta_status current_delta ON current_delta.pcn_id = p.id;
