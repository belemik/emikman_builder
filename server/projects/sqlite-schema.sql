PRAGMA user_version=1;
CREATE TABLE store_profile(profile TEXT NOT NULL PRIMARY KEY CHECK(profile='zarya.p03.disposable/v1')) STRICT;
INSERT INTO store_profile VALUES('zarya.p03.disposable/v1');
CREATE TABLE projects(
 account TEXT NOT NULL, id TEXT PRIMARY KEY, head TEXT NOT NULL,
 lifecycle TEXT NOT NULL CHECK(lifecycle IN('active','soft-deleted')),
 UNIQUE(account,id),
 FOREIGN KEY(account,id,head) REFERENCES revisions(account,project_id,id) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TABLE revisions(
 id TEXT PRIMARY KEY, account TEXT NOT NULL, project_id TEXT NOT NULL,
 parent_id TEXT, restore_id TEXT, sequence INTEGER NOT NULL CHECK(sequence>0),
 created_at TEXT NOT NULL, actor TEXT NOT NULL,
 name TEXT NOT NULL, description TEXT NOT NULL, product_id TEXT, product_version TEXT,
 lifecycle TEXT NOT NULL CHECK(lifecycle IN('active','soft-deleted')),
 operation TEXT NOT NULL CHECK(operation IN('create-project','update-metadata','create-revision','restore-project','soft-delete-project')),
 canonical TEXT NOT NULL, digest TEXT NOT NULL,
 CHECK((product_id IS NULL)=(product_version IS NULL)),
 UNIQUE(account,project_id,id), UNIQUE(project_id,sequence),
 FOREIGN KEY(account,project_id) REFERENCES projects(account,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(account,project_id,parent_id) REFERENCES revisions(account,project_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(account,project_id,restore_id) REFERENCES revisions(account,project_id,id) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TABLE receipts(
 account TEXT NOT NULL, scope_project TEXT NOT NULL, operation TEXT NOT NULL, key TEXT NOT NULL,
 project_id TEXT NOT NULL, revision_id TEXT NOT NULL, fingerprint TEXT NOT NULL, checksum TEXT NOT NULL,
 PRIMARY KEY(account,scope_project,operation,key), UNIQUE(revision_id),
 FOREIGN KEY(account,project_id,revision_id) REFERENCES revisions(account,project_id,id) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TABLE audit(
 revision_id TEXT PRIMARY KEY, account TEXT NOT NULL, project_id TEXT NOT NULL,
 operation TEXT NOT NULL, request_id TEXT NOT NULL,
 FOREIGN KEY(account,project_id,revision_id) REFERENCES revisions(account,project_id,id) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TRIGGER revisions_no_update BEFORE UPDATE ON revisions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_REVISION'); END;
CREATE TRIGGER revisions_no_delete BEFORE DELETE ON revisions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_REVISION'); END;
CREATE TRIGGER receipts_no_update BEFORE UPDATE ON receipts BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECEIPT'); END;
CREATE TRIGGER receipts_no_delete BEFORE DELETE ON receipts BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECEIPT'); END;
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'IMMUTABLE_AUDIT'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'IMMUTABLE_AUDIT'); END;
