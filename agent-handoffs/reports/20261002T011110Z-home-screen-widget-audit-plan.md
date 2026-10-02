# PhysiqueOS Home Screen widget — audit, architecture, mockups, and implementation plan

- Generated (UTC): 2026-10-02T01:11:10Z
- Task type: research / audit / design plan only
- Status: **complete; no shipping implementation performed**
- Repository: `dustinginn/physiqueos`
- Prompt authority: `agent-handoffs/inbox/prompts/20261002T001500Z-home-screen-widget-audit-plan.md`

## Outcome

Build a **single medium Home Screen widget first**. Its content should be:

1. **Calories eaten** for the Founder's current local day;
2. **Protein** for that day;
3. **Active calories** for that day, explicitly treated as accumulating / "so far" when the Server marks the Activity day partial;
4. a full-width **Start Workout Logger** link that changes to **Resume Workout** when `TrainingSessionAuthority` has an active live session.

The widget should read a small, versioned **App Group snapshot written by the app**. It should not authenticate to the Server, query HealthKit, or own workout state. The action should be a navigation `Link`/deep link, not a mutating widget `AppIntent`: no session is created until the Founder is inside the existing Workout Logger UI and confirms the start. If a live session exists, the app validates and resumes that exact session through `TrainingSessionAuthority`.

This is deliberately not a miniature Home tab. The current Home read does not contain daily nutrition/activity totals, and the reliable daily-total authorities already exist in the canonical `nutrition` and `activity` resources. Carbs, fat, weight, priorities, Goal Confidence, Sleep, and Recovery are not in the recommended first layout.

## Authority and safety boundary

| Item | Audited authority |
|---|---|
| `origin/main` at audit start | `78010f402e5a3ddf2d4d3d44b9b73fce175163a5` |
| Shipped Build 77 Native source | `c299fa29a14e04a4a22ac782d4610a4562e4f6e0` |
| Intermediate Build 78 source inspected during audit | `b09e6819c6bc7f43b2c8f13b98eaa23c12fb5623` |
| Final Build 78 Native source reconciled before publication | `5911dd2a6f968c5a355ec68d3313f0e5e644d529` |
| Build 78 delivery / status | `32447de5-04be-459b-a795-2b8469cbeffd` / **VALID**, pending Founder physical-device acceptance |
| `origin/main` Build 78 handoff reconciled before publication | `8b31fe2cf8ee0317d6be68665a1ac397a149b440` |
| Production Server | not queried, written, deployed, or changed |
| Native shipping code | not changed |
| Signing / profiles | not changed |
| Xcode / Simulator / DerivedData | not run or touched |
| TestFlight | not touched |

The audit used an isolated clone and detached read worktree. Claude's Build 78 worktree, processes, Simulator, DerivedData, archive/upload paths, and local state were not touched. Build 78 completed while this audit was in progress; its final pushed source and main handoff were fetched read-only and reconciled before this report was published.

## Apple platform facts for the actual target

The generator sets `IPHONEOS_DEPLOYMENT_TARGET = 18.0` and targets iPhone and iPad (`TARGETED_DEVICE_FAMILY = "1,2"`). The V1 can therefore use the interactive-widget platform introduced before the minimum target without compatibility branches.

| Topic | Platform fact | PhysiqueOS consequence |
|---|---|---|
| Home Screen families | iPhone supports `.systemSmall`, `.systemMedium`, and `.systemLarge`; iPad additionally supports `.systemExtraLarge`. Accessory circular/rectangular/inline families are Lock Screen contexts. [Apple: WidgetKit strategy](https://developer.apple.com/documentation/widgetkit/developing-a-widgetkit-strategy/) | Support `.systemMedium` in Phase 1. Add `.systemSmall` in 1B. Defer large, extra-large, and accessory families. |
| Multiple sizes | A widget declares supported families and must render each family deliberately. Sizes vary by device; fixed assumptions are unsafe. [Apple: supporting additional widget sizes](https://developer.apple.com/documentation/widgetkit/supporting-additional-widget-sizes) | Use family-specific layouts and system margins; do not scale one large composition down. |
| Interactive widgets | On iOS 17+, `Button(intent:)` and `Toggle(intent:)` run App Intents. Locked-device controls are inactive unless the person authenticates. [Apple: adding interactivity](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities) | Available on the deployment target, but unnecessary for V1's launcher because launch is navigation, not an in-place mutation. |
| Opening the app | Apple says an interactive button should do more than open the app. Use `Link` or `widgetURL(_:)` when the purpose is to open a scene. Medium and large widgets can contain multiple `Link` controls; a small widget uses its one widget URL. [Apple: linking scenes](https://developer.apple.com/documentation/widgetkit/linking-to-specific-app-scenes-from-your-widget-or-live-activity) | Implement Start/Resume and metric taps as deep links. Do not wrap a deep link in a no-op AppIntent. |
| AppIntent authentication | `IntentAuthenticationPolicy` can allow locked execution or require authentication. [Apple: authentication policy](https://developer.apple.com/documentation/appintents/intentauthenticationpolicy) | If a future widget mutates a workout, authentication and replay semantics must be explicit. V1 avoids that mutation. |
| Timeline timing | WidgetKit timelines specify earliest desired updates, not exact execution. The system may update later. Apple describes a dynamic budget; frequently viewed widgets commonly receive roughly 40–70 reloads per day, often 15–60 minutes apart, and future entries should generally be at least about five minutes apart. [Apple: keeping widgets up to date](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date) | Never claim real-time totals. Use app-triggered reloads plus a conservative timeline and explicit age/stale UI. |
| App-triggered reload | The containing app can call `WidgetCenter.reloadTimelines(ofKind:)` when shared data changes. Foreground-app and AppIntent reload circumstances receive special budget treatment, but WidgetKit still owns rendering time. [Apple: keeping widgets up to date](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date) | Reload after an atomic snapshot write; do not promise instant repaint. |
| Network access | A widget extension may use `URLSession`, including background sessions, but it has limited resources and may be halted before a request finishes. [Apple: network requests in widgets](https://developer.apple.com/documentation/widgetkit/making-network-requests-in-a-widget-extension) | Direct Server reads are technically possible but are a poor fit for current rotating auth and current-day reliability. |
| App/extension sharing | App Groups provide a shared container between an app and its extension. [Apple: configuring App Groups](https://developer.apple.com/documentation/xcode/configuring-app-groups) | An App Group is required for the recommended snapshot architecture. Ordinary app `UserDefaults` and files are not shared automatically. |
| Privacy/redaction | `privacySensitive(_:)` lets WidgetKit redact sensitive content; custom privacy placeholders are supported. Data Protection can hide an entire widget while locked. [Apple: creating a widget extension](https://developer.apple.com/documentation/widgetkit/creating-a-widget-extension) | Mark health totals privacy-sensitive and provide a deliberate redacted view. Keep the navigation action usable where the system allows it. |
| Smart Stacks | Timeline entries can supply a score and duration; relevance is one signal and does not guarantee rotation. [Apple: Smart Stack visibility](https://developer.apple.com/documentation/widgetkit/widget-suggestions-in-smart-stacks) | Optional after V1. A modest active-workout relevance window is defensible; do not tune speculative daily-total scores now. |
| StandBy | On iPhone, StandBy can reuse the small system widget and apply different rendering treatment. [Apple: WidgetKit strategy](https://developer.apple.com/documentation/widgetkit/developing-a-widgetkit-strategy/) | Phase 1B small acceptance must include StandBy, contrast, and redaction even though the Founder asked for Home Screen first. |

## Current extension and project audit

### Existing target

- One WidgetKit extension target: `PhysiqueOSLiveActivity`.
- Product: `PhysiqueOSLiveActivity.appex`.
- Bundle id: `com.physiqueos.native.dev.WorkoutActivity`.
- Extension point: `com.apple.widgetkit-extension`.
- Minimum iOS: 18.0, devices 1 and 2, `APPLICATION_EXTENSION_API_ONLY = YES`, `SKIP_INSTALL = YES`.
- The app embeds this one extension through `Embed Foundation Extensions`.
- The extension currently has **no entitlements file**.
- The app entitlements currently contain HealthKit and HealthKit background delivery only.
- `PhysiqueOSLiveActivityBundle` currently returns only `WorkoutLiveActivityWidget()` and explicitly says there is no Home Screen widget.

### Same extension versus a new target

Use the **same extension target** and add a second `Widget` configuration to the existing `WidgetBundle`.

Reasons:

- A `WidgetBundle` is the intended container for multiple WidgetKit configurations.
- The Home Screen widget and Live Activity already share the same deployment target, team, embedded extension, version/build parity, and extension-safe SwiftUI/AppIntents surface.
- A second target would create a second App ID, product, provisioning profile, embed record, release-verifier branch, and version/build parity surface without providing isolation that V1 needs.
- The existing bundle id can remain unchanged. The user-visible Home widget gets its own configuration `kind`, gallery name, and description; it does not need another `.appex`.

The target's current display name is `Workout`. During implementation, verify how the extension/product and per-widget gallery names appear. Prefer a per-widget `configurationDisplayName("PhysiqueOS Today")`; change the extension display name only if device acceptance shows confusing gallery presentation.

### Generator and release verification

`ios/Scripts/generate_project.py` is authoritative. Live Activity IDs are pinned in the 0x1600+ block, shared sources compile into both app and extension, and extension-only sources compile only into `PhysiqueOSLiveActivity`. Add the widget files through this generator; do not hand-edit the generated project.

`ios/Scripts/verify_release_configuration.py` currently checks:

- four matching build-number entries (app + one extension, Debug + Release);
- the existing app and extension bundle ids;
- one embedded `PhysiqueOSLiveActivity.appex`;
- extension-only API mode and `SKIP_INSTALL`;
- Live Activity plist declaration and custom URL scheme;
- app HealthKit entitlements.

The guarded release tool additionally verifies that embedded extensions share the app's version/build. A Home widget in the same extension does not change the extension count, but the source verifier should be extended to require the new WidgetBundle entry and matching App Group entitlement in both app and extension.

### Existing AppIntent and deep-link infrastructure

- `CompleteWorkoutSetIntent` is a `LiveActivityIntent`, compiled into app and extension. Its `perform()` resolves through a process hook installed by `WorkoutLiveActivityBridge`, then calls `TrainingSessionAuthority.completeSet` with session/exercise/set identity, expected revision, and a fresh mutation id.
- The existing Live Activity deep link is navigation-only: `physiqueos-workout://open?session=…`.
- `RootTabView.onOpenURL` parses it, verifies the named draft exists in the **currently selected** authority, switches to Log, and pushes the Logger. Invalid/external URLs mutate nothing.
- `TrainingSessionAuthority` is app-scoped per `NativeAPIEnvironment`, and is the only writer of its authority's draft store.
- `activeLiveSession()` selects the newest eligible live session started within 12 hours, excluding completed/submitted/left sessions.
- Multiple saved drafts are explicitly allowed. `Save & Leave` sets `leftAt`, so a saved/left draft is not an active live session.

This is a strong foundation. The Home widget needs a new navigation route, not a second runtime authority.

## Actual current Home and Server contracts

### Home

The production `home` resource is built from `coreNavigation.getHome` and maps in Native to:

- header;
- hero / Goal Confidence presentation;
- next best action;
- briefing cards;
- goals;
- today's focus occurrences and the notification horizon/time zone.

It does **not** contain calories, macros, Activity totals, weight, Sleep totals, or a workout-draft state. Therefore, copying `HomeReadModel` into a widget would not fulfill the requested totals and would couple the widget to high-density coaching presentation.

### Canonical daily reads

- `nutrition` is a declared production resource backed by `progressEvidence.getNutrition`. Native's `NutritionDayRecord` carries an exact `yyyy-MM-dd` day, `NutritionMacroTotals` (`calories`, `proteinG`, `carbsG`, `fatG`, `fiberG`), meals, and sources.
- `activity` is a declared production resource backed by `progressEvidence.getActivity`. Native's `ActivityDayRecord` carries exact date, `activeCalories`, `totalCalories`, exercise minutes, stand hours, goals, workout/non-workout attribution, and partial-day coverage.
- `evidence-review-queue` is the Log resource. It gives the Server-resolved local day plus compact Training/Nutrition/Activity summaries. It is excellent for choosing `today`, but its Nutrition row is formatted text and does not preserve the full numeric macro set.
- `weight` exists separately. Native already synthesizes a fourth Logged Today row from the exact-date current weight because the Log resource sends only Training/Nutrition/Activity.
- Recovery Sleep resources exist, but prospective Sleep acceptance and Recovery shadow calibration remain active backlog work. No published Recovery status belongs in this widget yet.

For the snapshot writer, use the Server-returned `evidence-review-queue.localDate` for the current device zone, then select `nutritionHistory.first(where: date == localDate)` and `activityHistory.first(where: date == localDate)`. Never substitute each resource's latest historical record when today's record is absent.

## Daily-total candidate matrix

| Candidate | Exact current source | Freshness / HealthKit behavior | Widget delivery | Missing/stale behavior | V1 decision |
|---|---|---|---|---|---|
| Calories eaten | `NutritionDayRecord.totals.calories` from production `nutrition` | Canonical Server NutritionDay; automatic HealthKit Nutrition daily-total ingestion can update it; screenshot/manual days also remain canonical | App Group snapshot after exact-day read | Missing is `—`, never zero; freeze with age when stale | **Include** |
| Protein | `NutritionDayRecord.totals.proteinG` | Same canonical day and HealthKit Nutrition path as calories; optional if source did not supply protein | Same snapshot | `—` when absent; do not infer from meals | **Include** |
| Carbs | `NutritionDayRecord.totals.carbsG` | Same reliability as protein when supplied | Same snapshot | `—` when absent | Defer for density |
| Fat | `NutritionDayRecord.totals.fatG` | Same reliability as protein when supplied | Same snapshot | `—` when absent | Defer for density |
| Active calories | `ActivityDayRecord.activeCalories` from production `activity` | Canonical Server ActivityDay; automatic HealthKit current-day Activity Summary updates it; Server marks current day partial / in progress | Same snapshot | Keep last value with age; label "so far" when partial; `—` if absent | **Include** |
| Total calories burned | `ActivityDayRecord.totalCalories` | Available on ActivityDay, but easier to confuse with calories eaten and less directly actionable | Same snapshot | Same as Activity | Defer |
| Exercise minutes / stand hours | `ActivityDayRecord.exerciseMinutes` / `standHours` | HealthKit-fed and reliable when available | Same snapshot | `—` if absent | Defer; secondary Activity detail |
| Today's weight | exact-date production `weight.current`; Native already guards against latest-weight substitution | Usually morning/manual workflow; not a daily total and highly sensitive | Snapshot possible | Never carry yesterday into today | Defer |
| Priorities completed / remaining | `HomeReadModel.todaysFocus` server occurrence state | Fresh after Home read or canonical completion/skip; not HealthKit-fed | Snapshot possible but adds Home join | Age and authority-sensitive; completion needs canonical capabilities | Defer to personalization |
| Training logged | Log `loggedToday.training` and Training reads | Canonical only after durable workout commit; live draft is local authority state | Snapshot possible | Distinguish active local session from durable logged workout | Do not show as a metric; use action state |
| Active workout | `TrainingSessionAuthority.activeLiveSession()` | Immediate local authority state; not a Server total | Snapshot on authority change | App revalidates on tap | **Use to change Start → Resume** |
| Sleep | production recovery-sleep resources | HealthKit Sleep canary / prospective acceptance still in progress | Snapshot possible later | Needs night/day semantics, not "today" shorthand | Defer |
| Recovery | no shipped published Recovery assessment; shadow candidate intentionally unwired | Not a current canonical Home metric | None for V1 | Must not invent a score/status | Defer |
| Goal Confidence / briefing | current Home hero/cards | Canonical but qualitative, dense, and privacy-sensitive; not a daily total | Snapshot possible | Last-known Home has same-day rules | Defer |

### Recommended metric semantics

- Use the labels **Eaten**, **Protein**, and **Active**. Two unlabeled calorie numbers would be ambiguous.
- Display whole calories and whole grams using bounded locale formatting.
- Do not show percent-to-goal or a calorie/protein target until one canonical daily target contract is selected and tested. The present daily records are totals, not an agreed widget target model.
- If the Activity record says partial/current day, expose "so far" in accessibility and stale/fresh context. Do not present an accumulating HealthKit value as a final day.
- Missing values remain absent (`—` / "Not synced"), not `0`.

## Start / Resume Workout behavior

### V1 interaction choice

Use a `Link` that opens the app. Do not create a workout entirely inside the widget.

| State in snapshot | Widget label | App behavior after tap |
|---|---|---|
| No active live session, no saved draft information needed | **Start Workout Logger** | Open the Workout Logger entry state. Creating a live session still happens only when the Founder chooses Start in the app. |
| Active live session | **Resume Workout** plus a short session label/progress | Open the exact session id. `RootTabView` verifies the id exists in the selected authority, then routes to the Logger. |
| Saved/left draft, no active live session | **Start Workout Logger** | Open the Logger entry state, which can show its existing saved-workout choice. Do not auto-resume: `leftAt` is an intentional leave boundary and multiple saved drafts are allowed. |
| Snapshot says active, but app says ended/missing/stale | **Resume Workout** in the stale widget; app fails soft | Open the Logger entry/root without creating or mutating a session. A subsequent snapshot removes the stale Resume state. |
| Authority in snapshot differs from selected authority | No authority switch | Open current-authority Log/Logger entry, clear/rewrite snapshot, and never resume a foreign-authority draft. |
| Reconnect required / no authenticated future user | **Open PhysiqueOS** | Open the connection/login surface; hide health totals and do not advertise Start as usable. |

### Proposed route shape

Keep `physiqueos-workout` and extend the navigation contract, for example:

- `physiqueos-workout://logger?action=start&authority=founderProduction`
- `physiqueos-workout://open?session=<validated-id>&authority=founderProduction`

The exact URL spelling is implementation detail, but the parser must be typed, length-bounded, authority-aware, navigation-only, and covered by tests. Any app can invoke a custom scheme, so a URL must never call `startSession`, `resume`, or another mutation by itself.

### Why not a direct Start AppIntent

- Apple recommends `Link` for an interaction whose job is to open the app.
- Starting without exercises still needs planning UI; choosing exercises/load/reps remains an app task.
- `TrainingSessionAuthority.startSession` intentionally allows multiple drafts. A widget mutation would require additional policy to prevent accidental double taps or conflict with an on-screen start.
- The current safe intent path is specialized for completing an exact rendered set with revision/mutation-id protection. Reusing its process hook to invent a blank session would broaden it into a second entry workflow for no V1 benefit.

A future direct-start intent is possible only if product direction defines a default plan/template and the intent calls the same app-scoped authority with idempotency. It is not part of this plan.

## Data delivery options

| Pattern | Freshness | Reliability / offline | Auth and authority safety | Cost / complexity | Decision |
|---|---|---|---|---|---|
| 1. App Group snapshot written by app | Event-driven after app/HealthKit/server work; timeline may still repaint later | Excellent: one atomic local read, last trusted values survive network loss | Credentials remain app-only; snapshot is tagged with authority/account/day | Medium: App Group, schema, writer, reload coordinator | **V1** |
| 2. Direct read-only Server fetch in widget | Potentially fresher when WidgetKit launches extension | Extension can be killed mid-request; poor locked/offline behavior | Current rotating refresh credential is app Keychain-only and `WhenUnlockedThisDeviceOnly`; sharing it would need a Keychain group and cross-process rotation serialization | High risk for modest gain | Reject for V1 |
| 3. Hybrid snapshot + bounded Server fetch | Best theoretical freshness | Good fallback, but two independently timed truth paths can race | Still requires extension auth and account/authority reconciliation | Highest complexity | Revisit only after measured snapshot gaps |
| 4. AppIntent refreshes snapshot on tap | Useful only on explicit interaction | Does not improve passive freshness; consumes UI space | Would need to run app-side canonical reads and report delayed results | Medium | Not needed; opening app already refreshes |

### Direct Server fetch-specific finding

WidgetKit permits networking, but PhysiqueOS's present authentication design makes it the wrong V1:

- `ProductionNativeAPI` serializes refresh-token use inside one app-process actor.
- The long-lived credential is stored in the app's Keychain service, has no shared access-group entitlement, and uses `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`.
- The extension is not currently provisioned for Keychain sharing.
- Giving the extension independent refresh logic creates concurrent rotating-credential failure modes across app and extension, especially during background/locked execution.
- Shipping the credential or an access token in an App Group snapshot would be unacceptable.

No Server change is required for the snapshot V1.

## Recommended snapshot contract

Use one atomically replaced JSON file in an App Group container, not a collection of shared defaults. Illustrative shape:

```json
{
  "schemaVersion": 1,
  "authority": "founderProduction",
  "accountScope": "opaque-local-account-key",
  "localDate": "2026-10-01",
  "timeZoneIdentifier": "America/Los_Angeles",
  "writtenAt": "2026-10-02T00:58:00Z",
  "lastSuccessfulServerReadAt": "2026-10-02T00:57:58Z",
  "refreshState": "success",
  "nutrition": { "calories": 2140, "proteinG": 176 },
  "activity": { "activeCalories": 648, "coverage": "partial_day" },
  "workout": {
    "state": "active",
    "sessionId": "synthetic-session-id",
    "label": "Push · Chest & Shoulders",
    "completedSets": 6,
    "totalSets": 18
  }
}
```

Rules:

- Include only widget display/navigation fields. No credential, token, raw HealthKit sample, meal list, exercise set values, or private evidence bytes.
- `accountScope` is a local opaque discriminator, not a display name or credential. It prevents a future login from seeing a prior user's snapshot.
- Tag every snapshot with `authority`; Sandbox and Founder Production never share a record.
- Future schema versions must be fail-soft. Unknown/newer schema → placeholder + Open PhysiqueOS, not a decode crash.
- Write a temporary file, apply appropriate file protection, then atomically replace. The widget must never observe half-written JSON.
- Clear/replace the snapshot on logout/reconnect, authority switch, owner/account change, and local-day/time-zone change.
- Use `NSFileProtectionCompleteUntilFirstUserAuthentication` or a stricter verified setting for the shared file. Numeric views still use WidgetKit privacy redaction.

## Refresh, day rollover, and staleness

### Write triggers

The app should attempt a fresh snapshot after:

1. successful foreground bootstrap / canonical daily reads;
2. Home or Log pull-to-refresh after HealthKit catch-up;
3. a successful HealthKit Activity/Nutrition upload followed by a bounded exact-day Server read;
4. Nutrition or Activity canonical writes/reviews that successfully reconcile;
5. each accepted `TrainingSessionAuthority` lifecycle change (start, resume, save/leave, commit, cancel/end);
6. authority selection, reconnect/logout, and local day/time-zone transition.

Only a successful canonical daily read advances `lastSuccessfulServerReadAt`. A failed background read leaves the last trusted values and records a failure state; it never overwrites values with zero/empty data. Workout state can update independently because its authority is local and exact.

After atomic write, call `WidgetCenter.reloadTimelines(ofKind:)`. This is a request, not a guarantee of immediate rendering.

### Timeline policy

- Provider reads the snapshot locally; no network and no HealthKit.
- Supply a current entry and a precomputed next-local-midnight entry that transitions to "Waiting for today's totals" if no new snapshot exists.
- Ask for another timeline roughly every 30–60 minutes while current-day data exists so age/stale presentation can advance. WidgetKit may delay or coalesce it.
- Keep entries at least five minutes apart and do not poll aggressively.
- Use named time-zone calendar math. On a zone change, the app invalidates old day-scoped reads before writing the new snapshot, mirroring `DailyDriverLocalDay`.
- `today` for these metrics is the exact Server `evidence-review-queue.localDate` projected for the device zone, not the Home notification schedule zone and not an ISO timestamp truncated by the widget.

### UI freshness states

Recommended initial thresholds, subject to device acceptance:

| Condition | Display |
|---|---|
| Current day, successful age ≤ 90 minutes | Values + subtle "Updated n min ago" |
| Current day, age 90 minutes–4 hours | Values + visible age; no alarming state |
| Current day, age > 4 hours or last refresh failed | Freeze values + `May be outdated` or `Offline · updated …` |
| Snapshot day is before current local day | Hide prior-day values; `Waiting for today's totals`; keep valid navigation action |
| No snapshot / malformed / future schema | Placeholder + `Open PhysiqueOS to refresh` |
| Reconnect/account mismatch | Redacted/empty metrics + `Open PhysiqueOS` |

The thresholds are presentation policy, not a claim about HealthKit arrival. HealthKit current-day totals are naturally partial and can lag because the app wake, upload, Server projection, snapshot write, and WidgetKit repaint are all separately scheduled.

## Widget family recommendation

### Phase 1: medium only

The medium family is the useful minimum because it can show three unambiguous totals and a separate Start/Resume `Link` without cramming. Metric cells can independently link to Nutrition or Activity while the launcher links to Logger.

### Phase 1B: small variants

Two distinct small studies are viable, but a small widget has one widget URL, so its interaction semantics are coarser:

- totals emphasis: Calories eaten headline + Protein + Active;
- launcher emphasis: Start/Resume only, with minimal workout context.

Decide whether to ship one or both only after medium device acceptance and widget-gallery discoverability review.

### Large and extra-large

Do not implement now. The reliable V1 contract does not justify the extra area. Filling it would pressure the team to add weight, priorities, targets, Goals, or Briefings and recreate Home without a locked product hierarchy.

### Lock Screen / accessory

Defer. Accessory families materially reduce space, use vibrant/accented rendering, and do not improve the Founder's requested daily-totals + logger workflow enough to justify a second acceptance surface. The Live Activity already owns the active-workout Lock Screen experience.

## Non-shipping visual prototypes

- Source: `docs/home-screen-widget-audit/home-screen-widget-v1-board.svg`
- Render: `docs/home-screen-widget-audit/home-screen-widget-v1-board.svg.png`
- Notes: `docs/home-screen-widget-audit/README.md`

The board uses synthetic values and covers:

1. small totals emphasis;
2. small launcher emphasis;
3. recommended medium V1;
4. active workout / Resume;
5. stale/offline;
6. privacy-redacted.

The palette mirrors current Native tokens (`#080D18`, `#141F31`, `#172235`, `#8B8CFF`, green nutrition, rose protein, blue Activity) while respecting system widget corner/margin constraints. It is a design study only and is not in any target.

## Interaction-state contract

| Interaction/state | Exact plan |
|---|---|
| Tap Calories or Protein (medium) | `Link` to the current Nutrition day/history surface. App revalidates current day. |
| Tap Active (medium) | `Link` to current Activity day/history. App revalidates current day. |
| Tap non-control background | Open a sensible Today/Log landing; do not duplicate a metric link. |
| Tap Start | Open Logger entry; no session mutation from URL or widget. |
| Tap Resume | Open exact active id if it still exists in the selected authority; otherwise fall back to Logger entry. |
| Active workout begins/changes/ends | Authority observer updates only the snapshot workout projection and requests reload. Live Activity behavior remains unchanged. |
| Saved/left workout | Keep Start label; Logger entry presents saved/resume choice. Never silently resume an intentionally left draft. |
| Stale totals | Metric links still open app and trigger refresh. Values remain visibly aged. |
| Sandbox | Snapshot tagged Sandbox and built only from Sandbox fixtures/stores. Never display Production totals in Sandbox or vice versa. |
| Future multi-user login | Account discriminator mismatch invalidates snapshot before display. Logout removes prior user's health values. |
| Privacy redaction | Health totals redact; generic app/navigation action remains. Active workout label should also be privacy-sensitive if it contains the workout name. |

## Project and signing plan

### Likely files

Modify/add during implementation (names may be refined, responsibilities should not):

- `ios/PhysiqueOSLiveActivity/PhysiqueOSLiveActivityBundle.swift` — add the Home widget configuration.
- `ios/PhysiqueOSLiveActivity/HomeDailyWidget.swift` — `StaticConfiguration`, timeline provider, supported families.
- `ios/PhysiqueOSLiveActivity/HomeDailyWidgetViews.swift` — family/state views only.
- `ios/PhysiqueOSShared/HomeWidgetSnapshot.swift` — versioned extension-safe Codable contract and projection helpers.
- `ios/PhysiqueOSShared/HomeWidgetDeepLink.swift` — typed navigation URLs/parser shared with the app.
- `ios/PhysiqueOS/Networking/HomeWidgetSnapshotStore.swift` — App Group atomic writer/reader seam.
- `ios/PhysiqueOS/Networking/HomeWidgetSnapshotCoordinator.swift` — exact-day canonical reads, authority/account/day fences, WidgetCenter reload.
- `ios/PhysiqueOS/App/AppEnvironment.swift` — one app-scoped coordinator, injected dependencies.
- `ios/PhysiqueOS/App/PhysiqueOSApp.swift` and/or existing foreground/HealthKit orchestration — bounded refresh triggers.
- `ios/PhysiqueOS/Presentation/Root/RootTabView.swift` — typed Start/Resume/metric routing.
- `ios/Scripts/generate_project.py` — source membership, extension entitlements, App Group build settings.
- `ios/PhysiqueOS/Supporting/PhysiqueOS.entitlements` — add App Group while preserving HealthKit keys.
- `ios/PhysiqueOSLiveActivity/PhysiqueOSLiveActivity.entitlements` — App Group only.
- `ios/Scripts/verify_release_configuration.py` — verify both entitlements, WidgetBundle registration, unchanged one-extension embedding, build parity.
- focused unit/view tests under `ios/PhysiqueOSTests/`.

Do not make the extension depend on app-only `ProductionNativeAPI`, HealthKit, or `TrainingSessionAuthority`. The app coordinator projects those authorities into the shared contract.

### Entitlement/signing consequences

Recommended App Group identifier: `group.com.physiqueos.native.dev.shared` (confirm naming before registration).

Required signing work:

1. register/enable the App Group in the Apple Developer team;
2. attach it to both `com.physiqueos.native.dev` and `com.physiqueos.native.dev.WorkoutActivity` App IDs;
3. add matching application-groups entitlements to app and extension;
4. allow automatic/cloud signing to regenerate profiles;
5. archive and verify both signed entitlements and app/extension version parity.

No new bundle id or extension target is recommended. Build 77's extension App ID/profile was created through automatic/cloud signing without Founder intervention, so the App Group may also be handled automatically; do **not** promise that. Founder re-authentication/2FA is required only if the developer session/tooling cannot update the capability or profile. Stop and request it if encountered.

`Info.plist` needs no new extension point. The app already registers `physiqueos-workout`; add routes under that scheme unless product/security review chooses universal links. Keep `NSSupportsLiveActivities` unchanged.

## Deterministic test plan

### Snapshot and data selection

- current schema round trip;
- missing optional metric remains missing, never zero;
- old compatible schema decodes with defaults;
- future schema fails soft;
- malformed/truncated file fails soft;
- atomic replacement never exposes partial JSON;
- exact `localDate` selection does not fall back to latest prior Nutrition/Activity day;
- partial Activity day produces "so far" semantics;
- authority/account mismatch rejects values;
- Sandbox/Production files or namespaces cannot cross;
- logout/authority switch/day change clears or replaces snapshot;
- canonical read failure preserves last trusted values and only changes refresh state.

### Timeline and staleness

- fresh, delayed, stale, offline, missing, redacted, reconnect states;
- next-midnight entry hides old values;
- DST spring/fall midnight in named zones;
- travel/time-zone change;
- entries respect a ≥5-minute spacing;
- app reload request happens only after successful atomic write;
- old-day snapshot never renders as today's total even if WidgetKit delays a network/app refresh.

### Workout routing and duplicate prevention

- no active session → Start link opens Logger entry and does not call `startSession`;
- repeated/double Start link taps still create zero sessions until in-app Start;
- active session → exact Resume id;
- active session ended between render and tap → safe Logger fallback;
- authority mismatch → no switch and no foreign resume;
- invalid/oversize URL values rejected;
- saved/left draft → entry choice, no automatic resume;
- multiple saved drafts remain intact;
- authority observer updates snapshot on start/resume/save-and-leave/commit/cancel without altering Live Activity coordinator behavior.

### Families and accessibility

- systemMedium states at smallest/largest supported device sizes;
- Phase 1B systemSmall states;
- placeholder, privacy redaction, dark/full-color, accented/vibrant contexts;
- Dynamic Type, VoiceOver reading order/labels, button/link traits, contrast, differentiate-without-color;
- long workout names and large metric values;
- localization-safe units and number formatting;
- StandBy small rendering when Phase 1B ships.

### Project/release

- deterministic project regeneration diff;
- extension source membership (shared versus extension-only);
- app and extension contain identical App Group id;
- extension does not inherit HealthKit entitlement;
- one embedded `.appex`, unchanged bundle id, matching marketing/build versions;
- source release verifier passes;
- archive codesign entitlements match generated settings;
- existing Live Activity contract/coordinator/intent/view suites pass unchanged.

### Simulator versus physical-device acceptance

Simulator/Xcode previews are sufficient for deterministic layout, timeline, decode, and routing tests. A physical device is mandatory before release for:

- widget gallery discovery and add/remove/upgrade behavior;
- real App Group signed-container access;
- cold-launch Start/Resume links;
- privacy redaction while locked and StandBy behavior;
- background HealthKit wake → Server read → snapshot → widget reload;
- real WidgetKit throttling/staleness over a day;
- offline/reconnect behavior;
- profile/capability correctness in an archive/TestFlight install.

## Phased implementation plan

### Phase 0 — contract lock and signing preflight

- Founder approves the three metrics and labels.
- Freeze snapshot schema v1, App Group id, route grammar, freshness copy, and account/authority fencing.
- Register the App Group/capabilities without changing a shipping build number yet.

Acceptance: both App IDs show the same App Group; no credential is shared; project-generation plan reviewed.

### Phase 1 — medium V1

- Add Home widget configuration to the existing extension.
- Implement snapshot contract/store/coordinator and exact-day Nutrition/Activity projection.
- Implement app-open and successful canonical-refresh writes.
- Observe existing `TrainingSessionAuthority` to project none/active state.
- Add navigation-only Start/Resume and metric deep links.
- Implement fresh/delayed/stale/offline/day-rollover/redacted/reconnect states.
- Add source verifier and focused tests; run existing Live Activity regressions.

Acceptance:

- medium widget shows only exact-current-day Calories eaten, Protein, Active calories;
- absent values are not zero and previous-day values never masquerade as today;
- Start creates no session until in-app confirmation;
- Resume opens the exact active authority session and stale links fail soft;
- Sandbox/Production and future account boundaries do not mix;
- app and extension share one signed App Group; no Server/HealthKit credential reaches extension;
- Live Activity behavior and Build 78 changes remain intact;
- physical device demonstrates gallery install, snapshot refresh, cold launch, stale state, and privacy redaction.

### Phase 1B — small families and richer tap-through

- Choose totals-focused small, launcher-focused small, or both after medium acceptance.
- Add family-specific layouts, StandBy/accented/vibrant checks, and a single small-widget URL policy.
- Add individual medium metric destinations if Phase 1 initially keeps a simpler whole-widget link.

Acceptance: no truncation at supported sizes; one clear action per small instance; StandBy/privacy verified.

### Phase 2 — only after usage evidence

Potential additions, none pre-authorized:

- user configuration for metric selection;
- carbs/fat or priorities if the Founder demonstrates a daily need;
- Smart Stack relevance while a workout is active;
- WidgetKit push updates or a bounded hybrid read if measured snapshot freshness is insufficient;
- Lock Screen accessory or large family if it has a distinct job.

Do not add direct workout creation, Recovery status, or a broad mini-Home without a separate product decision.

## Founder decisions still needed

1. Approve the recommended V1 trio: **Calories eaten / Protein / Active calories**.
2. Approve labels (`Eaten`, `Protein`, `Active`) and the use of `—` rather than zero for missing data.
3. Approve saved/left behavior: **open Logger entry and let the Founder choose Resume or Start New** rather than automatically resuming a left draft.
4. Approve the initial stale language/thresholds: subtle age after 90 minutes, explicit stale/offline after 4 hours, and hide prior-day totals after local midnight.
5. Confirm medium-only Phase 1, with small variants in 1B and large/Lock Screen deferred.
6. Confirm the App Group identifier before capability registration.

## Validation actually performed

- Read the prompt, durable backlog, Build 77 final report, Build 78 storage boundary/final report, and mandatory GH-main protocol from `origin/main`.
- Inspected shipped Build 77 and intermediate published Build 78 source read-only, then fetched and reconciled final Build 78 source `5911dd2a6f968c5a355ec68d3313f0e5e644d529` before publication.
- Verified the final Build 78 delta does not change the Live Activity widget, widget-extension entitlements, or App Group posture. It does refine `TrainingSessionAuthority`'s pending-completion lifecycle/routing; the V1 recommendation remains to derive only `activeLiveSession()` and never create a parallel session authority.
- Audited Native Home/Nutrition/Activity/Log contracts, Server production resource dispatch/manifest, HealthKit automatic synchronization comments/contracts, `TrainingSessionAuthority`, Live Activity intent/deep link, WidgetBundle, generator, entitlements, and release verifier.
- Verified Apple platform facts against current official Apple documentation linked above.
- Rendered and visually inspected the synthetic 1700×1700 mockup board.
- No unit/UI tests or Xcode build were run because no shipping code changed and the prompt explicitly required avoiding heavy Xcode work while Build 78 was active.

## What was not implemented

- no WidgetKit Home Screen configuration;
- no App Group/capability/profile;
- no deep-link change;
- no snapshot contract/writer;
- no Server, HealthKit, workout/session, Home, Live Activity, Build 78, signing, production, archive, or TestFlight change.

## Safe next step

After the Founder answers the six bounded decisions above, start Phase 0/1 from exact Build 78 Native authority `5911dd2a6f968c5a355ec68d3313f0e5e644d529`, use the existing extension, preserve Build 78's completion-presentation behavior, and run a physical-device acceptance pass before considering small variants.

The exact containing `origin/main` report commit is supplied after push and remote re-verification.
