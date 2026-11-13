PRAGMA user_version=1;
CREATE TABLE store_profile(profile TEXT NOT NULL PRIMARY KEY CHECK(profile='zarya.p04.b.store.test/v1')) STRICT;
INSERT INTO store_profile VALUES('zarya.p04.b.store.test/v1');
CREATE TABLE b_meta(store_id TEXT PRIMARY KEY,generation INTEGER NOT NULL CHECK(generation>0)) STRICT;
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
 project_id TEXT NOT NULL, revision_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
 id TEXT NOT NULL UNIQUE,op_id TEXT NOT NULL UNIQUE,generation INTEGER NOT NULL,expires_ms INTEGER NOT NULL,
 FOREIGN KEY(account,op_id) REFERENCES operation_status(account,op_id) DEFERRABLE INITIALLY DEFERRED,
 PRIMARY KEY(account,scope_project,operation,key), UNIQUE(revision_id),
 FOREIGN KEY(account,project_id,revision_id) REFERENCES revisions(account,project_id,id) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TABLE audit(
 revision_id TEXT PRIMARY KEY, account TEXT NOT NULL, project_id TEXT NOT NULL,
 operation TEXT NOT NULL, request_id TEXT NOT NULL, op_id TEXT NOT NULL UNIQUE,
 FOREIGN KEY(account,project_id,revision_id) REFERENCES revisions(account,project_id,id) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TRIGGER revisions_no_update BEFORE UPDATE ON revisions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_REVISION'); END;
CREATE TRIGGER revisions_no_delete BEFORE DELETE ON revisions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_REVISION'); END;
CREATE TRIGGER receipts_no_update BEFORE UPDATE ON receipts BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECEIPT'); END;
CREATE TRIGGER receipts_no_delete BEFORE DELETE ON receipts BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECEIPT'); END;
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'IMMUTABLE_AUDIT'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'IMMUTABLE_AUDIT'); END;

CREATE TABLE operation_status(
 op_id TEXT PRIMARY KEY,account TEXT NOT NULL,receipt_id TEXT NOT NULL UNIQUE,
 fingerprint TEXT NOT NULL,state TEXT NOT NULL CHECK(state='COMMITTED'),
 UNIQUE(account,op_id),
 FOREIGN KEY(receipt_id) REFERENCES receipts(id) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TRIGGER status_no_update BEFORE UPDATE ON operation_status BEGIN SELECT RAISE(ABORT,'IMMUTABLE_STATUS'); END;
CREATE TRIGGER status_no_delete BEFORE DELETE ON operation_status BEGIN SELECT RAISE(ABORT,'IMMUTABLE_STATUS'); END;
