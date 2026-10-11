# Create Broadcast + Stream — implementation and verification

Based on upstream `9af60cd`, local branch `codex/create-broadcast-stream`.
Development package version: `3.2.0-create-broadcast.3`.
No upstream push or pull request was made.

## Auto-start option in prerelease .3

The creation action now offers **Auto-start when encoder sends video**, default
false. Only an explicit boolean true enables `contentDetails.enableAutoStart`;
missing values on existing buttons continue to mean false. Auto-stop remains
false and the creation action still never calls the transition endpoint.
With auto-start enabled, YouTube itself can go live when the new stream receives
video, so a separate test/live stage is no longer part of that workflow.

Nine additional tests cover API true/false/omitted values, action option defaults
and strict boolean parsing, and callback completion after publication of the
new key. Documentation distinguishes callback completion from Companion's
concurrent execution, sequential execution timeout and failure behavior.

## Packaging correction in prerelease .2

The user reported Linux `EACCES` while importing `companion/HELP.md` from .1.
Inspection found the archived `pkg/companion/` directory had mode `0555`, inherited
from the Windows/OneDrive read-only attribute. Companion's tar-fs importer
creates that directory before opening the child file for writing, which fails
for an unprivileged Linux user. The previous Windows startup test did not cover
that Linux extraction behavior.

`scripts/normalize-package.mjs` now rebuilds the archive using the packaging
tool's existing tar dependency, with portable metadata, directory mode `0755`
and regular-file mode `0644`. It then reads the resulting archive and asserts
every entry's mode and the presence of the entrypoint, manifest and help file.
`yarn package:portable` runs compilation, standard packaging and normalization.
All 12 archive entries passed this check. Version .2 installs into a new module
directory so the failed .1 extraction need not be repaired in place.
The .2 packaging correction did not change the YouTube action implementation. Native Linux import still
requires confirmation on the user's installation; no Linux environment is
available on this Windows build host.

## Architecture

`index.ts` owns the existing OAuth client, creates `YoutubeConnector` and `Core`,
and publishes Companion definitions through `reloadAll` / `reloadStates`.
`actions.ts` registers actions; Companion's module API 1.13 expands variable-aware
input fields before their callbacks. `Core` maintains `StateMemory` and controls
lifecycle transitions. `youtube.ts` is the existing authenticated API wrapper.
`vars.ts` declares and exports variables from the cache.

The new operation uses these same layers. No new dependency, OAuth client, scope,
webhook, external service or changes to the existing transition algorithms were
introduced. `authorization.ts` was reviewed and remains unchanged: the
`youtube.force-ssl` scope is accepted for each of the three creation calls.

## Changed files

| File                                | Change                                                                                                                                                                                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/actions.ts`                    | New action and six options with defaults; title/description use host variable expansion                                                                                                                                                       |
| `src/youtube.ts`                    | Validation, three API calls, sanitized errors, compensating cleanup and authenticated restoration; refresh batches cover locally added resources beyond the discovery limit; empty/unbound channels and missing statistics/health are handled |
| `src/core.ts`                       | Per-connection creation lock, immediate cache/definition publication, saved-ID restoration, stale-refresh protection, coordination with reload and connection shutdown                                                                        |
| `src/cache.ts`                      | In-memory created-broadcast result including ingest details                                                                                                                                                                                   |
| `src/types.ts`                      | Creation options, supported video formats and non-secret persisted identifier type                                                                                                                                                            |
| `src/vars.ts`                       | Six stable last-created variable definitions and values, initially empty                                                                                                                                                                      |
| `src/config.ts`                     | Hidden last-created IDs and defensive ID loading                                                                                                                                                                                              |
| `src/index.ts`                      | Save only IDs using existing config persistence; finish creation before reconfiguration and preserve newer IDs                                                                                                                                |
| `src/__tests__/mock/module.ts`      | Persistence mock methods                                                                                                                                                                                                                      |
| `src/__tests__/mock/youtube-api.ts` | Creation/restoration mock methods                                                                                                                                                                                                             |
| `src/creation.test.ts`              | 47 new tests for the transaction and its integration                                                                                                                                                                                          |
| `src/vars.test.ts`                  | Empty-cache expectations include six permanent variables                                                                                                                                                                                      |
| `companion/HELP.md`                 | Usage, variables, encoder handoff, existing actions, persistence, cleanup and API restrictions                                                                                                                                                |
| `package.json`                      | Distinct prerelease version                                                                                                                                                                                                                   |
| `INSTALLATION-DE.md`                | German installation, Stream Deck workflow and real-channel test instructions                                                                                                                                                                  |
| `IMPLEMENTATION.md`                 | This delivery and verification report                                                                                                                                                                                                         |

## Transaction and persistence choices

Creation is `liveBroadcasts.insert` → `liveStreams.insert` → `liveBroadcasts.bind`.
The scheduled time is five minutes ahead; auto-start defaults to false and
is explicitly configurable. Auto-stop remains false.
The monitor stream is enabled. A non-reusable RTMP stream is inserted each time.
No transition endpoint is called during creation. Both IDs and ingest data must
be present and the binding confirmed before publishing success.

Only broadcast/stream IDs are persisted in connection config; the key is fetched
again through the existing client on restart/reload. Raw Google error objects
are not propagated or logged by the creation/restoration path. In-memory
Companion variables necessarily expose the key to authorized users and any
configured consuming module. The module cannot control those modules' logging.

The previous successful result survives failed creation. Cleanup affects only
resources just created by the failing invocation, deleting broadcast before
stream. If broadcast deletion fails, the stream is retained for inspection.
Creation requests disable automatic retry. Lost responses/process termination
cannot be made atomic with remote API creation: unknown orphan resources must
be checked in Studio. No automatic deletion of successfully created resources.

Concurrent invocations on one connection are ignored. A later press is a new
intentional creation; locks do not span separate connections or processes.
The cached last result is retained on a temporary reload failure within a session;
after restart it remains empty until the authenticated restore succeeds.

## Verification results

- `yarn install --immutable`: passed with Yarn 4.14.1; lockfile unchanged.
- `yarn test`: **183 passed**, 10 test files, including 47 new tests. Passed on
  Node **22.23.3**. The earlier 174-test suite also passed on Node 24.19.0.
- `yarn check-types`: passed.
- `yarn lint`: passed.
- `yarn build`: passed.
- `yarn package:portable`: completed; archive contains
  `main.js`, all three generated JavaScript chunks, manifest, help and licenses.
- `companion-module-check` on the packaged folder: passed.
- Package startup smoke test on Node 22.23.3: accepted registration for
  module API **1.13.6** through a simulated host IPC endpoint.
- `git diff --check`: passed.

The existing dependency set reports an ESLint peer-version warning. Packaging
also reports that three installed dependency packages lack separate license
files; the tooling-generated license inventory/package validation passes.
No dependency versions or lockfile entries were changed to suppress warnings.

The initial Windows sandbox test attempt failed at temporary-file rename before
tests started. Tests ran successfully outside that sandbox. The initial packaging
environment lacked npx; packaging was repeated using an official Node 22 runtime
verified against its published SHA-256 checksum. Only the subsequently validated
complete archive is delivered.

These tests mock YouTube. A real Google token refresh, YouTube channel creation,
encoder ingestion and test/live/finish cycle remain to be verified in the user's
installation. No real-channel success is claimed.

## Official API references checked

- [Broadcast insert: fields, scheduling and OAuth](https://developers.google.com/youtube/v3/live/docs/liveBroadcasts/insert)
- [Stream insert: required CDN settings and OAuth](https://developers.google.com/youtube/v3/live/docs/liveStreams/insert)
- [Binding](https://developers.google.com/youtube/v3/live/docs/liveBroadcasts/bind)
- [Stream resource: paired variable resolution/framerate; deprecated cdn.format avoided](https://developers.google.com/youtube/v3/live/docs/liveStreams)
- [Companion package format](https://companion.free/for-developers/module-development/module-lifecycle/module-packaging/)
