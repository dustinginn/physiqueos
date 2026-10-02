# Post-Build-70 batch FINAL candidate — HealthKit Strength background trigger + reusable photo inspection (status: CANDIDATE, all gates + fresh review done; NOT deployed / NOT uploaded)

Supersedes `20260930T062000Z-post70-background-reconcile-photo-inspection-checkpoint.md` (same content; the Native SHA changed after the fresh review). Prompt: `agent-handoffs/inbox/prompts/20260930T053000Z-claude-background-reconciliation-photo-inspection.md`. Scope held to the three items; HealthKit Sleep NOT started; accepted Build 70 work not reopened.

## Exact state
- Repo `dustinginn/physiqueos`; branch `claude/post70-background-reconcile-photo-viewer-20260930` @ **`a92519276eac2356af8ab7d236c1d2b9c1733c80`** (pushed; worktree clean), based on Build 70 Native `754376c5`.
- **Native-only. No Server change, no Server deploy.** Build number not chosen (source still 70); no TestFlight upload.
- Production authority untouched (one read-only timeline probe): Server `4a81f5b4`, Build 70 VALID.

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

## Fresh-context review (exact delta 754376c5..cf749295, then fixes)
Item 1: no findings (observer registration idempotent per scope; Founder-Production only; no network/query/upload at launch; assertion end-once guarded; observer completion released exactly once; `.immediate` only for the single workout type). Photo viewer: no blockers/majors; three minors + one design gap, ALL FIXED in `a9251927`: (1) a 3,200 px decode finishing after the viewer closed re-inserted ~30 MB (now dropped unless still loading), (2) paging away from a zoomed page left it zoomed behind a reset zoom flag (unselected pages reset to fit), (3) drag-dismiss on release now also requires a vertical-dominant drag, (4) when the large decode fails the lower-resolution image is now labelled "Full resolution unavailable · Try again".

## Validation actually run on the final SHA `a9251927`
- Full `PhysiqueOSTests`: **1590 tests, 0 failures**.
- Release compile (`-configuration Release -destination generic/platform=iOS`): **BUILD SUCCEEDED**; only the 3 pre-existing `BackgroundExecutionAssertion` actor warnings.
- Focused visual/interaction check (rendered real viewer, synthetic images) run at `cf749295`; it caught and fixed two real layout bugs before any device (image not fitted; letterbox bars inside zoom). After the fixes: opens fitted with chrome legible; 3× zoom + pan crisp; back-out restores fit. The later review fixes (`a9251927`) touch zoom reset/dismiss/notice logic and were re-covered by the full suite, not re-screenshotted.
- Lifecycle tests (Item 1): launch registration (3 streams, no sync/network), relaunch with cache, skips; `.immediate` for workouts only; app-init wiring; wake under assertion; refresher lifecycle (no match → no alert; later Logger session → one alert; repeats → none; deep link decodes to the exact review; assertions released).
- Disk disclosure: one earlier full-suite run in this task began at 13.6 GiB free (below the 15 GiB floor; I had not rechecked after the simulator/DerivedData grew). The final-SHA suite started at 16.7 GiB; the final-SHA Release compile ran only after free space recovered to 15.6 GiB. Only my own DerivedData/simulator data were cleaned.

## Not run
UI test bundle; broad simulator tour; real-device HealthKit background delivery; the viewer on real production photos; a screenshot of the review-fix states.

## Founder acceptance checklist
1. **Strength notification:** finish a Watch Strength workout with a matching Logger session and do NOT open Log (app backgrounded or closed). Expect "Workout needs review" when iOS delivers the workout; tap opens that exact review. If nothing arrives, unlock the phone and wait a minute (HealthKit delivers only while unlocked) before concluding.
2. **Photo Briefing:** tap a snapshot or comparison photo → full-screen viewer; pinch/pan/double-tap; swipe Previous ↔ Current; Close or drag down; back at the same scroll position.
3. **Progress Photos Evidence** set detail: same viewer from the Previous/Current tiles; return preserves the page.
4. Zoom on a physique detail is sharp (3,200 px decode).

## Known limitations
iOS controls background wake timing; no APNs push, so a terminated app that is never woken shows the notification at the next launch. Evidence landing thumbnails still navigate to the set detail (inspection is one tap further). Goals' completed-goal photos not converted (out of scope; the modifier is reusable).

## Next step
Founder/ChatGPT authorization to choose a build number and upload (Server unchanged). HealthKit Sleep only after this batch is accepted.
## Local-only state
None. Worktree `/private/tmp/physiqueos-post70-native` clean and pushed. Snapshot PNGs (synthetic images, no Founder data) and the read-only probe payloads live only in the local job directory.
