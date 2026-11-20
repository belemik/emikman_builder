PRAGMA user_version = 1;
CREATE TABLE store_profile (
  profile TEXT PRIMARY KEY CHECK (profile = 'zarya.p22a.initial-document.test/v1')
) STRICT;
INSERT INTO store_profile VALUES ('zarya.p22a.initial-document.test/v1');

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  owner_account TEXT NOT NULL UNIQUE CHECK (owner_account GLOB 'fixture-account-[A-Z]'),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  type TEXT NOT NULL CHECK (type = 'web-application'),
  status TEXT NOT NULL CHECK (status = 'active'),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE works (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id),
  UNIQUE (project_id, id)
) STRICT;

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE,
  work_id TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format = 'format:wdeaf-screen-v3'),
  head_revision_id TEXT NOT NULL,
  FOREIGN KEY (project_id, work_id) REFERENCES works(project_id, id),
  FOREIGN KEY (id, head_revision_id) REFERENCES revisions(document_id, id) DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE TABLE revisions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL UNIQUE REFERENCES documents(id),
  parent_id TEXT CHECK (parent_id IS NULL),
  sequence INTEGER NOT NULL CHECK (sequence = 1),
  created_at TEXT NOT NULL,
  screen TEXT NOT NULL CHECK (length(CAST(screen AS BLOB)) BETWEEN 1 AND 1024),
  screen_digest TEXT NOT NULL CHECK (length(screen_digest) = 64),
  UNIQUE (document_id, id)
) STRICT;
