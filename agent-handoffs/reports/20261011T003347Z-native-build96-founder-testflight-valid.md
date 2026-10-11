# Native Build 96 — Founder-only TestFlight VALID

- Published: `2026-10-11T00:33:47Z`
- Founder release authority: `85f3828d`
- Founder DEXA inclusion authority: `9416dadd`
- Approved consolidated Native base: [`9c58105990fa465c0a4d7d6898d21c271931191f`](https://github.com/dustinginn/physiqueos/commit/9c58105990fa465c0a4d7d6898d21c271931191f)
- Reviewed DEXA cleanup source: [`a26d89adbf035245d0d5521a2e1d6266ebab8817`](https://github.com/dustinginn/physiqueos/commit/a26d89adbf035245d0d5521a2e1d6266ebab8817)
- Combined immutable Native candidate: [`494406ce96eee9b2b39a7b44056a71cbaee449d6`](https://github.com/dustinginn/physiqueos/commit/494406ce96eee9b2b39a7b44056a71cbaee449d6)
- Exact released source: [`fe7ff9a1df6860df1e6b56db8a1096be7f2406c2`](https://github.com/dustinginn/physiqueos/commit/fe7ff9a1df6860df1e6b56db8a1096be7f2406c2)
- Release tree: `b34d86c15891726e07f9278d1131c278e7443efe`
- Release branch: [`codex/native-build96-dexa-testflight-release-20261010`](https://github.com/dustinginn/physiqueos/tree/codex/native-build96-dexa-testflight-release-20261010)
- App: `com.physiqueos.native.dev` `1.0 (96)`
- TestFlight delivery: `c55ef3d4-734c-4900-bf83-714928ec115b`
- Result: **UPLOAD SUCCEEDED; build `VALID`; import `VALID`; present on App Store Connect**
- Distribution: **existing Founder/internal TestFlight path only; no external tester invitation, external group change, or external-beta submission**
- Production Server: unchanged exact `2e4af15c67e1899933f315e9ea0c4922151c8803`, public health `9/9`
- External beta assessment: **NO-GO pending physical acceptance and completion of the existing reliability/operations gates**

## Executive result

Founder authority approved the normal internal TestFlight release of exact consolidated candidate `9c581059` and then explicitly added the already reviewed DEXA Evidence presentation cleanup `a26d89ad` to that same release. The first Build 96 archive attempt was still compiling and had neither produced an archive nor started an upload when the DEXA instruction arrived. It was stopped before distribution; the build number remained unused and App Store Connect still recorded Build 95 as the latest upload.

The DEXA change then applied to `9c581059` cleanly, without manual conflict resolution, producing combined candidate `494406ce`. The only subsequent commit, `fe7ff9a1`, is the deterministic 95-to-96 release metadata update. That exact source was pushed, tested, Release-compiled, archived, signed, dry-run validated, and uploaded once. Apple accepted delivery `c55ef3d4…`; an independent readback reports build status `VALID`, import status `VALID`, and `is-on-app-store-connect: true`.

Build 96 preserves the approved HealthKit authorization boundary, Watch workout styling/footer removal, Today widget Weight removal, Priority schedule deduplication, durable evidence-processing state, and Founder-only value-free historical Apple Health preview. It also includes the approved DEXA Evidence cleanup. It does not include Goal Adaptation, a Server change, historical HealthKit import, Recovery activation, external alert activation, or external beta enrollment.

## Exact integration boundary

### DEXA presentation inclusion

Cherry-picking the reviewed `a26d89ad` patch onto exact `9c581059` produced `494406ce` with no conflict and no hand-authored reconciliation. Relative to `9c581059`, the product change:

- removes the obsolete `DEXA → Apple Health` status/retry card from `DEXAHistoryView`;
- removes only the associated Debug review seam;
- leaves the DEXA synchronization coordinator, settings control, canonical scans, uploads, confirmations, HealthKit writeback, briefings, and goals untouched; and
- adds the reviewed unit/UI assertions plus the original deterministic before/after visual artifacts.

The accepted Evidence hierarchy now flows directly from Latest Scan into DEXA summary metrics in both Dark and Mineral appearances. The old launch seam was deliberately supplied during the UI test and remained ignored, proving the card cannot return through stale review tooling.

### Release metadata

`fe7ff9a1` is the direct child of `494406ce`. Its diff is limited to three source-controlled files:

- `APP_BUILD_NUMBER` 95 → 96 in the authoritative generator;
- the regenerated app, Watch, extension, and test-target `CURRENT_PROJECT_VERSION` values; and
- the source-controlled `CFBundleVersion` regression assertion 95 → 96.

Project generation was run twice and was byte-identical. Generated project SHA-256: `37a06ce4c2e2cfcf8760a239342152aaa0ddd170a88896995fc7b6ab61e1143d`. The release verifier passed for `1.0 (96)`, and `git diff --check` passed.

The earlier superseded release-only commit `d21d993b` was never archived or uploaded. It remains a recoverable Git branch record but is not Build 96's released source and must not be described as containing the DEXA cleanup.

## Validation ledger

### DEXA and adjacent regression — PASS

At combined candidate `494406ce`:

- **77/77 unit tests passed** across `DEXAHealthKitWritebackTests`, `DEXAReadModelTests`, `EvidenceReadModelTests`, and `HealthKitCapabilityTests`;
- the new boundary test proved the Evidence card/review seam are absent while Settings and the real synchronization coordinator remain present; and
- **4/4 UI journeys passed** across the complete `EvidencePhotosDEXAUITests` class in 439.9 seconds, including card absence, fixed section order, every disclosure/row/chart, chart tap/scrub/vertical scrolling, and adjacent progress-photo navigation.

### Final exact-SHA focused regression — PASS

At exact release SHA `fe7ff9a1`, **41/41 tests passed**:

- 27 Today-widget tests, including the explicit proof that Weight cannot affect either widget family in Dark or Mineral Light;
- the Priority schedule deduplication test across priority types;
- seven durable evidence-processing tests covering accepted/ready separation, terminal failure, server-owned state, relaunch, offline restoration, and session clearing;
- four historical Apple Health preview tests covering 21 cancelable chunks, incomplete-authorization refusal, conservative source-separated reconciliation, and zero uploads/writes;
- the DEXA Evidence cleanup/synchronization-preservation assertion; and
- the Build 96 version/encryption/bundle identity assertion.

Round 6's exact-base evidence remains applicable to unchanged Watch and consolidated behavior: **115/115 selected tests passed** while compiling the iPhone and Watch targets. Build 96's fresh tests and Release/archive gates compiled and embedded those same Watch sources again.

### Release, Watch, and signing — PASS

- Fresh unsigned generic iOS Release build passed from `fe7ff9a1`, compiling and embedding the iPhone app, Watch companion, and widget/Live Activity extension.
- Only established Swift warnings remained; no new Release error appeared.
- Signed archive: `PhysiqueOS-Build96-fe7ff9a1.xcarchive`.
- Deep strict signature verification passed.
- Archive identity: `com.physiqueos.native.dev`, version `1.0`, build `96`, team `33GMTRM6G9`.
- Watch identity: `com.physiqueos.native.dev.watchkitapp`, companion `com.physiqueos.native.dev`, build 96.
- Extension identity: `com.physiqueos.native.dev.WorkoutActivity`, build 96.
- iPhone entitlements retain HealthKit, HealthKit background delivery, and the shared app group.
- Watch retains HealthKit; the extension retains only the shared app group and has no HealthKit entitlement.
- App and dSYM UUID match exactly: `230C0068-A0C7-368C-8A1D-04A28C2681B7`.

## Guarded upload and internal-only disposition

The established API-key uploader first completed a non-mutating dry run. Every authority, archive-identity, signature, embedded-version, dSYM, monotonic-build, and duplicate-upload check passed, yielding `WOULD UPLOAD` for `com.physiqueos.native.dev 1.0 (96)`.

The exact archive was then uploaded once with the required confirmation. Xcode reported `Upload succeeded` and `EXPORT SUCCEEDED` at approximately `2026-10-10 17:30 PDT`.

Independent delivery readback:

| Field | Result |
|---|---|
| Delivery UUID | `c55ef3d4-734c-4900-bf83-714928ec115b` |
| Build status | `VALID` |
| Import status | `VALID` |
| Present on App Store Connect | `true` |
| App Store Connect uploaded date | `2026-10-10 17:31:31 PDT` |
| Guarded local latest-upload state | `96` |
| Upload lock after completion | absent |

The upload used the pre-existing internal TestFlight process. No tester, group, public link, external review, or external beta setting was created or modified. Build 96 is the sole newly uploaded binary and is ready for Founder/internal TestFlight acceptance through the established channel.

## Founder acceptance checklist

1. Refresh TestFlight and install **PhysiqueOS 1.0 (96)** on the Founder iPhone. Confirm the bundled Watch companion also updates to Build 96.
2. Cold-launch the iPhone app three times, background/foreground it three times, then force-quit/reopen. Repeat the corresponding Watch launch/update path. A Health authorization sheet is acceptable only for a genuinely new requested type; previously approved scopes must not reprompt.
3. Verify Home's existing design is unchanged. Confirm the Today widget contains all prior information/actions except Weight and that its tightened layout remains legible in Dark and Mineral appearances.
4. Confirm Foam Rolling shows one schedule line, `Daily · 5:00 PM`, and spot-check other priority types for no duplicated time/date/cadence.
5. On Watch, confirm Ready for Workout, Complete Set, and equivalent primary workout actions use the accepted amber treatment and that the unwanted bottom bar is absent.
6. Submit or inspect a safe manual Evidence item, close/reopen the app, and verify accurate processing, confirmation, failure, retry, and action-required state without a duplicate submission.
7. Open the Founder-only Apple Health History Preview. Entry must not prompt or query automatically. Start it explicitly, cancel/restart once, then allow all 21 seven-day chunks to finish. Review only counts, sources, coverage, and gaps; do not import. Confirm no Evidence confirmation or coaching is created.
8. Open DEXA Evidence in both appearances. Confirm Latest Scan flows directly into summary metrics and that no `DEXA → Apple Health` card appears. Confirm the normal DEXA-to-Apple-Health Settings control remains available and do not change its policy merely for acceptance.
9. If any gate fails, record device/OS, exact time, appearance, steps, and a screenshot/video. Do not enroll external testers or import historical data while triaging.

## Production and safety postflight

- Public liveness remains HTTP 200 with exact build `physiqueos-2e4af15c-20261010`.
- Public readiness remains HTTP 200 with all nine checks ready and migration `000014` applied.
- This task did not deploy/restart Server, mutate production data, run a repair, import historical HealthKit data, upload health values, activate Recovery, activate alert routing, or change infrastructure.
- The most recent committed production observation retains Recovery OFF, no replay/recovery events, zero active/stale evidence work, the immutable adoption boundary, and the seven-day observation anchored to the existing Worker restart.
- Goal Adaptation was not read, merged, changed, or released.
- Free Mac storage after upload is approximately **15 GiB**, preserving the 12 GiB hard floor.

## Remaining beta-readiness requirements

1. Complete the Founder physical iPhone/Watch acceptance checklist above and record the result.
2. Continue the existing seven-day production reliability observation through approximately `2026-10-17T19:46:50Z`; do not call the window complete early.
3. Review and separately authorize any Server performance rollout. Build 96 did not deploy the queued Server candidate.
4. Decide external alert destination, operator, acknowledgement, escalation, and retention before separately activating alert routing.
5. Keep historical Apple Health import as a distinct later decision after preview acceptance; Build 96 provides preview only.
6. Keep external beta enrollment closed until physical acceptance and the reliability/operations gates are complete.

## Final flags

- `FOUNDER_TESTFLIGHT_BUILD=1.0_96`
- `NATIVE_COMBINED_CANDIDATE=494406ce96eee9b2b39a7b44056a71cbaee449d6`
- `NATIVE_RELEASE_SHA=fe7ff9a1df6860df1e6b56db8a1096be7f2406c2`
- `DEXA_CLEANUP_INCLUDED=YES`
- `WATCH_COMPANION_INCLUDED=YES_BUILD_96`
- `UPLOAD_SUCCEEDED=YES`
- `APP_STORE_BUILD_STATUS=VALID`
- `APP_STORE_IMPORT_STATUS=VALID`
- `INTERNAL_ONLY_PROCESS_PRESERVED=YES`
- `EXTERNAL_TESTERS_INVITED=NO`
- `PRODUCTION_SERVER_CHANGED=NO`
- `PRODUCTION_DATA_MUTATED=NO`
- `RECOVERY_ACTIVATED=NO`
- `ALERT_ROUTING_ACTIVATED=NO`
- `HISTORICAL_HEALTHKIT_IMPORTED=NO`
- `HEALTH_VALUES_UPLOADED=NO`
- `GOAL_ADAPTATION_INCLUDED=NO`
- `DISK_FLOOR_12_GIB=PRESERVED_AT_APPROX_15_GIB`
- `FOUNDER_ACCEPTANCE=READY`
- `EXTERNAL_BETA=NO_GO`

**Final disposition: PASS — Build 96 is VALID on the existing Founder/internal TestFlight path. Founder remote physical acceptance may begin; external beta remains gated.**
