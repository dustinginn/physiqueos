# Workout Logger Live Activities — NON-SHIPPING visual prototype

- Generated: 2026-10-01T16:10:09Z
- Status: **COMPLETE visual prototype; NON-SHIPPING; architecture reconciliation pending**
- Repository: `dustinginn/physiqueos`
- Branch: `codex/workout-live-activities-visual-prototype-20261001`
- Prototype candidate: `9dfdd2b76a5b860575a17e7f1e2feb14c62d5226`
- Exact base: `77681cd79c8a818dd128766d9c69121f03f9a5e3` (`claude/sleep-evidence-integrated-native-20261001`, accepted Build 75 integrated Native)
- Prompt: `agent-handoffs/inbox/prompts/20261001T161500Z-workout-live-activities-visual-prototype.md`

## Outcome

A standalone, deterministic SwiftUI renderer now produces 21 high-fidelity visual-review PNGs covering the Lock Screen and Dynamic Island compact, minimal and expanded presentations. The fixture set covers Stopwatch, Countdown, Rest Off, Previous + Current, final-set + Up Next, post-final-set Completed + Up Next, supersets, timed and bodyweight sets, all-sets-complete, saving, completed, privacy-redacted, stale-safe and long-content pressure states.

The prototype is deliberately isolated under:

`ios/Prototypes/WorkoutLiveActivity/`

It does not compile into PhysiqueOS and does not import ActivityKit, create a Widget Extension, register an App ID, alter signing, read production data, perform workout mutations, touch Server, touch HealthKit Sleep, upload TestFlight or modify any shipping target.

## Implementation method

The prototype is a standalone macOS Swift Package using SwiftUI, SF/system fonts and SF Symbols. `ImageRenderer` produces deterministic 2× PNGs from synthetic absolute-time fixtures. This avoided a Widget Extension, provisioning and Apple account changes while retaining native SwiftUI typography and layout behavior.

Key files:

- `ios/Prototypes/WorkoutLiveActivity/Package.swift`
- `ios/Prototypes/WorkoutLiveActivity/Sources/WorkoutLiveActivityPrototype/PrototypeModel.swift`
- `ios/Prototypes/WorkoutLiveActivity/Sources/WorkoutLiveActivityPrototype/PrototypeViews.swift`
- `ios/Prototypes/WorkoutLiveActivity/Sources/WorkoutLiveActivityRender/main.swift`
- `ios/Prototypes/WorkoutLiveActivity/Tests/WorkoutLiveActivityPrototypeTests/PrototypeTests.swift`
- `ios/Prototypes/WorkoutLiveActivity/README.md`

No real interaction executes. The Complete Set button, tap-to-open Logger copy and state-transition sequence are visual demonstrations only.

## Founder-review screenshot set

All screenshots contain synthetic values only.

| # | Review state | Path |
|---:|---|---|
| 1 | Lock Screen — normal Stopwatch | `ios/Prototypes/WorkoutLiveActivity/screenshots/01-lock-normal-stopwatch.png` |
| 2 | Lock Screen — Countdown | `ios/Prototypes/WorkoutLiveActivity/screenshots/02-lock-countdown.png` |
| 3 | Lock Screen — Rest Off | `ios/Prototypes/WorkoutLiveActivity/screenshots/03-lock-rest-off.png` |
| 4 | Lock Screen — final set + compact Up Next | `ios/Prototypes/WorkoutLiveActivity/screenshots/04-lock-final-set-up-next.png` |
| 5 | Lock Screen — post-final Completed + Up Next | `ios/Prototypes/WorkoutLiveActivity/screenshots/05-lock-post-final-completed-up-next.png` |
| 6 | Lock Screen — superset | `ios/Prototypes/WorkoutLiveActivity/screenshots/06-lock-superset.png` |
| 7 | Lock Screen — timed set | `ios/Prototypes/WorkoutLiveActivity/screenshots/07-lock-timed-set.png` |
| 8 | Lock Screen — bodyweight set | `ios/Prototypes/WorkoutLiveActivity/screenshots/08-lock-bodyweight-set.png` |
| 9 | Lock Screen — all sets complete / finish when ready | `ios/Prototypes/WorkoutLiveActivity/screenshots/09-lock-all-sets-complete.png` |
| 10 | Lock Screen — saving | `ios/Prototypes/WorkoutLiveActivity/screenshots/10-lock-saving.png` |
| 11 | Lock Screen — saved/completed | `ios/Prototypes/WorkoutLiveActivity/screenshots/11-lock-completed.png` |
| 12 | Lock Screen — privacy redacted | `ios/Prototypes/WorkoutLiveActivity/screenshots/12-lock-privacy-redacted.png` |
| 13 | Lock Screen — stale/error-safe | `ios/Prototypes/WorkoutLiveActivity/screenshots/13-lock-stale-safe.png` |
| 14 | Lock Screen — long-name/value pressure | `ios/Prototypes/WorkoutLiveActivity/screenshots/14-lock-long-content-pressure.png` |
| 15 | Dynamic Island — compact workout | `ios/Prototypes/WorkoutLiveActivity/screenshots/15-island-compact-workout.png` |
| 16 | Dynamic Island — compact rest | `ios/Prototypes/WorkoutLiveActivity/screenshots/16-island-compact-rest.png` |
| 17 | Dynamic Island — minimal rest indicator | `ios/Prototypes/WorkoutLiveActivity/screenshots/17-island-minimal.png` |
| 18 | Dynamic Island — expanded normal | `ios/Prototypes/WorkoutLiveActivity/screenshots/18-island-expanded-normal.png` |
| 19 | Dynamic Island — expanded rest/final-set | `ios/Prototypes/WorkoutLiveActivity/screenshots/19-island-expanded-rest-final.png` |
| 20 | Lock Screen density comparison | `ios/Prototypes/WorkoutLiveActivity/screenshots/20-lock-density-alternatives.png` |
| 21 | Complete Set placement comparison | `ios/Prototypes/WorkoutLiveActivity/screenshots/21-complete-set-placement-alternatives.png` |

## Fixture projection

The prototype-only `WorkoutActivityFixture` contains:

- `sessionId`
- `sessionLabel`
- `startedAt`
- deterministic `referenceDate` for screenshots
- `phase`: active, all sets complete, saving, completed or stale
- `previousCompletedSet`
- `currentSet`
- `currentExercise`
- `isFinalSetOfExercise`
- `nextExerciseFirstSet`
- completed/total set progress
- `restMode`: Stopwatch, Countdown or Off
- `restStartedAt`
- `restEndsAt`
- completion state
- privacy mode

Set context supports weighted, timed and bodyweight targets plus superset member/partner context. This is a provisional presentation fixture, not workout authority and not a request for Claude's architecture to match it.

## Lock Screen hierarchy and density finding

The card is fixed at 365 × 160 pt, inside the discovery report's 393-wide-device guidance.

Normal hierarchy:

1. compact session/progress/workout-elapsed header;
2. Previous row;
3. Current row;
4. dominant rest timer when active, otherwise workout elapsed context;
5. 44 pt Complete Set action.

Transition rules explored in screenshot 20:

- normal: Previous + Current;
- final current set: Previous + Current plus one compact Up Next cue, not a third full row;
- immediately after final completion: Completed + Up Next;
- all programmed sets complete: a dedicated Finish when ready state, with no Finish/Cancel beside Complete Set.

Finding: three full context rows are too dense. The compact Up Next cue preserves the final-set transition while keeping the ordinary two-row mental model. The post-final state reads most clearly as Completed + Up Next.

## Complete Set placement

Screenshot 21 compares:

1. **Recommended: trailing 44 pt action.** It keeps Stopwatch/Countdown visually dominant, preserves Previous + Current and remains visibly intentional without occupying the full card width.
2. **Alternative: full-width bottom action.** It is unmistakable but must remove the Previous row to stay within 160 pt, weakening the Founder-preferred normal context.

Compact and minimal Dynamic Island presentations contain no tiny buttons. Expanded uses one 44 pt Complete Set action, subject to final ActivityKit and locked-device validation. No destructive action is adjacent. There are no rep/load +/- controls.

Tapping the surrounding activity is represented as returning to Workout Logger; the real implementation should use the supported Live Activity deep-link/open behavior after architecture acceptance.

## Stopwatch, Countdown and Rest Off

- Stopwatch uses absolute `restStartedAt`; synthetic state renders `REST · STOPWATCH 1:47` counting conceptually upward.
- Countdown uses absolute `restEndsAt`; synthetic state renders `REST · REMAINING 1:13` conceptually downward.
- Rest Off contains no blank rest placeholder; workout elapsed/progress occupy that hierarchy slot.
- Completing the visual final-set sequence resets the synthetic Stopwatch from 1:32 to 0:12 in the post-final screenshot.
- The fixture performs no per-second mutation or persistence.

The static renderer calculates timer strings at a deterministic reference date. A shipping ActivityKit view should use system timer rendering from the accepted projection's absolute dates rather than app-driven one-second updates.

## Dynamic Island hierarchy

- Compact workout: unmistakable dumbbell indicator + workout elapsed.
- Compact rest: dumbbell indicator + green status dot and rest time; rest dominates the trailing region.
- Minimal: stopwatch glyph plus a non-color-only circular rest treatment; no set text or action.
- Expanded normal: Previous + Current, workout elapsed, rest Stopwatch and Complete Set.
- Expanded final: Final + Up Next, workout elapsed, rest Stopwatch and Complete Set.

Expanded header content stays out of the sensor zone. The mockups use a 371 pt expanded width and 156 pt height. Compact/minimal heights stay at or below 36.67 pt.

## Accessibility and privacy

- Complete Set is at least 44 pt in every action layout.
- Accessibility labels/hints describe the activity and Complete Set semantics conceptually.
- Timer digits are monospaced.
- Set roles are written labels; meaning never relies on color alone.
- Long exercise/target fixture exercises single-line pressure, scaling and truncation without breaking the 160 pt card.
- The privacy branch renders generic `Workout`, progress, elapsed/rest and `Set details hidden`; it never routes session, exercise, load or rep strings into the visible text inventory.
- A unit test injects obvious private sentinel strings and proves they are absent from the privacy-visible text projection.
- System fonts/SF Symbols are used; no custom font is bundled.

Dynamic Type and VoiceOver behavior need final validation in a real WidgetKit preview/Simulator and on device. The spatial pressure fixture is evidence for truncation behavior, not a substitute for those tests.

## Platform limitations

These are native SwiftUI spatial mockups, not `ActivityConfiguration` previews. Therefore they do not prove:

- exact system Lock Screen or Dynamic Island chrome;
- ActivityKit payload decoding;
- system timer animation;
- Always-On, StandBy, Apple Watch, CarPlay or Mac presentation;
- locked-device `LiveActivityIntent` authentication behavior;
- deep-link routing;
- real interactive button execution.

Final implementation must be rendered in WidgetKit previews and on an iPhone Pro Simulator; privacy, Always-On and locked-device action behavior require physical-device proof. This task intentionally did not create the extension needed for those checks.

## Claude projection reconciliation

Final reconciliation is **pending**.

At the final GitHub refresh, Claude's only published authority branch state was:

- branch: `claude/workout-logger-session-authority-foundation-20261001`
- SHA: `1ecc251b631ee25aaa620e4798062292ecec3558`
- commit label: `wip(ios): TrainingSessionAuthority foundation (uncompiled checkpoint)`
- report: not published

Because that checkpoint explicitly says it is uncompiled and is not a final report, this prototype does not treat its types as accepted architecture and does not modify them. Once Claude publishes the final report, reconcile field-for-field for identity, phases, previous/current/next cue shape, progress, rest mode/timestamps, completion state and any version/idempotency metadata. Adapt only this prototype fixture or future presentation adapter; do not change Claude's authority to fit the mockup.

## Validation on exact candidate `9dfdd2b7`

- `swift test --disable-sandbox --scratch-path /tmp/physiqueos-workout-live-build`: **PASS**, 9 tests / 1 suite.
- `swift build -c release --disable-sandbox --scratch-path /tmp/physiqueos-workout-live-release`: **PASS**. The first restricted-sandbox attempt reached dSYM generation and failed with `Operation not permitted`; the same command completed outside the restricted sandbox.
- Renderer: **PASS**, 21/21 PNGs produced.
- Generated screenshot files match the committed candidate: **PASS**.
- Lock Screen height contract `<= 160 pt`: **PASS**.
- Context rows `<= 2`: **PASS**.
- Complete Set target `>= 44 pt`: **PASS**.
- Stopwatch/Countdown/Off fixture semantics: **PASS**.
- Timed/bodyweight/superset/final/post-final fixture semantics: **PASS**.
- Privacy sentinel leak test: **PASS**.
- Compact/minimal/expanded reference dimensions: **PASS**.
- Product-tree diff for `ios/PhysiqueOS`, `ios/PhysiqueOS.xcodeproj`, and `ios/Scripts`: **zero**.
- Visual QA inspected normal Stopwatch, final transition, post-final transition, privacy, long-content, compact, minimal, expanded, density comparison and Complete Set placement; wrapping/clipping findings were corrected before the candidate commit.

The full shipping Native unit suite and shipping app build were not run because the candidate changes no shipping target or project file. No Server tests, deploy, archive, TestFlight upload or production check was performed or required.

## Founder visual decisions requested

1. Accept the recommended trailing Complete Set action, or prefer the more dominant full-width version that drops Previous context?
2. Accept final-set Previous + Current + compact Up Next, or simplify further to Current + Up Next?
3. Accept post-final Completed + Up Next as the transition state?
4. Accept Stopwatch as the visually dominant rest treatment and Countdown as the amber remaining-time variant?
5. Should privacy redaction be a user preference for all Lock Screen presentations, or follow a separate system/product policy?
6. Subject to real-device validation, should expanded Dynamic Island include Complete Set on Day 1?

## Explicit non-shipping status

This branch is review material only. Do not merge it as shipping Live Activity implementation. It creates no ActivityKit authority, mutation path, extension/App ID, entitlement, provisioning profile, release build number, TestFlight artifact or production change. The safe next step is Founder visual selection plus reconciliation against Claude's accepted final TrainingSessionAuthority projection, followed by a separate shipping implementation task.

Two unrelated pre-existing local Sleep report files remain untracked in this worktree and were intentionally not included.
