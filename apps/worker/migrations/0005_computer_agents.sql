-- Secure computer-agent pairing and provisioning.
-- Raw pairing codes, registration tokens, and session tokens are never stored;
-- only SHA-256 hashes are persisted.

CREATE TABLE computer_pairing_sessions (
  id TEXT PRIMARY KEY,
  code_hash TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  team_id TEXT,
  computer_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','claimed','completed','expired','revoked')),
  registration_token_hash TEXT UNIQUE,
  registration_token_expires_at INTEGER,
  claimed_at INTEGER,
  agent_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE computer_agents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  team_id TEXT,
  name TEXT NOT NULL,
  platform TEXT,
  hostname TEXT,
  public_key TEXT UNIQUE NOT NULL,
  capabilities TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  created_at INTEGER NOT NULL,
  last_seen INTEGER,
  revoked_at INTEGER
);

CREATE TABLE computer_agent_connections (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES computer_agents(id),
  session_token_hash TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  closed_at INTEGER
);

CREATE TABLE computer_agent_commands (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES computer_agents(id),
  user_id TEXT NOT NULL,
  capability TEXT NOT NULL,
  command TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','denied','completed','failed')),
  denial_reason TEXT,
  result TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE computer_agent_audit_logs (
  id TEXT PRIMARY KEY,
  agent_id TEXT,
  user_id TEXT,
  event TEXT NOT NULL,
  detail TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_computer_pairing_sessions_user ON computer_pairing_sessions(user_id, created_at DESC);
CREATE INDEX idx_computer_agents_user ON computer_agents(user_id, created_at DESC);
CREATE INDEX idx_computer_agent_connections_agent ON computer_agent_connections(agent_id, created_at DESC);
CREATE INDEX idx_computer_agent_commands_agent_status ON computer_agent_commands(agent_id, status, created_at);
CREATE INDEX idx_computer_agent_audit_logs_agent ON computer_agent_audit_logs(agent_id, created_at DESC);
