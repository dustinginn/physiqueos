# Founder persistent-pairing canary — checkpoint: Native Build 72 candidate ready; activation blocked on changed Server authority and disk floor

Status: **blocked / waiting for Founder**. Authorization: `agent-handoffs/inbox/decisions/20260930T151500Z-persistent-pairing-founder-canary.md`. HealthKit Sleep was not started.

## Repositories, branches, and exact SHAs

- Repository: `dustinginn/physiqueos`.
- Reviewed pre-canary Server authority named by the decision: `4a81f5b4cac981f9241e40b556341246b83c3309`.
- Current production Server authority: `372c306ba45ffaa0f93f7bf74e4c0c266070d9a5`, deployment `4dac1b07-8fc6-4ab4-9b8d-7f9c3756ddbb`, ACTIVE 9/9 on web and worker.
- Native Build 71 authority: `71164900210f689480ed277205bf8a43b6d18ead`.
- Native canary branch: `codex/persistent-pairing-founder-canary-20260930`.
- Exact pushed Native Build 72 candidate: `279103107f044141aa4c9a7487f281dc6fd19423`.
- Checkpoint branch: `codex/persistent-pairing-founder-canary-checkpoints-20260930`.

## Authority verification and concurrent production change

At task start, production was independently verified at the expected `4a81f5b4`: deployment `1fa2121a-5729-49c3-9865-a79f1724bb3f`, web and worker source hashes exact, `/api/v1/health/live` 200 and `/api/v1/health/ready` 200, runtime build `physiqueos-4a81f5b4-20260930`. The enrollment flag was absent/off.

During this task a separately authorized Photo Intelligence rollout advanced production to `372c306b` and deployment `4dac1b07...`. Current `origin/combined-app-platform-cutover` is exact `372c306b`. The new SHA is a descendant of `4a81f5b4`; its complete diff from `4a81f5b4` is limited to ten Photo Intelligence implementation/test files. No auth, migration, database, deployment, or Native file differs. The new runtime is healthy: live 200, ready 200, runtime build `physiqueos-372c306b-20260930`; the enrollment flag remains absent/off.

The guarded spec update was stopped before mutation because the canary decision named `4a81f5b4`, while the live authority is now `372c306b`. No flag or deployment change was made by this canary task. Founder approval is required to activate the reviewed flag on the auth-preserving `372c306b` authority.

## Exact Server flag/config state

- Before task: `PHYSIQUEOS_SENDER_CONSTRAINED_REFRESH_ENROLLMENT` absent on the web runtime; effective value off.
- Current/after checkpoint: absent; effective value off.
- A candidate spec was verified to add exactly one `web` `RUN_TIME` entry with value `1`; removing that entry produced a byte-equivalent structured spec. It was **not applied**.
- Worker configuration, source branch, source stamps, topology, encrypted variables, alerts, health check, ingress, and instance sizes were not changed.

## Pre-enrollment production evidence (secret-free)

Migration `000015_sender_constrained_refresh_recovery` is present. Read-only aggregate queries showed:

- installation signing keys: 0;
- capable devices: 0;
- proof-bound sessions: 0;
- refresh-proof challenges: 0;
- refresh exchanges: 0;
- active legacy sessions: 6.

No identifiers, credentials, public keys, proofs, nonces, signatures, intents, successor credentials, hashes, or private Founder payloads were read or published.

## Native Build 72 candidate

Build 71 gate-off cannot enroll, so the reviewed rollout requires a separate canary binary. Exact `27910310` is Build 71 plus only four rollout/build-metadata files (5 insertions / 5 deletions):

- `PHYSIQUEOSSenderConstrainedRefreshEnrollment`: `false` to `true`;
- authoritative generator build number: 71 to 72;
- generated Debug/Release app build number: 71 to 72;
- version assertion: 71 to 72.

No auth implementation, product workflow, HealthKit, Photo Intelligence, entitlement, signing, privacy, API, or Server code changed. The branch is clean and pushed.

## Validation actually run on exact `27910310`

- deterministic project generation: passed;
- release configuration verification: version 1.0 (72), icon, HealthKit declarations, exempt encryption: passed;
- Info.plist lint: passed;
- Git whitespace check: passed;
- exact diff audit against Build 71: four files / 5 insertions / 5 deletions only;
- `FounderServerAPITests` on iPhone 17 Pro simulator: **243 passed, 0 failed, 0 unexpected**;
- included sender-constrained cases: local gate, Secure Enclave non-exportable/unattended/device-only attributes, canonicalization, pairing key advertisement and durable envelope, normal rotation/read retry behavior, lost-response + relaunch recovery with exact successor/fresh proof, atomic promotion failure, stale/replayed proof retry with retained intent, replay/revocation terminal handling, reconnect UI mapping, and diagnostic redaction.

Previously reviewed unchanged implementation evidence remains: Native full suite 1,590/1,590 and Release compile on the Build 71 product source; integrated Server threat matrix/security review at `4a81f5b4` returned SHIP with P0/P1/P2 all zero. This checkpoint does not re-label those prior runs as exact-Build-72 runs.

## Validation/builds not run

- Release archive: not run.
- TestFlight upload: not run.
- App Store Connect processing/VALID check: not run.
- Real-device enrollment, refresh, relaunch, lost-response, stale/replay/wrong-key, non-downgrade, Face ID absence, and product-workflow acceptance: not run because enrollment remains off.
- No broad simulator tour and no HealthKit Sleep work.

## Disk/resource blocker

The required 15 GiB heavy-operation floor was initially restored to 15.96 GiB by deleting only two unused 765 MB `node_modules` directories from clean, finished auth-review worktrees; source/history remained. Focused Xcode compilation increased encrypted swap from about 11.9 GiB to 14.0 GiB and reduced disk free space. The task simulator was shut down and its 506 MB DerivedData deleted after the passing result. Current free space is about **12.35 GiB** and `vm.swapusage` is about **14.0 GiB used of 15.0 GiB**. A Release archive must not start until at least 15 GiB is free. No source, active Photo Intelligence output, archives, credentials, private data/evidence, or rollback material was deleted.

## Blockers and Founder input needed

1. Explicitly approve enabling `PHYSIQUEOS_SENDER_CONSTRAINED_REFRESH_ENROLLMENT=1` on current production Server authority `372c306ba45ffaa0f93f7bf74e4c0c266070d9a5`. This SHA preserves the reviewed auth implementation unchanged and adds only the separately deployed Photo Intelligence corrections.
2. Restore at least 15 GiB free space before archive, preferably by restarting the Mac or otherwise reducing application memory pressure so encrypted swap is reclaimed. Do not delete protected/private material merely to reach the floor.

## Safe next step after approval/action

1. Reverify GitHub, production branch, active web/worker SHA, health, flag-off state, and zero proof-bound enrollment.
2. Apply exactly the one web runtime enrollment flag against the then-current exact authority; wait for the config deployment; prove both components remain on that exact SHA, health green, existing sessions still legacy, and no silent enrollment.
3. Recheck disk/swap at or above the 15 GiB floor; archive exact Native candidate `27910310` as version 1.0 (72); verify identity, deep signature, dSYM, and archived gate=true; run the guarded upload dry run; upload through Xcode only; wait for VALID.
4. Ask Founder to install Build 72 and perform only the explicit reconnect/pair step. Do not claim enrollment until aggregate and installation-bound production evidence proves exactly one intended proof-bound installation.
5. Execute the authorized canary matrix without secrets or destructive tests against unrelated sessions. Obtain separate confirmation before any destructive Founder revocation test lacking a non-destructive equivalent.

## Rollback / disable-new-enrollment

If activation fails, remove/disable the enrollment flag to stop new enrollment, but keep the proof-capable Server code at `372c306b` or a proof-capable descendant and keep migration 000015. Never downgrade an enrolled proof-bound session to bearer refresh, never add bearer grace, and never drop the migration. Use the reviewed reconnect/recovery path for the canary installation.

## Local-only state

- Exact Build 72 worktree is clean; candidate is pushed.
- No private Founder harness or evidence was created.
- Xcode test DerivedData was deleted after results were recorded.
- No archive exists yet.

## Current recommendation

Do not enroll yet. The canary remains technically ready at source/test level, but activation and distribution must wait for explicit approval of the changed Server authority and restoration of the disk floor.
