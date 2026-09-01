CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  iso_year INTEGER NOT NULL,
  iso_week INTEGER NOT NULL CHECK (iso_week BETWEEN 1 AND 53),
  version_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  report_date TEXT NOT NULL,
  author_name TEXT,
  department TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  original_filename TEXT NOT NULL,
  original_key TEXT NOT NULL UNIQUE,
  sanitized_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL DEFAULT 'text/html',
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  plain_text TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
  supersedes_report_id TEXT REFERENCES reports(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (iso_year, iso_week, version_number)
);
CREATE UNIQUE INDEX idx_reports_current_week ON reports(iso_year, iso_week) WHERE is_current = 1;
CREATE INDEX idx_reports_date ON reports(report_date DESC);
CREATE INDEX idx_reports_sha256 ON reports(sha256);
CREATE TABLE report_sections (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  heading TEXT,
  heading_path TEXT NOT NULL DEFAULT '[]',
  anchor_id TEXT NOT NULL,
  plain_text TEXT NOT NULL,
  char_count INTEGER NOT NULL,
  UNIQUE (report_id, order_index)
);
CREATE INDEX idx_sections_report ON report_sections(report_id, order_index);
CREATE VIRTUAL TABLE reports_fts USING fts5(
  report_id UNINDEXED, title, body, headings, tags,
  tokenize='trigram case_sensitive 0'
);
CREATE TABLE upload_limits (
  scope TEXT NOT NULL,
  bucket TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (scope, bucket)
);
