# Active Goal V3 — code-level diagnostic checkpoint (BLOCKED on production-read authorization)

Generated: 2026-09-26T02:40:12Z
Task id: `claude-active-goal-v3-current-state-coaching-20260925`
Prompt: `agent-handoffs/inbox/prompts/20260925T213000Z-claude-active-goal-v3-current-state-coaching.md` (main `d4bb8199`)
Agent: Claude (Active Goal V3 lane; lane pointer `agent-handoffs/goal-v3/latest.json`)
Status: **BLOCKED — awaiting Founder chat authorization for read-only production probes.** Code-level diagnosis complete. No product code changed. No production read executed. No production mutation.

This is a secondary-lane report. `agent-handoffs/latest.json`, `performance/latest.json`, `training-localday/latest.json` and Midweek pointers are NOT updated.

## Authority reverified (live, read-only metadata only)

- Production Server `09f04dc54eb26bfccdd2aeb34b156d8fc7d3f80e`, deployment `e979ee19-44f3-4c7a-ab2b-3c6e4f773349` ACTIVE, web + worker `source_commit_hash` exact, `/api/v1/health/live` buildId `physiqueos-09f04dc5-20260925`.
- Native installed: Build 60 `00321dcc` (unchanged). Future Native candidate `c15f0881` (unreleased, Performance Phase 2 + local-day) unchanged.
- Server `09f04dc5` and Native `c15f0881` are divergent histories (neither is an ancestor of the other). Server and Native candidates will therefore be separate SHAs; Native work will be a descendant of `c15f0881`.
- Worktrees created (clean, no commits yet):
  - Server: `/private/tmp/physiqueos-active-goal-v3-server`, branch `claude/active-goal-v3-server-20260925` @ `09f04dc5`.
  - Native: `/private/tmp/physiqueos-active-goal-v3-current-state-coaching`, branch `claude/active-goal-v3-current-state-coaching-20260925` @ `c15f0881`.
- Disk at start: 20 GiB free (above the 15 GiB floor; at the 20 GiB preferred reserve). No disk-intensive work performed.

## Why blocked

The session runs under the auto-mode permission classifier, which cannot see the GitHub inbox prompt. It denied bundling the zero-write production forensic probe (REPEATABLE READ READ ONLY + ROLLBACK + success marker; drafted, never bundled, never run). After that denial it also denied ordinary local source-file reads as "[Production Reads]". Per standing rules the agent did not work around the block.

**Unblock:** a plain chat sentence from the Founder authorizing, for this task: read-only zero-write production console probes (forensics and acceptance), local source reading/editing/testing/builds in the goal-v3 worktrees, pushing its non-deploy branches, and publishing its reports under `agent-handoffs/`. Deploy, TestFlight and production writes remain NOT authorized.

## Live path (code-proven)

`GET /api/v1/native/read/active-goal` → `NativeProductionContractService.read` (`case "active-goal"`) → `ActiveGoalReadService.getPreview` → `PostgresActiveGoalReadStore.load` → `composePhaseAwareActiveGoalPreview` (`src/domain/services/PhaseAwareActiveGoalPreviewService.js`) → envelope → Native `ProductionGoalsAPI.fetchGoalDetail` → `ActivePayload.model` → `GoalDetailView.ActiveGoalDetailContent`.

## Root causes proven from code (production values still to be confirmed by the probe)

1. **Aug 15 arithmetic ("148.3 lb lean mass, +5.8 lb from goal baseline").** The `phase_transition` turning point combines the phase-start scan's lean mass (`metricValue`, the Aug 15 scan) with `trajectory.goalProgress.changeValue`, which is the *latest* DEXA minus the baseline. Two different scans are merged in one sentence. The correct Aug 15 delta is phase-start lean mass minus baseline lean mass (148.3 − 147.5 = +0.8 in the repository's own test fixtures). The 5.8 lb / 58% figure is the latest-minus-baseline delta and is expected to reconcile to the Sep 12 scan (probe required).
2. **No current/latest DEXA in the payload.** `evidence` carries only `goalBaseline` and `phaseStart`. Native renders `goalBaseline ?? phaseStart` under a hard-coded "Goal baseline DEXA" label, so Jul 18 appears to be the only composition state. The guardrail observation uses `(phaseStart ?? baseline).bodyFatPercentage` and never the latest scan.
3. **No DEXA authority filter on the active Goal.** `PostgresActiveGoalReadStore` lists `dexaScans` with no lifecycle/supersession filter, and `resolveDexaOutcomeProgress` has none either. The Progress read stores use `selectValidDexaScans`, and the V3 adapter uses an `isActive` supersession filter.
4. **Confidence explanation.** For V3 assessments `buildConfidenceExplanationModel` returns null. The Goal `summary` therefore falls back to the stored `assessment.narrativeExplanation.text`. That text is the publishing briefing's movement-relative confidence body ("Confidence holds … one update …"), wording already retired from current engine composition. The V3 goal-context fields (`narrativePresentationV3.whyConfidence` and the rich what-supports/what-holds-back detail) are computed in `ActiveGoalConfidencePresentationReadService` and then dropped: `nativeConfidencePresentation` never copies them. The 79% / Moderate score and band are canonical; only the explanation field is wrong. This is a Goal consumption defect, not a V3 engine defect.
5. **Fictional review / boilerplate copy.**
   - "Evidence keeps accumulating toward the next review…" and "Weekly evidence monitors intake, activity, training…" are hard-coded in `currentPhaseNarrative` on the Server.
   - "Goal review comes next" is a hard-coded Native card; the Web screen has a matching fallback.
   - "Server-derived" is hard-coded in the Native mapper.
6. **Training Progress is not training progress.** `createGoalTrainingProgress` runs only when the phase has a `calculatedPlannedReviewDate`, and the terminal Lean Mass Build phase has none, so it returns null. Native never decodes `trainingProgress` anyway; it shows `currentPhase.evidence` boilerplate instead.
7. **Turning points are frozen by construction.** The list is fixed: baseline, activation, phase transition, a fictional `planned_review`, a future `goal_destination`, and a review-bound training checkpoint. No later DEXA (e.g. Sep 12) can ever qualify.
8. **Current Strategy grid.** The Server hard-codes the label list (Energy, Nutrition, Activity, Training, Coaching Updates, Peptide, Supplement). Native drops the summaries, so every tile reads "Goal support". Review Strategy / Review Protocols are Native buttons.
9. **Coach's Take is absent from the Goal payload.** Canonical V3 Coach's Take is uniform across briefing families: `narrativeV3.coachTake` plus `sections.action` and `sections.watch`. Midweek serves these through `presentationContract.coaching`, with dedupe suppression.

## Engine finding relevant to the guardrail

The V3 engine adapts the "approximately 8–9% body fat" guardrail as a symmetric `allowed_range` with these severity bands: any deviation outside the range = watch, ≥0.5 pt = pressured, ≥1.5 pt = breached. The consequence policy is confidenceImpact −1, recommendation constraint `monitor`. The Goal guardrail interpretation must follow this evaluator and policy; the Goal page must not substitute new "below range is fine" prose.

## Planned architecture (not yet implemented)

**Server.** Add a new `currentState` block (`active_goal_current_state_v1`) to the active-goal payload. Legacy keys are kept so Build 60 still decodes.
- **composition:** authoritative DEXA only.
  - Baseline = the last valid scan on or before the journey start.
  - Current = the latest valid scan.
  - Explicit change between the two; baseline and current are never conflated.
- **progress:** target / achieved / remaining / percent, deterministic.
- **guardrail:**
  - Measurement from the latest DEXA.
  - Status from the V3 evaluator.
  - Interpretation from the consequence policy.
- **phase:** includes cadence only when useful.
- **confidence:**
  - V3 `whyConfidence` plus the rich detail.
  - Publisher provenance.
  - No fallback to legacy text when a valid V3 assessment exists.
- **training:** progress to date from structured Training evidence, with server-owned interpretation.
- **turningPoints:** selective — baseline, activation if distinct, phase transitions with the correct delta, and materially goal-changing later DEXAs.
- **coachTake:** from the latest published V3-bound briefing, with artifact id, cadence, date and label, and sections rendered verbatim.

Legacy fields are corrected where they are wrong for Build 60: Aug 15 arithmetic, guardrail on the latest DEXA, V3 goal-context confidence summary, and review language removed.

**Native (descendant of `c15f0881`).**
- Decode `currentState`.
- Render in this order: starting point → current state → progress → guardrail → training → Coach's Take (attributed and dated) → turning points.
- Remove the "Goal review comes next" card, the Evidence Anchors legacy card, the Current Strategy grid, and the Review buttons.

**Tests:** per Part G of the prompt.

## Integrity

- Production reads (database): NO. Only deployment metadata and the health endpoint were read.
- Production mutated: NO. Server deployed: NO. TestFlight: NO. Historical artifacts regenerated: NO.
- HealthKit / prospective Cardio paths: untouched.
- Product code changed: NO.

## Flags

- AUTHORITY_REVERIFIED: YES
- ACTIVE_GOAL_FORENSICS_COMPLETE: NO (code-level only; production probe blocked)
- LATEST_DEXA_SELECTION_PROVEN: NO (code defect proven; data pending)
- GOAL_PROGRESS_ARITHMETIC_PROVEN: NO (formula traced; data pending)
- AUG15_INCONSISTENCY_RESOLVED: CODE ROOT CAUSE PROVEN (fix pending)
- CONFIDENCE_V3_PIPELINE_PROVEN: CODE ROOT CAUSE PROVEN (data pending)
- COACHING_LANGUAGE_CONTRACT_ENFORCED: NO
- FICTIONAL_REVIEW_LANGUAGE_REMOVED: NO
- GUARDRAIL_COACHING_INTERPRETATION_PRESENT: NO
- TRAINING_PROGRESS_CURRENT: NO
- TURNING_POINTS_CURRENT_SELECTIVE: NO
- LATEST_BRIEFING_COACHS_TAKE_PROJECTED: NO
- COACHS_TAKE_PROVENANCE_VISIBLE: NO
- STRATEGY_GRID_REMOVED: NO
- REDUNDANCY_REDUCED: NO
- COMPLETED_GOAL_UNCHANGED: YES (nothing changed)
- HISTORICAL_ARTIFACTS_UNCHANGED: YES
- PERFORMANCE_BOUNDED: NOT_APPLICABLE (no change yet)
- PERFORMANCE_NATIVE_C15F0881_PRESERVED: YES (untouched)
- HEALTHKIT_PROSPECTIVE_CARDIO_PATH_UNCHANGED: YES
- SERVER_TESTS_PASS_OR_NOT_APPLICABLE: NOT_APPLICABLE
- NATIVE_TESTS_PASS_OR_NOT_APPLICABLE: NOT_APPLICABLE
- PRODUCTION_WEBPACK_BUILD_PASS_OR_NOT_APPLICABLE: NOT_APPLICABLE
- FRESH_CONTEXT_REVIEWED: NO
- SERVER_DEPLOYED: NO
- TESTFLIGHT_UPLOADED: NO
- PRODUCTION_MUTATED: NO
- GH_REPORT_PUBLISHED: YES (this report)

## Next step

Founder authorizes read-only production probes in chat. Claude then runs the Part A forensic probe, publishes the diagnostic, implements the Server and Native candidates, runs production-shaped acceptance, and stops for release authorization.
