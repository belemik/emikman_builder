# P04 Synthetic WebPage Save/Reopen

This is an opt-in extension of the existing P04 B repository. It uses the same primary SQLite database, intent ledger, coordinator, synthetic principal boundary, conflict policy and recovery fence. A fresh synthetic volume opened with `{ webPageProfile: true }` has schema version 2. Default opens still use schema version 1, and each mode refuses the other's volume. In-place migration is outside this profile. The PR #33 WDeaf disposable repository is unchanged.

## Commands and confirmation

- Create a fixture project through the existing `create-project` command.
- Use `createWebPageRepositoryCandidate` with DTO version `zarya.p04.web-page.command.test/v1`. `save-web-page-v1` requires the project ID, exact expected ProjectRevision reference, idempotency key and the document's JSON text. Set `documentId` to null for creation. The repository issues Work, Document and DocumentRevision IDs.
- `read-web-page-v1` requires the project ID, Document ID and exact confirmed ProjectRevision reference. An authorized read resolves the DocumentRevision from that snapshot and returns a copy of the stored UTF-8 bytes with its digest and pinned context. Historical active snapshots are readable while the project is active.
- Use `reconcile` with the original command after an uncertain result. The same scoped key and command return the original receipt within the P04 receipt window. Changed payload bytes under that key return `IDEMPOTENCY_KEY_REUSED`. A stale expected revision returns `EXPECTED_REVISION_MISMATCH` even when a different document was saved. To retry a conflict, load the latest revision and issue a new explicit command and key.
- The v2 adapter also accepts existing metadata commands with v2 revision references. Metadata-only snapshots retain the v1 canonical byte domain. Snapshots with WebPage heads use `zarya.p04.project-manifest.web-page.test.jcs/v2`. Metadata changes carry current document heads forward. Restore takes its document heads from the selected historical snapshot.

## Storage and recovery

WebPage v0.1 validation precedes candidate issuance. The isolated R1 decoder applies strict UTF-8 and closed DTO rules to the command. The payload text is encoded as UTF-8 for storage without parsing and reserializing it. The Validator source and its runtime preflight dependencies are checked against the profile before opening a v2 store. The profile binds the contract to its checked source, the renderer to the verified archived patch digest, and the single allowed catalog asset to its checked content digest. The repository records the renderer pin and does not load or execute that patch.

The primary transaction commits the payload, immutable DocumentRevision, canonical project snapshot and CAS head, receipt, operation status and audit together. The pre-existing external ledger is the recovery record for write intents. A committed primary transaction can be reconciled after process termination before the ledger update. An unresolved intent with no corresponding primary receipt fences further writes under the existing P04 policy. Recovery never treats missing evidence as success or retries a write automatically.

## Scope

The integration tests use synthetic accounts and child processes. No routes, Workspace integration, real accounts, deployment or production authorization are included. A future adapter must separately qualify real session authority and Trusted Admission, retention and reconciliation policy, and approval to expose storage over HTTP. Local process termination tests do not establish power-loss durability.
