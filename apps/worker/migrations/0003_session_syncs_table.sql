CREATE TABLE IF NOT EXISTS session_syncs (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_syncs_user_platform
  ON session_syncs(user_id, platform, updated_at DESC);
