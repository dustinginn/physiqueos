# Build 63 Founder Acceptance — Diagnosis Complete, Two Fixes Prepared, One Cleared With No Code Change

Generated: 2026-09-27T03:17:00Z

Task: `claude-build63-acceptance-diagnosis-20260927`, executing `agent-handoffs/inbox/prompts/20260927T030000Z-build63-founder-acceptance-complete-handoff.md`

## Result

Diagnosed all three FAILED Build 63 acceptance items with production evidence, not assumption. Prepared minimal, tested fixes for two of them. For the third, production evidence proves the existing data authority is already correct, so per the explicit "do not invent new semantics" instruction, nothing was changed there. **No build was cut, no build number was bumped, nothing was archived or uploaded, no Founder device was operated, the Sep24 Strength review was not retried, and no production data was mutated.**

Candidate: commit `07e096f9` on top of Build 63's exact source (`1ef837815fc43b70996abd972d1648547db78f46`), branch `codex/native-batched-candidate-post-build62`, pushed to origin. An independent fresh-context review (given zero prior context) verified the diff directly against the code and reported it safe and correct: both `GoalPhaseCard` call sites confirmed, `Journey` confirmed as the only section on the current-state page that can show per-phase progress, the `Task.isCancelled` capture confirmed to run before the block's only `await` with no control-flow change, and both new tests confirmed passing.

## Acceptance matrix

| Item | Prior status | This task |
|---|---|---|
| 1. Logged Today Cardio | PASS | Preserved (no changes touched this path); full regression suite reconfirms it |
| 2. Your Journey progress bars | FAIL | **Root cause found, fixed, tested** |
| 3. Completed Visible Abs photos | FAIL | **Root cause investigated; production data proven correct; no code change** |
| 4. Strength reconciliation -999 | FAIL | **Cause narrowed as far as static+DB evidence allows; diagnostic extension added, not a guessed fix** |
| 5. Reconciliation-review notifications | preserved | Untouched |
| 6. Performance Phase 2 | accepted | Untouched |
| 7. Training/Cardio | accepted | Untouched |
| 8. HealthKit Cardio Phase1/V3 | live | Untouched — no policy change made |

## Item 2 — Your Journey: root cause and fix

**Root cause (proven, not assumed):** The Founder's real "Build Lean Mass" goal has a server-populated `currentState` field (confirmed live: Active Goal V3, Server `2a23eee7`, `PhaseAwareActiveGoalPreviewService.js` unconditionally composes and returns `currentState` for every V3-graduated goal). Because of that, `ActiveGoalDetailContent.body` (`GoalDetailView.swift`) renders `ActiveGoalCurrentStateSections`, **not** the legacy layout the prior task's fix actually touched only implicitly. `ActiveGoalCurrentStateSections` has its **own**, separate `journey` computed property, which called `GoalPhaseCard(phase: phase, showsProgress: false)` — explicitly suppressing the shared progress-bar treatment — based on a code comment claiming "progress is shown once below." That claim is false for this page: `ActiveGoalCurrentStateSections.renderedSections` is `[.hero, .journey, .bodyComposition, .guardrail, .trainingProgress, .turningPoints, .coachTake]` — no other section shows per-phase progress at all.

**Why the prior fix's own test didn't catch this:** `GoalsAcceptanceUITests.testJourneyPhaseCardsShowOneLabelPerPhaseNeverARedundantSeparatePercentage` drives the Sandbox JSON fixture. That fixture's "Build Lean Mass" `activeGoal` object has **no `currentState` key at all** (confirmed by directly parsing `GoalsFixture.json`), so the UI test exercised the legacy code path the whole time — never the real production path. This is exactly the "component-sharing assumption" trap the task warned against.

**Fix:** One-line change — `GoalPhaseCard(phase: phase, showsProgress: false)` → `GoalPhaseCard(phase: phase)` (default `showsProgress: true`) in `ActiveGoalCurrentStateSections.journey`. Updated the two stale comments that asserted the now-disproven "shown once elsewhere" design intent.

**Tests:** New unit test `testCurrentStateJourneyPhaseCardsShowProgressMatchingHomeSinceNoOtherSectionDoes` (`FounderServerAPITests.swift`), using the existing `activeGoalWithCurrentStateJSON` fixture (which does have `currentState`). Confirmed **RED** against the pre-fix code (both assertions failed with exactly the expected messages), confirmed **GREEN** after the fix. Full suite: 1446/1446 unit tests, 13/13 UI tests (Goals + Training), no regressions.

## Item 3 — Completed Visible Abs photos: investigated, production data proven correct, no code change

Per the explicit instruction not to invent new photo-selection/storage semantics without proof the existing authority is insufficient, this required a zero-write production DB read (`physiqueos.canonical_evidence_records`, `canonical_briefing_records`, `canonical_media_objects`), reproducing the **exact** production computation (`composeCompletedGoalPreview`, `resolveCompletedGoalPhoto`, `resolveProgressPhotoMedia`, `resolveBriefingMedia`/`resolveNarrativeMedia`, `ProviderMediaReferenceResolver`) line-for-line against real data, under the standard `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` / verified `read_only=on` / `ROLLBACK` contract.

Findings:
- **Beginning** (2026-05-21 photo): resolves to `href: /api/private-evidence/media/media-c324bb746c3aca53584a2ab3f21fbc1d-29830c5f8d06` — a fully valid `/media/<id>` href. The backing media object is `state: verified`, has a real `storage_key`, `content_type: image/jpeg`, `byte_length: 519428`.
- **Completion** (2026-07-18 photo): the briefing narrative's `journeyComparison.final.imageHref` is stored as a **raw legacy path** (`/api/private-evidence/founder/photos/uploads/2026-07-18-front-relaxed-1784414484063.jpeg`) — my first pass mistakenly treated this as the final served value and concluded it was the bug. Re-tracing the **actual** production pipeline showed briefings are run through `resolveBriefingMedia`/`resolveNarrativeMedia` **before** `composeCompletedGoalPreview` ever sees them, which correctly re-resolves that exact legacy path to `href: /api/private-evidence/media/media-688827382e9c0a3d40a71b0b69148895-bc4268989cd8` — also `state: verified`, real `storage_key`, `content_type: image/jpeg`, `byte_length: 4012185`.
- Confirmed the live runtime genuinely uses this provider/Postgres path (`PHYSIQUEOS_PROVIDER_FULL_RUNTIME=1` verified directly from the running container), not the legacy no-media-resolution fallback.

**Conclusion:** both photos' server-side data and href construction are completely valid end-to-end right now. I could not find a deterministic code defect in either Server or Native for this item (Native's `CompletedPhoto.mediaId` extraction, `ProgressPhotoTile`, and `FounderProductionPhotoMediaStore` were all re-checked and are structurally correct for these href shapes). Per the explicit instruction, **no code was changed for this item.** The most likely explanations for the Founder's observed placeholders are (a) the same period of network instability documented for item 4 also affected the authenticated photo fetch (transient, not a code defect), or (b) the underlying media catalog rows were still completing verification at the moment of the Founder's specific test and have since settled. **Recommend the Founder simply re-open the Completed Visible Abs Goal screen and confirm whether this has already resolved itself before any further engineering time is spent here** — the data says it should now render correctly.

## Item 4 — Strength reconciliation -999: narrowed with evidence, diagnostic extension prepared (not a guessed fix)

Traced the full chain: button action → `resolveWorkoutReconciliation` (`EvidenceReviewDetailView.swift`) → `ProductionEvidenceReviewAPI.resolveWorkoutReconciliation` → `ProductionNativeAPI.submitCommand`/`perform` (`FounderServerAPI.swift`). Confirmed by direct code read:
- No custom `URLSession` anywhere in the app — every transport uses `URLSession.shared` (the Apple-managed singleton). Zero occurrences of `.invalidate()`/`.invalidateAndCancel()` in the whole codebase.
- No `TaskGroup`/`async let`/client-side timeout-race pattern anywhere in the networking layer — only plain `URLRequest.timeoutInterval` (OS-level, produces `-1001`, not `-999`).
- `submitCommand` is sequential, single-attempt-plus-one-token-refresh-retry, no explicit cancellation of any kind.
- A zero-write DB read of `physiqueos.command_receipts` confirms **zero** `workout-reconciliation.resolve.v1` receipts have **ever** been created for this account (all-time query), while every other command type (`check-in.submit.v1`, `healthkit.observations.ingest.v1` ×327, `priority.complete.v1` ×10, `training-session.commit.v1`, etc.) flowed and committed normally through the exact same multi-day window, including the evening of the Sep26 confirm attempt.

This rules out ordinary, general transport/auth flakiness as a full explanation (it wouldn't explain a 100%-reproducible, single-command-type-isolated failure — this is now the **third** time this exact command type has failed this way across two independently-shipped, independently reviewed prior fix attempts, per `WorkoutReconciliationDiagnostics.swift`'s own header). But I could not find any app-owned cancellation trigger in the code to point to directly, so per the explicit instruction ("if source evidence cannot distinguish app-owned vs external, extend the existing diagnostics specifically around Task.isCancelled"), I did exactly that rather than ship a speculative behavioral fix.

**Change:** added `taskWasCancelledAtCatch: Bool?` to `WorkoutReconciliationDiagnostics.Event`, captured via `Task.isCancelled` read at the exact `catch` site in `resolveWorkoutReconciliation` — before any further `await` in that block, so it reflects the cancellation state at the moment of the throw, not after a later suspension point. Surfaced in the on-device Workout Reconciliation Diagnostics screen. This is diagnostic-only: no control flow, retry behavior, or error handling changed. New test `testPreservesTaskCancellationStateAtCatch` (matching the existing test file's own established level of coverage for this component) confirmed RED before the field existed, GREEN after.

**What this buys:** the next real confirm attempt will show, unambiguously, whether the app's own Task was cancelled at the moment of the throw (`true` → an app-owned Swift-concurrency/task-lifecycle cause exists somewhere still unfound and worth another pass) or was not (`false` → strongly corroborates the external-network-event explanation already suggested by the nearby, independent `-1001`/`-1005` OS errors in the same test session). Per the explicit instruction, **the Founder is not being asked to attempt this again on my request** — this only pays off on whatever future attempt happens anyway, and per the standing instruction, no engineer should ask for one until this or another materially different diagnostic/fix candidate is authorized.

## Validation

- Unit tests: full `PhysiqueOSTests` target, **1446/1446 passing** (1445 prior + 1 new; the 2 new RED/GREEN pairs for items 2 and 4 both confirmed correctly).
- UI tests: `GoalsAcceptanceUITests` 1/1, `TrainingAcceptanceUITests` 12/12 — no regression to Logged Today Cardio or any other previously-accepted behavior.
- Release build + `verify_release_configuration.py`: **not run this pass** — the build machine's free disk space was at ~14 GiB, at/under the 15 GiB STANDING_DISK_SAFETY.md hard floor, after clearing the already-uploaded Build 63 archive; a Release build was judged too disk-risky to force through. The Debug build-for-testing succeeded cleanly and the full unit+UI suites above ran against it. Recommend a disk-safety pass (or more headroom) before treating this as fully release-validated.
- Fresh-context review: complete, no issues found — confirmed both call sites, confirmed Journey is the only progress-showing section on this page, confirmed the `Task.isCancelled` capture is behavior-preserving with no hidden suspension point between it and the block's only `await`, confirmed both new tests build and pass.

## Files changed (commit `07e096f9`, pushed to `origin/codex/native-batched-candidate-post-build62`)

- `ios/PhysiqueOS/Presentation/Goals/GoalDetailView.swift` — the one-line Journey fix + stale-comment cleanup.
- `ios/PhysiqueOS/Networking/WorkoutReconciliationDiagnostics.swift` — new `taskWasCancelledAtCatch` field.
- `ios/PhysiqueOS/Presentation/Evidence/EvidenceReviewDetailView.swift` — captures `Task.isCancelled` at the catch site.
- `ios/PhysiqueOS/Presentation/You/WorkoutReconciliationDiagnosticsView.swift` — surfaces the new field on-device.
- `ios/PhysiqueOSTests/FounderServerAPITests.swift` — new Journey RED/GREEN test.
- `ios/PhysiqueOSTests/WorkoutReconciliationDiagnosticsTests.swift` — new Strength-diagnostic RED/GREEN test.

No other files touched. No build-number, signing, capability, or bundle-identifier change.

## Explicitly confirmed NOT done, per the release gate

- No Native build cut, no build number bumped, no archive, no TestFlight upload.
- No Founder device operated.
- Sep24 Strength reconciliation: not retried, not touched.
- No production Server data mutated; two read-only, owner-scoped, `ROLLBACK`-guaranteed zero-write DB audits only.
- No Server code deployed; no HealthKit graduation policy changed; no historical strategic artifact regenerated.
- Cardio strategic policy: untouched, as explicitly instructed.

## Backlog / open items for whoever picks this up next

- Get free disk space back above the 15 GiB floor and run the Release build + `verify_release_configuration.py` before this candidate is considered fully release-ready.
- Ask the Founder to simply re-check the Completed Visible Abs Goal screen (no code change needed there per the evidence above) before spending more engineering time on it.
- The next real Strength reconciliation confirm attempt (whenever the Founder next does one, not solicited by this task) will carry the new `taskWasCancelledAtCatch` signal — read it before any further speculation on that item.
