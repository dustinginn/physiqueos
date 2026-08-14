# Combined App Platform and persistence cutover

Status: implementation and isolated rehearsal design only. This document is not a production migration authorization. Windows, legacy JSON, and local production media remain authoritative until a new, exact combined-cutover authorization is issued.

## Why the transition is combined

A persistence-only transition cannot complete while the accepted PostgreSQL firewall permits only App Platform and the Windows serving runtime cannot consume the new canonical store. Moving the full application first also cannot complete because App Platform's ephemeral filesystem cannot provide the shared, durable semantics required by the legacy JSON and media implementation. A bridge or a temporary durable legacy store would create another authority plane and an immediate second migration.

The selected transition therefore moves serving, commands, reads, domain persistence, media, migration control, worker, and outbox authority together:

`Windows Next.js + legacy JSON/media -> fenced combined cutover -> App Platform Next.js/worker + PostgreSQL/Spaces`

The web product remains a first-class client. A future iOS client will call the same versioned application/API boundary. Neither client owns canonical storage; both observe PostgreSQL and private Spaces through the shared server application layer.

## Authority map

| Concern | Before the cutover | After accepted cutover |
| --- | --- | --- |
| Web serving and public routing | Windows production task and its current route | App Platform full Next.js web service and provider route |
| Canonical commands and reads | Windows application over Founder JSON | App Platform application boundary over PostgreSQL |
| Founder runtime | Versioned legacy JSON on Windows | PostgreSQL canonical tables and runtime metadata |
| Production media | Windows local evidence tree | Private, versioned Spaces objects plus PostgreSQL ownership records |
| Migration/runtime control | Protected Windows control and runtime-authority record | Transactional PostgreSQL control and runtime-authority record |
| Worker and outbox | Existing Windows-owned behavior; provider worker inert for production | One authority-gated App Platform worker and PostgreSQL outbox |
| Operational control | Windows task and protected local operations | App Platform health/readiness/operations with strong server-side authorization |
| Recovery | Current Windows build, JSON/media, and encrypted packet | Provider-compatible code rollback, PostgreSQL recovery/forward repair, Spaces versions; retained Windows data is recovery evidence only |

No intermediate phase has two canonical writers. PostgreSQL and Spaces may contain validated noncanonical copies before authority transfer, but those copies do not become canonical merely by existing.

## Machine-checkable invariants

The durable runtime-authority tuple binds environment, operation ID, authorization fingerprint, fence ID, final snapshot digest, Founder revision/digest, media manifest digest, migration-control digest, Windows source/build, provider source/build/deployment, PostgreSQL target, Spaces target, and routing target.

- `windows-legacy-authoritative` is the only state in which Windows may accept canonical writes.
- `combined-cutover-in-progress` requires an active matching Windows fence. No application accepts canonical writes.
- `provider-prepared` requires exact transfer receipts, PostgreSQL/Spaces semantic parity, provider readiness, and matching control/worker acknowledgements. It is non-public and write-blocked except for explicitly synthetic acceptance.
- `provider-authoritative` is entered once for the exact tuple. Windows can never regain write authority from this state.
- `recovery-required` preserves provider/PostgreSQL authority while writes may be paused for compatible-code rollback and forward repair.
- A provider canonical command must atomically verify `provider-authoritative` and record the first-provider-write marker in the same PostgreSQL transaction as its canonical mutation.
- A Windows command must fail closed whenever its protected control is fenced or no longer Windows-authoritative.
- A provider upload is noncanonical until private object readback validation and the final PostgreSQL ownership transaction succeed. Failure aborts multipart upload or deletes the exact uploaded version.
- The worker polls only when the same provider-authoritative tuple is complete; leases, retries, dedupe keys, and terminal receipts remain PostgreSQL-durable.
- No runtime falls back to Founder JSON, local media, or ephemeral container disk in provider canonical mode.

## Production phase model

1. **A — pre-fence validation.** Re-read live source/build, Founder revision and SHA-256, media inventory, control digest, targets, firewall, backups, provider compatibility deployment, routing preparation, capacity, alerts, and exact new authorization. Abort without mutation on drift.
2. **B — Windows fence.** Activate the protected Windows write fence for the exact operation. Reads follow the maintenance contract; all canonical commands and upload completion are rejected. Drain in-flight work and prove the fence across Workout Logger, evidence, weight/check-in, priorities, goals/protocols, and uploads.
3. **C/D — final capture/package.** After the drain, capture one authoritative JSON/media/control snapshot and create one deterministic package-v2 identity. Re-read the source after capture to prove it did not change behind the fence.
4. **E — one-time transfer.** Transfer only the authorized package and its declared media manifest over TLS to the provider execution boundary. Chunks are scoped to operation, artifact, ordinal, byte range, size, and SHA-256. Replays are idempotent only when bytes and metadata match; drift is rejected. The final receipt binds the complete manifest and authorization fingerprint. This is a cutover operation, not a continuing synchronization service.
5. **F/G — non-public import.** Import domain state transactionally into the exact PostgreSQL target and copy media privately into versioned Spaces. Objects remain noncanonical until manifests, ownership, MIME, length, hash, and version IDs validate.
6. **H/I/J — provider validation.** Validate complete semantic read parity, command readiness without legacy writes, media reads/uploads, full product route inventory, health, readiness, worker/outbox, and source/build identity while provider public writes remain disabled.
7. **K — durable preparation.** Record exact transfer receipts and provider/control/worker readiness. Both sides must show the same tuple. Windows records the provider acknowledgement while retaining its fence.
8. **L — authority/routing handoff.** Atomically transition provider runtime authority, keep Windows fenced, enable the prepared App Platform route, and verify that only the provider can reach the canonical command boundary. Routing must not lead this step.
9. **M — combined first-write boundary.** The first real canonical production command accepted through the provider application is committed with the first-write marker. This is the irreversible boundary.
10. **N/O — release and smoke.** Release writes only through the provider platform, start the authority-gated worker, and perform immediate web/read/write/media/user-facing acceptance. Windows remains stopped or read-only and cannot accept writes.
11. **P — stabilization.** Enter the approved observation period, reconcile domain/media/outbox state, verify backups and cross-client semantics, and retain legacy recovery material for at least the approved 35 days and until every exit condition passes.

## Fence and final snapshot ownership

Windows owns the fence through final snapshot capture and provider-prepared acknowledgement. The fence denies every canonical command, including logger finish, evidence confirmation, weight/check-in, priority completion, goal/protocol edits, and upload completion. Reads may continue from the frozen legacy snapshot with an explicit maintenance status. Provider control does not become authoritative at import time; it becomes authoritative only during the single authority transition after exact preparation evidence exists.

## One-time authenticated transfer

The transfer initiator supplies an operations-authenticated request whose digest is bound into the separately approved authorization. The provider verifies a short-lived credential using the existing server-only credential pepper, requires the exact operation and deployment identity, and permits only declared package/media artifacts. TLS is mandatory. The receiver stores chunks in noncanonical temporary storage, verifies each SHA-256, records idempotent PostgreSQL receipts, and assembles only after every declared range exists. It verifies package, Founder, media, control, source/build, target, and authorization digests before acknowledging `provider-prepared`.

The interface never accepts arbitrary destination paths, shell commands, bucket keys, or caller-selected database objects. Raw Windows paths and provider object keys never appear in client responses. Interrupted upload resumes by asking for missing declared chunks. A mismatched replay, extra artifact, expired credential, cross-owner request, or tuple drift fails closed. Temporary artifacts are removed after completion/abort under the approved retention rules.

Pre-staging may contain only synthetic or explicitly nonauthoritative data. The final authoritative package is created and transferred only after the fence.

## PostgreSQL and application composition

Provider full-runtime mode composes all Founder repositories from PostgreSQL. Reads hydrate a fresh canonical runtime. Mutations execute under a PostgreSQL advisory lock and transaction, compare the expected full-runtime fingerprint, apply the application unit of work, persist all changed canonical collections/context/metadata, record provenance and outbox effects, and advance runtime revision. Compatibility mode is restricted to named isolated test databases and can never claim production authority.

Server components, actions, and `/api/v1` share application handlers. Provider mode has fail-closed build replacements for Founder file runtime and protected Windows migration control. There is no JSON fallback or dual write. The same command contracts—idempotency, expected versions, ownership, provenance, replay/drift rejection, suppression, and outbox—apply independently of whether the caller is web or future iOS.

## Media and domain atomicity

New provider uploads use a durable intent and private multipart upload. The server validates declared type/length/hash, performs private readback validation, then commits ownership, canonical media metadata, related record mutation, first-write claim when applicable, and outbox entry in PostgreSQL. A failed upload is aborted; a failed final transaction compensates by deleting the exact object version. Retry is keyed to the intent and identical payload; payload drift is rejected.

Existing migrated objects are accepted only when the final inventory validates count, bytes, MIME, SHA-256, owner, logical media ID, object version, and no public ACL. Clients see `media://` logical references and short opaque application handles. The server redeems them, rechecks owner/expiry, and proxies a signed private read without revealing object keys.

## Worker handoff

The Windows/background producer is drained before final capture. The provider worker may run in compatibility mode but cannot poll the production outbox until the exact authority tuple is provider-authoritative. Authority-gated polling, durable leases, idempotent handlers, retry/dead-letter rules, and dedupe prevent duplicate canonical effects. The first provider worker heartbeat and outbox health are readiness requirements. Failure after handoff pauses work or enters `recovery-required`; it never restarts a stale Windows consumer.

## Routing handoff

The current Windows public route and any LAN/tunnel fallback remain unchanged in this patch. Before the future window, the exact provider hostname, TLS, rollback mechanics, TTL/dashboard action, and operator are recorded. The route is prepared but not enabled until provider preparation is durable. Windows stays fenced throughout the switch. A pre-first-write routing failure may return traffic to the unchanged fenced/then-unfenced Windows snapshot after the abort verifier passes. After the first provider write, traffic may move only among schema-compatible provider builds; it never returns to a write-enabled stale Windows runtime.

## Rollback and recovery matrix

| Point | Permitted response |
| --- | --- |
| Before fence | Abort; Windows remains authoritative and writable. |
| Fence through provider-prepared, before authority transfer | Remove noncanonical provider artifacts as allowed, verify the Windows snapshot/control are unchanged, release the exact fence, and resume Windows. |
| Authority transferred but no provider canonical write | If exact invariant checks prove no provider write, reverse routing/control once, restore Windows legacy authority, then release its fence. Any uncertainty fails closed. |
| First provider canonical write recorded | PostgreSQL/Spaces and App Platform remain canonical. Pause writes, promote a schema-compatible provider rollback build/spec, and repair/reconcile forward. Windows remains write-disabled. |
| Media completion partially fails | Abort/delete exact noncanonical version or reconcile the durable intent/outbox; never leave an accepted record permanently pointing to missing media. |

Synthetic rehearsal injects failures at fence, snapshot, transfer, import, media, database validation, Spaces validation, read parity, command readiness, routing preparation, acknowledgement, first provider write, media finalization, and worker startup. Pre-boundary cases must restore an unchanged legacy fingerprint; post-boundary cases must enter `recovery-required` with provider authority preserved.

## Readiness and product parity

Compatibility acceptance must cover Home, Log, weight, nutrition, activity, Evidence Review, goals, Operating Plan, priorities, progress, Confidence V2, briefings, training history/day/library/detail, profile, and private media. It compares IDs, values, ordering, dates/timezones, destinations, versions, freshness, and presentation inputs.

Command acceptance covers every Phase 3 command plus logger start/past-workout, area/search/exercise creation, previous performance, set prepopulation/edit/add/remove, variants/supersets, draft/resume/leave/cancel/finish/review, Apple Health reconciliation, Evidence Review handoff, TrainingSession/day/library effects, suggestions, and false/superseded exclusion. Evidence acceptance covers nutrition, training, Apple Health, photo, DEXA, generic intake, review, intent/completion, duplicate/replay, relationships, and private reads. Goals, Operating Plan, protocols, priorities, progress, and published Confidence/briefing ownership must retain generic multi-user contracts with no Founder shortcut.

Provider readiness reports source/build, PostgreSQL connection and schema, Spaces reachability/private policy, worker heartbeat, outbox health, authority/control state, epoch/composition, media readiness, and whether any legacy dependency is enabled. Compatibility mode reports prepared/non-authoritative truthfully and cannot report canonical provider authority.

## Build, security, topology, and cost

`Dockerfile.product` builds the full Next.js standalone runtime separately from `Dockerfile.foundation`. `Dockerfile.provider-worker` builds the worker. Provider build tracing replaces legacy Founder/file control imports with fail-closed modules. The image excludes `private`, `.env*`, logs, recovery material, Founder seed/runtime, personal fixtures, stories, and production evidence; secrets are runtime-injected encrypted variables.

`infra/digitalocean/app.product.template.yaml` retains one 512 MiB web and one 512 MiB worker in the existing app and uses the existing Managed PostgreSQL and private/versioned Space. The database firewall remains App-Platform-only. No new recurring resource is required; the accepted base remains $30.15/month, beneath the $50 ceiling. Capacity must be measured during compatibility deployment before cutover.

## Timing and hard boundaries

The old 2–5 minute persistence-only estimate is invalid for this combined transition. Local synthetic timings are useful only as component measurements. The production write-pause estimate is established after an exact-source provider compatibility deployment and a provider-backed copy rehearsal measuring fence/drain, final package generation, resumable transfer, PostgreSQL import, media copy, semantic parity, startup, routing, and smoke separately.

The future authorization must include the measured range and a hard pre-first-write abort time. Until provider-backed measurement exists, no production window or inherited ten-minute boundary is approved.

## Recovery packet and retention

The final packet is refreshed only after the combined source and compatibility deployment are accepted. It contains the final fenced Windows JSON/media/control state, combined source, exact provider source/build/spec, current and rollback Windows builds, compatible provider rollback build/spec, package-v2 and transfer tooling, authority state/receipts, PostgreSQL and Spaces inventories, routing configuration, and runbooks. It is encrypted, replicated off-machine, restore-tested, and retained for at least 35 days and until all approved exit conditions pass. This document does not refresh or delete the current packet.

## Authorization gates

The mandatory sequence is:

1. Preserve this exact source through End Work Session.
2. Build the exact checkpoint in isolation.
3. Separately authorize and deploy the full provider runtime in non-authoritative compatibility mode.
4. Complete provider-backed full-product acceptance and capacity/timing measurement.
5. Refresh and restore-test the recovery packet for the accepted lineage.
6. Run a fresh combined-cutover preflight.
7. Obtain a new exact GO binding runtime and persistence authority, final Founder/media/control identities, Windows and provider identities, targets, recovery packet, routing, pause/abort/recovery rules, inactive authentication, retention, and the user's no-writes acknowledgement.
8. Execute the production combined cutover.

The prior migration GO is permanently invalid. No compatibility deployment, production fence, production transfer/import, route switch, authentication activation, or iOS implementation is authorized by this runbook.

## Compatibility remediation checkpoint (2026-08-14)

Predeployment artifact inspection found that repository-root `tmp` was distinct from ignored `.tmp`: Next standalone tracing copied a tracked Founder-derived Playwright runtime and a private rendered briefing into the product artifact. The current branch removes those four private/generated `tmp` files in a normal forward change, ignores root `tmp`, excludes it from the Docker context and output tracing, prunes forbidden roots in both runtime images, and runs an independent final-artifact scanner. Historical commits are unchanged; any history-rewrite decision is separate and is not authorized here.

Compatibility authority is now an explicit durable `provider-compatibility-nonauthoritative` state in migration `000005`. It preserves Windows public, migration-control, and legacy canonical authority; disables production writes and combined execution; has no production operation or first-write boundary; and permits only the guarded Phase 5 test/restore databases. Web, worker, repository commands, and media completion revalidate that exact tuple. Production-authoritative behavior continues to require the original strict handoff tuple.

This source checkpoint alone does not apply `000005`, initialize the provider database, import synthetic data, change the app specification, or deploy. Those steps remain gated on independent read access to the current App Platform specification and a separately verified noncanonical provider preparation path.
