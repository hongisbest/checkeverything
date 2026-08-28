CREATE TABLE IF NOT EXISTS reference_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  view_type TEXT NOT NULL DEFAULT 'driver_side',
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL DEFAULT 'image/jpeg',
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reference_images_active
ON reference_images(is_active);

CREATE INDEX IF NOT EXISTS idx_reference_images_view_type
ON reference_images(view_type);
