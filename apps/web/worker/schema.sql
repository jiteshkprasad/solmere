-- Solmere comments (D1). Apply: wrangler d1 execute solmere-comments --file worker/schema.sql [--local | --remote]
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target TEXT NOT NULL,          -- day-4 | moment-12
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,   -- ms since epoch
  ip_hash TEXT NOT NULL,         -- daily salted hash, for rate limits only
  hidden INTEGER NOT NULL DEFAULT 0,
  reports INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS comments_target ON comments (target, hidden, created_at);
CREATE INDEX IF NOT EXISTS comments_ip ON comments (ip_hash, created_at);
CREATE TABLE IF NOT EXISTS reports (
  comment_id INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (comment_id, ip_hash)
);
