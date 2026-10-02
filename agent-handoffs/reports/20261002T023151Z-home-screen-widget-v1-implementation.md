# Home Screen Widget V1 — implementation candidate

- Generated (UTC): 2026-10-02T02:31:51Z
- Task: home-screen-widget-v1-implementation
- Agent: Codex
- Status: **complete, reviewed, pushed, integration-ready; not released**
- Repository: dustinginn/physiqueos
- Prompt: agent-handoffs/inbox/prompts/20261002T014500Z-home-screen-widget-v1-implementation.md
- Exact Build 78 base: 5911dd2a6f968c5a355ec68d3313f0e5e644d529
- Implementation branch: codex/home-screen-widget-v1-implementation-20261002
- Exact candidate SHA: 820401430b154eae64821d1fd7dc9ad993826f3c
- Candidate remote verification: refs/heads/codex/home-screen-widget-v1-implementation-20261002 resolved to the exact candidate SHA
- origin/main reconciled before this report: 93947b332a7db9a3377ee99781f8e70d4f83fea4
- Concurrent Priority Skip candidate: claude/priority-skip-peptides-foam-native-20261002 at 88d597b25d49f773a12b7dcff3930b0f237a7a46
- Production / Server changed by this lane: **no**
- TestFlight / App Store Connect changed by this lane: **no**

## Outcome

Implemented the Home Screen Widget V1 in the **existing** PhysiqueOSLiveActivity WidgetKit extension.

Founder feedback during implementation superseded the prompt's large-first family choice:

- the primary widget is now the four-tile square, systemSmall;
- it gives a fast glance at Nutrition calories and P/C/F, Activity active calories, and today's Weight when available;
- it includes a compact refresh control and a full-width Start Logger action;
- Start Logger becomes Resume Workout when the app-owned TrainingSessionAuthority projects an active live session;
- the detailed Logged Today systemLarge layout remains available as an optional alternate, preserving Training, Nutrition, Activity, Weight, per-section links, and the full Logger action.

The square matches the Founder's requested glanceable job. Training detail is intentionally absent from the square so long workout summaries cannot crowd the daily totals. No “Apple Health” or other source/provenance delineation appears in either family.

## Shipping renders

These PNGs are rendered by the compiled shipping HomeLoggedTodayWidgetView, not separate design mockups.

### Primary four-tile square (systemSmall)

| State | Candidate artifact |
|---|---|
| Full current-day data | [01-full-data.png](https://github.com/dustinginn/physiqueos/blob/820401430b154eae64821d1fd7dc9ad993826f3c/agent-handoffs/artifacts/home-screen-widget-v1/01-full-data.png) |
| No Weight today | [02-no-weight.png](https://github.com/dustinginn/physiqueos/blob/820401430b154eae64821d1fd7dc9ad993826f3c/agent-handoffs/artifacts/home-screen-widget-v1/02-no-weight.png) |
| Active workout / Resume | [03-active-workout.png](https://github.com/dustinginn/physiqueos/blob/820401430b154eae64821d1fd7dc9ad993826f3c/agent-handoffs/artifacts/home-screen-widget-v1/03-active-workout.png) |
| Stale / offline | [04-stale-offline.png](https://github.com/dustinginn/physiqueos/blob/820401430b154eae64821d1fd7dc9ad993826f3c/agent-handoffs/artifacts/home-screen-widget-v1/04-stale-offline.png) |
| Waiting for today | [05-waiting-for-today.png](https://github.com/dustinginn/physiqueos/blob/820401430b154eae64821d1fd7dc9ad993826f3c/agent-handoffs/artifacts/home-screen-widget-v1/05-waiting-for-today.png) |
| Privacy redacted | [06-privacy-redacted.png](https://github.com/dustinginn/physiqueos/blob/820401430b154eae64821d1fd7dc9ad993826f3c/agent-handoffs/artifacts/home-screen-widget-v1/06-privacy-redacted.png) |
| Long Training input | [07-long-training-summary.png](https://github.com/dustinginn/physiqueos/blob/820401430b154eae64821d1fd7dc9ad993826f3c/agent-handoffs/artifacts/home-screen-widget-v1/07-long-training-summary.png) |

The last square intentionally remains stable because Training detail belongs only to the optional large family.

### Optional detailed systemLarge

The same seven shipping states are under [agent-handoffs/artifacts/home-screen-widget-v1/large](https://github.com/dustinginn/physiqueos/tree/820401430b154eae64821d1fd7dc9ad993826f3c/agent-handoffs/artifacts/home-screen-widget-v1/large).

Visual inspection passed:

- clear Nutrition → Activity/Weight → Logger hierarchy in the square;
- Weight disappears cleanly when absent rather than becoming zero or a prior-day value;
- stale/offline age remains prominent without covering values;
- waiting-for-today hides all prior-day totals;
- privacy redaction covers health values while leaving generic navigation controls available;
- Start and Resume remain legible;
- the large alternate still mirrors the Native Logged Today card and bounds long Training summaries.

## Architecture

### One existing extension

PhysiqueOSLiveActivityBundle now registers:

1. the unchanged WorkoutLiveActivityWidget;
2. HomeLoggedTodayWidget.

No second extension target or bundle identifier was created. The Home widget is a StaticConfiguration supporting explicit systemSmall and systemLarge families.

### App-owned App Group snapshot

The shared schema is a minimal, versioned JSON snapshot:

- schema version;
- Native authority;
- opaque local account scope;
- exact local date and named time zone;
- write and last-success timestamps;
- refresh state;
- bounded Training presentation;
- Nutrition calories, protein, carbs, and fat;
- Activity active calories and partial-day semantics;
- exact-today Weight;
- active-workout projection with only safe display/navigation fields.

It contains no credential, token, raw HealthKit sample, meal list, evidence bytes, workout sets, reps, or load.

HomeWidgetSnapshotFileStore writes one protected, atomically replaced file in group.com.physiqueos.native.dev.shared.

Unknown future schemas and malformed files fail soft. App reads fence authority and opaque account scope. Authority changes clear the shared file before the new authority is fetched so a stale authority cannot remain visible.

### Exact-day projection

The app coordinator:

- uses the canonical Log read for its Server-resolved localDate, Training summary, and exact-day Weight row;
- selects Nutrition only when NutritionDayRecord.date equals localDate;
- selects Activity only when ActivityDayRecord.date equals localDate;
- never substitutes a previous Nutrition, Activity, or Weight day;
- represents missing optional values as absent, never zero;
- preserves only a same-day previously trusted Nutrition or Activity value when that individual canonical read fails;
- computes Start/Resume from the existing selected-authority TrainingSessionAuthority.activeLiveSession().

Canonical refresh requests are coalesced, and an authority switch during awaited reads causes the old pass to abandon its write. Workout-only authority changes update the workout projection immediately without creating another session authority.

### Refresh behavior

The small circular-arrow control uses RefreshHomeWidgetTotalsIntent.

- openAppWhenRun is true, keeping execution in the app process.
- The intent resolves through an app-installed process hook to the existing HomeWidgetSnapshotCoordinator.
- PhysiqueOS foregrounds and performs the canonical Log/Nutrition/Activity refresh.
- The extension does not authenticate to the Server and does not query HealthKit.
- The refresh action creates no workout session.
- After the atomic write, the app asks WidgetCenter to reload the widget timeline.

This is an honest app-opening refresh, not a promise of an immediate background fetch or repaint. WidgetKit still schedules the visual update. Apple documents that interactive widget buttons run App Intents and that openAppWhenRun moves execution to the app process: [Adding interactivity to widgets and Live Activities](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities).

The detailed large family uses a typed refresh Link to the same app-owned refresh relay.

### Start / Resume behavior

The square uses its one widgetURL for the navigation-only workout action; its visible bottom bar communicates that destination. The independent interactive refresh button intercepts its own tap.

- No active live session → **Start Logger** / **Start Workout Logger**.
- Active live session → **Resume Workout** with the exact session id.
- Saved-and-left draft → Start, never silent auto-resume.
- Stale/missing/wrong-authority Resume URL → safe Start/Logger fallback.
- URL parsing is bounded, rejects duplicate query keys, validates real Gregorian date keys, and fails closed.
- Opening Start or Resume creates zero sessions. Existing Logger UI and TrainingSessionAuthority retain sole session authority.

The large family additionally links each metric to its existing Native destination.

### Refresh triggers and timeline

The app requests a canonical snapshot refresh after:

- app install/bootstrap and foreground;
- actual day/time-zone transition;
- Log pull-to-refresh;
- durably accepted HealthKit ingestion followed by canonical reads;
- Nutrition/Activity evidence confirmation;
- successful weigh-in/check-in;
- durable workout commit;
- explicit widget refresh.

Workout authority observation updates Start/Resume across start, resume, save/leave, commit, cancel, or end.

Timeline behavior:

- snapshot-only provider; no widget network or HealthKit reads;
- current entry plus a named-time-zone midnight entry;
- a conservative 45-minute requested reload;
- normal freshness through 90 minutes;
- visible age from 90 minutes through four hours;
- stale/offline presentation after four hours or a failed refresh;
- any prior-day snapshot becomes “Waiting for today” and hides Nutrition, Activity, and Weight.

The policy requests updates; it does not claim WidgetKit will render on an exact schedule.

## Privacy, authority, and security review

Passed:

- no Server authentication or HealthKit query in extension code;
- no credentials or tokens in the App Group schema;
- protected atomic file writes;
- unknown schema and corrupt file fail soft;
- authority switch race fenced after awaited reads;
- opaque account discriminator included and checked by app-side reads;
- no prior-day substitution;
- values marked privacySensitive;
- active-workout detail marked privacy-sensitive in the large family;
- no “Apple Health” label rendered;
- deep-link parser rejects malformed, oversized, duplicate-key, and invalid-date input;
- Start/Resume/Refresh paths do not mutate workout state.

Known release acceptance requirement: a signed physical-device install must verify App Group container access, locked/redacted rendering, gallery discovery, cold-launch links/intents, and real WidgetKit throttling.

## Project generation and signing

Implemented:

- authoritative generator membership for app, shared, test, and extension files;
- a dedicated pinned Home widget object-id block so prior Build 78/Live Activity ids remain stable;
- matching App Group entitlements in the app and existing extension;
- extension entitlement contains the App Group only, never HealthKit;
- extension entitlement path wired in Debug and Release;
- release verifier checks matching group, app-only HealthKit, Home widget registration, explicit supported families, one existing extension, and Build 78 version/build parity.

Deterministic generator result, repeated after implementation:

bb5bff15856063a504b3235422c03db7013e9efc5f0bae38804e4241f40ae117  ios/PhysiqueOS.xcodeproj/project.pbxproj

Release verifier:

release configuration verified: version 1.0 (78), AppIcon, HealthKit app-only capability, matching App Group, Workout Live Activity + Home widget extension

Not performed:

- no Apple Developer browser login;
- no manual profile/capability mutation;
- no device/archive/cloud-signing pass;
- no TestFlight upload.

The next consolidated Native release lane must allow automatic/cloud signing to attach group.com.physiqueos.native.dev.shared to both existing App IDs and inspect the archived app and extension entitlements. Stop for Founder authentication only if the established signing session cannot create/update that capability.

## Validation on the exact candidate tree

### Final combined Xcode suite

Command scope:

- HomeWidgetTests
- TrainingSessionAuthorityTests
- TrainingSessionLiveProjectionTests
- WorkoutLiveActivityContractTests
- WorkoutLiveActivityCoordinatorTests
- WorkoutLiveActivityIntentTests
- WorkoutLiveActivityViewTests
- TrainingRestPreferenceTests

Result from the final xcresult:

- total: **159**
- passed: **159**
- failed: **0**
- skipped: **0**
- expected failures: **0**

The suite compiled the app and shared WidgetKit extension, regenerated all 14 shipping-view PNGs, and preserved the Build 78 Live Activity, Complete Set, projection, coordinator, and rest-mode regressions.

Environment:

- compiled with the installed iOS 27.0 SDK;
- executed on the available iPhone 17 Pro iOS 26.5 simulator runtime;
- Founder clarified the physical device runs iOS 27;
- no physical iOS 27 device acceptance or archive was run in this lane.

### Widget-specific coverage

- snapshot round trip;
- malformed/future schema;
- atomic protected write/read;
- authority/account fences;
- exact-day no-fallback and missing-not-zero;
- Nutrition calories/P/C/F;
- partial Activity semantics;
- today Weight;
- Training hierarchy and no provenance projection;
- fresh/aging/stale/offline/midnight;
- DST/named time zone;
- typed URL round trips and malformed/duplicate/invalid-date rejection;
- refresh intent uses app-process hook;
- Start creates no session;
- Refresh creates no session;
- exact Resume;
- stale Resume fallback;
- saved/left draft behavior;
- seven primary square render states;
- seven optional large render states;
- privacy-redacted render.

### Other checks

- project generator run repeatedly with identical SHA;
- verify_release_configuration.py passed;
- git diff --check passed;
- extension static scan found no network/auth/HealthKit implementation;
- final branch working tree was clean before push;
- remote branch ref was re-read at exact candidate SHA.

Not run:

- the full approximately 1,800-test Native suite, because the required changed-workflow and Build 78 regression suites were green and this work shared the Mac with the concurrent Priority Skip lane;
- physical widget install/gallery/StandBy/locked/device HealthKit acceptance;
- archive or TestFlight installation.

## Build 78 / Live Activity preservation

The existing ActivityKit widget, intent, coordinator, and session-authority implementation were not functionally altered. The existing extension bundle now returns one additional Home widget configuration. Final Build 78-focused regressions are included in the 159/159 pass.

## Priority Skip reconciliation

Claude's main-visible report identifies the concurrent Native candidate:

- branch: claude/priority-skip-peptides-foam-native-20261002
- SHA: 88d597b25d49f773a12b7dcff3930b0f237a7a46

The Priority Skip branch changes eight Priority capability/notification files. The widget candidate changes no overlapping file. A read-only Git merge-tree of the two exact candidates completed without conflict and produced tree d6919ef00c35996cc3f2e25552be9ce7a3d79842. That tree is integration evidence, not a reviewed release commit.

## Integration instructions

For the one next Native build:

1. Start from exact Build 78 5911dd2a6f968c5a355ec68d3313f0e5e644d529.
2. Merge/cherry-pick Priority Skip 88d597b25d49f773a12b7dcff3930b0f237a7a46.
3. Merge/cherry-pick Home widget 820401430b154eae64821d1fd7dc9ad993826f3c.
4. Preserve the widget generator output; Priority Skip has no overlapping generator or widget file.
5. Bump once for the single consolidated next Native build.
6. Re-run generator/verifier, full Native tests, focused Priority Skip tests, the 159 widget/Live Activity suites, and an archive entitlement inspection.
7. On the Founder's iOS 27 device, verify gallery discovery, App Group snapshot population, refresh, Start/Resume, privacy/locked state, midnight/offline behavior, and the existing Live Activity.
8. Upload one consolidated TestFlight build only after those checks.

## What was not changed

- no Server code or production data;
- no HealthKit entitlement on the extension;
- no workout/session authority duplication;
- no Build 78 release artifact;
- no App Store Connect/TestFlight state;
- no independent Priority Skip integration;
- no Goal Confidence, Briefing, Sleep, Recovery, Priority, or broader Home content in the widget.

## Disk/resource hygiene

The lane observed the standing 15 GiB free-space guard before heavy Xcode work. It removed only this task's /private/tmp/physiqueos-home-widget-v1-derived after extracting results and renders. Final free space was 22 GiB. No user repository, archive, signing asset, or unrelated DerivedData was deleted.

## Local/untracked state

- Implementation branch: clean and pushed.
- Original user worktree: intentionally untouched; its pre-existing unrelated untracked reports remain the user's work.
- Private Founder evidence: none created or pushed.
- Secrets/credentials: none added to code, screenshots, or report.

## Blockers and decisions

No implementation blocker remains. Founder feedback locked the square as primary and removed source provenance from the UI.

Release remains intentionally gated on:

- consolidation with Priority Skip;
- automatic/cloud App Group signing success;
- full integrated tests/archive verification;
- physical iOS 27 acceptance;
- explicit coordination of the one next TestFlight upload.

## Safe next step

Create a single consolidation branch containing exact candidates 88d597b25d49f773a12b7dcff3930b0f237a7a46 and 820401430b154eae64821d1fd7dc9ad993826f3c, then perform the signing, full regression, archive, and Founder-device acceptance gates above. Do not upload either candidate independently.

The exact containing origin/main report commit is supplied after publication and remote re-verification.
