CREATE TABLE IF NOT EXISTS session_syncs (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shopping_lists (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  items TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  ingredients TEXT NOT NULL,
  steps TEXT NOT NULL,
  time TEXT NOT NULL,
  calories INTEGER,
  source_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shopping_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_syncs_user_platform
  ON session_syncs(user_id, platform, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_shopping_lists_user_updated_at
  ON shopping_lists(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_recipes_user_updated_at
  ON recipes(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_shopping_notifications_user_created_at
  ON shopping_notifications(user_id, created_at DESC);
