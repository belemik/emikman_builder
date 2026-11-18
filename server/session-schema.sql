CREATE TABLE session_meta (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  profile_version TEXT NOT NULL CHECK (profile_version = 'zarya.session-store.local/v1'),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  store_id TEXT NOT NULL CHECK (length(store_id) = 32 AND store_id NOT GLOB '*[^0-9a-f]*'),
  generation INTEGER NOT NULL CHECK (generation BETWEEN 1 AND 9007199254740991),
  commit_seq INTEGER NOT NULL CHECK (commit_seq BETWEEN 0 AND 9007199254740991),
  last_op_id TEXT CHECK (length(last_op_id) = 32 AND last_op_id NOT GLOB '*[^0-9a-f]*'),
  CHECK ((commit_seq = 0) = (last_op_id IS NULL))
) STRICT;

CREATE TABLE sessions (
  token_digest TEXT PRIMARY KEY NOT NULL CHECK (length(token_digest) = 64 AND token_digest NOT GLOB '*[^0-9a-f]*'),
  account_id TEXT NOT NULL CHECK (length(account_id) = 32 AND account_id NOT GLOB '*[^0-9a-f]*'),
  issued_at INTEGER NOT NULL CHECK (issued_at BETWEEN 0 AND 9007199254740991),
  expires_at INTEGER NOT NULL CHECK (expires_at > issued_at AND expires_at <= 9007199254740991 AND expires_at - issued_at <= 28800000),
  lease_version INTEGER NOT NULL CHECK (lease_version BETWEEN 1 AND 9007199254740991),
  auth_generation INTEGER NOT NULL CHECK (auth_generation BETWEEN 1 AND 9007199254740991),
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  revoked_at INTEGER CHECK (revoked_at BETWEEN issued_at AND 9007199254740991),
  retain_until INTEGER GENERATED ALWAYS AS (
    CASE status WHEN 'revoked' THEN max(expires_at, revoked_at + 86400000)
                ELSE expires_at + 86400000 END
  ) STORED NOT NULL CHECK (retain_until BETWEEN 0 AND 9007199254740991),
  CHECK ((status = 'active') = (revoked_at IS NULL))
) STRICT;

CREATE INDEX sessions_active_expiry ON sessions (status, expires_at);
CREATE INDEX sessions_retention ON sessions (retain_until, token_digest);
CREATE TRIGGER sessions_match_generation BEFORE INSERT ON sessions
WHEN NOT EXISTS (SELECT 1 FROM session_meta WHERE singleton = 1 AND generation = NEW.auth_generation)
BEGIN
  SELECT RAISE(ABORT, 'session generation mismatch');
END;
