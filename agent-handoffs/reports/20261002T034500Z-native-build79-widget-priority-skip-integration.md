# Native Build 79 — Home Screen Widget V1 + Priority Skip consolidation (checkpoint: BLOCKED at signing)

- Task id: `native-build79-widget-priority-skip-integration-20261002`
- Prompt: `agent-handoffs/inbox/prompts/20261002T031500Z-native-build79-widget-priority-skip-integration.md`
- Generated (UTC): 2026-10-02T03:45:00Z
- Agent: Claude
- Status: **BLOCKED before release.** Integration, Server verification, independent review + 2 delta re-reviews, the full Native suite, UI journeys and shipping renders are all complete on the final candidate. The Release archive **cannot be signed**: the new App Group needs development provisioning that the approved App Store Connect API key cannot perform from `xcodebuild`, and no Apple Account is signed into Xcode on this Mac. **No archive, no upload, no Build 79 on TestFlight.** One Founder action is required (below).

## Exact authority
| Item | Value |
|---|---|
| Repository | `dustinginn/physiqueos` |
| Base (Build 78 shipping) | `5911dd2a6f968c5a355ec68d3313f0e5e644d529` |
| Priority Skip candidate | `88d597b25d49f773a12b7dcff3930b0f237a7a46` (merged unchanged) |
| Home Widget candidate | `820401430b154eae64821d1fd7dc9ad993826f3c` (merged unchanged) |
| Integration branch | `claude/native-build79-widget-priority-skip-integration-20261002` (pushed) |
| **Final candidate SHA** | **`a75f93df1a84c33bbe6e9cec6d648a11ec53031d`** (clean, equal to origin) |
| Version / build in source | 1.0 (**79**) — last uploaded is still 78 (release-tool state 78, no b79 receipt, no later report on main) |
| Production Server | `2d967e48cb6a01e4a327934bbd81a405d3c26486`, deployment `421cae1a-dbc6-494c-9f73-9b8778e45efd` ACTIVE (web + worker `source_commit_hash`) — read-only, unchanged |
| TestFlight / App Store Connect | **unchanged** (no upload) |
| Apple Developer portal | unchanged (both provisioning attempts failed at authentication before any mutation) |

### Commits on the integration branch
1. `58a40aa8` merge Priority Skip `88d597b2`, then `aa97eddd` merge Home Screen Widget `82040143` (tree `d6919ef00c35996cc3f2e25552be9ce7a3d79842`, byte-identical to the earlier no-conflict merge-tree prediction).
2. `81158bc5` integration review fixes (widget).
3. `2dc710b1` delta review fixes (widget session boundary).
4. `7f6d11e7` Build 79 bump (metadata only: `APP_BUILD_NUMBER`, `CURRENT_PROJECT_VERSION` ×4 app+extension, test pin).
5. `a75f93df` regenerated shipping widget renders + README note (artifacts only; no `ios/` change).

## Integration method
Two `--no-ff` merges of the exact reviewed SHAs onto exact Build 78, Priority Skip first. The candidates touch disjoint files (Priority Skip: 8 Priority capability/notification/detail files; Widget: generator, entitlements, app wiring, shared/extension widget files), so there was no textual conflict; the semantic review below covered the overlap. Generator output preserved: integrated `project.pbxproj` sha256 `bb5bff15…ae117` equalled the Widget candidate; after the bump, two consecutive generator runs give the identical `12d3d411a47f5877662ebf46ad8a4a33a5702181b89d6ca3813d970d96fedc1a`. `verify_release_configuration.py`: `release configuration verified: version 1.0 (79), AppIcon, HealthKit app-only capability, matching App Group, Workout Live Activity + Home widget extension`.

## C. Server contract reverification (read-only)
- Control plane: active deployment `421cae1a` ACTIVE; web and worker `source_commit_hash` = `2d967e48` (exact expected authority).
- Bounded read-only console probe (approved context `physiqueos-final-cutover-config`, approved runner blob `f7123347`, component `web`): ran the real production path `NativeProductionContractService.read(home, presentationVersion 2)` → `CoreNavigationReadService` → `HomeBriefingService` → `DailyFocusService.getNotificationOccurrences` inside one `REPEATABLE READ READ ONLY` transaction (asserted `transaction_read_only = on`, SELECT-only guarded pool, 3 SELECTs, always ROLLBACK; fs/network writes trapped). Server-resolved America/Los_Angeles, local date 2026-10-01, 22 occurrences over the 7-day horizon. Sanitized result (key names only, no values):
  - **peptide** (Tesamorelin): `skipCommand` = `priority.skip.v1`, payload keys exactly `[occurrenceDate, priorityId]` (no dose), plus `expectedVersion`; completion stays dose-aware `[dose, occurrenceDate, priorityId, protocolId]` — **PASS**
  - **Foam Rolling** (recovery Support): `skipCommand` `priority.skip.v1` on 10-02…10-07 (today's occurrence was already resolved) — **PASS**
  - **supplement** (Fadogia): `skipCommand` null on every occurrence — **PASS**
  - **Morning Check-In / weight**: no completion and no skip command — **PASS**
- No Founder data mutated; no occurrence created/skipped/completed.

## D. App Group / signing preflight
- App entitlements: `group.com.physiqueos.native.dev.shared` + HealthKit + HealthKit background delivery (app **retains HealthKit**).
- Existing extension `PhysiqueOSLiveActivity` (`com.physiqueos.native.dev.WorkoutActivity`): App Group **only** — **no HealthKit**. Both entitlement files are wired for Debug and Release (generator + verifier).
- Shared schema carries no credential/token (reviewed): opaque per-authority account scope, exact local date, bounded display values only.
- Generator deterministic; verifier green (above).
- **Signing result: BLOCKED** — see the Founder action.

## E. Integrated review (independent, read-only) and fixes
Initial integrated review of `aa97eddd`: no P0/P1. Priority Skip side clean (Skip only from `skipCommand` with identity checks; peptide Skip carries no dose; peptide/Foam `specializedSkippable` keeps planned-dose Complete; supplements no Skip; Build 78 `simpleCompletion`/`directCompletion` payloads still work; haptics preserved; delegate install order unchanged; widget URLs (`host=widget`) and Live Activity URLs (`host=open`) do not collide). Live Activity coexistence, PR completion lifecycle and Start/Resume no-session-creation clean.
Substantive widget findings fixed in `81158bc5`:
- **P2** revoke / re-pair / rejected refresh left the previous session's health totals in the App Group file (shown "Offline"); account scope never rotated → ProductionNativeAPI now notifies a session-boundary observer from `retireAllLastKnownSnapshots` (pair, revoke, terminal refresh rejection); the widget clears its file and rotates its opaque scope; session-ending read errors also clear.
- **P2** weigh-in / Morning Check-In / evidence confirmations awaited the whole widget refresh → fire-and-forget.
- **P2** every launch, including locked background launches (HealthKit delivery, notification/Live Activity actions), refreshed and marked fresh totals "Offline" because the when-unlocked credential is unreadable → Founder Production refresh skipped while protected data is unavailable; refreshed on unlock.
- **P2** HealthKit-ingest and explicit widget refreshes could stamp 90 s cached nutrition/Log reads "Updated now" → those refreshes bypass the read cache for `evidence-review-queue`, `weight`, `nutrition`.
- P3 fixed: widget Refresh no longer navigates (an open Logger / owed Workout Complete stays put); Start/stale Resume reopen a **live** workout instead of the Logger start (never a second workout; saved-and-left still never auto-resumes; Build 78 pending completions are not live); unchanged workout projection no longer rewrites/reloads; widget bridge inert in the unit-test host.
- Integration test break fixed: a Build 78 source-scan test (`testDurableHealthKitIngestTriggersTheNotifierIndependentOfTheLogTab`) asserted the exact pre-widget callback text; it now asserts the notifier refresh still runs first and the widget refresh follows.
Delta re-review of `81158bc5`: four P2s verified fixed; one residual P2 (an in-flight or cache-served refresh could write the ended session back) → fixed in `2dc710b1` (session-generation fence on every write path, next refresh bypasses cache, `endsSession` narrowed to notPaired/reconnectRequired, locked cache-bypass retained until unlock, refresh requested after a same-authority re-pair).
Final delta review of `2dc710b1` + bump: **no P0/P1/P2; nothing blocks release.** Bump verified metadata-only.

## F. Tests (final candidate code; `a75f93df` differs from `7f6d11e7` only in artifacts)
- **Full Native unit suite on `7f6d11e7`: 1889 tests, 1 skipped, 1 failure** = the known pre-existing `PeptideSupportEditorViewModelTests.testSandboxChangeDoseKeepsHistoryAndPauseResumeWorkAgainstTheFixture` (also fails on Builds 77/78). **No new deterministic failures.**
  - (Integrated-before-fixes run on `aa97eddd`: 1883 tests, same known failure + the source-scan break above, since fixed.)
- Relevant suites inside that run (all 0 failures): HomeWidgetTests 16 · PriorityNotificationSchedulerTests 78 (categories/delegate/scheduler, peptide planned-dose Complete, peptide Skip no dose, Foam Skip, supplement no Skip, stale/duplicate/network/idempotency, Build 78 fallback, Priority Detail skip) · CompletionFeedbackAndNotificationCapabilityTests 6 (haptics) · FounderServerAPITests 244 · TrainingSessionAuthorityTests 51 · TrainingSessionLiveProjectionTests 24 · WorkoutLiveActivityContract 14 / Coordinator 30 / Intent 15 / View 7 · TrainingRestPreferenceTests 8 · TrainingLoggerTests 88 · all HealthKit suites green.
- Widget coverage: snapshot schema/store, exact-day/no fallback, Nutrition P/C/F, partial Activity, Weight, fresh/aging/stale/offline/midnight, DST/named zone, privacy, deep links, Start/Resume/saved-left, authority/account fences, refresh hook, small + large shipping render states; new: session boundary clears + rotates scope, other-authority boundary leaves the visible snapshot, in-flight refresh across a boundary never writes back, locked launch leaves the snapshot untouched, unchanged projection no rewrite, error classification.
- **UI journeys (fresh private iOS 27.0 simulator, final code): 6/6 passed** — new **Home widget Start/Resume links** (Start opens the Logger without creating a workout; stale Resume falls back; with a live workout the link reopens it, no duplicate), Save & Leave/Resume, rest-preference menu, backgrounded workout, Workout Review → confirmation, **Workout Complete survives tab switch until Return to Log** (PR lifecycle).
- Not drivable in UI tests: notification actions (XCUITest cannot act on notifications) and peptide Priority Detail Skip (the Sandbox fixture has no skippable peptide) — covered at the unit/delegate boundary; Live Activity rendering is not visible in simulator screenshots.

## G. Shipping renders
All 14 shipping-view PNGs (7 `systemSmall` square + 7 optional `systemLarge`) were regenerated by `HomeWidgetTests.testShippingViewsRenderAllRequiredStates` from the final code and committed in `a75f93df` under `agent-handoffs/artifacts/home-screen-widget-v1/`. Visual comparison with the approved Codex renders: identical layout and content (only anti-aliasing bytes differ on the iOS 27 runtime). No Founder visual review needed.

## H/I. Build number and archive
- Build 78 confirmed latest uploaded → Build 79 (single bump, `7f6d11e7`).
- Preflight: 28 GiB free (≥20), no other xcodebuild running, generator/verifier green, worktree clean at `a75f93df`.
- `xcodebuild archive` (Release, `generic/platform=iOS`, automatic signing) **failed at signing**: the only available development profiles (`iOS Team Provisioning Profile: com.physiqueos.native.dev` and the wildcard `*` used by the extension since Build 77) do not include the App Groups capability / `group.com.physiqueos.native.dev.shared`.
- Same archive with `-allowProvisioningUpdates` and the approved Admin App Store Connect API key (the release tool's established authentication; key path only, never read): **`Authentication failed: Make sure a bearer token was provided, it is properly configured and signed, and it has not expired.`** for both targets. Clock verified in sync with Apple (no skew); repeated once to rule out a transient — identical. The same key passes the tool's read-only `auth-check` and has performed distribution cloud signing at export before; Xcode does not accept it for this development-provisioning step.
- No workaround was attempted (no unsigned archive, no entitlement stripping, no browser login, no manual portal change).

## FOUNDER ACTION REQUIRED (exact)
On this Mac, in Xcode (not a browser):
1. **Xcode ▸ Settings ▸ Accounts ▸ +** → sign in with the Apple Account for team **33GMTRM6G9** (complete 2FA if asked).
2. Open `ios/PhysiqueOS.xcodeproj` in worktree `~/Developer/PhysiqueOS/native-build79-widget-priority-skip-integration-20261002` (branch `claude/native-build79-widget-priority-skip-integration-20261002`, at `a75f93df`; do not change files).
3. Select target **PhysiqueOS ▸ Signing & Capabilities**, then target **PhysiqueOSLiveActivity ▸ Signing & Capabilities**. With "Automatically manage signing" on (already set), let Xcode finish its provisioning update so both show no signing error. This registers `group.com.physiqueos.native.dev.shared` and enables App Groups on `com.physiqueos.native.dev` and `com.physiqueos.native.dev.WorkoutActivity`, and regenerates their development profiles. Do not add/remove capabilities manually.
4. Tell Claude "signing done". The agent then re-runs the Release archive from exact `a75f93df` (no source change), inspects entitlements, runs the guarded tool dry run, uploads Build 79 and waits for VALID.

(Equivalent alternative: someone with the Account Holder/Admin Apple Account enables App Groups with `group.com.physiqueos.native.dev.shared` on both App IDs in the developer portal — manual portal work, so only if the Founder prefers it; Xcode still needs the account to fetch the new development profiles.)

## K. Physical-device checklist (for after Build 79 is VALID — not yet applicable)
Home widget: gallery discovery (square + large) · small square totals · large alternate incl. Training · current-day Nutrition cal + P/C/F, active cal, today's Weight · no-weight state · refresh (opens app, then repaints) · Start Logger · Resume Workout (during a live workout) · stale/offline and locked/privacy redaction · real App Group population after first launch · after Production revoke/re-pair the widget empties, then refills.
Priority: peptide Detail Mark Skipped · peptide notification Complete (planned dose) / Skip / Snooze · skipped peptide records no dose · Foam Rolling notification Complete / Skip / Snooze · supplement notification Complete / Snooze, no Skip · Morning Check-In no actions.
Carry-forward: PR celebration confetti + success haptic once · Live Activity real-workout acceptance.
Physical acceptance has NOT been performed.

## L. Backlog
Not updated: the prompt updates the backlog only after Build 79 is VALID. Build 78 items keep their "shipped in Build 78, pending physical acceptance" status.

## Known limitations / residual P3s (non-blocking, reviewed)
- A persistent Keychain delete failure after a terminal refresh rejection could repeat refresh→reject cycles at network pace (needs a persistent Keychain fault; unbounded but very unlikely).
- A Production re-pair while Sandbox is selected consumes the cache-bypass flag on the Sandbox refresh; switching to Production within 90 s can be served pre-re-pair cached reads (root cause: `retireAllLastKnownSnapshots` does not empty the in-memory read cache — pre-existing for app UI reads too).
- Older-Server Cardio fallback reads `training-day` cache-first (not in the bypass set).
- `fetchLog` reads Weight with `try?`, so a failed Weight read shows "Not logged today" rather than offline (pre-existing Log behavior).
- Generator: Widget files were added to the Live Activity id-allocation loop, so several extension object ids differ from Build 78 (functional, deterministic, documented; no scheme references them).
- Freshness label is evaluated per timeline entry ("Updated now" may persist up to ~45 min); Sandbox snapshots are not labeled Sandbox on the widget.
- The in-flight-boundary unit test depends on executor scheduling rather than a controllable stub.
- Supplement Skip and peptide un-skip remain deferred product decisions.

## Disk / housekeeping
Disk 34 GiB free at start; ≥28 GiB throughout (floor 15). Removed only this lane's own DerivedData, result bundles and private simulator after extracting logs/renders (≈1 GB); 29 GiB free after. Build 75–78 archives untouched. No local-only work; no credentials changed; no production or Founder data mutated.
