# Live workout audit — HealthKit workout recording + Phone/Watch latency

- Generated (UTC): `2026-10-04T20:22:56Z`
- Agent: Claude (Remote Control lane, High reasoning)
- Status: **AUDIT COMPLETE / NO CODE CHANGED / AWAITING FOUNDER + CHATGPT DECISION**
- Governing prompt: `agent-handoffs/inbox/prompts/20261004T202000Z-live-workout-healthkit-watch-audit-claude.md` at `e887e0108d4444ec1d7b0ab6c2175f024dc1d85f`
- Work branch: `claude/live-workout-healthkit-watch-audit-20261004`

Nothing was implemented, deployed, built or uploaded. No workout command was sent. Production data and HealthKit were not touched. The live workout was not disturbed.

## 1. Authority inspected

| Surface | Exact authority | How reverified |
|---|---|---|
| Native (shipping) | `b8ee8690b194cb90086b62816b9a2c8c400dc026`, `com.physiqueos.native.dev 1.0 (85)`, delivery `a8c393e7…` VALID | Still the newest Native commit on any `origin` branch (`codex/build85-watch-native-20261003`). Newest local archive is `PhysiqueOS-Build85-b8ee8690` (`CFBundleVersion 85`). Last release receipt is `receipt-b85.json`. No Build 86 exists. |
| Server | `3c0f4aef…` (per Build 85 final report) | Not needed for this question. No production read was made. |
| Device | The installed build on the Founder's iPhone/Watch could **not** be read | `devicectl` lists the physical iPhone 17 Pro and Apple Watch Ultra 3 as `unavailable`. No tethered/network device access, so no device logs or app-container reads were possible. |

The source was read from a read-only detached checkout of `b8ee8690`.

## 2. Answer: should a HealthKit workout be active right now?

**Only if the workout was started from the Watch.** Build 85 has exactly one path that creates an `HKWorkoutSession`:

1. On iPhone, the Logger's **Ready for Watch** button. It only appears while `completedSetCount == 0`, and it clears `startedAt` (`TrainingSessionAuthority.swift:317-331`).
2. On Watch, **Start Workout** on the Prepared screen sends `startPreparedWorkout` (`WatchWorkoutStore.swift:350-353`).
3. The phone stamps `startedAt` and `watchStartedAt` (`TrainingSessionAuthority.swift:346-361`).
4. **Only** after that command's `.applied`/`.unchanged` acknowledgement does the Watch call `health.start(...)` (`WatchWorkoutStore.swift:706-718`).

The only other caller is `retryHealthStart()`. It is reachable only after a start already failed (`notice == .healthStartFailed`, `WatchWorkoutViews.swift:873-877`).

A live workout started on iPhone (`TrainingLoggerViewModel.start(mode: .live)` sets `startedAt` immediately, `TrainingLoggerViewModel.swift:208-215`) never passes through `.prepared`. The Watch receives it as `.active` and goes straight to the execution pager (`WatchWorkoutViews.swift:115-118`). `apply()` → `resolveHealthSession` only keeps, saves or discards a workout that **already exists**. It never starts one (`WatchWorkoutStore.swift:775-801`). Nothing on iPhone starts a workout either: the phone only installs a mirroring receiver (`WatchWorkoutConnectivityBridge.swift:35-40`), with no `startWatchApp(with:)` and no phone-side `HKWorkoutSession`.

This was the design intent: "Watch Start performs one phone-authoritative transaction … The Watch then starts the HealthKit workout" (`20261002T045500Z-apple-watch-workout-app-audit-plan.md:149`). The same plan also said "If an active session already exists, the Watch Start surface becomes Resume Workout" (`:151`). **That Resume path was never implemented.** A phone-started session shows the full Watch workout UI and accepts Complete Set, but has no HealthKit recording and no affordance to start one.

Once any set is completed on iPhone, Ready for Watch is hidden. **For this session there is now no in-app way in Build 85 to begin a PhysiqueOS HealthKit workout.**

### Does the code prove the start path was or was not invoked today?

- **The source proves conditionality:** HealthKit starts only through Watch Start Workout on a Ready-for-Watch plan.
- **Runtime proof for today is not available from here** (no device access). Two Founder answers settle it: (a) did you tap **Ready for Watch** on iPhone and then **Start Workout** on Watch? (b) the Watch header did **not** say `HEALTH START FAILED`.
  - If (a) is no, the path was not invoked. That is source-proven.
  - If (a) is yes, see H2 below.
- **The path works when used.** The 2026-10-03 production read-only audit (`20261003T201500Z-…`) proves one PhysiqueOS-created indoor Traditional Strength Training workout (`com.physiqueos.native.dev`) was saved for that day's Watch-started session.

### Gates

The Watch entitlement `com.apple.developer.healthkit`, `NSHealthShareUsageDescription`/`NSHealthUpdateUsageDescription`, `WKBackgroundModes = workout-processing` and `WKCompanionAppBundleIdentifier` are all present at `b8ee8690`. The phone reachability gate also applies: Watch Start is disabled unless `connectionState == .reachable` (`WatchWorkoutViews.swift:237`). Authorization covers share `workoutType` and read `heartRate`, `activeEnergyBurned` and `basalEnergyBurned` (`WatchWorkoutHealthController.swift:261-271`).

### iPhone vs Watch roles

The Watch owns the `HKWorkoutSession`/`HKLiveWorkoutBuilder` (indoor `.traditionalStrengthTraining`, External UUID = structured session id) and mirrors it to the phone. The phone owns structured state only.

### What ends/saves it

The workout is saved only through the finish saga: a confirmed finish carries `finish.operationId` → `WatchHealthSessionResolution.save` → `health.finish(...)` → `reportHealthSaved`/`reportHealthSaveFailed`. Cancel discards. For a phone-started session the phone stamps `watchHealthSaveState = nil` because `watchStartedAt == nil` (`TrainingSessionAuthority.swift:440`), so no Health leg is expected at all.

### Can a silent failure leave the Logger working with no HealthKit workout?

**Yes, and it is the normal phone-started case.** It is not an error path. The session is fully usable on Watch and nothing tells you HealthKit is absent. Worse, the authority warning text says `IPHONE UNAVAILABLE · HEALTH ON` unconditionally (`WatchWorkoutViews.swift:358`), and the idle text says "Health may continue." (`:163`) Neither consults `health.lifecycle`. An actual start failure *is* surfaced (`HEALTH START FAILED` plus Retry Health Start). `startMirroringToCompanionDevice` failures are silently ignored (`try?`), which is harmless to recording.

## 3. Watch Workout Metrics: why TIME works and the rest show "—"

`WatchWorkoutMetricsView` (`WatchWorkoutViews.swift:644-689`) uses these sources:

| Row | Source | Needs HealthKit? |
|---|---|---|
| TIME | `WatchWorkoutClock.sessionSeconds(projection, …)`: the **phone projection's** `startedAt`/pause anchors, ticked locally | **No** |
| ACTIVE CALORIES | `store.health.activeCalories` | Yes: set only in `refreshStatistics` from `HKLiveWorkoutBuilder` `didCollectDataOf` |
| TOTAL CALORIES | `health.totalCalories` = active + basal, nil unless **both** exist | Yes |
| HEART RATE | `health.currentHeartRateBPM` | Yes |

Every empty state for the three HealthKit rows (each falls back to `?? "—"`):

- the values are nil from init until the first builder callback;
- they are cleared by `cancel()`;
- they are cleared by `resetPresentationMetrics()` on terminal projections with no live session.

There is no other source. A running timer is **no evidence** that HealthKit is recording.

**Most likely explanation (H1, high confidence):** no PhysiqueOS `HKWorkoutSession` exists because the session was started or logged on iPhone (no Ready for Watch → Watch Start). With no builder there are no `didCollectDataOf` callbacks, so all three values stay nil while TIME advances from phone anchors. This exactly matches the observed screen, and matches the Founder's suspicion.

**Alternative (H2, low confidence, only if the Watch Start path *was* used):** a session is running but Watch Health **read** permission for Heart Rate / Active Energy / Resting Energy was denied. `requestAuthorization` does not throw on denial, so the builder statistics would stay nil. A Watch-started session would also show the workout indicator and keep the app frontmost.

H3 (basal-only gap) is ruled out: it would leave ACTIVE populated with only TOTAL blank.

### Read-only checks the Founder can do now without touching the workout

1. Watch face / status area: is the workout (running-figure) indicator present, and does a wrist raise return to PhysiqueOS? With no PhysiqueOS session: no indicator, and the app drops back to the clock after the Return-to-Clock timeout.
2. Recall whether Ready for Watch → Start Workout was used.
3. Look only, do not toggle: iPhone Settings → Health → Data Access & Devices → PhysiqueOS. Are Heart Rate / Active Energy / Resting Energy read allowed? This is relevant only to H2.
4. After the workout: Health → Workouts. A PhysiqueOS "Traditional Strength Training" will exist only if a session was started.

### What can be done during this workout (Founder decision; nothing here is required)

- **Do nothing (recommended default):** structured logging and the commit are unaffected. This session simply gets no PhysiqueOS HealthKit workout and no trusted correlation, and passive Apple Watch energy/HR still accrue to daily Activity.
- **Optional:** start Apple's Workout app (Traditional Strength Training) now to capture HR/energy for the remainder. It is independent of PhysiqueOS and creates a separate, late-starting non-PhysiqueOS workout that the Server matcher may later surface as an ordinary Pending Workout Match review. It does not alter the PhysiqueOS session. Do **not** use PhysiqueOS Cancel/Finish/Ready-for-Watch to "fix" this mid-workout: Ready for Watch is hidden after a completed set, and it would reset `startedAt` if it were shown.

## 4. Phone ↔ Watch latency path

### Transport inventory (Build 85)

| Direction | Mechanism | Code |
|---|---|---|
| Watch → phone commands (Complete Set, pause, finish, **refresh**) | `sendMessageData` + reply (interactive) | `WatchWorkoutStore.swift:519-552` |
| Phone → Watch reply | the projection inside the acknowledgement | `WatchWorkoutConnectivityBridge.swift:111-143` |
| Phone → Watch push of phone-originated changes | **`updateApplicationContext` only**: system-scheduled, coalesced, no delivery-time guarantee. No `sendMessage`/`transferUserInfo` push. | `WatchWorkoutConnectivityBridge.swift:58-109` |
| Server | **not** in the set-execution loop: `route` mutates the local `TrainingSessionAuthority` only | `WatchWorkoutCommandRouter.swift:75-…` |
| Polling | none. Refresh happens only on activation/reachability events | `WatchWorkoutStore.swift:245-250,1047-1066` |

### Complete Set enablement

The button is enabled only when `projection.canCompleteSet && !store.isMutationPending && store.connectionState == .reachable` (`WatchWorkoutViews.swift:463`). `canCompleteSet` is true only for phase `.active` with a current set (`WatchWorkoutProjectionMapper.swift:18`).

### Delay points proven by source

These are mechanisms. Durations are not measured; there is no runtime instrumentation.

1. **D1 — every wrist raise / scene activation disables Complete Set for one phone round trip.** `scenePhase → .active` → `setDisplayActive(true)` → `retryPending()` → with nothing pending → `refresh()` → `issue(.refreshProjection)` → `gate.begin` (`PhysiqueOSWatchApp.swift:13-15`, `WatchWorkoutStore.swift:245-250,458-478,485-517`). The gate is single-flight and does not distinguish a read-only refresh from a mutation, so `isMutationPending == true` and Complete Set renders disabled at 45% opacity until the phone (possibly woken in the background) answers. The same refresh fires on `sessionReachabilityDidChange(true)` and `activationDidComplete`. Tests assert this sequencing (`WatchWorkoutFinishStateTests.swift:425-436` expects `[.refreshProjection, …]`), but none assert that Complete Set stays enabled. **This matches "delayed light-up, not broken".**
2. **D2 — reachability gating.** If `WCSession.isReachable` is not yet true at activation, `connectionState` stays `.passive`, which disables Complete Set until `sessionReachabilityDidChange`. That callback then triggers D1, so the two delays stack.
3. **D3 — phone-originated changes arrive only by application context.** Examples: a set completed or edited on iPhone, Not Yet, resume. Until the context lands, the Watch shows the old row/phase. A Complete Set tapped on a stale revision gets `.stale` → `STATE REFRESHED` and needs a second tap (`WatchWorkoutCommandRouter.swift:104-109`, `WatchWorkoutStore.swift:629-631`).
4. **D4 — lost/slow reply recovery.** A 12 s reply watchdog, then 2/4/8 s backoff, up to 4 attempts, then "Waiting for iPhone" (`WatchWorkoutStore.swift:108-113,547-569`). During all of this Complete Set stays disabled.

### Likely amplifier (platform behavior, not runtime-proven)

With no active `HKWorkoutSession` (section 2), watchOS does not keep the PhysiqueOS Watch app frontmost or running in the background. On each wrist-down the app is backgrounded or suspended and immediate-message reachability drops. Each wrist-up therefore pays app resume + D2 + D1. A Watch-started HealthKit workout would hold the app active, so H1 probably contributes to the latency too. Confirming this needs the instrumentation in section 6.

Root cause of the latency is **not** claimed beyond D1–D4. Durations need runtime timing.

## 5. Defects / gaps found

| # | Defect | Classification |
|---|---|---|
| G1 | A phone-started live session never gets a Watch HealthKit workout. The audit plan's "Resume Workout" path for an already-active session is missing, and there is no affordance once a set is logged. | LIKELY SHIPPING DEFECT + FOUNDER DECISION (auto-start vs explicit) |
| G2 | The Watch claims `HEALTH ON` / "Health may continue" without consulting `health.lifecycle`, and nothing indicates "not recording to Apple Health". | LIKELY SHIPPING DEFECT (truthfulness) |
| G3 | A read-only `refreshProjection` occupies the single-flight mutation gate, so every activation/reachability event disables Complete Set (D1). | LIKELY SHIPPING DEFECT (latency) |
| G4 | Phone-originated state reaches the Watch only by application context (D3). There is no immediate push while reachable. | ARCHITECTURAL CONTEXT / likely contributor |
| G5 | No deterministic tests cover G1–G3. `WatchWorkoutHealthController` is not injectable (concrete `HKHealthStore`), so start is untestable without a seam. | Test gap |
| G6 | Minor, unrelated to today's symptoms: `recover()`/`cancel()` reattach the recovered builder without re-setting `dataSource`. It needs verification against Apple recovery guidance before anyone acts on it. | Note only |

The existing ledger item "Apple Watch Logger — timed-set duration projection mapping" is a separate mapper issue and is **not** related.

## 6. Smallest safe fix plan (not implemented)

**F1 (G1)** — the Watch offers or starts HealthKit for an already-active session.

When the Watch applies an `.active`/`.paused` projection whose `sessionId` has no live, stored or saved HealthKit workout, it shows one explicit **Record with Apple Health** action (or starts automatically, per Founder decision). That action calls `health.start(structuredSessionId:)` and pauses it if the session is paused.

The phone must learn of the start, because otherwise `watchHealthSaveState` stays nil and the Health leg/correlation never runs. Add one bounded Watch→phone command, e.g. `reportHealthStarted(startedAt)`, that stamps `watchStartedAt` (idempotent, compare-and-set) on an active session.

Founder decision needed: trusted correlation uses `watchStartedAt ?? startedAt` with a 120 s tolerance, so a late start would not meet the exact time-envelope policy. Choose between: (a) accept that a late-start workout goes to ordinary Pending Review; (b) a separately reviewed policy extension. Do not silently widen trust.

**F2 (G2)** — derive the header/idle Health text from `health.lifecycle`: `HEALTH ON` only when running or paused, otherwise `NOT RECORDING TO HEALTH`. Show a small indicator on the Metrics page when no session exists.

**F3 (G3)** — don't let `refreshProjection` disable Complete Set: give refresh its own in-flight slot, exempt `.refreshProjection` from `isMutationPending` in the enablement predicate, or skip the activation refresh when a fresh context was received within N seconds. A Complete Set tapped during a refresh still sends with the current revision; the existing `.stale` handling covers a race.

**F4 (G4, optional, measure first)** — while reachable, also push phone-originated projections via `sendMessageData` (no reply required) in addition to application context, keeping context as the durable fallback.

**Diagnostics first (no behavior change):** add signposts/logging of `scenePhase` activation → reachability → refresh issue → ack received → Complete Set enabled, plus `health.lifecycle`, so D1–D4 durations can be measured on device.

No diagnostic-only change was required for this audit, so none was made.

## 7. Deterministic tests needed

1. Phone-started active projection (no `readyForWatchAt`, no `watchStartedAt`) applied on Watch → the store exposes the Record-with-Health affordance (or issues start), never silently "HEALTH ON". This needs a `WatchWorkoutHealthController` protocol seam with a fake.
2. Watch-started path still starts exactly once; an applied-then-replayed `startPreparedWorkout` acknowledgement never double-starts.
3. `reportHealthStarted` is idempotent, stamps `watchStartedAt` once, is rejected on finished/cancelled sessions, and finish then sets `watchHealthSaveState = .pending`.
4. `setDisplayActive(true)` while reachable with an active projection → `completeSet()` remains enabled/accepted during the activation refresh (F3), and a racing stale revision yields one refresh plus no lost tap.
5. Header text truth table: lifecycle {idle, running, paused, failed} × connection state.
6. Metrics view: nil builder statistics render "—" and TIME still advances from phone anchors (existing `testSessionTimeUsesAuthoritativeAnchorsAndPauseSemantics` covers TIME only).
7. If F4: a phone-originated mutation while reachable reaches the Watch fake via the message lane and via context, applied once by revision.

## 8. DESIGN_IMPLEMENTATION_DELTA_LEDGER.md

**Yes, for G1 + G2 and for G3.** The locked Watch Workout Metrics design depends on populated HealthKit metrics and truthful Health status, and the ledger rule requires recording likely shipping defects found during source audit. Two OPEN entries were appended:

- "Apple Watch Workout — phone-started session never records HealthKit / false HEALTH ON";
- "Apple Watch Logger — activation refresh disables Complete Set".

G4 stays in this report as architectural context. The timed-set ledger item is unchanged.

## Stop

Stopped for Founder/ChatGPT review: patch now or after the workout, the F1 auto-start vs explicit choice, and the late-start correlation policy.
