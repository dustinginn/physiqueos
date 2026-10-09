# Build 93 Energy back-trail correction — focused PASS, release BLOCKED by storage gate

Task: `20261008-codex-build93-energy-backtrail-unblock-resume`  
Prompt commit: `5f5ab0519c106ea8fab0cc83cef2a0bbc929760a`  
Generated: 2026-10-09T05:54:19Z  
Status: **BLOCKED / fail closed**

The Energy back-navigation defect is understood, corrected narrowly, and proven by its focused UI journey. The required complete one-pass iPhone UI rerun was then stopped when free storage crossed the assignment's explicit 12 GiB hard floor. Therefore the full Build 93 gate matrix is incomplete. No Server deployment, archive, export, TestFlight upload, release-pointer change, Recovery activation, or production-data mutation was performed.

## Exact candidates

| Lane | Branch | Exact published SHA | State |
|---|---|---|---|
| Native | `codex/native-build93-final-integration-20261008` | `ac3def4ce6941138719f3a39c7cbbfc521b29eb0` | Published; clean; descends from prior integrated candidate `1b209ebf` |
| Server | `codex/build93-final-server-integration-20261008` | `e03f6768627f49175c476208eca79c99ae3d5ee9` | Published; clean; unchanged by this follow-up; **not deployed** |

Both remote refs were read back from GitHub and matched the SHAs above.

## Investigation and authority decision

The failed expectation was authoritative, not stale:

- Accepted Build 92 source and the pre-correction Build 93 candidate have no Energy product-code or Energy UI-test delta. `EnergyHistoryView.swift` and `RecoverySleepAcceptanceUITests.swift` are unchanged across the Build 92 release SHA `beaf5eff` and the original Build 93 integration SHA `1b209ebf`.
- The Founder-approved Build 90 redesign authority explicitly says: pages pushed directly from Energy read `‹ Energy`, while pages pushed inside its sheets read `‹ Daily Energy History` (`agent-handoffs/artifacts/build90-remaining-redesign-20261006/README.md`).
- The existing focused UI journey enforces all three relevant cases: Energy entered from the Evidence Hub reads `Evidence Hub`; a Nutrition page pushed from the Daily Energy History sheet reads `Daily Energy History`; a direct Activity push from Energy reads `Energy`.
- `EnergyHistorySheet` already owned a sheet-local `EvidenceBackTrail(seed: [title])`, but the nested `NavigationStack` destination router did not explicitly receive it. In the failing runtime, the pushed destination resolved the outer Evidence stack trail and therefore presented `Evidence Hub`.

This was a product environment-propagation defect. Weakening the test would have contradicted the approved navigation contract.

## Smallest correction

One production file changed: `ios/PhysiqueOS/Presentation/Evidence/EnergyHistoryView.swift`.

The `AppDestinationRouterView` created by the sheet's `.navigationDestination` now receives the sheet-local `evidenceBackTrail` explicitly. Diff size: four insertions, one deletion. There was no broad Energy redesign, test expectation change, held Energy history integration, Server change, or unrelated edit.

Correction commit: `ac3def4ce6941138719f3a39c7cbbfc521b29eb0` (`fix(ios): bind Energy sheet destinations to local back trail`).

## Focused verification — PASS

Fresh simulator: `B93 Energy Gate iPhone 17 Pro`, iOS 27.0.  
Isolated DerivedData and result bundle were used.

`EnergyRecoveryRedesignUITests.testEnergyEstimateWordingSheetsLinksAndBackTrail`:

- **1 executed / 1 passed / 0 failed**;
- XCTest duration **275.268 seconds**;
- Xcode result: `** TEST SUCCEEDED **`;
- verified root Energy back label `Evidence Hub`;
- verified nested Nutrition back label `Daily Energy History` and return to the still-open sheet;
- verified direct Activity back label `Energy`.

The candidate was committed and pushed only after this focused pass.

## Complete one-pass iPhone UI gate — STOPPED at mandatory disk floor

Before starting the full suite, inactive Codex-owned regenerable DerivedData from earlier Build 92/93 lanes was removed and free space was restored to **17,873,892 KiB (17.05 GiB)**. No source, archive, credential, signing asset, worktree, or Claude-owned simulator was touched. No Claude `xcodebuild`, `xctest`, or `XCTRunner` process was active.

A second fresh simulator, `B93 Full Gate iPhone 17 Pro`, was created. The complete `PhysiqueOSUITests` target began as one uninterrupted pass against exact Native `ac3def4c`. The rebuild completed without an error (known compile warnings only), and the suite progressed across repeated test launches without emitting an XCTest assertion failure or runner crash.

At 2026-10-09T05:50Z, free space measured **12,534,948 KiB (11.95 GiB)**. The assignment says `HOLD below 12`, so the active run was interrupted immediately. Xcode did not finalize the result bundle; `xcresulttool` correctly rejected it as incomplete, so no partial pass count is claimed. The interruption is not represented as a test pass or a test failure.

The exact lane-owned full-gate simulator, DerivedData, and incomplete result bundle were then deleted. Final free space after cleanup settled at **16,604,668 KiB (15.83 GiB)**. No Xcode/test runner remains active.

Because this is a new gate failure and the Founder instructed `Stop on any new failure`, no additional Xcode suite was started.

## Gates not completed after the stop

The following required fresh gates remain incomplete and are not waived:

- completed one-pass iPhone UI result;
- integrated Morning Weight failure/retry/canonical-persistence matrix;
- full iPhone units;
- Watch units and Watch UI on both supported sizes;
- widget tests and remaining Recovery UI/release checks;
- fresh deterministic generator verification and clean Release build on `ac3def4c`;
- archive, signing/export readiness, guarded upload dry run, and upload.

The Server candidate's previously published focused/broad/build evidence remains valid as candidate history, but the instruction required rerunning every Build 93 gate after this correction. That rerun was not completed, so it cannot authorize deployment.

## Production and TestFlight — unchanged

Fresh read-only verification after the stop:

- production branch `combined-app-platform-cutover`: `84cc64e4e7205b2540bf78ea43afd1cbfb068d06`;
- active DigitalOcean deployment: `32143aa4-90d4-496a-81b2-17f35a609fde`, phase `ACTIVE`;
- `/api/v1/health/live`: `status=ok`, build `physiqueos-84cc64e4-20261008`;
- `/api/v1/health/ready`: `status=ready`, **9/9** checks ready, schema `PROVIDER_MIGRATION_000014_APPLIED`;
- Build 93 Server `e03f6768`: **not deployed**; there is no Build 93 deployment ID;
- Build 93 Native: **not archived, exported, validated, or uploaded**; there is no Build 93 delivery ID;
- current Build 92 delivery `56b0c334-b8f5-42e4-979b-78e68a6d0573`: build `VALID`, import `VALID`, present on App Store Connect.

`agent-handoffs/latest.json`, `latest.md`, and the release backlog were not changed because Build 93 is not released.

## Safety ledger

- Production writes: **zero**.
- Founder weight writes/backfills, including 178.1 lb: **zero**.
- Recovery activation/calibration or production Sleep reads/backfill: **zero**.
- Server deployments: **zero**.
- Archives/exports/uploads: **zero**.
- Existing Builds 85–92 archives and signing credentials: untouched.
- Claude's pre-existing `B91 Evidence iPhone 17 Pro` simulator: untouched.

## Rollback and exact next action

No production rollback is necessary because production did not change.

Candidate rollback is one commit: revert `ac3def4c` to return to `1b209ebf`. That is not recommended: the focused regression proves `ac3def4c` restores the approved navigation contract.

The next authorized release-resume attempt should first establish at least 20–25 GiB free without touching protected assets, start from exact Native `ac3def4c` and Server `e03f6768`, reverify no authority drift, and rerun the complete gate matrix from the beginning. Only an all-green fresh matrix can authorize the already specified guarded Server deployment and single Build 93 TestFlight upload.

Morning Weight remains present in the unreleased Build 93 candidate, but Build 92 remains the only validated TestFlight build. It was not safe to publish Build 93 tonight after the storage gate failed.
