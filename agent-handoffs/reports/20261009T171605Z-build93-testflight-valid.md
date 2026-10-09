# Build 93 guarded release — Server deployed, TestFlight VALID

**Recorded:** 2026-10-09T17:16:05Z

**Assignment:** `agent-handoffs/inbox/prompts/20261009-codex-build93-final-testonly-sha-gated-release.md` at `bfd93a83486104b28f8f1fb89ff357a3347a1152`

**Native:** `9d0a206908fc3c4a64976e9cc3840e23cab0ba55` (`codex/native-build93-final-integration-20261008`)

**Server:** `e03f6768627f49175c476208eca79c99ae3d5ee9` (`codex/build93-final-server-integration-20261008`)

**Result:** **PASS — Build 93 is VALID on App Store Connect and the guarded Server candidate is active.**

## Executive result

Every Founder-authorized release gate passed without a new product or test failure. Exact Native candidate `9d0a2069` was archived as PhysiqueOS 1.0 (93), uploaded once through the guarded API-key path, and independently reconfirmed by delivery status as build `VALID`, import `VALID`, present on App Store Connect. Delivery UUID: `15ae3b39-2594-47a7-a686-7920b3a7faf0`.

Exact Server candidate `e03f6768` fast-forwarded the production branch from verified rollback anchor `84cc64e4`, deployed as `69a8dc14-461f-4680-91a3-14e42522494f`, and is ACTIVE 9/9 with both web and worker on the exact candidate. Public live and ready checks report build `physiqueos-e03f6768-20261009`; all nine readiness checks pass and schema remains `PROVIDER_MIGRATION_000014_APPLIED`.

Recovery remains **OFF**. A post-deploy bounded production read used `REPEATABLE READ READ ONLY`, verified `transaction_read_only=on`, and found exactly zero `recovery_briefing_publication_authority` rows and zero historical briefing rows containing a Recovery assessment. No Recovery activation, Sleep backfill, historical briefing rewrite or real Founder Sleep read occurred. The deployed code accepts Recovery only for Weekly and Monthly if a separate future authority is installed; Midweek, DEXA, Photo and other cadences remain excluded.

No DEXA recovery, Morning Weight backfill, historical correction replay, production data runner, migration, seed, build-number change beyond already-approved 93, or unrelated next-build scope was executed.

## Authority and candidate integrity

| Gate | Result |
|---|---|
| Assignment authority | `origin/main` exact `bfd93a83` before release work |
| Native local and remote | clean and exact `9d0a2069`; application source identical to final integrated `ac3def4c`; only `ios/PhysiqueOSTests/TrainingLoggerTests.swift` differs |
| Server local and remote | clean and exact `e03f6768` |
| Production pre-deploy branch | exact `84cc64e4`; proven ancestor of `e03f6768` |
| Production pre-deploy deployment | `32143aa4-90d4-496a-81b2-17f35a609fde`, ACTIVE 9/9, web + worker exact `84cc64e4` |
| Native build metadata | bundle `com.physiqueos.native.dev`, version `1.0`, build `93` |
| Unrelated worktrees | not modified; no Claude Xcode process was active when Xcode gates began |

## Credited exact-candidate evidence

The assignment explicitly authorized crediting evidence that remained valid after the one-file test-only replacement SHA:

- full iPhone unit target on exact `9d0a2069`: **2,283 executed; 2,281 passed; 2 designed skips; 0 failed**;
- focused Logger/Watch matrix on exact `9d0a2069`: **265/265**;
- corrected stale Watch-projection test: 1/1, containing suite 14/14;
- final Energy back-navigation UI gate: **1/1** on app-source-equivalent final candidate;
- prior mapped full iPhone UI evidence: **93/93** on the unchanged covered journeys, reconciled under the Founder-approved Option B matrix rather than rerunning the 87-minute suite;
- integrated Recovery and widget feature-lane evidence remained source-equivalent and was covered again by the targeted integration matrix below.

No unit suite was rerun after this evidence because no Native source, project or build metadata changed.

## Founder-approved 12-test iPhone UI matrix

One fresh iPhone 17 Pro simulator on iOS 27.0, one isolated DerivedData directory, one nonparallel `test-without-building` invocation, and the exact twelve approved methods:

1. `FoamRollingPriorityDetailUITests/testPriorityFamilyVariantsRenderTheirLockedActionsOnly`
2. `FoamRollingPriorityDetailUITests/testMorningCheckInLockedDispositionsAndAtomicAction`
3. `FoamRollingPriorityDetailUITests/testManualWeightRevealsReturnToLogOnlyAfterADurableSave`
4. `FoamRollingPriorityDetailUITests/testHomeOddFinalPrioritySpansTheBottomRowInDarkAndMineralLight`
5. `FoamRollingPriorityDetailUITests/testHomeAccessibilityDynamicTypeUsesReadableSingleColumnPriorities`
6. `LoggerParityCaptureUITests/testProgressionSuggestionActionabilityDark`
7. `LoggerParityCaptureUITests/testProgressionSuggestionActionabilityMineralLight`
8. `TrainingAcceptanceUITests/testHomeWidgetStartAndResumeLinksOpenTheLoggerWithoutCreatingAWorkout`
9. `Build89IntegrationUITests/testCombinedRootReviewRoutesDark`
10. `Build89IntegrationUITests/testCombinedRootReviewRoutesMineralLight`
11. `BriefingRecoveryAcceptanceUITests/testNoRecoveryAnywhereWithoutAPublishedCard`
12. `BriefingRecoveryAcceptanceUITests/testMonthlyCardSitsBetweenEnergyAndNewBaselineWithWeeklyAggregates`

Result: **12/12 passed, 0 failed, 0 skipped**. XCTest duration 659.523 seconds; operation duration 742.911 seconds. The finalized result bundle independently reported the same totals.

## Watch gates

| Gate | Device | Result |
|---|---|---|
| Full Watch unit target | watchOS 27 build destination | **76/76**, 0 failed, 0 skipped |
| Full Watch UI target | Apple Watch Series 12 (42mm), watchOS 27 | **11/11**, 0 failed, 0 skipped |
| Full Watch UI target | Apple Watch Ultra 4 (49mm), watchOS 27 | **11/11**, 0 failed, 0 skipped |

All runs were serialized. Finalized result bundles were independently summarized before their disposable simulators and DerivedData were removed.

## Project, Release, signing and archive gates

- `generate_project.py` ran twice; `project.pbxproj` SHA-256 was identical both times: `f38c5dd889f10a1453a8b0d181e4dd9c0260ef3a6c1a9f5dccf442e51c11ef53`.
- Required `0x20FF` and `0x21FF` blocks were present.
- `verify_release_configuration.py` passed for version 1.0 (93), AppIcon, app-only HealthKit capability, matching App Group, Workout Live Activity and Home widget extension.
- `git diff --check` passed and the Native candidate remained clean.
- Clean unsigned generic Release build: **BUILD SUCCEEDED**.
- App, Watch app and extension all reported version 1.0 (93) with their expected bundle identifiers.
- Exact DEBUG/review-seam scan across app, Watch and extension: zero forbidden test-launch seams.
- One valid local signing identity was available for team `33GMTRM6G9`; App Store Connect API-key authentication and Build 92 delivery authority rechecked successfully.
- Signed archive: `/Users/dustinginn/Library/Developer/Xcode/Archives/2026-10-09/PhysiqueOS-Build93-9d0a2069.xcarchive`.
- Archive result: **ARCHIVE SUCCEEDED**; `codesign --verify --deep --strict` passed.
- App UUID `D68A9D50-CFC3-3374-8D42-5AA3324D1E77` matched the dSYM UUID.
- Archived app binary SHA-256: `440c4b19f845e5295e8ab627da05777bd55c06c06a3ef5a7cbc80946410d7ff1`.
- Guarded upload dry-run passed every identity, version, signature, dSYM, monotonic-build and uniqueness check and returned `WOULD UPLOAD UPLOAD com.physiqueos.native.dev 1.0 (93)`.

Known compiler warnings were unchanged and non-fatal; there were no Release errors.

## Server validation

Fresh and credited exact-SHA evidence was reconciled before deployment:

- prior exact-`e03f6768` focused Server matrix: **16 files / 264 tests passed**;
- HealthKit strategic boundary selection: **5/5 passed**;
- broad relevant Server baseline: **1,868 passed, 15 accepted pre-existing baseline failures, 3 skipped, zero new failures**;
- ESLint: **37 touched files passed with zero warnings**;
- production build: **50/50 routes generated**;
- no migration, schema, dependency, infrastructure or deployment-file drift;
- fresh final Recovery/HealthKit selection during this release: **7 files / 93 tests passed**, covering provider wiring, cadence integration, publication, execution-context publication, Monthly seam, Sleep quarantine and strategic read boundaries.

Static and test evidence proves absent/disabled/malformed Recovery authority fails closed before any Sleep input read, Recovery publication is Weekly/Monthly only, and historical backfill/artifact rewrite remain forbidden.

## Guarded Server deployment

1. Reverified GitHub production branch exact `84cc64e4`, candidate clean, and fast-forward ancestry.
2. Plain fast-forwarded `combined-app-platform-cutover` to exact `e03f6768`; no force push.
3. Updated only four approved app-spec values: `PHYSIQUEOS_GIT_SHA` and `PHYSIQUEOS_BUILD_ID` for web and worker.
4. After replacing those four values with a neutral marker, before/after specs had identical SHA-256 `e9cbfda9a5f7028d4acc4954c912227b56dc395be618ac48862407125b4e7497`.
5. Deleted the private temporary spec immediately after the platform accepted the update.
6. Started a forced rebuild. The platform's automatic stamp-update deployment `881c7d6e-9390-448b-b83e-cf73ccd65db2` was superseded and finished `CANCELED` at 1/9.
7. Authorized deployment `69a8dc14-461f-4680-91a3-14e42522494f` reached **ACTIVE 9/9**. No deployment remains in progress.
8. Both web and worker report `source_commit_hash=e03f6768627f49175c476208eca79c99ae3d5ee9`.
9. `/api/v1/health/live`: HTTP 200, `status=ok`, build `physiqueos-e03f6768-20261009`.
10. `/api/v1/health/ready`: HTTP 200, `status=ready`, **9/9 ready**, schema `PROVIDER_MIGRATION_000014_APPLIED`.

Rollback anchor remains Server `84cc64e4`, deployment `32143aa4-90d4-496a-81b2-17f35a609fde`.

## Recovery OFF production verification

After the new deployment was active, the approved Mac console runner executed a purpose-built bounded audit inside the web component:

- runtime SHA gate: exact `e03f6768`;
- owner scope: exact canonical Founder owner;
- `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`;
- `SHOW transaction_read_only` returned `on`;
- parameterized owner-scoped counts only;
- explicit `ROLLBACK` before the success marker;
- authority rows: **0**;
- historical briefing rows with a Recovery assessment: **0**;
- runner exit: 0 with the unique success marker.

No Sleep rows or values were read, printed or exported. No credential, database URL, certificate, environment binding or Founder evidence is present in this report.

## TestFlight delivery

The guarded helper rechecked every archive and authentication gate, then executed one upload:

- bundle/version/build: `com.physiqueos.native.dev` / 1.0 / 93;
- previous uploaded build: 92;
- Xcode export/upload: **EXPORT SUCCEEDED**, upload succeeded;
- delivery UUID: `15ae3b39-2594-47a7-a686-7920b3a7faf0`;
- helper processing result: **VALID**, import **VALID**;
- independent status invocation: build `VALID`, import `VALID`, `is-on-app-store-connect: True`;
- App Store Connect uploaded date reported: 2026-10-09 10:14:21 AM Pacific.

No retry was needed or attempted.

## Storage and cleanup

| Stage | Available KiB | Available GiB |
|---|---:|---:|
| Initial final-release preflight | 22,776,676 | 21.72 |
| Lowest measured point, after iPhone UI matrix | 17,361,836 | 16.56 |
| Before generic Release | 18,548,420 | 17.69 |
| Before guarded upload | 20,178,940 | 19.24 |
| Final report stage | 19,404,348 | 18.51 |

The 12 GiB hard floor was never breached; minimum measured margin was 4.56 GiB. Each completed disposable simulator and isolated DerivedData directory was removed only after result extraction. The signed Build 93 archive, prior release archives, iCloud reference archive, credentials, production tooling, candidates, user-owned `.pnpm-store`, and active worktrees were preserved.

## Release content and exclusions

Build 93 carries the approved integrated Home/Morning Weight behavior, odd-final-priority full-row layout, Logger suggestion actionability, DEXA informational reminder behavior, Widget/Watch/Live Activity theme work, Energy back-navigation correction, and the dormant Weekly/Monthly Recovery Server/Native seams represented by the final candidates.

Explicitly excluded and unchanged:

- Claude's separately held DEXA confirmation recovery `539f7006`;
- any Recovery authority activation or real-data shadow/calibration run;
- Recovery in Midweek, DEXA, Photo or other excluded surfaces;
- historical Recovery backfill or briefing rewrite;
- DEXA/weight repair or backfill;
- next-build Founder feedback items;
- any replay of completed Static Hold or Super Set corrections.

## Remaining human gate

Build 93 is technically released to TestFlight but not yet physically accepted. Founder should install Build 93 and verify Morning Weight, Home priority layout/actions, Logger suggestion behavior, DEXA reminder behavior, Watch workout actions and the Home widget on real devices. Recovery remains invisible/off until a separate future calibration and activation authorization.

**STOP.** The authorized release task is complete; no further deployment, activation or production-data action is implied.
