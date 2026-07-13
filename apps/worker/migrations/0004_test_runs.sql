CREATE TABLE IF NOT EXISTS test_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  device_id TEXT NOT NULL REFERENCES devices(id),
  session_id TEXT,
  platform TEXT NOT NULL CHECK(platform IN ('ios','android')),
  suite TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running','passed','failed')),
  summary TEXT NOT NULL,
  checks TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_test_runs_user_started_at
  ON test_runs(user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_test_runs_device_started_at
  ON test_runs(device_id, started_at DESC);
