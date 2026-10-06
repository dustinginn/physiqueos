# Build 90 design round: Founder options ready for review

**Task:** `build90-founder-design-round-20261006`. The prompt is `agent-handoffs/inbox/prompts/20261006T193100Z-claude-build90-design-round.md`, at commit `2f1367ba`.

**Status:** options are ready for Founder selection. This is a report-only publication: `latest.json` and `latest.md` are unchanged, and Build 89 remains the release authority.

## Authority
| Item | Value |
|---|---|
| Base | Build 89 shipped source `51399425b683d6a6e36b5c91836290259e31a7e0` |
| Branch | `claude/native-build90-founder-design-round-20261006` (pushed) |
| Seams commit | `7d6e00ce` |
| Package commit (final) | `3d7c54abdde81b937974d68f4da7f3a40d08ce50` |
| Production Server | `b7eb1e39` / deployment `6fa4e887`, unchanged; read-only check, health live 200 |

## Review package
The package is `agent-handoffs/artifacts/build90-founder-design-round-20261006/` on the branch. Its `README.md` is the mobile-readable index; `IMPLEMENTATION-AUDIT.md` holds the technical findings.

| Board set | Boards |
|---|---|
| **B90-1** Logger rest stopwatch (issue #7) | 1a no rest, 1b active rest, 1c long scrolled, 1d Dark. Current plus A docked tile, B floating pill, C footer status line. |
| **B90-2** Guided iPhone → Watch handoff (issue #8) | 2a paired offer (with the current Build 89 card), 2b waiting, 2c acknowledged, 2d unreachable fallback, 2e Dark, 2f after the flow. A bottom sheet, B centered card, C docked panel. |
| **B90-3** Photo Briefing expanded viewer | 3a–3c Front Relaxed, Back Relaxed and Back Flexed (Mineral), 3d wider 1:1 frame, 3e–3f Dark. Current plus A captioned stage, B centered group, C framed panel. Safe synthetic photos only; the interpretation is the canonical persisted narrative. |
| **B90-4** Watch primary button placement | 4a Start Workout, Mineral, 49 mm and 42 mm. 4b Dark plus the shared impact on Idle and the orphan prompt. Current vs A centered vs B optical (42%). |

No winner was chosen.

## Key findings
- **Item 1.** The canonical rest authority (`draft.rest`, an absolute anchor) is complete and already feeds the Watch and the Live Activity. The phone Logger never rendered it. All options read it, gated like `TrainingSessionLiveProjection` (Build 83 Finish rule), and add no timer state.
- **Item 2, current protocol.** The handoff is pull-only:
  - Ready sets `readyForWatchAt` and clears the phone start;
  - the plan is published through application context;
  - the Watch shows Start Workout only when the app is opened.

  There is no `startWatchApp` call and no phone-side paired/reachable observation.
- **Item 2, what watchOS allows:**
  - `HKHealthStore.startWatchApp` is the only sanctioned launch path.
  - It is not guaranteed to foreground a locked, asleep, off-wrist or out-of-range Watch, so the fallback instruction is always shown.
  - The acknowledgment authority is the phone authority stamping `watchStartedAt`.
- **Item 2, pre-existing defect.** The Ready-card predicate does not exclude Watch-started sessions; re-tapping it would clear `startedAt`.
- **Item 2, separate Watch bug.** `didReceiveApplicationContext` drops the appearance slot.
- **Item 3.** The blank columns come from `BriefingPairedZoomView`, whose panes are full-height `scaleAspectFit` panes. The fitted stage removes them, and synchronized zoom/pan is unchanged.
- **Item 4.** The screen matches `WatchWorkoutStartView`. The shared `WatchPanelPage` also drives Idle and the orphan prompt. Only the position changes.
- **Server:** no Server change is needed for any item.
- **Items 1 and 2:** implement them together, as one lane with two commits.

## Founder decisions requested
1. One option each for B90-1, B90-2, B90-3 and B90-4.
2. **D-1a:** expose an End rest control on the phone, through the existing `endRest`? It is recommended only if one is wanted, and pause should stay on the Watch.
3. **D-2a:** should the handoff sheet dismiss on Watch readiness (needs a new `preparedPresented` command) or on Watch Start (`watchStartedAt`, no new protocol)?

## Validation
- **Release build:** the Release generic iOS build (unsigned, embeds the Watch app) succeeds.
- **Seam-string scan:**
  - 0 hits in the Release iPhone binary and both Release Watch binaries;
  - positive control: 8 hits in the Debug iPhone dylib and 1 in the Debug Watch dylib.
- **Unit tests:**
  - focused iOS: 326/0 (Briefing V3, Build 83 finish lifecycle, Photo Briefing, Photo inspection, Training Logger, rest preference, session authority, live projection);
  - Watch: 57/0.
- **Capture UI tests:** `Build90DesignRoundCaptureUITests` 14/14.
- **Other checks:** `git diff --check` is clean; no project or generator change.
- **Remote verification after the push:**
  - all 126 capture and source blob hashes match the local files;
  - README, audit and all 18 boards return HTTP 200 as GitHub pages and as raw downloads with full byte sizes.
- **Simulators:** dedicated lane simulators only; shared simulators were not shut down or erased.

## Not done (by design)
No production implementation, no Build 90 bump, no TestFlight upload, no Server deploy, no production mutation.

## Next
After the Founder selects, a separate implementation task:
- makes the selections production behavior;
- removes the unchosen options and the seams;
- adds the tests listed in the audit;
- runs the full regressions.
