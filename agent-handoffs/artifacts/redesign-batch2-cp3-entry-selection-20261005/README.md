# Batch 2 · Checkpoint 3: Logger entry and exercise selection

Start with **`primary-mobile-review-board.png`**.

## Exact authority

| Item | Value |
|---|---|
| Implementation commit | `6d79f057385e9cf9a8258c6bb1868c9968d04fba` |
| Branch | `claude/redesign-batch2-log-logger-20261005`, on top of CP2 `0d59b45e` |
| Locked screens | L1, L2, L3 and L4 (`origin/codex/utility-surfaces-design` @ `ca088e80`, `utility-surfaces-design-20261004/screens/logger-l{1..4}*.png`) |

## Captures

- **How they were made:** `LoggerParityCaptureUITests.testCheckpoint3EntrySelection{Dark,MineralLight}` runs a real sandbox journey on a clean install:
  1. create one saved draft (Save & Leave);
  2. entry;
  3. Areas (Chest and Back);
  4. picker with 2 selected;
  5. search;
  6. All Exercises;
  7. Create New Exercise;
  8. Add Exercise mid-workout.
- **Cleanup:** the journey cancels and discards everything it created.
- **Possible-match candidate:** shown through a DEBUG-only seam (`-physiqueos.logger-review.candidate`). The collision check is Production/Server-only. The seam sets view-model presentation state only and never writes.

## Measured geometry (pt)

| Element | Locked | Simulator |
|---|---|---|
| Start Workout teal field | 85.7 | 85.7 |
| Saved workouts card | 160.7 (CSS math 162.1) | 162.0 |
| Log Past Workout card | 145.7 | 145.7 |
| Gaps between entry cards | 12.3 | 12.3 |
| Area chips | 53.7 | 53.7 |
| Chip gaps | 9.3 | 9.4 |
| Choose exercises button | 47.7 | 47.7 |
| Search field | 43.7 | 43.7 |
| Start logging bar button | 51.7 | 51.7 |
| Create form card | 348.7 | 354.0 (adds the canonical candidate message line) |

## Remaining differences, each explained

1. **System navigation bar.** Content sits lower, as in Checkpoint 2. On every step except the active workout, the canonical toolbar **Save & Leave** appears as an iOS 26 glass toolbar button.
2. **System controls.**
   - The past-workout date and the Training Area choice use the native compact DatePicker and the menu Picker, inside the locked 48 pt secondary frame.
   - The search keyboard is system-owned.
3. **Canonical copy (D3).**
   - "Start logging · 2 selected" (locked: "· 2 exercises").
   - The saved-draft detail is "Chest · 1 exercise" (locked: "· 4 completed sets").
   - The candidate action is "Use <name>" (locked: "Use existing exercise"), with the locked POSSIBLE MATCH eyebrow added.
   - The canonical Back / Back to Training Areas actions are kept as quiet secondary buttons. They are not drawn in the locked screens; canonical behavior wins.
4. **Suggested Today.** The sandbox fixture has no category suggestion, so the teal suggestion field (implemented with canonical label, reason and an accepted marker) appears only when the Server supplies one. It is not shown in these captures.
5. **Harness glyphs.** ▶ ▣ ⌕ ＋ › ● ○ ✓ become SF Symbols at the stand-ins' size and position.
6. **Glyph baselines.** They differ by up to about 1 pt (CoreText versus Chromium).

## Behavior safety

The change is presentation-only:
- the same view-model calls (`start`, `resume`, `discardSavedDraft`, `toggleArea`, `continueFromAreas`, picker toggles, create, `beginAddingExercises`);
- the same identifiers (`trainingLogger.start`, `.past`, `.resume.*`, `.discard.*`, `.area.*`, `.exercise.*`, `.exerciseSearch`, `.browseAll`, `.createNewExercise`, `.submitNewExercise`, `.startLogging`);
- the same accessibility labels.

The Log-tab routing tripwires are untouched.

The Log-root text-role change (negative leading for tight line heights, so the 28 pt Logger titles wrap) was re-verified on the accepted Log root, with geometry within 0.4 pt.

**Tests:**
- The Checkpoint 3 parity journeys passed in both appearances.
- The regression run (`TrainingAcceptanceUITests` on a clean install, `TrainingLoggerTests`, `AppTabTests`, `TrainingCatalogMyLibraryTests`) is reported in the overnight index.
