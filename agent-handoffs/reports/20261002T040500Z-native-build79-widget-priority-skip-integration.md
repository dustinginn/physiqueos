# Native Build 79 — Home Screen Widget V1 + Priority Skip consolidation (final)

- Task id: `native-build79-widget-priority-skip-integration-20261002`
- Prompt: `agent-handoffs/inbox/prompts/20261002T031500Z-native-build79-widget-priority-skip-integration.md`
- Generated (UTC): 2026-10-02T04:05:00Z
- Agent: Claude
- Status: **complete — Build 79 uploaded and VALID. Founder physical-device acceptance NOT done.**
- Supersedes the signing checkpoint `agent-handoffs/reports/20261002T034500Z-native-build79-widget-priority-skip-integration.md` (main `fd623f81`), which is still the full record of integration, Server verification, review and tests. This report adds the release and repeats the essentials.

## Exact authority
| Item | Value |
|---|---|
| Repository | `dustinginn/physiqueos` |
| Base (Build 78 shipping) | `5911dd2a6f968c5a355ec68d3313f0e5e644d529` |
| Integrated inputs | Priority Skip `88d597b25d49f773a12b7dcff3930b0f237a7a46` · Home Widget `820401430b154eae64821d1fd7dc9ad993826f3c` (both merged unchanged) |
| Branch | `claude/native-build79-widget-priority-skip-integration-20261002` (pushed) |
| **Archived source / final SHA** | **`a75f93df1a84c33bbe6e9cec6d648a11ec53031d`** — archived from a clean detached checkout of exactly this SHA |
| Commits | `58a40aa8` merge Priority Skip · `aa97eddd` merge Home Widget (tree `d6919ef0`, = the predicted no-conflict merge-tree) · `81158bc5` integration review fixes · `2dc710b1` delta review fixes · `7f6d11e7` bump 78→79 (metadata only) · `a75f93df` regenerated shipping renders (artifacts only) |
| Version / build | **1.0 (79)** (app and extension); last uploaded before this was 78 |
| **Delivery id** | **`8937b165-e7df-4f46-87b5-63efd3ce8244`** |
| **Processing** | **VALID** (build-status VALID, import VALID, on App Store Connect, uploaded 2026-10-01 21:01:52 PT); re-confirmed with a separate read-only `status` call |
| Archive | `~/Library/Developer/Xcode/Archives/2026-10-01/PhysiqueOS-Build79.xcarchive` (retained beside Builds 75–78); dSYM UUIDs app `226CABC4-5808-3BFB-A341-0C670DB53FFB`, extension `6ABC4C54-1C1F-3D22-809F-F453E32F956C` |
| Production Server | `2d967e48cb6a01e4a327934bbd81a405d3c26486`, deployment `421cae1a-dbc6-494c-9f73-9b8778e45efd` ACTIVE — unchanged, verified read-only |
| Backlog | updated on main `9a2957005df6a6e64973e7e1ac0703b0fca307f7` |

## Integration method
Two `--no-ff` merges of the exact reviewed SHAs onto exact Build 78, Priority Skip first. The two candidates touch disjoint files, so there was no textual conflict; a fresh semantic review covered the overlap. Generator deterministic: after the bump, two consecutive runs give the identical `project.pbxproj` sha256 `12d3d411a47f5877662ebf46ad8a4a33a5702181b89d6ca3813d970d96fedc1a`. Release verifier: `release configuration verified: version 1.0 (79), AppIcon, HealthKit app-only capability, matching App Group, Workout Live Activity + Home widget extension`.

## Server verification (read-only)
Control plane: deployment `421cae1a` ACTIVE, web + worker `source_commit_hash` `2d967e48`. A bounded console probe ran the real Home contract path (`NativeProductionContractService` → `HomeBriefingService` → `DailyFocusService.getNotificationOccurrences`) in one `READ ONLY` transaction (3 SELECTs, rollback, writes trapped), approved context `physiqueos-final-cutover-config`. Results (key names only):
- peptide `skipCommand` = `priority.skip.v1`, payload `[occurrenceDate, priorityId]`, no dose (Complete remains dose-aware);
- Foam Rolling `skipCommand` present;
- supplements `skipCommand` null;
- Morning Check-In/weight has no actions.
No Founder data mutated.

## Review
- **Fresh integrated review of `aa97eddd`:** no P0/P1. The Priority Skip side was clean:
  - Skip comes only from `skipCommand`, with identity checks.
  - Peptide Skip sends no dose; peptide and Foam Complete stay planned-dose.
  - Supplements get no Skip.
  - Old Build 78 payloads still work, and haptics are preserved.
  - Delegate install order is unchanged, and widget and Live Activity URLs do not collide.
- **Widget P2s fixed in `81158bc5`:**
  - A revoke or re-pair left the old session's totals in the App Group file. Now ProductionNativeAPI's session boundary clears the file and rotates the opaque scope.
  - Save confirmations awaited the widget refresh. They now fire and forget.
  - A locked background launch marked fresh totals "Offline". It now skips the refresh while locked and refreshes on unlock.
  - Ingest and explicit refreshes could stamp cached reads "Updated now". They now bypass the read cache.
- **P3s fixed:**
  - Refresh no longer navigates.
  - Start or a stale Resume reopens a live workout, never a second one, and saved-and-left drafts are never auto-resumed.
  - An unchanged projection no longer rewrites the file.
  - The widget bridge is inert in the unit-test host.
- **Delta review:** the residual P2 (an in-flight or cached refresh writing an ended session back) was fixed in `2dc710b1` with a session-generation fence.
- **Final delta review:** no P0/P1/P2, nothing blocks release, and the bump was confirmed metadata-only.

## Tests (final code)
- **Full Native unit suite: 1889 tests, 1 skipped, 1 failure** = the known pre-existing `PeptideSupportEditorViewModelTests.testSandboxChangeDoseKeepsHistoryAndPauseResumeWorkAgainstTheFixture` (fails on Builds 77/78 too). **No new deterministic failures.**
- That run included: HomeWidgetTests 16, PriorityNotificationSchedulerTests 78, CompletionFeedbackAndNotificationCapabilityTests 6, FounderServerAPITests 244, TrainingSessionAuthorityTests 51, TrainingSessionLiveProjectionTests 24, WorkoutLiveActivity Contract 14 / Coordinator 30 / Intent 15 / View 7, TrainingRestPreferenceTests 8, TrainingLoggerTests 88, and every HealthKit suite — all green.
- **UI journeys (private iOS 27.0 simulator): 6/6**
  - new: Home widget Start/Resume links create no workout and reopen a live workout;
  - Save & Leave/Resume;
  - rest preference;
  - backgrounded workout;
  - Workout Review → confirmation;
  - Workout Complete survives a tab switch until Return to Log (PR lifecycle).
- One integration break was caught and fixed: a Build 78 source-scan test asserted the exact text of the pre-widget durable-ingest callback.
- Not drivable in UI tests: notification actions, and peptide Detail Skip (the Sandbox has no skippable peptide). Both are covered by unit and delegate tests.

## Shipping renders
14 PNGs (7 square + 7 large) regenerated from the final code (`agent-handoffs/artifacts/home-screen-widget-v1/`, commit `a75f93df`). Layout and content are identical to the approved Codex candidate; only anti-aliasing bytes differ. No new visual review was needed.

## Signing, App Group and archive
- **Signing:** the checkpoint blocker was resolved by the Founder.
  - The Founder signed the team 33GMTRM6G9 Apple Account into Xcode and let automatic signing finish for both targets.
  - Both targets show App Group `group.com.physiqueos.native.dev.shared`; HealthKit is on the app only. No browser login was used.
- **Xcode side effect, discarded:** opening the project made Xcode re-serialize two tracked files.
  - `project.pbxproj` was restructured, adding a "Recovered References" group.
  - `Info.plist` lost `NSHealthShareUsageDescription`, `NSHealthUpdateUsageDescription`, `NSSupportsLiveActivities` and `ITSAppUsesNonExemptEncryption`.
  - Per the Founder's no-source-change instruction, both files were restored to `a75f93df`; Xcode's diff is kept only as local scratch.
  - The archive was built from a separate clean checkout of exactly `a75f93df`, so the open Xcode could not interfere.
  - **If Xcode is reopened on this worktree, it may make these edits again — do not commit them.**
- **Archive:** `xcodebuild archive` (Release, `generic/platform=iOS`, automatic signing, `-allowProvisioningUpdates`) succeeded, and the source tree was still clean afterwards.
- **Signed-archive inspection:**
  - **App** `com.physiqueos.native.dev` 1.0 (79):
    - entitlements: `com.apple.security.application-groups` = [`group.com.physiqueos.native.dev.shared`], `com.apple.developer.healthkit` = true, `com.apple.developer.healthkit.background-delivery` = true;
    - Info.plist keeps both Health usage descriptions, `NSSupportsLiveActivities` = true and `ITSAppUsesNonExemptEncryption` = false;
    - embedded profile carries the App Group.
  - **Extension** `com.physiqueos.native.dev.WorkoutActivity` 1.0 (79):
    - entitlements: application-identifier, team and **only** the same App Group — **no HealthKit**;
    - embedded profile carries the App Group.
  - **Coexistence:** a single extension (`com.apple.widgetkit-extension`) contains both `WorkoutLiveActivityWidget` (`WorkoutActivityAttributes`) and `HomeLoggedTodayWidget` (kind `com.physiqueos.home.logged-today`).
  - `codesign --verify --deep --strict`: valid for app and extension. dSYMs are present for both.
- **Guarded release tool:** dry run passed every check, then a real upload.
  - Dry-run checks: authentication, export options, archive identity, 1.0 (79), team, extension version parity, codesign, dSYM UUID match, and build 79 > last 78.
  - Upload: `upload --execute --confirm "UPLOAD com.physiqueos.native.dev 1.0 (79)"` through the API-key cloud distribution signing.
  - Result: EXPORT SUCCEEDED, delivery `8937b165…`, **VALID**. Release state is now 79; receipt `receipt-b79.json`.

## Physical-device acceptance checklist (Founder; none performed yet)
Home widget (Build 79)
1. Long-press Home Screen → + → PhysiqueOS: the small square and the optional large "Logged Today" appear in the gallery.
2. Square: today's Nutrition calories + P/C/F, active calories, today's Weight (or "Not logged today" — never yesterday's, never 0). Large additionally shows Training.
3. Refresh control: opens PhysiqueOS and the widget repaints with current totals (WidgetKit may take a moment).
4. Start Logger opens the Workout Logger without creating a workout; during a live workout the button reads Resume Workout and returns to it; after Save & Leave it reads Start again.
5. Lock the phone / StandBy: values redacted when locked; navigation still available. After a long time offline the age/offline label shows; after midnight it shows "Waiting for today".
6. First launch after install populates the widget from the real App Group (confirms the signed App Group works on device).
7. Optional: revoke and re-pair Founder Production in You → Connection: the widget empties, then refills.
Priority (Server 2d967e48 + Build 79)
8. Peptide Priority Detail: Mark Complete and "Took a different amount" unchanged; Mark Skipped present (confirmation).
9. Peptide notification (long-press): Complete (records planned dose) · Skip · Snooze. After Skip, Home/Detail show Skipped and no dose is recorded.
10. Foam Rolling notification: Complete · Skip · Snooze.
11. Supplement notification: Complete · Snooze (no Skip). Morning Check-In/weight notification: no actions.
Carry-forward
12. PR celebration: confetti + success haptic once on a natural PR workout (Build 78 behavior, unchanged).
13. Live Activity: real-workout acceptance on Lock Screen/Dynamic Island (Build 77 behavior, unchanged; now beside the Home widget in the same extension).

## Backlog
`agent-handoffs/backlog/PHYSIQUEOS_PRODUCT_BACKLOG.md` updated on main (`9a295700`):
- a new BUILD 79 section: SHIPPED VALID, pending physical acceptance, with this checklist;
- Home Screen widget roadmap item → shipped in Build 79, pending acceptance;
- item E peptide/Foam Skip → shipped (Server + Build 79), pending acceptance;
- Build 78 items A–D are carried unchanged in Build 79 and keep their acceptance status;
- Live Activities acceptance can be done on Build 79.
Nothing is marked complete before the Founder confirms on device.

## Known limitations (non-blocking, reviewed)
- A persistent Keychain delete failure after a terminal refresh rejection could repeat refresh/reject at network pace. This is unlikely and unbounded.
- After a Production re-pair while Sandbox is selected, switching to Production within 90 s can serve pre-re-pair cached reads. The root cause predates this build: `retireAllLastKnownSnapshots` does not empty the in-memory read cache.
- The older-Server Cardio fallback reads `training-day` cache-first. A failed Weight read shows "Not logged today" rather than offline (pre-existing Log behavior).
- The freshness label is evaluated per timeline entry, so "Updated now" can persist for up to ~45 min. Sandbox snapshots are not labeled Sandbox on the widget.
- The widget generator moved several extension object ids relative to Build 78. This is deterministic and functional.
- There is no un-skip, and notification Skip cannot ask for confirmation (iOS). Supplement Skip remains a deferred product decision.
- Peptide sandbox unit-test failure (pre-existing).

## Disk / housekeeping
Disk was ≥28 GiB throughout (floor 15). Only this lane's DerivedData, result bundles and private simulator were removed. The Build 79 archive is retained; Builds 75–78 are untouched. The two temporary worktrees (archive source, backlog edit) live in this job's scratch area and are removed after publication. No credentials were changed, nothing was deployed, and no production or Founder data was mutated.
