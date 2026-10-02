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
