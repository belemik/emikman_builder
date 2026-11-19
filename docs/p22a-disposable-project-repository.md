# P2.2a · Initial document repository

The local fixture stores one personal web application per synthetic account. A create operation commits the Project, one Work, one Document and its first immutable Revision together. The project and initial revision have server-generated IDs and UTC creation timestamps. The initial document is the empty WDeaf web screen from the existing Canvas model, checked by the existing strict Screen Schema v3 validator.

## Interface and boundaries

- DTO version `0.1` exposes `create(context, { version, type, name })` and `read(context, projectId)`. The first revision has `sequence: 1` and `parentId: null`. The read returns one linked snapshot from the current file, including the exact initial JSON and its SHA-256 digest. The digest detects accidental changes to the JSON bytes and provides no independent proof of origin.
- The repository accepts a genuine `TestFixtureAuthority` context. The context identity is checked in the authority's private map. Synthetic account scope comes from that lookup. A foreign project returns the same `not-found` result as a missing project. A caller can mint fixture grants locally through a fixture authority it controls. The process and its directory owner are trusted in this experiment.
- The SQLite file `p22a-initial-document.sqlite` lives in a registered private temporary volume. Reopen checks directory ownership, allowed filenames, file permissions, initialization marker, SQLite profile, foreign keys and quick integrity. SQLite uses the local `DELETE` journal and `FULL` synchronous mode in this fixture. This is a separate file and schema from P03.
- The writer starts a `BEGIN IMMEDIATE` transaction before checking the one-project slot. Unique and foreign-key constraints enforce the linked graph, including the document head. The result is published to the caller after SQLite acknowledges commit.
- An exception during the transaction makes that handle unavailable. The test suite reopens after injected pre-commit exceptions and checks the persisted row counts. `unavailable` by itself does not prove rollback. Ambiguous commit, durable receipts, save/CAS, backup/restore and independent recovery authority are outside this create/read slice.

There is no HTTP route, Workspace integration, live account access or P03 migration. The verification below covers graceful close/reopen and injected exceptions. Crash and physical power-loss durability, production filesystem qualification and performance are unverified.

## Reproduction

```sh
node node_modules/tsx/dist/cli.mjs --test tests/project-p22a-disposable-repository.test.ts
node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --module esnext --moduleResolution bundler --resolveJsonModule --esModuleInterop tests/project-p22a-disposable-repository.test.ts tests/fixtures/p22a-disposable-worker.ts
npm run build:server
npm test
```

Local targeted result on macOS arm64, Node 26.13.0 and SQLite 3.54.0 was **11/11 PASS**. The tests check the linked graph and strict renderer, read after close/reopen, two-account isolation, malformed commands, four rollback injection points, revocation before commit, competing submissions from two independent processes, private file prerequisites and rejection of a corrupted snapshot. The concurrent test checks the result of contention for the same account slot. It does not measure exact lock acquisition timing.
