# Batch 3 → final release: exact multi-lane integration map

**Status:** nothing merged. This map was produced with `git merge-tree --write-tree`, plus one resolved preview tree that was built and tested locally and never pushed.

## Lanes

All lanes branch from Build 87 `f66c7fc6`.

| Lane | Native authority | Notes |
|---|---|---|
| Batch 3 Evidence (this lane) | `claude/redesign-batch3-evidence-takeover-20261005` @ **`44609af1`** (code) | A–E; the base is inherited `49e48f1e` (Home parity) |
| Clean Batch 2 RC | `793462b1` = tip of `origin/claude/redesign-batch2-log-logger-20261005` | Includes L13 Workout Match `79a1a33d` and `b1488c2e` (`home.latestBriefing`) |
| Founder-approved Batch 2 Workout Match branch | L13 `79a1a33d`; `EvidenceReviewDetailView.swift` is unchanged from `79a1a33d` through `793462b1` and `70ebf753` | The only file it touches that Batch 3 also touches is `EvidenceReviewDetailView.swift` |
| Workout reliability Native | `e9f8a957` | **Not modified.** Production Server `b7eb1e39` (deployment `6fa4e887`) |
| Integration preview | `70ebf753` = tip of `origin/claude/workout-reliability-on-batch2-preview-20261005` | `793462b1` + `e9f8a957` (both are ancestors) |

## Merge results

| Merge | Conflicts | Auto-merged shared files |
|---|---|---|
| Batch 3 × `793462b1` | **1**: `ios/PhysiqueOS/Presentation/Home/HomeJourneyFieldView.swift` | `EvidenceReviewDetailView.swift`, `ProductionDailyDriverAPI.swift`, `HomeView.swift`, `FounderServerAPITests.swift`, `FoamRollingPriorityDetailUITests.swift` |
| Batch 3 × `e9f8a957` | **0** | `ProductionDailyDriverAPI.swift`, `FounderServerAPITests.swift` (via the inherited Home commit only) |
| Batch 3 × `70ebf753` | **1**: the same `HomeJourneyFieldView.swift` | The same five files as × `793462b1` |
| Batch 3 × L13 `79a1a33d` (Workout Match) | **0** (whole tree; merge-tree `cf34c5dd`) | `EvidenceReviewDetailView.swift` auto-merged (see below) |

Shared files that are byte-identical on both sides (Home parity package, `HomeReadModel.swift`, `HomeReadModelTests.swift`, `HomeRedesignReviewFixture.json`) merge trivially.

## The one conflict: `HomeJourneyFieldView.swift`

Neither side's Batch 3 work touches this file. The conflict comes from Home parity history only:

| Blob | Commits |
|---|---|
| `9000d997` | Base `f66c7fc6` and `e9f8a957` |
| `f1b8335e` | Batch 3, which inherits `49e48f1e`; byte-identical to Batch 2's `49733300` |
| `95cb0848` | `793462b1` and `70ebf753` = `49733300` **+ `b1488c2e`**, which restores `HomeBriefingAccessibility` / `home.latestBriefing` on the Home briefing strip |

Both sides wrote the same parity edit. Git sees conflicting hunks only because `49e48f1e` and `49733300` are different commits.

**Resolution:** take the release side verbatim:

```
git checkout 70ebf753 -- ios/PhysiqueOS/Presentation/Home/HomeJourneyFieldView.swift
```

When merging onto `793462b1` instead, take `793462b1`'s copy; it is the same blob `95cb0848`. This keeps `b1488c2e`, and that also fixes the `TrainingAcceptanceUITests.testBriefingParityJourneys` failure the Batch 3 branch inherits (classified below).

## Auto-merged shared file that matters: `EvidenceReviewDetailView.swift`

- **Batch 2 (`79a1a33d`, L13):**
  - inside the Build 87 `ScrollView` body, adds `case .loaded(.some(review)) where review.workoutReconciliation != nil: workoutMatchContent(review)`;
  - adds the redesign canvas and toolbar background for Workout Match.
- **Batch 3 (E):**
  - the top-level `presentation` routes `EvidenceReviewPresentationRoute(state:)`;
  - `.workoutMatch`, meaning `workoutReconciliation != nil` (identical predicate), goes to `workoutMatchScroll`, which is the **unchanged** Build 87 `ScrollView`/toolbar;
  - every other review goes to `genericWorkflowBody`;
  - Batch 3 appends its generic code after the type.

The textual merge therefore nests Batch 2's L13 inside Batch 3's Workout Match route. This preserves the Founder-approved L13 byte for byte; Batch 3 never restyles it.

## Resolved preview tree `41ba03dd`

This is local proof, not pushed and not a commit. It contains Batch 3 at `ce9dd214` merged with `70ebf753`, with the resolution above.

- **Conflict markers:** none.
- **Generator:** `generate_project.py` reproduces `project.pbxproj` byte for byte.
- **Build:** Debug simulator build succeeded.
- **`EvidenceReviewHeaderDateTests`:** 13/13 passed; covers routing, occurrence date and the correction-field order.
- **Batch 2 `LoggerParityCaptureUITests.testCheckpoint5WorkoutMatchDark`:** passed (L13 intact).
- **Batch 3 `EvidenceIntakeReviewUITests`:** `testWorkoutMatchKeepsItsOwnBranchWhileGenericUsesTheWorkflow` and `testGenericReviewPresentationActionsAndCorrection` passed.
- **Screenshots:** `generic-vs-workout-match-routing.png`, lower rows. A workout reconciliation renders Batch 2 L13 and a mixed review renders the Batch 3 generic workflow, in both Dark and Mineral Light.

## Workout reliability lane

Batch 3 changes **no** file that `e9f8a957` changes, apart from the two Home-parity files that Batch 3 inherited byte-equal from Batch 2's `49733300`. Those merge cleanly. Nothing in the workout reliability lane, its Server `b7eb1e39` or deployment `6fa4e887` was touched.

## Suggested final order (not performed)

1. Start from `70ebf753`, or from `793462b1` followed by the workout lane.
2. Merge the Batch 3 branch.
3. Resolve `HomeJourneyFieldView.swift` with the release side as shown above.
4. Run `python3 ios/scripts/generate_project.py` and confirm no diff.
5. Run gates and bump the build only after the Founder authorizes the release.
