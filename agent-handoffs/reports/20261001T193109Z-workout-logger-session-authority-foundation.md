# Workout Logger session authority foundation — final report

- Task id: `workout-logger-session-authority-foundation-20261001`
- Prompt: `agent-handoffs/inbox/prompts/20261001T160000Z-workout-logger-session-authority-foundation.md`
- Generated (UTC): 2026-10-01T19:31:09Z
- Agent: Claude (background session)
- Status: **complete — candidate for review (not merged, not released, no TestFlight)**

## 1. Exact SHAs
- Repository `dustinginn/physiqueos`.
- **Candidate A (on Build 75 base):** branch `claude/workout-logger-session-authority-foundation-20261001`, **`e3f3f5f1`**. Base `77681cd7` (Build 75). Everything in this report was validated at this SHA unless marked otherwise.
- **Candidate B (integrated with shipped Build 76):** branch `claude/workout-logger-session-authority-on-build76-20261001`, **`2b41dc48`** = A merged with `fcd26309` (Build 76, Sleep polish). This is the one to integrate or build the next phase from.
- The Swift sources merged cleanly. Only `ios/Scripts/generate_project.py` and the generated project file conflicted:
  - the generator conflict was resolved by keeping Build 76's lists and appending this task's;
  - the project was regenerated;
  - the regenerated project differs from Build 76's by **+20 additive lines, with no removals or renumbering**. Session-authority files use a pinned object-id block at 0x1500+, away from the Sleep lane's counter.
- Do NOT hand-merge the project file; always resolve the generator and regenerate.

## 2. Authority re-verification
- Native: Build 76 `fcd26309` is the latest shipped (last-uploaded build 76). Candidate A was cut from Build 75 `77681cd7` before Build 76 shipped; Candidate B fixes that.
- Server: production deployment `8008f928` ACTIVE (read-only doctl). Untouched. No Server change was needed or made.
- The Sleep Build 76 lane was not touched.

## 3. Old vs new authority map
| Concern | Before | After |
|---|---|---|
| Owner of an in-progress workout | `TrainingLoggerViewModel`'s private copy of the draft, one per screen | App-scoped `@MainActor TrainingSessionAuthority`, one per Native authority (Sandbox / Founder Production), created in `AppEnvironment` |
| Durable record | Draft store, written by the view model | Draft store, written **only** by the authority; each change is persisted first, then published; a failed write rejects the change and memory still equals storage |
| View model | Mutates its own copy, then `persist()` | Selects a session by id and commands the authority; `draft`/`savedDrafts` are read-through of authority state; `persist()` is a no-op |
| Log-tab routing | Reads the store directly | Reads the authority |
| Server commit | `ProductionTrainingWriteAPI.commit` at Finish | **Unchanged** (file untouched) |

## 4. Concurrency / idempotency design (smallest robust design)
- **Serialization:** the authority is main-actor-isolated and each mutation is synchronous (read current, transform, persist, publish). Nothing awaits mid-mutation, so no mutation is computed from a stale snapshot. No locks or extra actors were needed.
- **Revision:** per-draft monotonic `revision` (older drafts read as 0), advanced only when content really changes.
- **Idempotency ledger:** the last 32 caller-supplied `mutationId`s per draft are persisted, so a replayed command is recognized after relaunch.
- **Compare-and-set:** an `.intent` origin **must** carry `expectedRevision` (otherwise `revisionRequired`). Result vocabulary:
  - `applied(revision)`
  - `unchanged(revision)`
  - `duplicate(revision)`
  - `rejected(reason)`
- **Check order:**
  1. writes authorized;
  2. session exists, or was ended in this process (`sessionEnded` tombstone, so a late write can't resurrect a cancelled or committed draft);
  3. revision present for intents;
  4. duplicate id;
  5. origin/scope gate (non-UI origins only touch an in-progress live session at set entry, not left, not awaiting durability, and not mid-Finish);
  6. apply and normalize;
  7. unchanged check;
  8. stale check;
  9. persist.
- **Typed operations (future LiveActivityIntent surface):**
  - `completeSet` / `setCompletion`, with an explicit end state and never a toggle;
  - `setValue`;
  - `endRest`;
  - `setRestConfiguration`.
- An intent may complete only a set whose entered values are valid. Sets are addressed by exercise id plus set id and validated, never by position.
- **UI-only operations:**
  - structural `edit` (add/remove/reorder exercises, variants, supersets, evidence, areas, step navigation);
  - lifecycle: `startSession`, `resume`, `saveAndLeave`, `markFinishing`, `setSubmissionState`, `endSession` (reasons: committed / cancelled / discarded);
  - exclusive submission lock (`beginSubmission` returns false if a Finish is in flight).
- Persistence failure is surfaced for `start`, edits and Finish; `submit()` stops if the `finishedAt` stamp is refused, so the idempotency identity can't change on retry.

## 5. completedAt semantics
- Optional ISO8601 string with fractional seconds, on the set.
- Stamped only on an incomplete→complete transition in a **live** session; preserved while the set stays complete (editing values keeps it); cleared when marked incomplete.
- Never backfilled for older drafts. Never set for retrospective/past entries. A structural edit cannot forge or move one. Not sent to the Server.

## 6. Rest model and behavior
- `TrainingSessionRestState`: id, mode (stopwatch | countdown | off), `startedAt`, `endsAt` and `durationSeconds` (countdown only), `sourceExerciseId`, `sourceSetId`. Absolute instants only; nothing ticks and nothing is persisted per second.
- **Auto-start:** completing a set starts or replaces rest per configuration.
  - Stopwatch: `startedAt` only.
  - Countdown: `endsAt = startedAt + duration`.
  - Off, or Countdown with no valid duration: no rest state (and a prior rest is cleared).
- **Countdown expiry** is presentation only: it never completes or advances anything, and the expired state stays until the next completion or an explicit `endRest`.
- **Ends when:**
  - its source set is un-completed;
  - Save & Leave;
  - Finish;
  - awaiting durability;
  - the session ends.
- Resume does not restart it. An unknown future mode decodes to Off and is dropped.
- **Relaunch:** the stored state is restored exactly; the projection derives the clock from the absolute times.
- **Preference boundary** (precedence: session override → per-exercise → global → Off):
  - `TrainingRestPreferenceProviding` takes the canonical exercise id, so per-exercise preferences can be added later with no schema break;
  - a device-global default store exists but nothing writes it;
  - **no product default is chosen**: with no preference, rest is Off and behavior matches today;
  - there is no settings UI yet.

## 7. ViewModel migration
- The Logger view still builds the same screens. Changes: the set checkmark now sends an explicit end state through the VM; numeric edits go through `setValue`; the per-field edit-buffer keys are unchanged.
- Resume, Save & Leave, Cancel, discard and the Finish outcomes (durable, accepted-processing, result-unknown, durability recovery, evidence reconcile, attachment cleanup, Evidence Review handoff) are preserved.
- Only the caller that actually ends a session runs its cleanup and evidence reconcile, which fixes a double-reconcile race between two Logger screens.
- **One intentional behavior change:** Resume now persists `leftAt = nil` immediately (base changed it in memory only). Without this, a future Lock Screen intent would be refused for a resumed-but-unsaved workout. Visible effect: after Resume, force-quitting and then tapping Log routes straight into the workout (the intended meaning of "in progress"). One acceptance journey now ends with a Save & Leave to keep later journeys independent.

## 8. Server finish parity
- `TrainingWriteAPI.swift` is unchanged. A new test commits a plain draft and an otherwise identical draft carrying every new local field (revision, ledger, rest, rest override, set completedAt). The request payload, the idempotency key and the body strings are identical, and none of the local field names appear in the body.
- The finishedAt window is stamped once and persisted before the commit; a retry reuses it (tested).

## 9. Live Activity projection (pure, no ActivityKit)
- `TrainingSessionLiveProjection` is Codable and Hashable, derived from authority state at a given `now`.
- It carries:
  - session id and revision (to pass back as `expectedRevision`);
  - label;
  - startedAt/finishedAt;
  - phase;
  - progress;
  - previous and current set cues with exercise cues;
  - `isFinalSetOfExercise`;
  - Up Next set and exercise;
  - workout-complete flag;
  - rest (mode, startedAt, endsAt, expiry);
  - a redacted variant.
- Stopwatch renders as `now - rest.startedAt`; Countdown as `rest.endsAt - now`.
- **Founder two-row rule, encoded as `contextLayout` + derived `contextRows` (never more than two):**
  - `previousAndCurrent` normally;
  - `currentAndUpNext` on an exercise's final set (Previous drops away);
  - `completedAndUpNext` immediately after finishing an exercise (the Up Next row is what Complete Set completes);
  - edges: `currentOnly`, `completedOnly`, `empty`.
- The cursor follows the most recently completed set (by `completedAt`), treats a superset pair as a unit, and falls back to list order for older drafts.
- An unknown future phase decodes to `paused` so a renderer never offers Complete Set for a state it doesn't understand.
- UUID-sized worst case (40 exercises, long names, rest) encodes under 3 KB (ActivityKit limit 4 KB).

## 10. Tests actually run
All at `e3f3f5f1` unless noted; simulator: iPhone 17 Pro, iOS 27.0.

| Run | Result |
|---|---|
| New authority suite | passes (48 tests: identity, idempotency, duplicate across relaunch, bounded ledger, stale revision, intent gating, persistence failure incl. real store with a non-finite number, completedAt, rest, lifecycle, multi-draft, authority switch, schema compatibility, VM migration, Finish/lock/recovery/start-failure, concurrency) |
| New projection suite | passes (15 tests: reps/load, bodyweight, timed, superset, final set→next exercise, single-set exercises, workout complete, rest modes, phases, redaction, payload size) |
| New Server-parity test | passes |
| Existing TrainingLoggerTests + TrainingCatalogMyLibraryTests | pass, except the stale build-number pin below |
| **Full Native unit suite, Candidate A** | **1724 tests, 2 failures, both pre-existing and unrelated** |
| Pre-existing failure 1 | `TrainingLoggerTests.testAppDeclaresExemptEncryption…` pins Build 74 while the project is Build 75 (stale at base `77681cd7`) |
| Pre-existing failure 2 | `PeptideSupportEditorViewModelTests.testSandboxChangeDose…`: the Peptide failure already listed as known in the Build 75 report |
| **Full unit suite, Candidate B** | **1749 tests, 1 failure** (the Peptide one); Build 76 fixed the pin |
| **Release compile, Candidate A (`e3f3f5f1`)** | **BUILD SUCCEEDED** (Release, generic iOS device, signing off); `verify_release_configuration.py` passes (1.0 (75)) |
| **Release compile, Candidate B (`2b41dc48`)** | **BUILD SUCCEEDED**; verifier passes (1.0 (76)) |
| Generator | regenerates the committed project byte-for-byte on both candidates |
| Training UI journeys | see below |

- **UI journeys (Training Logger):**
  - Run individually or in the two groups below, all four Logger journeys pass on a clean install: Save & Leave/reopen/Resume, the Workout Review confirmation, the Founder shoulders cancel-alert journey, and the Training history journey.
  - Run **together in this one order**, Save & Leave and Review fail with "Training Logger was not available from Log". **The base `77681cd7` fails identically in the same order.** Cause: the shoulders journey leaves an active workout, so the next Log tap routes into it. This is a pre-existing test-ordering leak, not a regression. I did not refactor those UI tests beyond the one added trailing Save & Leave.
- The full UI suite was not run.
- Test infrastructure: I used a private simulator and derived-data folders created for this task, and deleted them afterwards. Nothing belonging to other sessions was touched or deleted. The disk floor of 15 GiB was respected throughout (lowest observed during validation about 19 GiB).

## 11. Fresh independent reviews (read-only, code-reading)
- **Review 1** on the first candidate: no blockers; 8 minor/nit findings, all fixed (revision required for intents, ended-session tombstone, exclusive lock, Finish stops on a refused stamp, only-the-ender cleanup, unknown rest mode dropped, surfaced start/resume failures, raw draft store no longer exposed).
- **Review 2** on the full diff plus hardening delta: no blockers, no regressions from the hardening. Fixed:
  - the narrow submit-path double-reconcile / lost Completed-screen race;
  - silent Finish returns (now surfaced);
  - ignored `setSubmissionState` rejection;
  - single-set exercises now show Completed + Up Next at the transition;
  - unknown phase → `paused`;
  - the weak redaction and payload tests;
  - added VM Finish-boundary tests.

## 12. Performance
- No network, timer or per-second work in the authority. Each accepted edit is one synchronous local write (the same count as before). A 201-mutation loop through the view model (200 edits plus a completion) runs well under the 2 s guard in the deterministic test, and completion is visible synchronously.
- Observation is on the authority's `drafts` array, with no broad reloads; an unchanged value writes nothing.
- Not measured: on-device interaction latency with Instruments.

## 13. Remaining concerns / decisions for the Founder
1. **Complete Set records what is on screen.** An intent can complete a set whose values were pre-filled from the previous workout, so a Lock Screen tap logs those values as performed (it refuses only sets with invalid or empty values). Confirm this is wanted, or require the user to have confirmed values first.
2. **Single-set exercises:** Completed + Up Next always wins at the transition (Current + Up Next never appears for them). The Founder rule is silent on this; confirm.
3. **Superset final set:** the final-set layout is per exercise, so Row's last set can show Current + Up Next (the partner's set in the same round) even though the superset still has a round to go; unequal-size supersets can show Completed + Up Next mid-round. Confirm or ask for unit-level semantics.
4. **No rest default is chosen**, and there is no preference UI. The Founder expects Stopwatch to be useful; the product default and a Logger rest UI are the next decisions.
5. **Resume durability change** (section 7).
6. A UI-test-ordering leak exists at base (section 10); consider a per-test state reset.
7. Minor, unfixed: `reloadFromStore` ignores the in-process ended-session set, which matters only if a store discard fails silently. `replace()` is a compatibility path reachable only through `viewModel.draft =`, which the product uses only with nil; tests use it. The device-global rest default reads UserDefaults on each access.
8. Not verified on a real device or lock screen: this task builds none of that.

## 14. Readiness
- **Ready for the shipping Live Activity implementation phase**, building on Candidate B (`2b41dc48`) once the Founder accepts the authority:
  - the typed operations, revision/mutation-id contract and the projection are the interface a LiveActivityIntent and a Widget need;
  - no authority or contract rework is expected.
- **Ready for the visual-mockup task's projection input** (the already-published prototype can map straight to `contextRows`, `contextLayout`, `isCompletionTarget` and `rest`).
- Still required before shipping UI: Founder decisions 1-4, extension target plus generator/verifier work from the discovery report (the Sleep generator drift it listed is already fixed), and a device test of locked-screen intent behavior.
- **Not done by design:** ActivityKit, Widget Extension, Lock Screen or Dynamic Island UI, LiveActivityIntent, mockups, Server changes, TestFlight (no visible change warrants it).

## 15. Recommended next prompt
"Implement the Workout Logger Live Activity (Phase 1) on branch `claude/workout-logger-session-authority-on-build76-20261001` (`2b41dc48`) using the accepted TrainingSessionAuthority and `TrainingSessionLiveProjection`: add the Widget Extension target (generator-driven, verifier made target-aware), the app-side coordinator that renders `contextRows`/`rest` into ActivityKit state and reconciles on launch, a Complete Set `LiveActivityIntent` that calls `completeSet(...)` with its mutationId and the revision it was rendered from, tap-to-open routing, and a rest-mode setting. Resolve Founder decisions 1-4 first. Do not change the authority API without a new review. Release compile, extension signing/provisioning check, TestFlight only after the Founder approves the rendered screenshots."

## 16. State
- All work is committed and pushed on both branches; no local-only or untracked work remains; no private Founder data was involved or pushed.
- Production untouched; no deploy; no TestFlight.
