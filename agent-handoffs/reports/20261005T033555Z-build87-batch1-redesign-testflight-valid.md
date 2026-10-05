# Build 87 — accepted Redesign Batch 1 uploaded, Apple VALID

- Generated (UTC): `2026-10-05T03:35:55Z`
- Agent: Codex A
- Status: **BUILD 87 UPLOADED / APPLE VALID / AWAITING FOUNDER PHYSICAL-DEVICE ACCEPTANCE**
- Governing prompt: `agent-handoffs/inbox/prompts/20261005T030000Z-build87-batch1-redesign-testflight.md` at `d966abc54e5bf8b4d3a1e5a13f926e5aeacafa2b`

## Result

| Item | Value |
|---|---|
| Build 86 base | `cec8af20a6121bb66ecca3ba9f667d91774a891c` |
| Founder-accepted Batch 1 authority | `c4a74ad0855a0500e42a90a81d6f4a871e5cc3c5` |
| Exact Native candidate uploaded | **`f66c7fc690b1b61094e620791ee2d4a40caf3799`** on `codex/redesign-batch1-home-goals-you-20261005` |
| Release | `com.physiqueos.native.dev` **1.0 (87)** |
| Archive | `~/Library/Developer/Xcode/Archives/2026-10-04/PhysiqueOS-Build87-f66c7fc6.xcarchive` |
| App binary SHA-256 | `84244d5e2d3c659b79b6b8f4893a8c9613afe686f09dd9dd8f69403a7c43a513` |
| App / dSYM UUID | `B3A647F7-FDCE-3552-8B9A-0C6E90636022` (match) |
| Delivery id | **`2129e4b4-23e8-40d7-b955-d40ab0274642`** |
| Apple status | **processing `VALID`, import `VALID`** |
| Release receipt | `~/.physiqueos-release/logs/receipt-b87.json`; upload log `upload-b87-20261004-202845.log` |

Build 87 contains the accepted Home + Goals + You/Settings redesign implementation on top of Build 86, and no Batch 2 implementation.

## Candidate and project-generation proof

- The uploaded candidate's parent is exactly the accepted Batch 1 commit `c4a74ad0`; that commit's parent is exactly Apple-VALID Build 86 `cec8af20`.
- The release-layer delta above accepted Batch 1 is limited to:
  - canonical `APP_BUILD_NUMBER` 86 → 87 in `ios/Scripts/generate_project.py`;
  - generated project synchronization, including the already-accepted `HomeJourneyFieldView.swift` and `HomeRedesignReviewFixture.json` entries in the canonical generator;
  - the source-controlled release assertion 86 → 87.
- Two consecutive project generations were byte-identical after the intended bump: project SHA-256 `e308eb6bdffe9042aabab65e7a4508e3ab48f732f63a70e9280133fa9a95505d`.
- `verify_release_configuration.py` passed: 1.0 (87), AppIcon, app-only HealthKit capability, matching App Group, Watch app, Live Activity and Home widget graph.
- The candidate branch was pushed before archive creation. Unrelated pre-existing widget review PNG modifications in the working tree were not staged or committed.

## Regression gates

### Passed

- Batch 1 focused Home, Goals, Goals sandbox, Shared UI/appearance and App Tab tests: **124 passed, 0 failed**.
- Training/HealthKit/Watch transport/finish lifecycle/Live Activity regression subset: **268 passed, 0 failed**.
- Watch unit regression suite: **47 passed, 0 failed**.
- Goals acceptance, locked Foam Rolling dark/light, representative shipping-surface dark/light, and direct System appearance UI render checks passed.
- The accepted dark/mineral Home/Goals/You review artifacts remain at `agent-handoffs/artifacts/redesign-implementation-batch1-20261005/`.
- Full Native unit execution after the 87 assertion bump: **2,005 tests, 1 skipped, 1 failure**. The only failure is the same pre-existing `PeptideSupportEditorViewModelTests.testSandboxChangeDoseKeepsHistoryAndPauseResumeWorkAgainstTheFixture()` fixture failure documented on the accepted Batch 1 candidate. The Build 87 source-controlled configuration assertion passes.
- Generic iOS Release compile: **BUILD SUCCEEDED**, including iPhone app, Watch app and Live Activity/Home widget extension dependency graph.

### Non-candidate diagnostics retained for transparency

- A combined Watch scheme run executed the required Watch units successfully but also ran Watch UI tests; 6/7 UI tests passed. `testFinalSetFinishShowsConfirmationOnThePrimarySurfaceAndNotYetReturns()` failed to re-find the finish button after **Not Yet**. Build 87 changes no Watch source; the required Watch unit suite is independently green 47/47.
- The nested You → Settings → Appearance interaction UI test did not navigate under the simulator hierarchy, while direct Appearance rendering in dark/light, System rendering, and the appearance store/palette tests passed. The nested action implementation is byte-identical to Build 86. No speculative release change was made.

No introduced product-code regression was found in the Build 86 Watch/HealthKit, Training, Foam Rolling, Appearance infrastructure, widget or Live Activity areas.

## Archive verification

- `xcodebuild archive` completed with **ARCHIVE SUCCEEDED** through the established signing workflow.
- The archive contains exactly the expected app family:
  - `PhysiqueOS.app` — `com.physiqueos.native.dev`, 1.0 (87);
  - `PhysiqueOSLiveActivity.appex` — `com.physiqueos.native.dev.WorkoutActivity`, 1.0 (87), carrying the Live Activity + Home widget;
  - `PhysiqueOSWatch.app` — `com.physiqueos.native.dev.watchkitapp`, 1.0 (87).
- `codesign --verify --deep --strict` passes for all three bundles.
- Team is `33GMTRM6G9`; archive is retained outside every Git repository; app and dSYM UUIDs match.

## Guarded TestFlight upload

1. Dry run passed every environment, authentication, archive-identity, signing, dSYM and monotonic-build gate and returned the exact verdict `WOULD UPLOAD UPLOAD com.physiqueos.native.dev 1.0 (87)`.
2. Execute used the exact confirmation `UPLOAD com.physiqueos.native.dev 1.0 (87)`.
3. `xcodebuild -exportArchive` reported **EXPORT SUCCEEDED** and upload success.
4. Guarded polling reached terminal **VALID** for delivery `2129e4b4-23e8-40d7-b955-d40ab0274642`.

No guardrail was bypassed. No browser login or App Store Connect UI was used.

## Production Server authority observed (read-only)

- No Server code, configuration or data was changed.
- Current active deployment remains `99188a9e-75a7-49c6-a5c2-05a43737de5f`, phase **ACTIVE**, progress 9/9.
- Web and worker source authority both remain **`27dad44a1f63d68b53f23e51152a10a5d04968e6`**, build id `physiqueos-27dad44a-20261005`.
- `/api/v1/health/live` returned `ok`; `/api/v1/health/ready` returned `ready` with all 9 checks ready, including migration `000014`.
- This is the expected production authority containing Sleep/V3 graduation plus the confirmed Option A Strength presentation.

## Founder physical-device acceptance checklist

Install Build 87 from TestFlight and inspect:

### Home

- Locked hierarchy, spacing and text sizing.
- Confidence ring and intentionally subtle divider lines beneath it.
- Primary Goal phase timeline: no extra progress bar; approved vertical rail and phase markers.
- Guardrail rectangle geometry and treatment in both appearances.
- Priorities and Training Today.
- Briefing button without the redundant purple “Midweek Briefing” eyebrow.
- Navigation in Dark, Mineral Light and System appearance.

### Goals

- Goals root and Your Journey.
- Active Build Lean Mass Goal and its phase pages.
- Completed Visible Abs Goal.
- Progress bars and first/final real progress photos.
- Navigation and Dark/Mineral parity.

### You / Settings

- Locked You hierarchy.
- Goals and Operating Plan routes.
- Settings shell and Appearance page.
- System/Dark/Mineral Light switching, immediate application and persistence.
- Confirm there are no dead Profile, Data Sources or Sign Out destinations.

### Regression spot check

- Log remains usable in its pre-Batch-2 form.
- Training Logger opens.
- Foam Rolling still works.
- Watch app launches.
- Home widgets and Live Activity are not obviously regressed when naturally available.

Do not perform an extra workout solely for Build 87. Build 86 Watch workout acceptance can continue naturally with the next real workout.

## Scope stop

- **Batch 2 was not started.** Claude's Batch 2 lane remains PREP ONLY.
- Build 87 is Apple VALID. Work stops here for Founder physical-device acceptance.

## Flags

`BUILD_87` · `BATCH_1_ACCEPTED` · `HOME_GOALS_YOU_SETTINGS` · `APPLE_VALID` · `DELIVERY_2129E4B4` · `SERVER_UNCHANGED` · `BATCH_2_NOT_STARTED`

- CONTAINS_SECRETS: NO
- CONTAINS_CREDENTIALS: NO
- CONTAINS_PRODUCTION_EXPORTS: NO
- CONTAINS_FOUNDER_EVIDENCE: NO
- SAFE_FOR_CHATGPT_RETRIEVAL: YES
