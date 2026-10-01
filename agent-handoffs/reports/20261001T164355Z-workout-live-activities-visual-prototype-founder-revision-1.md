# Workout Logger Live Activities — Founder revision 1 visual prototype

- Generated: 2026-10-01T16:43:55Z
- Status: **COMPLETE visual revision; NON-SHIPPING; final Claude report pending**
- Repository: `dustinginn/physiqueos`
- Branch: `codex/workout-live-activities-visual-prototype-20261001`
- Revision candidate: `cc57ddf1cbd5f5aaf2f8058ee9f1bd9810b57542`
- Original prototype candidate: `9dfdd2b76a5b860575a17e7f1e2feb14c62d5226`
- Exact Native base: `77681cd79c8a818dd128766d9c69121f03f9a5e3`
- Founder decision: `agent-handoffs/inbox/decisions/20261001T164500Z-workout-live-activity-founder-revision-1.md`
- Prior report: `agent-handoffs/reports/20261001T161009Z-workout-live-activities-visual-prototype.md`

## Outcome

Founder revision 1 is implemented as the primary visual direction. The Lock Screen retains the accepted large lower-left rest clock and trailing Complete Set action. Context presentation is now a tested invariant shared by Lock Screen and expanded Dynamic Island:

- normal: **Previous + Current**;
- final current set: **Current + Up Next**; Previous drops away;
- immediately after final completion: **Completed + Up Next**;
- no presentation emits more than two full context rows.

Compact and minimal Dynamic Island presentations remain intentionally sparse. A new 13-image revision set is published under `ios/Prototypes/WorkoutLiveActivity/screenshots/revision-1/`. First-pass screenshots remain historical and are not the current Founder-review authority.

## Accepted Lock Screen direction

The selected layout is now locked:

1. session/progress/workout-elapsed header;
2. exactly zero, one or two context rows according to the transition rule;
3. large rest Stopwatch or Countdown at lower left;
4. trailing Complete Set action with a 44 pt target;
5. no adjacent destructive action and no rep/load +/- controls.

The rejected full-width action is not included in the revision review set. Its old comparison image remains only as first-pass documentation.

Stopwatch and Countdown use the same hierarchy:

- `REST · STOPWATCH` / `1:47`
- `REST · COUNTDOWN` / `1:13`

Rest Off has no empty rest placeholder; workout elapsed occupies the lower-left slot while the same two-row context rule remains intact.

## Revised Founder-review screenshot paths

| ID | State | Path |
|---|---|---|
| A | Lock Screen — normal Previous + Current, Stopwatch | `ios/Prototypes/WorkoutLiveActivity/screenshots/revision-1/A-lock-normal-previous-current-stopwatch.png` |
| B | Lock Screen — normal Previous + Current, Countdown | `ios/Prototypes/WorkoutLiveActivity/screenshots/revision-1/B-lock-normal-previous-current-countdown.png` |
| C | Lock Screen — final Current + Up Next, Stopwatch | `ios/Prototypes/WorkoutLiveActivity/screenshots/revision-1/C-lock-final-current-up-next-stopwatch.png` |
| D | Lock Screen — post-final Completed + Up Next, reset Stopwatch | `ios/Prototypes/WorkoutLiveActivity/screenshots/revision-1/D-lock-post-final-completed-up-next-stopwatch.png` |
| E | Lock Screen — Rest Off, Previous + Current | `ios/Prototypes/WorkoutLiveActivity/screenshots/revision-1/E-lock-rest-off-two-row.png` |
| F | Lock Screen — superset, Previous + Current | `ios/Prototypes/WorkoutLiveActivity/screenshots/revision-1/F-lock-superset-two-row.png` |
| G | Dynamic Island expanded — normal Previous + Current | `ios/Prototypes/WorkoutLiveActivity/screenshots/revision-1/G-island-expanded-normal-previous-current.png` |
| H | Dynamic Island expanded — final Current + Up Next | `ios/Prototypes/WorkoutLiveActivity/screenshots/revision-1/H-island-expanded-final-current-up-next.png` |
| I | Dynamic Island expanded — active Countdown rest | `ios/Prototypes/WorkoutLiveActivity/screenshots/revision-1/I-island-expanded-active-rest-countdown.png` |
| J1 | Dynamic Island compact — workout | `ios/Prototypes/WorkoutLiveActivity/screenshots/revision-1/J1-island-compact-workout.png` |
| J2 | Dynamic Island compact — rest | `ios/Prototypes/WorkoutLiveActivity/screenshots/revision-1/J2-island-compact-rest.png` |
| J3 | Dynamic Island minimal — rest | `ios/Prototypes/WorkoutLiveActivity/screenshots/revision-1/J3-island-minimal-rest.png` |
| K | Dynamic Island expanded — post-final Completed + Up Next | `ios/Prototypes/WorkoutLiveActivity/screenshots/revision-1/K-island-expanded-post-final-completed-up-next.png` |

## Projection invariant

The prototype fixture now exposes a presentation `ContextPhase` and derived ordered `contextRoles`:

| Prototype context phase | Rendered roles |
|---|---|
| `normal` | `[previous, current]` |
| `finalSet` | `[current, upNext]` |
| `postFinalSet` | `[completed, upNext]` |
| `none` | `[]` |

Both Lock Screen and expanded Dynamic Island render from this semantic phase. The model-level test asserts the exact sequences for Stopwatch, Countdown, Rest Off, superset, final and post-final fixtures, asserts that final never contains Previous, and separately asserts every fixture stays at two rows or fewer.

The post-final Up Next row is the next exercise's first-set cue and is the visual completion target. When that exercise begins/progresses, the projection naturally returns to normal Previous + Current.

## Dynamic Island revision

- Expanded normal: Previous + Current.
- Expanded final: Current · Final + Up Next.
- Expanded post-final: Completed + Up Next.
- Expanded active rest: large lower-left rest clock with the same hierarchy as Lock Screen.
- Compact workout: workout glyph + elapsed only.
- Compact rest: workout glyph + rest status/time only.
- Minimal: unmistakable stopwatch treatment only.

Expanded contexts use explicit equal-width columns inside the 371 pt frame. Visual QA caught and corrected a first render where the longer final label could push context regions outside the frame.

## Claude projection reconciliation status

Claude's final TrainingSessionAuthority report is still **not published**. The final GitHub check found this latest candidate:

- branch: `claude/workout-logger-session-authority-foundation-20261001`
- SHA: `8398c076bce440cbb0d4cd385bbccef5943b35e8`
- commit: `feat(ios): projection encodes the two-row context rule`
- final report: absent

Read-only inspection of the candidate's `TrainingSessionLiveProjection` shows provisional semantic parity:

| Founder/prototype rule | Claude candidate `ContextLayout` |
|---|---|
| Previous + Current | `previousAndCurrent` |
| Current + Up Next | `currentAndUpNext` |
| Completed + Up Next | `completedAndUpNext` |

The candidate also derives `contextRows` capped at two and exposes row roles `previous`, `completed`, `current`, `upNext`. Its richer authority projection retains schema version, session revision, set/exercise identities, completion-target identity, phases, exercise progress and absolute rest timestamps. The prototype does not duplicate or alter that architecture; it uses synthetic presentation-only cues.

This is useful candidate parity, not final reconciliation. When Claude publishes the report, recheck phase mapping, paused/reviewing/finishing/complete presentation, redaction semantics and row completion-target behavior against the accepted exact SHA.

## Validation on exact revision candidate `cc57ddf1`

- `swift test --disable-sandbox --scratch-path /tmp/physiqueos-workout-live-build`: **PASS**, 10 tests / 1 suite.
- `swift build -c release --disable-sandbox --scratch-path /tmp/physiqueos-workout-live-release`: **PASS**.
- Revision PNG count: **13/13**.
- Generated screenshot outputs match the committed candidate: **PASS**.
- Exact Founder context-role sequences: **PASS**.
- Every fixture `<= 2` context rows: **PASS**.
- Complete Set `>= 44 pt`: **PASS**.
- Lock Screen `<= 160 pt`: **PASS**.
- Stopwatch/Countdown absolute-time projection: **PASS**.
- Privacy sentinel leak guard: **PASS**.
- Compact/minimal/expanded size checks: **PASS**.
- Shipping product-tree diff (`ios/PhysiqueOS`, Xcode project, scripts): **zero**.
- Visual QA: all required Lock Screen transitions, expanded normal/final/rest/post-final, compact and minimal inspected; expanded overflow finding corrected before commit.

The shipping app build/full Native suite were not run because no shipping source or project file changed. No Server test/deploy, signing change, App ID, entitlement, archive, TestFlight upload, production write, real `LiveActivityIntent`, workout mutation or HealthKit Sleep work occurred.

## Remaining visual decisions

The primary layout, row rule, final transition, post-final transition, large rest clock and trailing action no longer need selection. Remaining implementation-stage decisions are:

1. whether privacy redaction is a user preference or broader product/system policy;
2. whether the expanded Complete Set action passes locked-device authentication/usability testing on physical hardware;
3. final truncation behavior under real WidgetKit Dynamic Type and device widths.

## Explicit non-shipping status

This remains visual prototype material only. It must not be merged as a shipping Live Activity implementation. It creates no Widget Extension, ActivityKit lifecycle, interactive intent, authority mutation, signing capability, App ID, provisioning profile, release artifact or production change.

Two unrelated pre-existing local Sleep report files remain untracked and were intentionally not included.
