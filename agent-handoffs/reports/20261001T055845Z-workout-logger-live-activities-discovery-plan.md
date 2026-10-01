# Workout Logger Live Activities — discovery, architecture audit, and phased implementation plan

- Task id: `workout-logger-live-activities-discovery-20261001`
- Prompt: `agent-handoffs/inbox/prompts/20261001T060100Z-workout-logger-live-activities-discovery.md` (origin/main 3fa8d4f0; coordination note 503b06f0)
- Agent: Claude (Remote Control background session), high reasoning
- Generated (UTC): 2026-10-01T05:58:45Z
- Scope: research, audit and plan only. **No application code was written. Nothing was committed to any product branch.** No production change, no TestFlight upload, no signing or entitlement change, no Apple web-portal login, no HealthKit Sleep work.

## 0. Authority at time of audit (re-verified live, read-only)

| Item | Value |
|---|---|
| Native source audited | `b6d98889` "Set Native build number 74" (worktree `native-live-activities-discovery-20261001`, branch `claude/workout-logger-live-activities-discovery-20261001`, clean) |
| Last uploaded Native build | 74 (release-tool state) |
| Production Server | `b81c784e` web+worker, deployment `8008f928` ACTIVE, `/api/v1/health/live` ok (`buildId physiqueos-b81c784e-20261001`) — read-only; untouched |
| Local toolchain | Xcode 27.0 (27A266a), iPhoneOS 27.0 SDK; Simulators iPhone 14 Pro … iPhone 18 Pro available |
| App deployment target | iOS 18.0, Swift 6.0, team `33GMTRM6G9`, automatic signing |

Note: the `physiqueos-audit` doctl context now returns 401; `physiqueos-final-cutover-config` still reads. Worth refreshing before the next audit that relies on it.

## 1. Executive summary

1. **A Live Activity is feasible and local-only in Phase 1.** It needs no App Group, no push entitlement, no Server change and no HealthKit change. It needs one new Widget Extension target, an `NSSupportsLiveActivities` key on the app, one shared attributes file, and one app-scoped coordinator.
2. **The only authority for an in-progress workout is the persisted `TrainingLoggerDraft`** in `UserDefaults.standard`, written on every edit through `TrainingLoggerDraftStore`. The view model exists only while the Logger screen is on screen. The Server becomes authoritative only at Finish, through one idempotent `commitTrainingSession` command.
3. **Recommended design:** project the Live Activity from the draft-store boundary. A decorator store calls a `WorkoutLiveActivityCoordinator` after every `save` or `discard`. The coordinator derives content through a pure `draft → ContentState` projection. The activity is write-only output: nothing ever reads Activity state back into the draft.
4. **Three Logger concepts the prompt assumes do not exist today:**
   - a rest timer
   - a current exercise/set cursor
   - per-set completion timestamps

   Phase 1 derives the current exercise and set deterministically from list order. The rest timer is a separate Logger feature (Phase 1B) and a prerequisite for any rest UI on the Lock Screen. Elapsed time comes from `startedAt`, which exists.
5. **Interactive controls (Phase 2) need an authority refactor first.** A `LiveActivityIntent` runs in the app process and would write the draft store underneath a live view model holding a stale in-memory copy. That is a lost-update risk. Phase 2 is therefore gated on an app-scoped session owner, and should start with rest controls only. Remote push (Phase 3) has no current use case. Recommendation: do not build it.
6. **Project blockers before any implementation:**
   - **(a) Generator drift.** `ios/Scripts/generate_project.py` is missing three Sleep files that are hand-added to the committed pbxproj. Regenerating today would drop them. This must be reconciled with the Sleep lane first; this task did not touch it.
   - **(b) Release verifier.** `verify_release_configuration.py` requires `CURRENT_PROJECT_VERSION` to appear exactly twice. An extension with the required matching build number makes it four.
   - **(c) Provisioning.** The new extension bundle ID needs a new App ID and provisioning profiles. The first archive may need an interactive Xcode run signed into the team. If that run hits a sign-in or 2FA prompt, the Founder must be told rather than the agent logging in.

## 2. Apple platform facts (verified)

Two kinds of verification were used:
- **[SDK]**: checked directly against the local iOS 27.0 SDK Swift interfaces (`ActivityKit.swiftinterface` module 312.100, `WidgetKit`, `AppIntents`, `WGWidgetDefines.h`). This is the most authoritative source for API names and availability.
- **Apple documentation**: read through the DocC JSON behind each page.

Sources:
- **[DL]** https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities
- **[PUSH]** Apple ActivityKit article "Starting and updating Live Activities with ActivityKit push notifications" (https://developer.apple.com/documentation/activitykit)
- **[LAUNCH]** https://developer.apple.com/documentation/activitykit/launching-your-app-from-a-live-activity
- **[INT]** https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities
- **[HIG]** https://developer.apple.com/design/human-interface-guidelines/live-activities (last updated Dec 16 2025)
- **[ACT]** https://developer.apple.com/documentation/activitykit/activity
- **[WWDC26-223]** "Live Activities essentials" https://developer.apple.com/videos/play/wwdc2026/223/
- **[WWDC24]** https://developer.apple.com/videos/play/wwdc2024/10068/
- **[WWDC25]** https://developer.apple.com/videos/play/wwdc2025/278/

**Current OS:** iOS 27 is current. Apple Developer News (Sep 9 2026) opened iOS 27 submissions with the Xcode 27 RC. The deployment target stays iOS 18.0, so every iOS 26/27 API below needs `if #available`.

### 2.1 Requirements
- **Info.plist:** the app target needs `NSSupportsLiveActivities = YES` (iOS 16.1+) [DL].
  - `NSSupportsLiveActivitiesFrequentUpdates` only raises the *push* update budget and is not needed for local updates.
- **Extension:** the UI lives in a Widget Extension. Its `WidgetBundle` contains an `ActivityConfiguration(for:content:dynamicIsland:)` [SDK][DL]. No home-screen widget is required.
- **Attributes type:** `ActivityAttributes: Codable` with `associatedtype ContentState: Codable & Hashable` [SDK]. The type must compile into both the app and the extension.
- **Entitlements:**
  - Local start/update/end needs no special entitlement.
  - The Push Notifications capability (`aps-environment`) is needed only for remote updates [PUSH].
  - No Apple setup step mentions an App Group. That local Live Activities don't need one is inferred from the documented setup, and is consistent with the design below, where the extension reads only what ActivityKit hands it.
- **Sandbox:** the Live Activity cannot access the network or location [DL].

### 2.2 Lifecycle API (exact names and availability from the iOS 27 SDK)

**Starting**
- `Activity.request(attributes:content:pushType:)`, iOS 16.2.
  - Foreground only, except from a `LiveActivityIntent`, push-to-start, or a scheduled start [ACT][DL].
- `Activity.request(attributes:content:pushType:style:)`, iOS 18.0.
  - `ActivityStyle.standard` / `.transient`. Transient ends when the device locks, so it is unsuitable here.
- `Activity.request(attributes:content:pushType:style:alertConfiguration:start:)`, iOS 26.0: scheduled start.
  - The `startDate:` variant is deprecated in 26.0.

**Updating and ending**
- `update(_:alertConfiguration:)`, iOS 16.2.
- `update(_:alertConfiguration:timestamp:)`, iOS 17.2. An update with an older timestamp is ignored.
- `end(_:dismissalPolicy:)`, iOS 16.2.
- `end(_:dismissalPolicy:timestamp:)`, iOS 17.2.
- `ActivityUIDismissalPolicy` is `.default`, `.immediate` or `.after(Date)`. `.after` removes the activity at that date, or 4 h after ending, whichever comes first.
- Ending is allowed from the foreground or the background [DL].

**Content and state**
- `ActivityContent(state:staleDate:relevanceScore:)`.
- `ActivityState` cases: `active`, `ended`, `dismissed`, `stale` (16.2), `pending` (**26.0**).
  - Switches need `@unknown default` handling.
- Async sequences: `Activity.activities` (static), `activityUpdates`, `activityStateUpdates`, `contentUpdates`, `pushTokenUpdates`, plus `id` and `attributes` [SDK].

**Authorization and errors**
- `ActivityAuthorizationInfo`: `areActivitiesEnabled`, `activityEnablementUpdates`, `frequentPushesEnabled` [SDK].
- `ActivityAuthorizationError` cases [SDK]: `attributesTooLarge`, `unsupported`, `denied`, `globalMaximumExceeded`, `targetMaximumExceeded`, `unsupportedTarget`, `visibility`, `persistenceFailure`, `missingProcessIdentifier`, `unentitled`, `malformedActivityIdentifier`, `reconnectNotPermitted`.

**Orphan cleanup**
- Apple: "the system may stop your app, or your app may crash while a Live Activity is active. When the app launches the next time, check if any activities are still active … and end any Live Activity that's no longer relevant." [DL]

### 2.3 Lifetime, stale and dismissal
- **Maximum active time:** up to **8 hours**. After that the system ends the activity and removes it from the Dynamic Island. It can stay on the Lock Screen up to 4 more hours [DL][HIG].
- **After a custom end:** HIG suggests a dismissal of about 15–30 minutes [HIG].
- **Stale date:** at `staleDate`, `activityState` becomes `.stale` and `ActivityViewContext.isStale` becomes `true`, so the view can show different content without an app update [DL][SDK].
- **App 12 h vs system 8 h:** the app's existing 12 h "active live session" window (`TrainingLoggerDraft.activeLiveSessionWindow`) is longer than the 8 h ActivityKit limit. The plan handles the gap (§6.4).

### 2.4 Presentations
- **Required views:** Lock Screen (also the banner on devices without a Dynamic Island), Dynamic Island compact leading, compact trailing, minimal, and expanded [DL][HIG].
- **Expanded regions:** `DynamicIslandExpandedRegion(.leading | .trailing | .center | .bottom, priority:)` and `.dynamicIsland(verticalPlacement: .belowIfTooWide)` [SDK].
- **Sizes (HIG, pt):**

  | Screen | Compact leading / trailing (each) | Minimal | Expanded and Lock Screen | Notes |
  |---|---|---|---|---|
  | 393-wide | 52.33×36.67 | 36.67–45 wide | 371 × 84–160 | |
  | 430-wide | 62.33×36.67 | 36.67–45 wide | 408 × 84–160 | |
  | All | | | | Content over 160 pt may be truncated; Lock Screen margin 14 pt |

- **Modifiers** [SDK]: `.widgetURL`, `.keylineTint`, `.contentMargins(_:_:for:)`, `activityBackgroundTint`, `activitySystemActionForegroundColor`.
- **StandBy:** shows the minimal view; tapping it shows the Lock Screen view at 2× scale. Detect it with `@Environment(\.isActivityFullscreen)`, iOS 17+ (back-deployed) [SDK][HIG].
- **Apple Watch Smart Stack:** automatic from iOS 18 / watchOS 11. A custom small layout uses `.supplementalActivityFamilies([.small])` and `\.activityFamily` (`ActivityFamily .small/.medium`, iOS 18.0) [SDK][WWDC24].
- **CarPlay and Mac menu bar:** iOS 26 surfaces with no code required [WWDC25]. Buttons and toggles do not perform actions in CarPlay [DL].
- **Simplified detail:** `LevelOfDetail` `.default/.simplified`, iOS 26.0 [SDK].
- **iOS 27 landscape Dynamic Island:** compact and minimal views now appear in landscape. `@Environment(\.isDynamicIslandLimitedInWidth)` is **iOS 27.0** [SDK][WWDC26-223].
- **Always-On:** renders as dark with no animations; use `isLuminanceReduced` [DL].
- **Possible iOS 27 issue (UNVERIFIED):** a forum report says `colorScheme` is always `.dark` inside Live Activities. Use explicit theme colors; PhysiqueOS is dark-themed anyway.

### 2.5 Timers (no per-second updates)
- `Text(timerInterval:pauseTime:countsDown:showsHours:)` and `ProgressView(timerInterval:countsDown:)` (iOS 16) are rendered live by the system with no app updates.
  - In widgets they expand horizontally, so constrain them with `.frame`.
- `Text(date, style: .timer)` counts down to a date, then counts up after it passes.
- iOS 18: `SystemFormatStyle.Timer` / `.Stopwatch`, e.g. `Text(.currentDate, format: .timer(countingDownIn:))`.
- Custom animations are ignored. `.contentTransition(.numericText(countsDown:))` is allowed [DL].

### 2.6 Budget, payload and background
- **Payload:** static plus dynamic data combined must be **≤ 4 KB**, including updates [DL]. Images must fit their presentation size, or the activity may fail to start.
- **Push budget:** priority 10 is budgeted per hour; priority 5 does not count against the budget [PUSH].
- **Local update budget:** Apple publishes none (UNVERIFIED). Phase 1 coalesces anyway (§6.3).
- **Starting from the background:** only via a `LiveActivityIntent`, push-to-start (17.2+), or a scheduled start (26+).
- **Updating or ending from the background:** allowed while the app has runtime, for example during a background task [DL].

### 2.7 Remote push (Phase 3 reference only)
- **APNs headers:** `apns-push-type: liveactivity`, `apns-topic: <bundle id>.push-type.liveactivity`, priority 5 or 10. Token-based APNs auth is required.
- **`aps` payload keys:** `timestamp`, `event` (start/update/end), `content-state`, `stale-date`, `dismissal-date`, `relevance-score`, `alert`.
- **Tokens:** `pushTokenUpdates` (rotates), `pushToStartTokenUpdates` (17.2+).
- **Broadcast:** `PushType.channel(_:)` (iOS 18) [PUSH][SDK].

### 2.8 Interactivity
- `Button(intent:)` and `Toggle(intent:)` work in the Lock Screen and expanded presentations only.
- The intent must conform to `LiveActivityIntent` (iOS 17.0) [SDK]. It runs **in the app's process**, launched in the background without opening the app [INT].
- **Locked device:** [INT] says buttons are inactive on a locked device unless the person authenticates. However `authenticationPolicy` (`.alwaysAllowed` default, `.requiresAuthentication`, `.requiresLocalDeviceAuthentication`) [SDK] suggests per-intent control. Real-device behavior is **UNVERIFIED** and must be tested.
- **iOS 26 change:** `supportedModes` replaces `openAppWhenRun` [SDK].
- **HIG:** at most one or two simple controls. HIG names workouts and pause/resume as examples [HIG].

### 2.9 Deep links
- `widgetURL` sets the URL for the Lock Screen, compact and minimal presentations. In expanded, `Link` overrides it. Compact leading and trailing must open the same screen [LAUNCH].
- **Without an explicit deep link,** the system opens the app with an `NSUserActivity` whose `activityType` is `NSUserActivityTypeLiveActivity`. That is delivered to `onContinueUserActivity` [LAUNCH][SDK `WGWidgetDefines.h`].
- **Consequence:** Phase 1 does not need a custom URL scheme (§8).

### 2.10 Authorization, privacy, multiples
- **User toggles:** the user can turn Live Activities off per app (observe `activityEnablementUpdates`). Frequent updates have a separate toggle.
- **HIG privacy guidance:** avoid sensitive information; show an innocuous summary or let people choose. No Live-Activity-specific redaction API exists beyond standard SwiftUI redaction (UNVERIFIED that the system redacts Live Activities automatically).
- **Concurrency limits:** the per-app concurrent cap is unpublished ("may depend on a variety of factors"). Handle `targetMaximumExceeded` and `globalMaximumExceeded`. The highest `relevanceScore` gets the Dynamic Island. HIG prefers a single activity.

### 2.11 Testing
- **Previews:** `#Preview(_:as:using:widget:contentStates:)` with `ActivityPreviewViewKind` `.content`, `.dynamicIsland(.compact | .expanded | .minimal)` [SDK].
- **Simulator:** iPhone Pro simulators show the Dynamic Island. This is commonly observed but Apple does not document which models (UNVERIFIED).
- **Physical device:** Lock Screen privacy, Always-On, StandBy, Watch Smart Stack and locked-device intent behavior need a physical device.

### 2.12 UNVERIFIED / conflicting (do not rely on without device proof)
1. Per-app concurrent activity cap ("5" is folklore).
2. Local `update()` budget.
3. Persistence across reboot and user force-quit. Apple implies persistence across app termination but says nothing about reboot.
4. Locked-device behavior of `LiveActivityIntent` buttons under each `authenticationPolicy`.
5. Whether the view re-renders exactly at `staleDate` while the device is locked. The docs say `isStale` flips at that date; timing needs on-device proof.
6. iOS 27 `colorScheme` forced to `.dark` (forum report only).
7. Which Simulator models render the Dynamic Island, and `simctl` push support for liveactivity payloads.
8. Widget-extension memory ceiling (keep the extension tiny: no fonts or images beyond SF Symbols).

## 3. Current Native architecture (audited at b6d98889)

All paths are relative to `ios/PhysiqueOS/`.

### 3.1 Workout Logger authority map

| Concern | Where | Finding |
|---|---|---|
| In-progress owner | `Presentation/TrainingLogger/TrainingLoggerViewModel.swift:3-5` | `@MainActor @Observable final class TrainingLoggerViewModel`. Built per screen inside `TrainingLoggerView` (`@State … viewModel`, `.task(id: environment.nativeAuthority)`, `TrainingLoggerView.swift:8,59-83`). **No app-scoped owner exists.** |
| Durable authority | `Networking/TrainingLoggerDraftStore.swift:3-69` | `protocol TrainingLoggerDraftStore { loadAll(); save(_:); discard(id:) }`. `UserDefaultsTrainingLoggerDraftStore` writes a JSON envelope `{schemaVersion: 2, drafts}` to `UserDefaults.standard`. Sandbox key `physiqueos.trainingLogger.localDraft.v1`; production key `physiqueos.founder-production.trainingLogger.localDraft.v1` (`App/AppEnvironment.swift:585`). Selected per authority at `AppEnvironment.swift:239-241`. |
| Mutation path | `TrainingLoggerViewModel.update(_:)` `:181-188` → `persist()` `:390-397` | Every edit calls `persist()`, which calls `draftStore.save`. Set completion toggles `isCompleted` (`TrainingLoggerView.swift:827-832`). `persist()` skips `.complete` drafts. |
| Server authority | `Networking/TrainingWriteAPI.swift:104-228` | Local-first during the session. At Finish, `submit()` sends one `commitTrainingSession` command with idempotency key `training-session.<draftId>`. On a durable result the draft and attachments are discarded (`completeLocalCapture`, `:230-245`). Otherwise `submissionState` becomes `.acceptedProcessing` or `.resultUnknown`, and durability recovery polls up to 30 × 2 s (`:311-334`). |
| Write gate | `:643-645` | `NativeProductWriteGuard.authorize(.workoutLogger, in:)`. Sandbox makes no Server writes. |
| Timestamps | `Contracts/TrainingLoggerReadModel.swift:112-149` | `startedAt: String?` (ISO8601; live mode only, set at `start`). `finishedAt: String?` (stamped once on the first Finish/submit, persisted before the commit). `leftAt` is set by Save & Leave. **No per-set timestamps.** |
| "Active session" selector | `TrainingLoggerReadModel.swift:194-212` | `TrainingLoggerDraft.activeLiveSession(in:now:)` picks the newest draft that is live, not `.complete`, has `submissionState == nil` and `leftAt == nil`, and has `startedAt` within −5 min … +12 h. It is used by Log-tab routing (`Presentation/Root/RootTabView.swift:122-133`). |
| Multiple drafts | `PhysiqueOSTests/TrainingLoggerTests.swift:609,634` | Multiple concurrent drafts are intentionally allowed. `start()` always mints a new UUID draft. There is no lock; "active" is derived. |

**State by app condition:**
- **Foreground:** the view model's in-memory `draft` mirrors the persisted draft. Each `update` writes through immediately.
- **Background or locked:** no Logger code runs. The persisted draft is authoritative and unchanged. There are no `UIBackgroundModes` and no BGTasks.
- **Terminated or force-quit:** the persisted draft survives, as of the last `update`. Relaunch `load()` restores saved drafts, clears any already durable on the Server, and resumes durability recovery for drafts with a `submissionState` (`ViewModel:78-126`).
- **Reboot:** same as terminated (UserDefaults).
- **After a durable Finish:** the Server's canonical training session is authoritative, as `training|authoritative|training_logger_draft_<draftId>`.

**Rule for Live Activities:** the Live Activity is a pure projection of the persisted draft. It is never read back. Its Activity state, content, dismissal or push token never feed into the draft, Server commands, or HealthKit reconciliation.

### 3.2 Data model relevant to display

Source: `Contracts/TrainingLoggerReadModel.swift`.

- **`TrainingLoggerDraft`:** `mode` (`.live`/`.past`), `workoutDate`, `selectedAreaIds`, `exercises`, `relationships`, `step` (`entry → areas → exercises → workout → summary → review → complete`), `startedAt`, `finishedAt`, `submissionState`, `leftAt`, plus evidence fields.
- **`TrainingLoggerDraftExercise`:** `name`, `areaId`, `measurement`, `executionVariant`, `sets`, `previousPerformance`, `progressionRecommendation`, `progressionChoice`.
- **`TrainingLoggerMeasurement`:**
  - `repsLoad`
  - `bodyweightReps`
  - `duration` (timed)
- **`TrainingLoggerDraftSet`:** `setNumber`, `reps`, `load`, `loadType`, `durationSeconds`, `isCompleted`.
- **Units:** none on the draft. The write path hard-codes `lb`, or `bodyweight`.
- **Supersets:** `TrainingLoggerDraftRelationship { relationshipType: "superset", memberExerciseIds }`. Pairs only.
- **Not found:** circuits, warmup flags, RPE/RIR, notes.
- **No current-exercise or current-set cursor.** The workout screen is a free-form list. Keyboard focus order (`TrainingLoggerNumericFocusOrder`) is transient `@State`.
- **No rest timer:** no rest state, countdown, or rest notification anywhere.
  - **Gotcha for implementers:** the app defines its own `struct TimelineView: View` (`Presentation/Evidence/TimelineView.swift:8`), which shadows SwiftUI's `TimelineView` in the app module.
- **No elapsed-time display.** The in-app header reads a static "Started now · N exercises" no matter how long ago the workout started (`TrainingLoggerWorkoutPresentation`, `ViewModel:660-680`). A pure presentation struct already exists in this shape; the Live Activity projection should follow it.

### 3.3 Lifecycle, navigation, notifications, background
- **Entry point:** `@main PhysiqueOSApp` (`App/PhysiqueOSApp.swift:10-102`), one `WindowGroup { RootTabView() }`, no `UIApplicationDelegateAdaptor`.
  - The `scenePhase` hook (`:86-93`) re-evaluates the day and HealthKit sync only.
  - The Logger's only lifecycle hook is `.onDisappear { viewModel?.persist() }`.
- **Navigation:**
  - `RootTabView` holds `selectedTab` plus five `NavigationPath`s.
  - `AppDestination.trainingLogger` (`Contracts/AppDestination.swift:96`) routes to `TrainingLoggerView()` (`Presentation/Root/AppDestinationRouterView.swift:97-98`).
  - An existing programmatic resume path sets `environment.pendingTrainingLoggerResumeDraftId` (`AppEnvironment.swift:181-187`) and then `logPath.append(.trainingLogger)`. `TrainingLoggerView` consumes it with `resume(draftId:)`.
- **URL handling: none.** No `onOpenURL`, `onContinueUserActivity`, `CFBundleURLTypes`, universal links or associated domains.
- **Notification taps:**
  - `PriorityNotificationDelegate` decodes `userInfo["destinationJSON"]` into `NotificationDeepLinkCoordinator`, which is cold-launch safe and de-duplicates requests.
  - `RootTabView.openFromNotification` then routes on the Home tab.
- **Notifications:**
  - Local only, with six categories.
  - No `registerForRemoteNotifications`, no APNs token, no `aps-environment`.
- **Background:**
  - Only `beginBackgroundTask` via `BackgroundExecutionAssertion`, used for HealthKit and Evidence, not training.
  - No `BGTaskScheduler`, no `UIBackgroundModes`.

### 3.4 HealthKit workout reconciliation
- **Read-only.** The app never starts an `HKWorkoutSession` or builder (HealthKit `writeTypes: []`).
- **Matching happens on the Server.** Native shows a typed `WorkoutReconciliationDetail` review and resolves it with `workout-reconciliation.resolve.v1` (`Networking/EvidenceReviewAPI.swift:138-215`).
- **The commit's `startedAt`/`finishedAt` presumably feed Server time-window matching.**
- **Live Activity impact: none.** The Live Activity must not change `startedAt` or `finishedAt` semantics. Phase 1 reads them; it never writes them.

### 3.5 Project, targets, signing (audited)

**Targets and settings**
- Three targets only: app `com.physiqueos.native.dev`, tests `.Tests`, UI tests `.UITests`.
- Debug and Release share the bundle ID.
- iOS 18.0, Swift 6.0, team `33GMTRM6G9`, automatic signing, version 1.0 (74).
- No extension, WidgetKit, ActivityKit or AppIntents anywhere.

**Entitlements**
- HealthKit and HealthKit background delivery only.
- No App Groups, push, or associated domains.

**Generator (`ios/Scripts/generate_project.py`, 1207 lines)**
- Hand-written f-string with deterministic object IDs and append-only `late_*` file lists.
- Three hard-coded targets. No support for extension, embed phase, `.appex` product or target dependency.
- `system_frameworks = ["HealthKit.framework"]`.

**DRIFT: the committed pbxproj contains three hand-added files the generator does not list**
- `Contracts/HealthKitSleepHistoricalEvidence.swift`
- `Presentation/You/HealthKitSleepHistoricalEvidenceSection.swift`
- `PhysiqueOSTests/HealthKitSleepHistoricalEvidenceTests.swift`

They have object IDs `…13A0–13A5`. Verified: the generator has 0 matches and the pbxproj has 12. **Regenerating today would silently drop the Sleep files.** This task does not touch them (Sleep is out of scope). The Sleep lane owner must fold them into the generator before any Live Activities regeneration.

**Verifier (`ios/Scripts/verify_release_configuration.py`)**
- Requires `CURRENT_PROJECT_VERSION = <N>;` to appear **exactly 2** times, so an extension breaks it.
- Requires the app bundle-ID line to appear exactly 2 times. A `…dev.WorkoutActivity;` line does not match, so it is safe.
- Requires the AppIcon and entitlements-path lines exactly 2 times. Safe if the extension has no AppIcon and no entitlements file.

**Release tool (`~/.physiqueos-release/bin/physiqueos-asc-upload`)**
- Already globs `PlugIns/*.appex`. It requires each extension's `CFBundleShortVersionString`/`CFBundleVersion` to equal the app's (verified at `:218-229`).
- It runs `codesign --verify --deep --strict`.
- It verifies the dSYM of the app binary only.
- Export uses `method=app-store-connect`, `signingStyle=automatic`, `-allowProvisioningUpdates` and the Admin-role API key. (The Developer-role key cannot cloud-sign; this was resolved in Build 48.)
- No tool change is required for an extension.

**Shared scheme**
- Hand-maintained, with hard-coded BlueprintIdentifiers. New target IDs must not disturb them.

**Unit tests and UI tests**
- `PhysiqueOSTests/TrainingLoggerTests.swift` has 78 tests. Lines 1692-1696 assert the build number and bundle ID.
- `PhysiqueOSUITests/TrainingAcceptanceUITests.swift` runs under sandbox authority.
- No snapshot library. `ImageRenderer` is used ad hoc.

**Design tokens**
- Colors are code constants (`SharedUI/PhysiqueOSTheme.swift`).
- The font is PlusJakartaSans via the app's `UIAppFonts`. Fonts do not cross bundles.

## 4. Phase 1 UX (restrained)

Principles:
- Glanceable.
- At most three lines of text on the Lock Screen.
- No workout history.
- No tiny overloaded numbers.
- System-rendered timers only.
- SF Pro (system font) with PhysiqueOS theme colors. Do not bundle PlusJakartaSans into the extension, to keep it small (Founder may override, D7).

### 4.1 Lock Screen / banner (about 371 × 100–130 pt)

```
[dumbbell]  Push · Chest & Shoulders                    42:17
Bench Press · Set 3 of 4                     185 lb × 8 target
Last 185 lb × 8          ▓▓▓▓▓▓▓▓░░░░  11 / 18 sets
```

**Line 1: session label and elapsed time**
- The session label is the selected training areas, or "Workout" before any areas are chosen.
- Elapsed is `Text(timerInterval: startedAt...startedAt+8h, countsDown: false)`, monospaced digits, fixed frame.

**Line 2: current exercise, set position and target**
- Target is the entered reps/load for that set when present. Otherwise it falls back to the previous-performance hint, otherwise it is omitted.
- Timed sets show "45 s". Bodyweight shows "BW × 12".
- Variant label (e.g. "Paused") is appended to the name only if it fits; otherwise it is dropped.

**Line 3: most recent completed set and progress**
- Shows the most recent completed set in the current exercise (§6.2) and set progress (`ProgressView(value:)` plus "11 / 18 sets").
- When all sets are complete: "All sets logged · Finish in PhysiqueOS".

**Superset**
- Line 2 becomes "Superset · Bench Press ↔ Row". The set position is that of the current member.

**Phase states**
- Before any exercise exists (areas or exercises step): "Choosing exercises…" plus elapsed time.
- `summary`/`review` step: "Reviewing workout" plus frozen elapsed.
- After Finish: "Saving workout…". When ended as complete: "Workout saved · 58 min · 21 sets".

**Rest active (Phase 1B only; rest temporarily dominates)**
- Line 2 becomes a large `Text(timerInterval: rest.startedAt...rest.endsAt, countsDown: true)` "Rest 1:24", plus a thin `ProgressView(timerInterval:countsDown:)`.
- Line 3 becomes "Up next: Bench Press · Set 4".
- At `staleDate = rest.endsAt` the view flips to "Rest complete" via `context.isStale`. Device proof is required; the fallback is the timer showing 0:00.

### 4.2 Dynamic Island

| Region | Default (lifting) | Rest active (1B) |
|---|---|---|
| Compact leading | `dumbbell.fill` SF Symbol, theme accent | `timer` symbol |
| Compact trailing | Elapsed `42:17` (fixed-width frame) | Rest countdown `1:24`, accent color |
| Minimal | `dumbbell.fill` | Circular `ProgressView(timerInterval:countsDown:)` ring |
| Expanded leading | Exercise name (1 line, truncating) and "Set 3 of 4" | "Rest" |
| Expanded trailing | Elapsed | Rest countdown (large) |
| Expanded bottom | Target, last set and progress bar "11/18 sets" | "Up next: Bench Press · Set 4" |
| Expanded center | Not used (avoids crowding the camera) | Not used |

- **iOS 27 landscape:** under `if #available(iOS 27, *)`, read `isDynamicIslandLimitedInWidth`. When true, compact trailing drops the timer text and shows only the symbol.
- **Keyline:** `.keylineTint(theme accent)`.
- **One URL:** compact leading and trailing open the same destination (§8).

### 4.3 Other surfaces
- **StandBy:** `isActivityFullscreen` enlarges the elapsed and exercise lines. There is no extra content.
- **Apple Watch Smart Stack:** accept the system default (it derives from the compact views) for Phase 1. A custom `.small` family is optional (D6).
- **CarPlay / Mac:** the system default; nothing to build. No buttons exist in Phase 1 anyway.
- **Devices without a Dynamic Island:** the Lock Screen view only. Phase 1 sends no `AlertConfiguration`, so there are no banners. HIG says alerts are for essential updates only.

## 5. Attributes and ContentState (proposed v1)

```swift
// Shared file compiled into app + extension: ios/PhysiqueOSShared/WorkoutLoggerActivityAttributes.swift
struct WorkoutLoggerActivityAttributes: ActivityAttributes {   // NEVER rename (persisted across app updates)
    static let currentSchemaVersion = 1
    let schemaVersion: Int          // immutable; bumping => app ends + re-requests old activities
    let draftId: String             // opaque local UUID; identity for dedupe/orphan cleanup
    let startedAt: Date             // elapsed derivation; immutable for the draft

    struct ContentState: Codable, Hashable {
        var phase: Phase            // String-backed, unknown raw values decode to .inProgress
        var sessionLabel: String    // ≤ 32 chars, e.g. "Push · Chest & Shoulders"
        var completedSets: Int
        var totalSets: Int
        var current: Cue?           // nil when no exercise or all sets done
        var lastSetText: String?    // preformatted, ≤ 24 chars, "185 lb × 8"
        var nextText: String?       // preformatted, ≤ 32 chars
        var finishedAt: Date?       // freezes elapsed once Finish pressed
        var rest: Rest?             // Phase 1B; absent in v1 payloads (optional => forward compatible)

        enum Phase: String, Codable { case planning, inProgress, reviewing, finishing, saved }
        struct Cue: Codable, Hashable {
            var exerciseName: String    // ≤ 28 chars, variant appended only if fits
            var setNumber: Int
            var setCount: Int
            var targetText: String?     // "185 lb × 8" | "45 s" | "BW × 12"
            var supersetPartnerName: String?
        }
        struct Rest: Codable, Hashable { var startedAt: Date; var endsAt: Date }
    }
}
```

**Rules**
- **What it carries:** no history, no previous sessions, no body metrics, no Evidence, no notes, no Server ids.
- **Payload headroom:** a unit test asserts that the encoded attributes plus state are ≤ 1 KB. That leaves 4× headroom under the 4 KB limit.
- **Truncation:** every string is truncated in the projection, not in the view.

**Versioning**
- New fields are always optional.
- Fields are never removed or renamed.
- `Phase` decodes unknown values to a safe case.
- A breaking change bumps `schemaVersion`. On launch the coordinator ends any activity whose `attributes.schemaVersion != currentSchemaVersion` and re-requests (foreground only).
- **Why this matters:** an activity started by build N keeps rendering after the user installs build N+1, because the extension is replaced while the activity persists. The ContentState encoded by N must decode in N+1.

**Preformatted strings vs raw numbers**
- The app owns formatting (units `lb` hard-coded today, bodyweight, timed) so the extension stays dumb and identical to in-app language.
- Counts stay numeric for the progress bar.

## 6. State derivation and lifecycle

### 6.1 Architecture (Phase 1)

```
TrainingLoggerViewModel ──update/persist/discard──▶ LiveActivityPublishingDraftStore (decorator)
                                                         │  1. forwards to inner UserDefaults store (authority)
                                                         │  2. then notifies ↓ (main actor, after successful save)
                                                    WorkoutLiveActivityCoordinator (@MainActor, app-scoped, in AppEnvironment)
                                                         │  subject = TrainingLoggerDraft.liveActivitySubject(in: store.loadAll(), now:)
                                                         │  state   = WorkoutLiveActivityProjection.make(draft:, now:)   (pure)
                                                         │  diff vs last-sent → request / update / end via LiveActivityClient
                                                    LiveActivityClient (protocol; ActivityKit impl + in-memory fake for tests)
```

**Why the store boundary**
- Every mutation path (start, edit, toggle set, Save & Leave, resume, cancel, discard, durable complete, durability-recovery discard on relaunch) already funnels through `save` or `discard`.
- The decorator therefore cannot miss a path, and the view model needs almost no changes.

**The one gap is end reason**
- `discard(id:)` is used both by Cancel and by durable completion.
- The view model passes an explicit hint at its three terminal methods: `completeLocalCapture`, `cancelWorkout` and `discardSavedDraft`. That is one line each, for example `liveActivity.noteTerminal(draftId:, reason: .saved | .cancelled | .discarded)`.
- The fallback with no hint is safe: end with `.immediate`.

**Subject selector**
- `liveActivitySubject(in:now:)` equals `activeLiveSession`, extended to keep the same draft while `finishedAt != nil` and `submissionState != nil`, so the activity can show "Saving workout…".
- It excludes `mode == .past`, `leftAt != nil`, `.complete`, and `startedAt` older than 8 h.

**Authority switch**
- The coordinator reconciles against `environment.trainingLoggerDraftStore` for the current authority.
- Switching sandbox ↔ production changes the subject, which ends the old activity.
- Enable in both authorities so sandbox UI tests can exercise it.

### 6.2 Deterministic "current exercise / set" (no cursor exists)

1. Order exercises as displayed (`draft.exercises` order). A superset pair is treated as a unit at the position of its first member.
2. The **current exercise** is the first exercise (or superset unit) with at least one incomplete set.
   - Inside a superset unit, the current member is the one with fewer completed sets. On a tie, the first member.
3. The **current set** is the current exercise's first incomplete set (lowest `setNumber`).
4. **Last** is the highest-numbered completed set of the current exercise. If there is none, it is the last completed set of the previous unit. If there is none, it is nil.
5. **Next** is the first incomplete set of the next unit, or "Finish when ready" when nothing remains.
6. **Target text:** entered values on the current set. Otherwise `previousPerformance` for the same set number. Otherwise nil.

**Limitation**
- Out-of-order completion (for example finishing exercise 3 before 2) makes "current" point at 2. That is deterministic and explainable, but may not match intent.
- **D3 (recommended):** add optional `completedAt: String?` to `TrainingLoggerDraftSet`. It is additive and decodes as nil on old drafts. It would make "last" exact and enable an auto-started rest timer. It touches the authority model, so the Founder decides.

### 6.3 Update policy
- **When to update:** recompute after each `save`. Send an update only when the projected `ContentState` differs (it is `Hashable`).
  - Typing in an *incomplete* set's field changes `targetText`. Trailing-coalesce updates to at most one per 1 s.
  - Set completion and terminal transitions bypass coalescing.
- **Ordering:** use `update(_:alertConfiguration:nil, timestamp:)` (iOS 17.2+, so always available at the iOS 18 target) with a monotonic timestamp so out-of-order async updates are dropped by the system.
- **Elapsed time:** never sent as updates. It is derived from `attributes.startedAt` by the system timer.
- **Stale date:**
  - `staleDate = min(lastUpdate + 3 h, rest?.endsAt)`.
  - When stale with no rest, the view shows "Open PhysiqueOS to continue". This covers crash or abandonment.
  - Founder may tune 3 h (D4).

### 6.4 Lifecycle matrix

| Event | Authority effect (unchanged) | Live Activity action |
|---|---|---|
| Start live workout (`start(mode: .live)`) | New draft with `startedAt` | If `areActivitiesEnabled`, `request(…style: .standard)` with `phase .planning`. Foreground only, which always holds here. |
| Start past workout | Draft, `mode .past` | None, ever |
| Areas or exercises chosen, set edited or completed | `save` | Recompute, diff, update (§6.3) |
| Finish pressed (`finishedAt` stamped) | `save` | Update to `.finishing`; elapsed frozen at `finishedAt` |
| Durable commit (`completeLocalCapture`) | `discard` and `noteTerminal(.saved)` | `end(state .saved, dismissalPolicy: .after(now + 15 min))` |
| Commit accepted-processing / result-unknown | `submissionState` saved | Stay `.finishing`. End `.saved` when recovery discards, or `.immediate` if the draft disappears without a hint. |
| Cancel Workout | `discard` and `noteTerminal(.cancelled)` | `end(nil, .immediate)` |
| Save & Leave (`leftAt`) | `save` | Subject disappears, so `end(.immediate)`. Leaving means "not now". |
| Resume a left draft (clears `leftAt`) | `save` | Request a new activity (foreground) unless suppressed (below) |
| Discard saved draft | `discard` | End if it was the subject |
| Second live workout started while one is active | Allowed by design | Subject becomes the newest draft. End the old activity (`.immediate`) and request the new one, so there is never more than one activity. |
| App backgrounded or device locked | None | None. Timers keep rendering. |
| App terminated or crashed | Draft persists | The activity persists (system) and is reconciled at next launch |
| Relaunch / `scenePhase` → active | `load()` | **Reconcile**: list `Activity<…>.activities`; end every activity whose `draftId != subject?.id` or whose `schemaVersion` is stale; end duplicates for the subject (keep one); adopt the existing activity for the subject and push current state; request one if none exists and the subject is not suppressed and `now − startedAt < 8 h`. |
| User swipes the activity away (`.dismissed`) | None | Add `draftId` to the suppressed set (persisted, key `physiqueos.liveActivity.suppressedDraftIds.v1`, pruned when the draft goes). Never resurrect it for that draft. |
| System 8 h limit (`.ended` by system) | None | Same as above: suppress. The app's 12 h Log-routing window is unaffected. |
| Live Activities disabled in Settings | None | No-op, no UI nag. Observe `activityEnablementUpdates`; if re-enabled while foreground with a subject, request. |
| `ActivityAuthorizationError` (`denied`, `targetMaximumExceeded`, …) | None | Log a sanitized diagnostic. The workout is never blocked or altered. |
| App update while active (extension replaced) | None | Old state must decode (§5). On launch, a `schemaVersion` mismatch triggers end and re-request. |
| Authority switch sandbox ↔ production | Different store | The subject changes, so the old activity ends |
| Device without Dynamic Island | None | Lock Screen view only; no special handling |
| Reboot | Draft persists | Persistence is UNVERIFIED. Launch reconciliation handles both outcomes. |

### 6.5 Rest timer audit and decision
- **No rest timer exists today.**
- **Recommendation:** Phase 1 ships without any rest UI. **Phase 1B** adds a rest timer to the Logger itself, as authority in the draft:
  - Optional `restTimer: { id, afterSetId, startedAt, endsAt }` (ISO8601 like the other draft timestamps).
  - In-app countdown UI.
  - Optional local notification at `endsAt` using existing `UNUserNotificationCenter` plumbing, as a new category.
- **The Live Activity then mirrors `rest`:**
  - System countdown `Text(timerInterval:)` with an absolute `endsAt`.
  - `staleDate = endsAt`.
  - No per-second updates.
- **Founder decisions needed (D2):**
  - Auto-start rest on set completion, or tap to start?
  - Default duration: global, per exercise, or per measurement?
  - Should rest end with an alert (sound/haptic)? Via a local notification is preferred. A Live Activity `AlertConfiguration` requires an app update at `endsAt`, which a suspended app cannot do.
- **Elapsed workout time** always derives from `startedAt`.
- **Optional parity fix:** the in-app header's static "Started now" should show the same system timer.

## 7. Interaction support matrix

| Interaction | Technically supported? | Safe for PhysiqueOS? | Recommendation |
|---|---|---|---|
| Tap to open the active Logger | Yes (`NSUserActivityTypeLiveActivity` / `widgetURL`) | Yes (read-only navigation) | **Phase 1** |
| Skip rest | Yes (`Button(intent:)` + `LiveActivityIntent`, iOS 17) | Yes, once rest exists and authority is app-scoped. Non-evidentiary and reversible. | **Phase 2**, `authenticationPolicy .alwaysAllowed` |
| +30 s rest | Yes | Same as skip rest | **Phase 2** (paired with Skip; at most two controls per HIG) |
| Mark set complete | Yes | **Not yet.** It writes workout evidence from a glance surface: accidental pocket or lock-screen taps, values unseen or unconfirmed (blank reps/load), and a lost-update race with the live view model. | **Not recommended.** Reconsider only after the authority refactor, with "complete as entered" restricted to sets whose values are all filled, `.requiresAuthentication`, and an in-app undo. |
| Next exercise | No underlying concept (no cursor) | N/A | Not applicable unless a cursor feature is designed |
| Pause / resume workout | Supported by the platform; no pause concept in the Logger | N/A | Not proposed |

**Phase 2 prerequisite (blocking)**
- **The race:** a `LiveActivityIntent.perform()` runs in the app process, possibly while a suspended `TrainingLoggerViewModel` holds an in-memory `draft`. Today the view model would overwrite the intent's store write on its next `persist()`. That is a lost update.
- **Required fix:** introduce an app-scoped `@MainActor TrainingSessionAuthority` that owns the active draft. The view model and intents both mutate through it, so writes are serialized, versioned, and observed.
- **Tests:** concurrency tests are required.

**Accidental taps and privacy**
- Controls only in the expanded and Lock Screen presentations (they cannot exist elsewhere).
- Large hit targets.
- Never in the compact or minimal presentations.
- Rest controls affect only rest. Nothing on the Lock Screen can alter sets, loads, finish or cancel.

## 8. Deep links
- **Phase 1:** do **not** add a URL scheme. Rely on Apple's default: with no explicit deep link, tapping opens the app with an `NSUserActivity` of type `NSUserActivityTypeLiveActivity` [LAUNCH].
- **Handler:** add `.onContinueUserActivity(NSUserActivityTypeLiveActivity)` on the root.
  - It routes like the existing Log-tab path (`RootTabView.selectTab`): select `.log`, reset `logPath`, set `pendingTrainingLoggerResumeDraftId = activeLiveSession?.id`, and append `.trainingLogger`.
  - If no active session remains (for example a stale activity), just select Log.
- **Why:** no new external attack surface (a custom scheme can be invoked by any app or web page), no Info.plist `CFBundleURLTypes`, and it reuses tested routing. The routing logic is a pure function testable like `AppTabTests`.
- **Later:** if a precise anchor such as "scroll to current exercise" is wanted, add `widgetURL(physiqueos://workout-logger?draftId=…)` with a registered scheme.
  - The handler must validate that `draftId` is an existing local live draft and **never mutate** state from a URL.
  - The same routing must work on cold launch, as `NotificationDeepLinkCoordinator` already does for notifications.

## 9. Privacy
- **Phase 1 shows on the Lock Screen while the device is locked:**
  - training-area label
  - exercise name
  - target and last set load × reps
  - set counts
  - elapsed time
- **Never shown:** body weight, body composition, nutrition, peptides or protocols, goals, Evidence, notes, Server data, or HealthKit-derived values. The Live Activity carries Logger-entered data only.
- **Sensitivity:** low but bystander-visible.
- **Recommendation:** an in-app toggle (default ON, decision D5), "Show exercise details on Lock Screen".
  - **OFF redacts at the source:** the projection omits `current`, `lastSetText` and `nextText`, and sets `sessionLabel = "Workout"`. The Live Activity then shows only "Workout · 42:17 · 11/18 sets".
  - This is stronger than view-level `redacted(reason:)` because the data never reaches the system.
- **Respect the system:** the Live Activities toggle; no nagging.
- **Diagnostics:** log activity ids and outcomes only, never exercise names.

## 10. Exact project changes for implementation

The order matters.

0. **Prerequisite (Sleep-lane owner, not Live Activities):** fold the three hand-added Sleep files into `generate_project.py`. Prove `python3 ios/Scripts/generate_project.py` reproduces the committed pbxproj byte-for-byte before any further generator change.
1. **Generator** (`ios/Scripts/generate_project.py`), appended after the last allocation so existing IDs never renumber:
   - A new source group `PhysiqueOSLiveActivity/` (extension) and `PhysiqueOSShared/`, the files compiled into both targets.
   - An `.appex` product fileref (`explicitFileType = "wrapper.app-extension"`).
   - Extension Sources, Frameworks (`WidgetKit.framework`, `SwiftUI.framework`; ActivityKit is auto-linked or added explicitly) and Resources phases.
   - A `PBXNativeTarget`, `productType = "com.apple.product-type.app-extension"`.
   - On the app target: a `PBXCopyFilesBuildPhase` "Embed Foundation Extensions" (`dstSubfolderSpec = 13`, `ATTRIBUTES = (RemoveHeadersOnCopy, )`), a `PBXContainerItemProxy` and a `PBXTargetDependency`.
   - Extension Debug and Release configs:
     - `PRODUCT_BUNDLE_IDENTIFIER = com.physiqueos.native.dev.WorkoutActivity`
     - `INFOPLIST_FILE = PhysiqueOSLiveActivity/Info.plist`
     - `CURRENT_PROJECT_VERSION = APP_BUILD_NUMBER`, `MARKETING_VERSION = 1.0` (the upload tool requires these to match)
     - `IPHONEOS_DEPLOYMENT_TARGET = 18.0`, `SWIFT_VERSION = 6.0`
     - `SKIP_INSTALL = YES`, `APPLICATION_EXTENSION_API_ONLY = YES`
     - `CODE_SIGN_STYLE = Automatic`, `DEVELOPMENT_TEAM = 33GMTRM6G9`
     - `LD_RUNPATH_SEARCH_PATHS = @executable_path/Frameworks @executable_path/../../Frameworks`
     - `TARGETED_DEVICE_FAMILY = 1`
     - **No** `CODE_SIGN_ENTITLEMENTS`.
   - Add the target to `targets` and `TargetAttributes`.
   - Add the extension to the shared scheme's BuildActionEntries without changing existing BlueprintIdentifiers.
2. **App `Supporting/Info.plist`:** add `NSSupportsLiveActivities = true`. Do **not** add `NSSupportsLiveActivitiesFrequentUpdates` (no push).
3. **Extension Info.plist:** `NSExtension → NSExtensionPointIdentifier = com.apple.widgetkit-extension`, plus `CFBundleDisplayName`. There is no `UIAppFonts` (system font, D7).
4. **Entitlements:**
   - App: unchanged.
   - Extension: none.
   - **No App Group** (the extension reads only ActivityKit-delivered state).
   - **No `aps-environment`.**
5. **Shared code (`PhysiqueOSShared/`, compiled into both the app and the extension; must be extension-safe, so no `UIApplication.shared`):**
   - `WorkoutLoggerActivityAttributes.swift`
   - A small `WorkoutActivityTheme.swift`: colors copied from `PhysiqueOSTheme` constants, or a shared subset file. **Do not** pull the whole `SharedUI`.
6. **Extension code (`PhysiqueOSLiveActivity/`):**
   - `PhysiqueOSLiveActivityBundle.swift` (`@main WidgetBundle`)
   - `WorkoutLoggerLiveActivity.swift` (`ActivityConfiguration`)
   - Region views
   - `#Preview` for every region and state
7. **App code:**
   - `Contracts/WorkoutLiveActivityProjection.swift` (pure)
   - `Networking/WorkoutLiveActivityCoordinator.swift`
   - `Networking/LiveActivityClient.swift` (protocol, ActivityKit implementation, fake)
   - `Networking/LiveActivityPublishingDraftStore.swift`
   - `AppEnvironment` wiring
   - Three one-line terminal hints in `TrainingLoggerViewModel`
   - `.onContinueUserActivity` routing in `RootTabView`/`PhysiqueOSApp`
   - Reconcile on launch and on `scenePhase == .active`
   - Optional in-app elapsed timer fix
   - Optional D5 toggle in You → settings
8. **`verify_release_configuration.py`:** make it target-aware.
   - Expect the app build-number line twice and the extension's twice (or parse per configuration).
   - Assert the extension bundle ID has the prefix `com.physiqueos.native.dev.`
   - Assert `NSSupportsLiveActivities` is true.
   - Assert the extension Info.plist extension point.
   - Assert the extension has no entitlements.
9. **Tests:** the new files are added to `PhysiqueOSTests`. The extension views are also compiled into the test target so they can be rendered with `ImageRenderer` (or kept in `PhysiqueOSShared`).
10. **Signing and provisioning:**
    - The new explicit App ID `com.physiqueos.native.dev.WorkoutActivity` needs development and App Store profiles.
    - **Development archive:** automatic signing with `-allowProvisioningUpdates` uses the Xcode-signed-in account to register the App ID and profile.
    - **Export:** the Admin API key with `-allowProvisioningUpdates` should create the distribution profile. This is unproven for a *new* App ID on this team.
    - The release tool needs no change, and must not be bypassed.
    - **Risk:** the first archive may require Xcode's Accounts session to be valid. If it prompts for Apple ID sign-in or 2FA, the implementing agent **must stop and notify the Founder**; do not log in to portals.
11. **TestFlight:**
    - The extension rides inside the app (one upload, same version and build).
    - No App Store Connect metadata change is needed for Live Activities.
    - The archive check already validates `PlugIns/*.appex` versions.

## 11. Deterministic test plan

**Unit tests (`PhysiqueOSTests`)**

Projection, `WorkoutLiveActivityProjectionTests`, all pure with a fixed `now`:
1. Empty planning draft gives `.planning` with "Workout".
2. Area labels give `sessionLabel`, truncated to 32.
3. `repsLoad` current set gives "185 lb × 8".
4. `bodyweightReps` gives "BW × 12".
5. `duration` gives "45 s".
6. Blank values fall back to `previousPerformance`, then nil.
7. Superset pair: current member by fewest completed, then the tie rule, and partner name.
8. Out-of-order completion follows the documented "current" rule.
9. All sets complete gives `current == nil` and "Finish when ready".
10. Variant appended only when it fits.
11. `finishedAt` gives `.finishing` with frozen elapsed.
12. A past-mode draft gives no subject.
13. `leftAt` gives no subject.
14. A draft older than 8 h gives no subject.
15. Privacy OFF omits all exercise strings.
16. The encoded attributes plus state stay ≤ 1 KB for a worst-case draft (40 exercises, 50-character names).
17. ContentState v1 JSON decodes with unknown extra fields, and an unknown `phase` falls back.

Subject selection:
18. Newest of several live drafts wins.
19. Durable-processing drafts stay subject while `finishedAt` is set.
20. The −5 min clock-skew bound.

Coordinator with the fake `LiveActivityClient`, `WorkoutLiveActivityCoordinatorTests`:
21. Start requests once.
22. Identical state sends no update.
23. A changed state sends one update with a monotonic timestamp.
24. Rapid edits coalesce to ≤ 1/s, while set completion bypasses coalescing.
25. Cancel ends `.immediate`.
26. Durable complete ends `.saved` `.after(+15 min)`.
27. Save & Leave ends; resume re-requests.
28. A discard with no hint ends `.immediate`.
29. A second live workout ends the old activity and requests a new one, keeping at most one.
30. Relaunch with an orphan (different `draftId`) ends it.
31. Relaunch with duplicates for the subject keeps exactly one.
32. Relaunch with a matching activity adopts it with no new request.
33. Relaunch with no activity requests (foreground).
34. User-dismissed and system-ended activities are suppressed and never resurrected; the suppression set is pruned when the draft is gone.
35. Authorization disabled does nothing, and re-enabling requests.
36. Each `ActivityAuthorizationError` is swallowed, the draft is untouched, and a diagnostic is recorded.
37. An authority switch ends the old activity.
38. A stale `schemaVersion` triggers end and re-request.
39. A Logger `persist()` failure path never causes an activity request.

Decorator and authority, `LiveActivityPublishingDraftStoreTests`:
40. Every write reaches the inner store before the coordinator is notified.
41. A failing coordinator can never block or alter a save.
42. The existing 78 `TrainingLoggerTests` pass unchanged with the decorator installed.

Routing, `AppTabTests`-style:
43. A `NSUserActivityTypeLiveActivity` continuation with an active session lands on Log → TrainingLogger with the resume id.
44. With no session, it lands on Log only.
45. The cold-launch path works.
46. The handler is never applied twice.

Rest (Phase 1B):
47. `restTimer` persistence round trip.
48. A projection with rest yields absolute `endsAt` and `staleDate == endsAt`.
49. An expired rest at relaunch is cleared or ignored.
50. Starting a new rest replaces the old one.
51. Rest never changes `startedAt`/`finishedAt`.

Rendering (`ImageRenderer`, no new dependency):
52. Lock Screen, expanded, compact leading/trailing and minimal for states planning, in-progress, superset, timed, bodyweight, all-done, finishing, saved, stale, privacy-OFF, and rest (1B). Assert non-empty render, no truncation overflow beyond the 160 pt height, and fixed-width timer frames.

**Previews**
- `#Preview(as: .content | .dynamicIsland(.compact | .expanded | .minimal), using:)` for every state above, for human review in Xcode.

**UI test (Simulator, sandbox authority)**
- Start a live workout, then assert `Activity.activities.count == 1` through a DEBUG-only diagnostics hook.
- Complete a set and assert content changed.
- Cancel and assert the count is 0.
- (Lock Screen pixels are not asserted in UI tests.)

**Physical-device acceptance (Founder, TestFlight build)**
1. Start a live workout; the Lock Screen and Dynamic Island appear within 1 s.
2. Lock the phone for 5 min; elapsed keeps ticking with no app wake.
3. Complete sets in the app; the activity updates on unlock.
4. Superset and timed exercises render correctly.
5. Force-quit mid-workout, then relaunch; still exactly one activity, correct content.
6. Reboot mid-workout, then relaunch; one activity or a fresh one, never two.
7. Save & Leave ends it; Resume brings it back.
8. Cancel ends it immediately.
9. Finish shows "Saving workout…" and then "Workout saved", which disappears after about 15 min.
10. Swipe-dismiss; it does not come back for that workout.
11. Disable Live Activities in Settings; there is no activity and the workout works normally.
12. Tapping from Lock Screen, compact, minimal and expanded each opens the active Logger.
13. StandBy, Always-On, and Watch Smart Stack (if a Watch is paired) look correct.
14. Landscape compact on iOS 27.
15. Privacy toggle OFF shows only the generic content.
16. Start a past workout; no activity.
17. Run an 8 h+ workout (or a simulated `startedAt`); after the system ends it, it is not resurrected.

## 12. Phased implementation

### Phase 0: prerequisites (small; can run before or with Phase 1)
- **Sleep-lane owner:** reconcile generator drift (§10.0).
- **Founder:** answer D1–D7 (D1 is blocking).
- **Acceptance:** the generator reproduces the committed pbxproj exactly.

### Phase 1: minimal local Live Activity (no rest, no buttons)
- **Scope:** §10 items 1–11 (except the D5 toggle if declined), with deep links by `NSUserActivityTypeLiveActivity` (§8).
- **Acceptance criteria:**
  - All unit, routing and rendering tests 1–46 and 52 (non-rest states) pass.
  - The full existing suite stays green apart from known pre-existing failures.
  - `verify_release_configuration.py` passes in target-aware form.
  - The archive passes `physiqueos-asc-upload` guards, including the appex version match and deep codesign.
  - Founder device checklist items 1–13, 15–17 pass.
  - Zero Server, HealthKit, or Sleep diffs.
  - No new entitlements.
- **Likely files:**
  - Generator, pbxproj, scheme
  - App `Info.plist`
  - New `PhysiqueOSShared/*`, `PhysiqueOSLiveActivity/*`
  - New app files from §10.7
  - `TrainingLoggerViewModel.swift` (three lines), `RootTabView.swift`/`PhysiqueOSApp.swift`, `AppEnvironment.swift`
  - Tests
  - `verify_release_configuration.py`
- **Size estimate:** a moderate Native change of roughly 1–1.5k lines including tests. One Build.

### Phase 1B: Logger rest timer and Live Activity rest presentation
- **Prerequisite:** D2 answered.
- **Scope:** draft `restTimer` authority, in-app rest UI, optional local notification, projection `rest`, rest regions (§4), tests 47–51 and rest renders.
- **Acceptance:** rest countdown renders on Lock Screen and Dynamic Island without app wake; "Rest complete" at `endsAt` (device proof of the stale flip); no per-second updates (verified by the coordinator update count in tests).

### Phase 2: safe interactive controls (only if the Founder wants them)
- **Prerequisite:** the app-scoped `TrainingSessionAuthority` refactor (§7), with concurrency tests proving no lost updates between the view model and intents.
- **Scope:** `SkipRestIntent` and `ExtendRestIntent` (+30 s) as `LiveActivityIntent`s in the app target. `authenticationPolicy .alwaysAllowed` (rest only). Buttons in expanded and Lock Screen only.
- **Acceptance:**
  - On-device locked behavior documented for each policy.
  - Accidental-tap test: no set, load, finish or cancel mutation is possible from the activity.
  - Intents are idempotent per rest `id`.
- **Explicitly excluded:** mark set complete, next exercise, finish and cancel.

### Phase 3: remote push / richer integration (not recommended now)
- **Possible future triggers:**
  - (a) a non-phone logger, such as a Watch app or web, driving the same session
  - (b) Server-originated updates while the app is suspended, for example a reconciliation result for the active session
  - (c) push-to-start from the Server for scheduled sessions
- **None exists today**, because the workout is phone-driven and every state change happens in the foreground app.
- **Cost:**
  - Push capability on the App ID and `aps-environment` (an entitlement and signing change)
  - Server APNs token-auth key and sender
  - A per-activity token registry with rotation
  - Budget handling (priority 5/10)
  - Privacy review of Server-held tokens
- **Revisit only with a concrete use case.**
- **Optional nicety unrelated to push:** an App Shortcut "Start Workout" (HIG suggests the Action button) is an `OpenIntent`-style shortcut that opens the Logger. It could ride in Phase 2.

## 13. Blockers and open Founder decisions

**Blockers (technical)**
- **B1.** The generator is missing three Sleep files. A Live Activities regeneration would drop them. The Sleep-lane owner must fix this first; this task did not touch Sleep.
- **B2.** The release verifier's exact-count rule breaks with any extension. Phase 1 must update it.
- **B3.** First provisioning of the new extension App ID is unproven with the Admin key. It may need an interactive Xcode session; if Apple ID re-auth is needed, the Founder must do it.
- **B4.** The `physiqueos-audit` doctl context returns 401 (ops note; not blocking this plan).

**Founder decisions**
- **D1 (blocking): which iPhone model and iOS version will do acceptance?** This decides whether the Dynamic Island can be device-tested. If the device lacks one, the Island is verified in the Simulator only.
- **D2: rest timer.** Build Phase 1B at all? If so:
  - auto-start on set completion, or manual?
  - default duration (global, per exercise, or per measurement)?
  - local notification with sound or haptic at rest end?
- **D3: per-set `completedAt`.** Add optional `completedAt` to draft sets? It makes "last set" exact and enables auto-rest. Recommended yes; additive.
- **D4: stale timeout.** "Stale after 3 h without updates", or another value.
- **D5: Lock Screen privacy toggle.** Add it in Phase 1 (default ON), or always show details?
- **D6: Apple Watch Smart Stack.** System default (recommended), or a custom `.small` layout?
- **D7: font.** System SF in the Live Activity (recommended; small extension), or bundle PlusJakartaSans into the extension?
- **D8: interactions.** Do you want Phase 2 rest controls at all? Mark-set-complete from the Lock Screen is recommended against.
- **D9: completion dismissal.** "Workout saved" for 15 min (HIG range 15–30), or immediate removal?

## 14. Recommended implementation execution
- **Coder:** Claude (Opus, high reasoning) in a **new** Remote Control chat on a fresh Native worktree from the current Native tip (after Build 74 and Sleep merges). Phase 1 only per chat.
- **Phase 2 refactor:** use max reasoning, because it touches workout authority.
- **Review:** Codex adversarial review of the coordinator, subject selection, decorator ordering and the verifier change before any archive.
- **Sequencing:**
  1. Phase 0 generator reconciliation by the Sleep lane.
  2. Founder answers D1–D9.
  3. Phase 1 implementation, all tests, local archive dry-run.
  4. Founder-authorized TestFlight build.
  5. Physical-device acceptance.
  6. Phase 1B, then optionally Phase 2.
- **Gates that remain closed:** no production or Server change is needed at any phase before Phase 3. No signing change beyond the new extension App ID and profiles via automatic signing. No HealthKit or Sleep involvement.

## 15. What this task did and did not do
- **Did:** read-only audits of the Native Workout Logger, navigation, lifecycle, notifications, project generator, verifier and release tool. Verified ActivityKit, WidgetKit and AppIntents APIs against the local iOS 27 SDK. Gathered Apple documentation, HIG and WWDC sources. Read-only production authority check.
- **Did not:** write application code, commit to product branches, regenerate the project, modify signing or entitlements, log into Apple portals, upload to TestFlight, mutate production, or touch HealthKit Sleep.
- **Independent of the Sleep lane.** The latest Sleep status (Founder Build 74 historical import gate) remains in report `20261001T053235Z-healthkit-sleep-v2-server-deployed-founder-import-gate.md`.
