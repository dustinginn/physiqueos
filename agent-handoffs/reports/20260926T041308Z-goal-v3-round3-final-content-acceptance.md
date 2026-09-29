# Active Goal V3 — Round 3 final content: display-only Confidence (STOP for Founder)

Generated: 2026-09-26T04:13:08Z
Task id: `claude-active-goal-v3-round3-final-content-20260925` (prompt `agent-handoffs/inbox/prompts/20260925T231500Z-claude-active-goal-v3-round3-final-content.md`)
Final content gate: `agent-handoffs/reports/20260926T041308Z-goal-v3-round3-final-content-preview.md`
Prior rounds: `20260926T035810Z-goal-v3-round2-candidates-acceptance.md`, `20260926T031806Z-goal-v3-candidates-acceptance.md`.
Lane pointer: `agent-handoffs/goal-v3/latest.json` only.

## Candidates

| | SHA | Branch | Note |
|---|---|---|---|
| Server | `2a23eee762472081815d9122b97c0f0a9f1b8969` | `claude/active-goal-v3-server-20260925` | **Unchanged from round 2** (worktree clean, `git diff 2a23eee7 HEAD` empty); round-2 validation stands |
| Native | `efcb8574d38d7462c3e2ccb0fd0e04ccb936517d` | `claude/active-goal-v3-current-state-coaching-20260925` | round-2 `fb4df07d` + `2a165d68` + `efcb8574`; clean descendant of `c15f0881` |

Production unchanged: Server `09f04dc5`, deployment `e979ee19`; `combined-app-platform-cutover` = `09f04dc5`. Installed Native Build 60 `00321dcc` unchanged.

## Round-3 change (Native only)

On the current-state active Goal, the Confidence block is display-only:

- **Visible content:** "79% · Moderate" with the V3 goal thesis beneath it. Provenance comes from publisher metadata: "As of the Sep 23 Midweek Briefing".
- **Interaction removed:** there is no chevron, tap target or `.isButton` trait, and no Confidence detail sheet can be reached.
- **VoiceOver:** reads one static element made of score, band, thesis and provenance, with clean punctuation. When the band is missing it still reads correctly.
- **Detailed evidence:** the Confidence V3 evidence (supports/limits/could-raise/could-lower/assumptions) stays in the Server contract untouched. This is a presentation decision, not data deletion. None of it is presented on the Goal page, and nothing moved onto the primary page. "49 days left" appears nowhere.

What stays unchanged:
- The legacy layout (payloads without `currentState`) keeps its existing hero tap and sheet.
- `ConfidenceDetailSheet.swift` is byte-identical to `c15f0881`, so Home's sheet is unchanged.
- The completed Goal page is untouched.
- The `c15f0881..efcb8574` diff touches only `GoalsReadModel.swift`, `ProductionDailyDriverAPI.swift`, `GoalDetailView.swift` and `FounderServerAPITests.swift`. There are no Home, Log, HealthKit, Cardio, Performance or local-day files in it.
- Round-2 architecture and copy are unchanged: section order with Coach's Take last, primary-page dedupe, and the Body Composition, Guardrail, Training and Turning-point content.

## Tests

- New and updated `ActiveGoalCurrentStateTests`:
  - The hero Confidence is a display value (score, band, thesis, provenance, static spoken label), with no double period and correct output without a band.
  - A whole-page scan confirms no Confidence detail item or "days left" appears in any string the current-state page renders.
  - A source-structure guard checks the current-state sections and the confidence block. They contain no `onTapGesture`, `chevron`, `.isButton`, `.sheet(`, `ConfidenceDetailSheet`, `Button`, `NavigationLink`, gesture, `accessibilityAction` or `contentShape`. The block must carry `.isStaticText` and the static label. The legacy layout must keep its sheet and its hero tap.
  - **Mutation-checked:** reintroducing `.onTapGesture { }` on the block makes the guard fail. The file was then restored byte-identical.
- Existing tests still pass:
  - section order with Coach's Take last;
  - dedupe (the table owns the change; progress shows share + remaining; the pill shows reading + status);
  - per-block lenient decode;
  - schema gate;
  - production-shaped decode.
- Full `PhysiqueOSTests` on the existing iPhone 17 Pro simulator: **1421 tests, 0 failures**, on the exact final content. There are no new warnings. The UI-test target was not run (disk reserve 17 GiB, below the 20 GiB preferred).
- Server: not rerun, because it is byte-identical to `2a23eee7`. Round-2 results cite: full suite of 9206 tests with the same failure set as baseline (306 environmental) and 0 new failures; production webpack on the exact SHA passed; fresh-context review approved.

## Fresh-context review

The Native review of `2a165d68` found nothing blocking. Its low findings are all fixed in `efcb8574`:
- a double period in the spoken label;
- the label when the band is missing;
- gaps in the source guard;
- an unread `isInteractive` constant;
- a detail-leak test that only scanned the hero;
- dead code.

One item is left informational: a sheet flag could linger across a mid-session legacy-to-currentState payload switch. This is effectively unreachable.

## Production-shaped acceptance (read-only)

- Probe run at 2026-09-26T04:09:54Z: `REPEATABLE READ READ ONLY`, rollback verified, empty stderr.
- The `currentState` is identical to round 2.
- Performance over 6 interleaved rounds: candidate median 455 ms, max 1.56 s; baseline median 346 ms, max 730 ms. Both are within the 3 s ceiling.
- Completed Visible Abs digest `4a3430ff1ff5a17e` is identical for baseline and candidate.
- Production mutated: **NO**.

## Recommended release order (after Founder content acceptance)

1. Deploy Server `2a23eee7` first. It is Build 60 compatible and carries the shared intake-completeness engine fix for the next briefings.
2. Then cut Build 61 from Native `efcb8574`, after the prospective Cardio acceptance. It contains the `c15f0881` Performance Phase 2 and local-day correctness work.

## Flags

ROUND3_FINAL_CONTENT_PASS: YES · CONFIDENCE_DISPLAY_ONLY: YES · CONFIDENCE_DETAIL_REMOVED: YES (presentation; contract retained) · CONFIDENCE_PROVENANCE_VISIBLE: YES · PRIMARY_PAGE_DEDUP_PASS: YES · COACHS_TAKE_LAST: YES · LATEST_COACHS_TAKE_VERBATIM: YES · FUTURE_BRIEFING_ENGINE_FIX_PRESERVED: YES · HISTORICAL_BRIEFINGS_UNCHANGED: YES · ROUND2_CURRENT_STATE_CONTENT_PRESERVED: YES · COMPLETED_GOAL_UNCHANGED: YES · PERFORMANCE_NATIVE_C15F0881_PRESERVED: YES · HEALTHKIT_PROSPECTIVE_CARDIO_PATH_UNCHANGED: YES · NATIVE_TESTS_PASS: YES · SERVER_UNCHANGED_OR_VALIDATED: UNCHANGED (2a23eee7) · FRESH_CONTEXT_REVIEWED: YES · SERVER_DEPLOYED: NO · TESTFLIGHT_UPLOADED: NO · PRODUCTION_MUTATED: NO · GH_REPORT_PUBLISHED: YES

**STOP — awaiting Founder final content acceptance and release authorization.**
