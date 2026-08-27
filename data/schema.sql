PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS change_type (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  default_risk TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (default_risk IN ('MAJOR', 'MINOR', 'UNKNOWN'))
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

CREATE INDEX IF NOT EXISTS idx_pcn_date ON pcn(notification_date DESC);
CREATE INDEX IF NOT EXISTS idx_pcn_change_type ON pcn(change_type_id);
CREATE INDEX IF NOT EXISTS idx_pcn_ti_part_part ON pcn_ti_part(ti_part_id);
CREATE INDEX IF NOT EXISTS idx_delta_form_pcn ON delta_form(pcn_id);
CREATE INDEX IF NOT EXISTS idx_delta_form_base ON delta_form(delta_pcn_number_base);
CREATE INDEX IF NOT EXISTS idx_delta_form_status ON delta_form(form_status);
CREATE INDEX IF NOT EXISTS idx_delta_item_form ON delta_form_item(delta_form_id);
CREATE INDEX IF NOT EXISTS idx_delta_item_ti_part ON delta_form_item(ti_part_number_normalized);
