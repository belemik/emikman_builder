PRAGMA user_version=2;

CREATE TABLE web_documents(
  account TEXT NOT NULL,
  project_id TEXT NOT NULL,
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL UNIQUE,
  UNIQUE(account, project_id, id),
  FOREIGN KEY(account, project_id) REFERENCES projects(account, id)
) STRICT;

CREATE TABLE web_revisions(
  account TEXT NOT NULL,
  project_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  project_revision_id TEXT NOT NULL UNIQUE,
  payload BLOB NOT NULL CHECK(length(payload) BETWEEN 1 AND 16384),
  sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  contract TEXT NOT NULL CHECK(contract='0.1'),
  validator TEXT NOT NULL CHECK(length(validator)=64),
  renderer TEXT NOT NULL CHECK(length(renderer)=64),
  asset_catalog TEXT NOT NULL CHECK(length(asset_catalog)=64),
  UNIQUE(account, project_id, document_id, id),
  FOREIGN KEY(account, project_id, document_id) REFERENCES web_documents(account, project_id, id),
  FOREIGN KEY(account, project_id, document_id, parent_id) REFERENCES web_revisions(account, project_id, document_id, id),
  FOREIGN KEY(account, project_id, project_revision_id) REFERENCES revisions(account, project_id, id) DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE TABLE web_snapshot_heads(
  account TEXT NOT NULL,
  project_id TEXT NOT NULL,
  project_revision_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  document_revision_id TEXT NOT NULL,
  PRIMARY KEY(project_revision_id, document_id),
  FOREIGN KEY(account, project_id, project_revision_id) REFERENCES revisions(account, project_id, id),
  FOREIGN KEY(account, project_id, document_id, document_revision_id) REFERENCES web_revisions(account, project_id, document_id, id)
) STRICT;

CREATE TRIGGER web_documents_no_update BEFORE UPDATE ON web_documents BEGIN SELECT RAISE(ABORT,'IMMUTABLE_DOCUMENT'); END;
CREATE TRIGGER web_documents_no_delete BEFORE DELETE ON web_documents BEGIN SELECT RAISE(ABORT,'IMMUTABLE_DOCUMENT'); END;
CREATE TRIGGER web_revisions_no_update BEFORE UPDATE ON web_revisions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_DOCUMENT_REVISION'); END;
CREATE TRIGGER web_revisions_no_delete BEFORE DELETE ON web_revisions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_DOCUMENT_REVISION'); END;
CREATE TRIGGER web_snapshot_heads_no_update BEFORE UPDATE ON web_snapshot_heads BEGIN SELECT RAISE(ABORT,'IMMUTABLE_DOCUMENT_HEAD'); END;
CREATE TRIGGER web_snapshot_heads_no_delete BEFORE DELETE ON web_snapshot_heads BEGIN SELECT RAISE(ABORT,'IMMUTABLE_DOCUMENT_HEAD'); END;
