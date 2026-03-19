CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  team_id TEXT REFERENCES teams(id),
  role TEXT CHECK(role IN ('owner','admin','developer','viewer')),
  created_at INTEGER NOT NULL
);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT CHECK(platform IN ('ios','android')),
  model TEXT,
  os_version TEXT,
  team_id TEXT REFERENCES teams(id),
  tunnel_url TEXT,
  status TEXT DEFAULT 'offline',
  last_seen INTEGER,
  agent_host TEXT
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  device_id TEXT REFERENCES devices(id),
  user_id TEXT REFERENCES users(id),
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  ip_address TEXT
);

CREATE TABLE permissions (
  user_id TEXT REFERENCES users(id),
  device_id TEXT REFERENCES devices(id),
  can_view INTEGER DEFAULT 1,
  can_control INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, device_id)
);

