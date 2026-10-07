# Watch "ready for you" haptic: event contract (design only)

**Meaning:** "Your Watch is ready for you." The Watch received and prepared the workout and is showing an enabled **Start Workout**.

It does **not** mean any of the following:
- the workout started;
- the phone's request was merely sent;
- watchOS foregrounded the app because of `startWatchApp`.

## Current handoff authority (verified at `32baf1d5`)

| Step | Owner | Code |
|---|---|---|
| Phone taps **Ready on Watch** | `TrainingSessionAuthority.setReadyForWatch` sets `draft.readyForWatchAt` and clears the phone start | `TrainingSessionAuthority.swift:317` |
| Phone publishes the prepared plan | `WatchWorkoutCommandRouter` builds `WatchWorkoutProjection.make(…, prepared: true)` → phase `.prepared`; rides application context and replies | `WatchWorkoutCommandRouter.swift:35` |
| Phone asks watchOS to open the app (sanctioned) | `HKHealthStore.startWatchApp(with:)` | `WatchWorkoutConnectivityBridge.swift:307` |
| Watch launch request | `PhysiqueOSWatchAppDelegate.handle(workoutConfiguration)` → `store.handlePhoneWorkoutLaunchRequest()` applies the newest context and runs `refresh()` | `PhysiqueOSWatchApp.swift`, `WatchWorkoutStore.swift:1577` |
| Watch applies state | `WatchWorkoutStore.apply(_:)` (context, replies, refresh) | `WatchWorkoutStore.swift:1253` |
| **Start Workout enabled** | `presentedPhase == .prepared && !isMutationPending && connectionState == .reachable` | `WatchWorkoutViews.swift` (`WatchWorkoutStartView`) |
| Founder taps Start | `startPreparedWorkout` → phone `startPreparedWorkout` stamps **`watchStartedAt`** (authoritative), and the phone modal dismisses (Build 90) | unchanged |

**Existing Watch haptic vocabulary:**

| Haptic | Used for |
|---|---|
| `.success` | Applied command: Start, Complete Set, Cancel. **Start Workout already plays `.success`.** |
| `.notification` | Final planned set; rest end (0 s) |
| `.directionUp` | Rest countdown 10 s / 5 s |
| `.click` | Pause / Resume |
| `.retry` / `.failure` | Stale / failure |

## The truthful event

The cue fires on the **first transition into "Start Workout is actionable on screen"** for a **new preparation lifecycle**:

```
readyCueEligible =
     presentedPhase == .prepared                 // projection says prepared (not declined, not started)
  && !isMutationPending && connectionState == .reachable   // the exact Start-enabled predicate
  && displayIsActive                              // scenePhase .active: the app is actually presenting it
  && debugSurface == nil                          // never in fixtures
  && lifecycleKey != lastCuedLifecycleKey         // once per preparation
  && preparedAt within 10 min of now              // freshness (no cue for a stale prepared plan)
```

**Where it is evaluated:** a single `evaluateReadyCue()`, called at the end of the following, in the same way `evaluateAutomaticHealthStart()` is already called:
- `apply(_:)`;
- `setDisplayActive(_:)`;
- reachability changes;
- gate settle.

It is never called from a view body, so a redraw can never play it.

## Lifecycle key (needs one additive contract field)

- The Watch projection today has **no** preparation identity. A re-delivered context (same `sessionId`) cannot be told apart from a new Ready.
- **Proposal:** add the optional field `preparedAt: Date?` to `WatchWorkoutProjection`, set from `draft.readyForWatchAt` only when `prepared == true`. The lifecycle key is `sessionId + preparedAt`.
  - It is additive and optional, so it decodes as `nil` on the other side.
  - `schemaVersion` is unchanged.
  - Phone and Watch ship in one bundle.
- **Fallback when absent:** the key is `sessionId` alone.
- `lastCuedLifecycleKey` is **persisted in Watch `UserDefaults`**, so a cold launch by `startWatchApp` or a relaunch never re-cues the same preparation.

## Safeguards (each one a unit test)

| Rule | Mechanism |
|---|---|
| Exactly once per preparation | Persisted key compare |
| No haptic on redraw / state refresh / context replay | Event-driven evaluator plus the key; the same projection re-applied is a no-op |
| No haptic on a stale or duplicate preparation | `preparedAt` freshness window and the key. An older revision is already dropped by `apply` |
| No haptic for **Use without Watch** | `declineWatchHandoff` clears `readyForWatchAt`, so the projection is not `.prepared` |
| No haptic merely because WCSession is reachable | Reachability is a necessary condition, never the trigger. The key must also be new |
| Phone reconnect while already prepared | Same key, so no cue. Only a new Ready (new `readyForWatchAt`) cues |
| Ready → withdraw → Ready again | New `readyForWatchAt`, so a new key, so one new cue (truthful: a new preparation) |
| App backgrounded when prepared | No cue while inactive. When it becomes active within the freshness window and Start is enabled, it cues once (that is the moment the Watch presents it) |
| Accessibility / system settings | `WKInterfaceDevice.play` respects the system haptic settings (Haptic Alerts, Prominent Haptic). Visual state never depends on the cue |
| Fixtures / UI tests | `debugSurface != nil`, so no cue |

## Recommended haptic

**`WKHapticType.notification`, played once.**

Why:
- **Semantic fit.** Apple's meaning for `.notification` is "something needs your attention now." That is exactly "your Watch is ready for you; look at it."
- **Consistency.** It is the cue PhysiqueOS already uses when the Watch has the next action waiting (rest over). The rest-end cue only occurs in `.active`, and this one only in `.prepared`, so they cannot be confused.
- **It is not `.success`.** Start Workout itself plays `.success`, and that cue must keep meaning "it happened."
- **It is not `.start`.** That means "an activity began," which is the claim we must not make.
- **It is not `.directionUp`.** That is the countdown vocabulary.
- **Restraint.** It is a single short tap, with no repeat, no rising pattern and no sound beyond the system setting.

**Alternative if the Founder wants it quieter: `.click`.** It is the lightest standard tap, but easy to miss while the eyes are on the phone. It also shares a pattern with Pause/Resume.

## Phone side

No change:
- The phone keeps waiting.
- `watchStartedAt` stays authoritative.
- The modal dismisses on Watch Start, as in Build 90.

## Implementation estimate (held)

**Code:**
- Watch: about 60 lines (evaluator, persisted key, call sites).
- Contract: 1 field.
- Mapper: 1 line.

**Tests:** about 10 Watch unit tests covering the table above. The `commandSinkForTesting` and `now` seams already exist.
