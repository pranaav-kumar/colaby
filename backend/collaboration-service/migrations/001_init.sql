CREATE TABLE IF NOT EXISTS collaboration_workspaces (
  project_id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL DEFAULT 'SCRATCH',
  repository_url TEXT,
  initialized BOOLEAN NOT NULL DEFAULT FALSE,
  repo_cloned BOOLEAN NOT NULL DEFAULT FALSE,
  repo_path TEXT,
  root_node_id TEXT NOT NULL DEFAULT 'root',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  version BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collaboration_chat_messages (
  message_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS collaboration_chat_project_created ON collaboration_chat_messages(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS collaboration_whiteboards (
  project_id TEXT PRIMARY KEY,
  objects JSONB NOT NULL DEFAULT '[]'::jsonb,
  version BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collaboration_file_operations (
  operation_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  node_id TEXT NOT NULL,
  operation JSONB NOT NULL,
  logical_timestamp BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS collaboration_file_ops_project_clock ON collaboration_file_operations(project_id, logical_timestamp);

CREATE TABLE IF NOT EXISTS collaboration_code_documents (
  project_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  yjs_state_vector BYTEA,
  yjs_update BYTEA,
  version BIGINT NOT NULL DEFAULT 0,
  last_edited_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id, file_path)
);

CREATE TABLE IF NOT EXISTS collaboration_code_updates (
  id BIGSERIAL PRIMARY KEY,
  project_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  update_payload BYTEA NOT NULL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS collaboration_code_updates_document ON collaboration_code_updates(project_id, file_path, id);

CREATE TABLE IF NOT EXISTS collaboration_events (
  event_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  operation_id TEXT,
  logical_timestamp BIGINT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS collaboration_events_project_clock ON collaboration_events(project_id, logical_timestamp);
CREATE INDEX IF NOT EXISTS collaboration_events_project_created ON collaboration_events(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS collaboration_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  snapshot_type TEXT NOT NULL,
  state JSONB NOT NULL,
  version BIGINT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS collaboration_snapshots_project_type_version ON collaboration_snapshots(project_id, snapshot_type, version DESC);
CREATE INDEX IF NOT EXISTS collaboration_snapshots_created ON collaboration_snapshots(created_at);

CREATE TABLE IF NOT EXISTS collaboration_file_nodes (
  project_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  parent_id TEXT,
  name TEXT NOT NULL,
  node_type TEXT NOT NULL,
  path TEXT NOT NULL,
  deleted BOOLEAN NOT NULL DEFAULT FALSE,
  logical_timestamp BIGINT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(project_id, node_id),
  UNIQUE(project_id, path)
);
CREATE INDEX IF NOT EXISTS collaboration_file_nodes_parent ON collaboration_file_nodes(project_id, parent_id) WHERE deleted = FALSE;
