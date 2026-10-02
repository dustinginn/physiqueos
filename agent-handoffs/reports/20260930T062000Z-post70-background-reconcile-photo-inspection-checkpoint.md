# Post-Build-70 batch checkpoint — HealthKit Strength background trigger + reusable photo inspection (status: CANDIDATE; fresh review in flight; not deployed/uploaded)

Prompt: `agent-handoffs/inbox/prompts/20260930T053000Z-claude-background-reconciliation-photo-inspection.md`. Scope held to the three items; HealthKit Sleep NOT started; Build 70 work not reopened.

## Exact state
- Repo `dustinginn/physiqueos`; branch `claude/post70-background-reconcile-photo-viewer-20260930` @ **`cf749295fcbc7035ad6eaedec2256f59832329c5`** (pushed), based on Build 70 Native `754376c5`. Native-only; **no Server change, no Server deploy**. Build number still 70 in source (no number chosen; no TestFlight upload).
- Production authority not touched (read-only timeline probe only): Server `4a81f5b4`, Build 70 VALID.

## Item 1 — root cause (Strength reconciliation notification)
Diagnosis (read-only production timeline + code trace), Sep 29 event: Apple workout ended 15:02:13Z; Logger session ended 15:02:11Z; the Server created the 95%-confidence review at 15:26:34Z (`createdAt` 15:26:36Z) in the SAME ingest that first delivered the workout observation — i.e. the workout was NOT uploaded until the Founder opened the app (foreground sync). Matching/review creation/notification/deep link all worked once the workout arrived. The defect is the HealthKit background delivery lifecycle in Native:
1. **Observers were only registered on `scenePhase == .active`** (`HealthKitAutomaticSynchronizationCoordinator.bootstrap()`), and the app had no launch-path registration. iOS relaunches a terminated app in the background for HealthKit delivery WITHOUT activating a scene, so the wake found no `HKObserverQuery` and was lost.
2. **Workouts used `.hourly` background delivery** (`enableBackgroundDelivery(... frequency: .hourly)`); `HKWorkoutType` supports `.immediate`. This matches "hours passed".
3. After the observer completion fires, the upload and the follow-up review refresh ran with no background-execution assertion, so a suspended process could be cut off mid-upload/refresh.
(Log's lifecycle was never the trigger for ingest; opening the app ran the foreground catch-up that finally ingested the workout. The Build 69 "refresher after durable ingest" was correct but never ran because ingest never happened.)
Not the cause / verified: matching quality; Keychain accessibility (HealthKit data is unavailable while locked, so delivery happens after unlock).

### Fix (ownership, not a UI call)
- `PhysiqueOSApp.init` → `AppEnvironment.registerHealthKitObserversForLaunch()` → `HealthKitAutomaticSynchronizationCoordinator.registerObserversForBackgroundLaunch()`: registers observers + background delivery for all three streams in the process-launch path (Founder Production only), from a locally cached owner identity (`HealthKitOwnerIdentityCache`, filled by the first foreground bootstrap; opaque id, no credential) — no network, no query, no upload at launch; observer wakes drive the same sync as foreground.
- `SystemHealthKitObserverClient.backgroundDeliveryFrequency(for:)`: `.immediate` for workouts, `.hourly` for Activity/Nutrition.
- `HealthKitSynchronizationEngine.handleObserverWake` and `WorkoutReconciliationNotificationRefresher` run under `withBackgroundExecutionAssertion` (optional scheduler; production passes `UIKitBackgroundTaskScheduler`).
Preserved: 95% matching/review semantics, standard Evidence Review confirmation, no auto-confirm, cardio/activity paths, identity-diffed notifier (no spam), existing deep link. No Server change.
Limitation: iOS still decides when to wake the app; with no background grant the notification waits for the next launch/unlock. Real-device acceptance is the final proof.

## Items 2+3 — photo inspection architecture
One reusable component, `SharedUI/PhotoInspectionViewer.swift`: `PhotoInspectionItem/Request`, `.photoInspection($request)` (fullScreenCover), `.inspectsPhoto(items, tapped:, presenting:)` (the photo itself is the tap target + one subtle corner glyph; inert for placeholder/asset sources), `PhotoInspectionViewer` (paging between a group's photos, drag-down/Close/escape dismiss, "n of m" + title/date chrome, read-only), and `ZoomableImageView` (UIScrollView: pinch, momentum pan, double-tap zoom about the tap, image view sized to the aspect-fit rect so zoom never shows letterbox, max 6×).
Media resolution audit: the media route only serves display derivatives (JPEG/PNG/HEIC/WebP; never RAW/DNG); grid tiles decode to 1,600 px; the viewer shows the tile's decode instantly then upgrades to a 3,200 px decode of the same media (`FounderProductionPhotoMediaStore.loadInspectionImage`, kept apart from the grid cache and released when the viewer closes). Failed → "Try again"; permanent → "Photo unavailable".
Entry surfaces: Photo Briefing snapshot grid (swipe through the session's poses) and every comparison image (Previous ↔ Current); Progress Photos Evidence set detail (Previous ↔ Current). The repeated "Tap a photo to expand" caption was removed (behavior is now the photo itself) and taps no longer navigate away, so the Evidence page position/state is untouched on return. The Evidence landing's small thumbnails/rows remain navigation to the set detail (they sit inside tappable cards); inspection is one tap further.

## Validation actually run on `cf749295`
- Full `PhysiqueOSTests` (iPhone 17 Pro, iOS 26.5): **1590 tests, 0 failures** (Build 70 was 1575; +15 new: launch registration ×3, immediate frequency, app-init wiring, wake-under-assertion, refresher lifecycle (no-match → no alert; later match → one alert; 4 repeats → none; deep link decodes to the exact review; assertions released), viewer request/inspectability/resolution/architecture ×5, rendered viewer). Two existing source-scan tests were updated for the intentional behavior change.
- Release compile (`-configuration Release -destination generic/platform=iOS`): **BUILD SUCCEEDED**, only the 3 pre-existing `BackgroundExecutionAssertion` actor warnings.
- Focused visual/interaction check (answers what unit tests cannot): a test hosts the REAL `PhotoInspectionViewer` in a window with synthetic detail-bearing images, drives zoom/pan/back-out, and renders PNGs. It caught and I fixed two real bugs before any device: (a) the image was not fitted (scroll view had no size at `updateUIView`; now fitted in `layoutSubviews`), (b) zoom exposed letterbox bars (image view now sized to the aspect-fit rect). After the fixes: opens fitted with the whole 3:4 photo visible and chrome (Close, title, date, "2 of 2") legible; 3× zoom + pan shows crisp magnified content, chrome overlaid; zooming back restores the fit. This covers the shared component used by BOTH entry surfaces; the two surfaces' wiring is covered by source/model tests. The sandbox has no real photo bytes, so no on-simulator tap-through of the actual Briefing/Evidence screens was run (no broad simulator tour, per instruction).
- Disclosure: the last full-suite run started with **13.6 GiB free (below the 15 GiB floor)** — I did not recheck free space between runs after the simulator/DerivedData had grown. It completed cleanly and I cleaned regenerable output afterwards (free 15.7 GiB); the earlier runs in this task were above the floor. Nothing was deleted except my own DerivedData/simulator data.

## Not run
UI test bundle; any broad simulator tour; real-device HealthKit background delivery (needs the Founder's device); the viewer on real production photos.
Fresh-context review of this delta: launched; results in the follow-up report (see below).

## Founder acceptance checklist
1. **Strength notification:** complete a Watch Strength workout with a matching Logger session, do NOT open Log (app backgrounded or closed). Expect the "Workout needs review" notification when iOS delivers the workout (immediate delivery); tapping opens that exact review. If nothing arrives, unlock the phone and wait a minute (HealthKit delivers only when unlocked) before concluding.
2. Photo Briefing: tap any snapshot/comparison photo → full-screen viewer; pinch/pan/double-tap zoom; swipe between Previous/Current; Close or drag down dismisses; back on the briefing at the same scroll position.
3. Progress Photos Evidence → open a set → same viewer from Previous/Current tiles; return preserves the page.
4. Zoom sharpness on a physique detail (3,200 px decode).

## Known limitations / follow-ups
iOS ultimately controls background wake timing; no APNs push. Evidence landing thumbnails still navigate to the set detail (inspection is one tap further). Goals' completed-goal photos not converted (not in scope; the modifier is reusable).
## Next step
Fresh review result + Founder/ChatGPT authorization for a build number and TestFlight upload; Server unchanged. HealthKit Sleep only after acceptance.
## Local-only state
None: worktree clean and pushed (`/private/tmp/physiqueos-post70-native`). Snapshot PNGs are in the local job dir only (synthetic images, no Founder data).
