CREATE TABLE IF NOT EXISTS vc2_references (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  view_type TEXT NOT NULL,
  guide_text TEXT NOT NULL DEFAULT '',
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL DEFAULT 'image/jpeg',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vc2_regions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference_id INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT '홍보 스티커',
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vc2_inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_name TEXT NOT NULL,
  employee_id TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  vehicle_no TEXT NOT NULL,
  reference_id INTEGER NOT NULL,
  view_type TEXT NOT NULL,
  photo_object_key TEXT NOT NULL,
  score REAL NOT NULL,
  status TEXT NOT NULL,
  findings_json TEXT NOT NULL DEFAULT '[]',
  metrics_json TEXT NOT NULL DEFAULT '{}',
  admin_state TEXT NOT NULL DEFAULT '미확인',
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vc2_refs_active ON vc2_references(view_type, is_active);
CREATE INDEX IF NOT EXISTS idx_vc2_regions_ref ON vc2_regions(reference_id);
CREATE INDEX IF NOT EXISTS idx_vc2_insp_status ON vc2_inspections(status, admin_state);

CREATE TABLE IF NOT EXISTS vc2_rules (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  damage_normal_max REAL NOT NULL DEFAULT 10,
  damage_replace_min REAL NOT NULL DEFAULT 30,
  position_tolerance REAL NOT NULL DEFAULT 10,
  color_difference_max REAL NOT NULL DEFAULT 35,
  shape_similarity_min REAL NOT NULL DEFAULT 75,
  use_damage INTEGER NOT NULL DEFAULT 1,
  use_position INTEGER NOT NULL DEFAULT 1,
  use_color INTEGER NOT NULL DEFAULT 1,
  use_shape INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO vc2_rules (
  id, damage_normal_max, damage_replace_min, position_tolerance,
  color_difference_max, shape_similarity_min,
  use_damage, use_position, use_color, use_shape
) VALUES (1, 10, 30, 10, 35, 75, 1, 1, 1, 1);

