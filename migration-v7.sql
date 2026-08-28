CREATE TABLE IF NOT EXISTS inspection_regions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference_image_id INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT '스티커 영역',
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inspection_regions_reference
ON inspection_regions(reference_image_id);
