# P04-C Workspace / Editor Adapter v0.1

The loopback pilot uses the Astra workspace styles, theme controls and existing WebPageEditor. It starts separately from the normal server and Pages builds. It uses synthetic accounts and v3 volumes.

## Run locally

```sh
node node_modules/vite/bin/vite.js build --config pilot/web-page/vite.config.ts
node --import tsx pilot/web-page/start.ts --port 4183
```

The launcher prints the loopback URL, process ID, and paths to the private access and volume files. Open the access file locally and use the owner code within 60 seconds. To issue a fresh one-time code, send `SIGUSR2` to the pilot process. The process atomically replaces its access file. Keep codes, browser handles and worker bearers out of logs and screenshots. Both code fields report an invalid format alongside the input before any request.

Create an event page, find it in My Documents, and open it. Use Layers or Canvas to select Hero. Apply validates the input and updates Canvas and Preview. Save submits the applied page. After a confirmed save, restart with `--resume PATH_TO_VOLUMES_JSON` and the same port, obtain a fresh code, then reopen from My Documents.

```sh
node node_modules/playwright/cli.js test --config pilot/web-page/playwright.config.ts
```

## UX handoff

| State | Editor behavior |
|---|---|
| Draft | Inspector inputs differ from the applied document. Preview shows applied content. Cancel restores input from the applied document. |
| Applied | The existing validator accepted the change. Save can submit the applied version using the confirmed ProjectRevision as its CAS precondition. |
| Saving | One immutable command is in flight. Inspector edits can continue. |
| Saved | The returned receipt matches the operation, idempotency key, project, parent revision, Document ID, pinned context and exact UTF-8 digest. A late receipt only advances the confirmed revision for its own command. |
| Conflict | Inputs and applied content stay in the editor. Copy both current Hero fields with a single clipboard action, confirm leaving, then open the latest revision from My Documents. Transfer the changes by hand, apply, and save with the newly opened revision as the CAS precondition. If clipboard access fails, select and copy from the read-only text area. |
| Unknown outcome | Keep the original command in memory and use the status endpoint. Recovery never sends another write. An owner-scoped read of the open revision can confirm a replacement session. |
| Error | Show the error and retain current editor input. My Documents can retry its read or accept a new one-time code when no operation is pending. |

The document locator consists of the ProjectRevision reference and Document ID. My Documents supplies the confirmed DocumentRevision ID and SHA-256. Read checks both against the response and hashes the returned UTF-8 bytes before initializing the editor.

Drafts and pending receipt commands live in the tab. Closing the tab discards them. Confirmed revisions survive a server restart. Session claim and document traffic are limited to this opt-in loopback profile. Production/P05 remains blocked.

Manual screen-reader verification and EN localization remain open.
