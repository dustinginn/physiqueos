# Build 70 consolidated integrated candidate — peptide/Pause-Resume + roll-forwards + persistent pairing (status: CANDIDATE, all gates passed, NOT deployed / NOT uploaded)

Decision executed: `agent-handoffs/inbox/decisions/20260930T024000Z-build70-integrate-persistent-pairing.md`. Supersedes the standalone candidates in `20260930T020500Z-peptide-build70-final-candidate-closeout-v2.md` (do NOT deploy `b94ab533` / upload `4c93d9f5` standalone).

## Current production authority (independently reverified 2026-09-30, read-only)
App `bf57cf56-…`, active deployment `3e87b8a7-8af6-4280-9cfd-b7437ff5f995` (ACTIVE). Web AND worker stamps `PHYSIQUEOS_GIT_SHA=446bc964dc31318ea48261400e8b243cdd1d4ab1`, build id `physiqueos-446bc964-20260929`; branch `combined-app-platform-cutover` = `446bc964`. `/api/v1/health/live` ok and `/ready` ready (buildId matches). `PHYSIQUEOS_SENDER_CONSTRAINED_REFRESH_ENROLLMENT` is NOT set in production. Authority matches the expected value; no material difference (98534bf8 is an ancestor of 446bc964). No production mutation.

## Exact combined candidates (dustinginn/physiqueos, pushed)
| Layer | Branch | SHA |
|---|---|---|
| **Server** | `claude/build70-integrated-server-20260930` | **`4a81f5b4cac981f9241e40b556341246b83c3309`** |
| **Native (Build 70)** | `claude/build70-integrated-native-20260930` | **`754376c529964eea280e87419ace68a003a9e0fb`** |

Parents. Server: production `446bc964` + merge of Claude `b94ab533` (merge-base `98534bf8`; peptide Pause/Resume + read contract, Logged Today provenance, Foam Rolling skip, weekly averages) + merge of Codex `5f51dc4d` (`codex/auth-persistent-pairing-server-20260929`, merge-base `98534bf8`) + one test fix commit. Native: Claude `4c93d9f5` + merge of Codex `05554855` (`codex/auth-persistent-pairing-native-20260929`, merge-base Build 69 `efa65db1`). Build number remains **70** (no bump); pbxproj regeneration deterministic; Codex added no new Swift files.

## Overlap / conflict resolution
- Both merges were textually clean (no conflict markers): Photo Intelligence (deployed in 446bc964) is not touched by either parent; review found no Photo file changes and no reverts.
- Semantic fix (Server): `scripts/PhysiqueOSMigrationDiscovery.test.js` hard-coded "through 000014" and failed with the new migration; updated to expect `000015_sender_constrained_refresh_recovery.cjs` (`4a81f5b4`).
- Native semantic checks: Codex's `HomeViewModel.reconnectRequired` case coexists with my Home changes (notification-sync `sweepsDeliveredOrphans` untouched); `ProductionNativeAPI` init only gained a parameter; `PeptideSupportEditorViewModel` error switch has a `default`; no exhaustive-switch breakage (whole app+tests typecheck clean).
- Codex's handoff report lives on branch `codex/auth-persistent-pairing-handoff-20260929` (not on main).

## Migration 000015 status
`db/migrations/000015_sender_constrained_refresh_recovery.cjs` re-reviewed against production schema through 000014: purely additive (columns with NOT NULL DEFAULT 0/CHECK on `devices`, `sessions`, `access_credentials`; new tables `installation_signing_keys`, `refresh_proof_challenges`, `refresh_exchanges`, `refresh_exchange_access_credentials`). FK targets exist (`devices_id_user_unique`, `sessions_id_user_device_unique` from 000002; users/refresh_credentials/access_credentials from 000001); all existing rows satisfy the new constraints (version 0 ⇒ NULL key). Down migration drops only what up created (do not roll back destructively once proof-bound sessions exist). Expect brief table locks at Founder scale. NOT applied to production. Retention note (P2): no cleanup job yet for challenge/exchange rows (~1 per refresh); `ON DELETE RESTRICT` on exchange FKs would block a future hard-delete of sessions/credentials.

## Rollout gates (default OFF, verified in code)
- Server: `PHYSIQUEOS_SENDER_CONSTRAINED_REFRESH_ENROLLMENT === "1"` required (`productionApplicationComposition.js`); unset in production today; must stay unset for the compatibility deployment. Off ⇒ a supplied `refreshProof` is ignored and only legacy strict one-use rotation sessions are created; proof-bound sessions never downgrade (DB CHECK + protocol-mismatch rejection); no bearer grace.
- Native: `PHYSIQUEOSSenderConstrainedRefreshEnrollment` = **false** in `Info.plist` and `SenderConstrainedRefreshRollout.isEnabled` requires explicit true; with it off no Secure Enclave key is created and pairing omits `refreshProof`. Ordinary Build 70 does NOT enroll the Founder installation.

## Validation on the exact SHAs
Server `4a81f5b4`:
- Full unit regression vs production baseline (`446bc964`: 9216/9525, 304 failures): candidate **9365/9674, 304 failures, 0 new** (final clean run). An earlier run under concurrent load showed 1 transient timeout (`productionEsmSyntaxIntegrity` 5.4s>5s); it passes in isolation (1.5s) and in the clean full run.
- Migration/schema + auth targeted set (`src/platform/auth`, migrations, `PostgresIdentityStore`, native contract/routes): 28 files, 381 tests pass. `test:phase2` 121/121, `test:foundation` 38/38 (same as Codex's evidence), `test:access-gate` 174/174.
- `test:phase3` 1 failure and `native-sandbox` 2 failures and `migration-safety` 15 failures are identical to the production baseline (same test ids; verified by diff for migration-safety).
- Persistent-pairing threat matrix, legacy-refresh compatibility, Build 70 targeted tests: all within the above suites.
- Production build `npm run build -- --webpack`: exit 0.
Native `754376c5`:
- Full `PhysiqueOSTests` (iPhone 17 Pro, iOS 26.5): **1575 tests, 0 failures** (includes persistent-pairing security/recovery tests, peptide/Build 70 tests, Build 69 daily-driver tests).
- Release compile (`-configuration Release -destination generic/platform=iOS`): **BUILD SUCCEEDED** (only the 3 pre-existing `BackgroundExecutionAssertion` actor warnings).

## Fresh-context reviews of the exact combined SHAs
Server `4a81f5b4` and Native `754376c5`: **no P0, no P1** (Codex's own independent review also SHIP P0/P1/P2 = 0). Confirmed: gates off by default; legacy rotation order unchanged; no downgrade; replay/wrong-key/stale proofs cannot rotate/recover; pending rotation persisted before network; fresh proof per attempt; relaunch recovery before reads; Secure Enclave key non-exportable with no Face ID/LocalAuthentication; no secrets in logs; challenge issuance bounded; Photo Intelligence untouched.
P2 observations (not blocking, for Founder awareness; none changed in this integration to preserve Codex's SHIP-reviewed implementation):
1. (Gate on) malformed `refreshProof` key input throws a plain error → 500 instead of 400.
2. Holding only a refresh credential can overwrite a device's pending challenge (nuisance; attacker cannot sign).
3. Retention/`RESTRICT` note above; `refresh-challenge` route is not listed in the native bootstrap contract manifest/OpenAPI (documented in `docs/auth-persistent-pairing-protocol-v1.md`).
4. Every authenticated request now does `SELECT … FOR UPDATE` + `first_used_at` UPDATE on the access credential (extra write load, independent of the gate).
5. Native, flag off: legacy refresh now deletes the credential only for a listed set of terminal 401 codes (Build 69 deleted on any 401); the first legacy refresh/pair rewrites the Keychain item as a versioned JSON envelope (one-way: reinstalling Build 69 over Build 70 needs a re-pair); legacy credential format regex `^[A-Za-z0-9_-]{43,128}$` assumed; connection view may trigger a rotation on open; Home error copy now distinguishes offline/recovering/reconnect.
6. Claude-side note: the Build 70 briefing-focus projection now receives execution items/check-ins (paused peptides excluded); `DAILY_BRIEFING_VERSION` unchanged.

## Disk / resources
Free 16.8 GiB after all gates (floor 15). Reclaimed only regenerable output (`.next` dirs of two candidate worktrees, test/Release DerivedData, simulator erase). Nothing else deleted.

## Deployment / TestFlight
NOT deployed; NOT uploaded; production untouched (read-only authority check only).

## Deployment order (for Founder approval; nothing authorized)
1. Run migration `000015` (additive) as part of the deploy step; 2. deploy Server `4a81f5b4` with `PHYSIQUEOS_SENDER_CONSTRAINED_REFRESH_ENROLLMENT` unset and verify Build 69 devices still refresh (legacy strict rotation), health live/ready, peptide read keys; 3. archive/upload Native Build 70 `754376c5` with the Info.plist gate false; 4. Founder accepts on device; 5. any enrollment only via the controlled canary below.
## Controlled enrollment / canary plan (later, separate explicit decision)
Enable the Server flag; produce a separately reviewed Native canary build with the Info.plist gate true for only the intended installation; pair/reconnect that installation so the Server returns `sender-constrained-refresh-v1`; verify normal rotation, simulated lost response, stale challenge retry, access-first-use denial, revocation, reconnect with the same key and secret-free events before broader enablement. Never deploy only Native or remove proof support while enrolled sessions exist.
## Rollback
Server: restore prior stamps/branch head `446bc964` with force-rebuild (per established procedure); migration 000015 stays (additive); Build 70 peptide state written by the new code reads as Custom on older code and a rollback silently un-pauses paused peptides. Auth: disable the enrollment flag first; keep proof-capable code while enrolled sessions exist; never add bearer grace. Native: Build 69 can be reinstalled but needs re-pair after Build 70's Keychain envelope migration.

## Founder acceptance checklist (changed workflows only)
1. After Server deploy: existing Build 69 iPhone continues to load Home/refresh unchanged (legacy path); `/live`,`/ready` OK.
2. Build 70 install (gate off): app opens without re-pairing, Home loads, no Face ID prompt anywhere; connection screen shows normal connected state.
3. Peptide screen/Pause/Resume, Logged Today caption, Foam Rolling skip, weekly averages (checklist in the earlier closeout).
4. Workout Complete PR celebration and HealthKit paths unchanged.
5. Confirm Photo Intelligence (multi-view, holistic briefing) renders as before.

## Local-only state
None. Both integration worktrees clean and pushed. Private Founder harness stays only in the local job dir. Not touched: Photo Intelligence audit, HealthKit reconciliation-notification issue, Face ID/app lock.
