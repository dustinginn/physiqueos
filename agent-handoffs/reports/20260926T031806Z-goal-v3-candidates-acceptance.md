# Active Goal V3 current state + coaching — candidates, production-shaped acceptance (STOP for Founder)

Generated: 2026-09-26T03:18:06Z
Task id: `claude-active-goal-v3-current-state-coaching-20260925`
Supersedes the blocked checkpoint `agent-handoffs/reports/20260926T024012Z-goal-v3-diagnostic-blocked.md` (Founder authorized read-only probes in chat, 2026-09-26).
Content gate: `agent-handoffs/reports/20260926T031806Z-goal-v3-founder-content-preview.md` — **Founder content acceptance required before any deployment.**
Lane pointer: `agent-handoffs/goal-v3/latest.json` (HealthKit / performance / training-localday / Midweek pointers untouched).

## Authority (reverified live before every production read)

- Production Server `09f04dc54eb26bfccdd2aeb34b156d8fc7d3f80e`, deployment `e979ee19-44f3-4c7a-ab2b-3c6e4f773349` ACTIVE, web + worker `source_commit_hash` exact, build `physiqueos-09f04dc5-20260925`. Unchanged throughout.
- Native installed Build 60 `00321dcc` (unchanged). Native base `c15f0881` (Performance Phase 2 + local-day) preserved.

## Candidates

| | SHA | Branch | Base |
|---|---|---|---|
| Server | `0a245c5c11bd40393b152cbf6b8013a132b6543d` | `claude/active-goal-v3-server-20260925` | production `09f04dc5` (commits a9ed5962, abaf8b0a, 8586950d, 0a245c5c — the last is test-only; product code identical to the probed `8586950d`) |
| Native | `efadb35e` | `claude/active-goal-v3-current-state-coaching-20260925` | `c15f0881` (commits 333bc93d, efadb35e) — clean descendant; only 4 Goal files touched |

## Canonical current Goal / DEXA facts (production, read-only)

- Goal: Build Lean Mass, active, target +10 lb lean mass (numeric_change, increase) by 2026-10-31; journey start 2026-07-19. Phases: Establish Maintenance (Jul 19 → completed Aug 16) → Lean Mass Build (active since Aug 15; monthly, DEXA-anchored). Guardrail "Maintain approximately 8–9% body fat."
- DEXA (17 records): 13 legacy scans 2024-06-10 … 2026-06-20 (pre-goal), one superseded Jun 20 revision with no metrics, and three current canonical scans:
  - **Jul 18 (goal baseline):** lean 147.5 lb, fat 12.8 lb, BF 7.7%, weight 167.4 lb.
  - **Aug 15 (phase start):** lean 148.3, fat 12.8, BF 7.6%, weight 168.3.
  - **Sep 12 (latest authoritative, revision 1):** lean 153.3, fat 14.2, BF 8.1%, weight 174.7.
- Progress: 153.3 − 147.5 = **+5.8 lb = 58%** of 10 lb; 4.2 lb remaining. Proven independently from canonical baseline/target/current.
- Confidence: V3 `confidence_assessment_v3|f5deaf71…`, **79% Moderate**, held, published by the Sep 23 Midweek (window Sep 20–22) at 2026-09-23T10:01:29Z. Prior V3: activation Sep 18 (62→79), Weekly Sep 20, Photo Sep 20.
- Latest published briefing: **Sep 23 Midweek** (V3-bound). Served Coach's Take = What To Do + What To Watch (the contract suppressed Biggest Takeaway as a non-decision-changing second movement).
- Training since Aug 15: 39 live resistance sessions on 38 training days; 23 defensible comparisons — 15 improving, 7 steady, 1 regressing (Single-Leg Leg Press −16.5%).

## Proven root causes (production data + code)

1. **Aug 15 arithmetic ("148.3 lb, +5.8 lb from baseline")** — `phase_transition` turning point combined the Aug 15 scan's lean mass with `trajectory.goalProgress.changeValue` (Sep 12 − Jul 18). Correct Aug 15 delta is +0.8. Displayed lean mass was right; the delta was mis-mapped.
2. **No current DEXA** — payload carried only `goalBaseline`/`phaseStart`; Native labelled `goalBaseline ?? phaseStart` "Goal baseline DEXA". Guardrail observation used `(phaseStart ?? baseline)` → live page said **"7.6% observed — below the 8–9% guardrail range"** while the latest authoritative DEXA is **8.1%, inside the range**. The guardrail classification itself was wrong, not just uninterpreted.
3. **DEXA authority** — active-Goal store listed `dexaScans` without lifecycle/supersession/revision filtering (Progress stores filter). Harmless on today's data (the superseded Jun 20 row has no metrics), unsafe in general.
4. **Confidence explanation** — for V3, `buildConfidenceExplanationModel` returns null, so the Goal fell back to the stored `narrativeExplanation.text` = the Sep 23 Midweek's movement sentence "Confidence holds. This progress supports the current approach, but one update does not change the overall goal outlook." (retired composition; no referent on the Goal). The V3 goal-level `whyConfidence` and rich detail were computed and dropped. **Goal consumption defect, not a V3 engine defect** — no engine change needed for this.
5. **Fictional review / boilerplate** — "Evidence keeps accumulating toward the next review…" and "Weekly evidence monitors intake…" hard-coded in `currentPhaseNarrative`; "Monthly review" in phase dates; "Goal review comes next" hard-coded in Native (and Web fallback); "Server-derived" hard-coded in the Native mapper.
6. **Training Progress** — computed only when a phase review date exists (terminal phase has none) and never decoded by Native; the card showed the boilerplate. The existing module also filtered on region names (`Lower Body/Core/Arms`) that never match the report's fine categories (`quads`, `glutes`, …).
7. **Turning points frozen** — fixed list (baseline, activation, transition, fictional planned review, future destination); no later DEXA could ever qualify, so Sep 12 never appeared.
8. **Strategy grid** — fixed labels, Native tiles all "Goal support"; Coach's Take absent from the Goal payload.

## Contract: before → after

Before: `confidence.summary` = briefing movement sentence; `evidence{goalBaseline, phaseStart}` only; guardrail on phase-start scan; fixed turning points; strategy grid; no coaching provenance.

After (additive `currentState`, schema `active_goal_current_state_v1`, documented in `docs/ACTIVE_GOAL_CURRENT_STATE_V1.md`): `composition{baseline, current, change, sameAsBaseline}` (authoritative DEXA only), `progress{target, achieved, remaining, percent}`, `guardrail{measurement, status (V3 evaluator), position, interpretation (V3 consequence policy)}`, `phase{…, measurementCadence}`, `confidence{score, band, summary=V3 whyConfidence, publishedBy, detail}`, `training{…, trainingDayCount, highlights, regions, summary}`, selective `turningPoints`, `coachTake{artifactId, cadence, publishedOn, attribution, sections (verbatim)}`. Legacy keys kept for Build 60 decode, with corrected content (Aug 15 delta, guardrail on latest DEXA, V3 confidence summary/explanation, no review copy, selective turning points, real training summary).

Native (Build 61 candidate): renders `currentState` in the target hierarchy (hero+confidence → journey → body composition baseline/latest/change + progress → guardrail → training → Coach's Take → turning points); removes "Goal review comes next", Evidence Anchors, the Current Strategy grid and Review Strategy/Protocols; progress % shown once; per-block lenient decode; legacy layout only when `currentState` is absent.

## Shared engine changes and cross-cadence impact

- `DeclarativeGoalEvaluator.evaluateGuardrailMeasurementV3` (new export; same range test + severity bands as the evaluator) and `ProductionConfidenceNarrativeV3Adapter.adaptLegacyGuardrailV3` (now exported), `TrainingPerformanceIntelligenceService.getActiveResistanceTrainingSessions` (now exported). Additive only — no behavior change to Midweek/Weekly/Monthly/DEXA/Photo publication or presentation; V3 engine suites (`src/domain/intelligence/v3`) pass unchanged.
- No historical briefing/confidence/narrative artifact regenerated or rewritten.

## Tests / builds / reviews / performance

- Server: new `ActiveGoalCurrentStateService.test.js` (DEXA baseline vs latest, superseded/failed/retracted/removed/unit exclusion, revision selection, progress arithmetic, no conflation, guardrail bands/policy, Confidence V3 selection + no legacy fallback + jargon withholding, training counts/local day/waiting, turning-point freshness/selectivity, latest-briefing selection incl. superseded/invalid/retired/preview/regenerated-older, Midweek suppression fidelity, provenance, auto-update with newer DEXA/briefing, payload bound, no hard-coded facts). Related suites 350/350. Full unit suite on exact `0a245c5c`: 9192 tests, failure set identical to baseline `09f04dc5` (306 environmental: Windows-only scripts + missing gitignored `private/founder/*.json`), 0 new failures; the read-only database guard (`IntegratedHealthKitProductionShapedAcceptance` Item 15) now admits the active-Goal read store and asserts its additions are SELECT-only. Production webpack on exact `0a245c5c`: **PASS** (also passed on `abaf8b0a` and `8586950d`).
- Native: 5 new `ActiveGoalCurrentStateTests` (production-shaped decode, section contract/no strategy/review, per-block lenient + schema gate, formatting). Full `PhysiqueOSTests` on the existing iPhone 17 Pro simulator: **1419 tests, 0 failures**; no new warnings. UI-test target not run (disk reserve 18 GiB < 20 GiB preferred).
- Fresh-context adversarial reviews (Server, Native): no blocking issues; all medium/low findings fixed in `8586950d` (+ guard `0a245c5c`) / `efadb35e` (published-state set aligned with Home incl. superseded/invalid/retired/preview; evidence-coverage ranking so a regenerated older briefing never wins; unparseable timestamps; real session/local training-day counts; engine guardrail precedence; per-block Native decode; Dynamic Type/VoiceOver; captions).
- Performance (same read-only transaction, interleaved baseline/candidate, live DB): baseline total 167–748 ms, candidate 308–1104 ms (first-round cold), warm ≈0.3–0.7 s; DB bytes 2.27 MB → 2.35 MB (+82 KB: metadata-only candidates + one artifact); queries 9 → 11; payload 4.8 KB → 12.5 KB. Within the ≤3 s ceiling and the 1–2 s warm target.
- Completed Visible Abs goal: read-model digest `4a3430ff1ff5a17e` identical for baseline and candidate on production data.

## Integrity

- Production reads: three bounded read-only transactions (forensics + two acceptance runs), each `REPEATABLE READ READ ONLY`, `SHOW transaction_read_only = on`, explicit `ROLLBACK`, marker once after rollback, empty stderr. **Production mutated: NO.** Server deployed: NO. TestFlight/Build 61: NO. DEXA/HealthKit/prospective Cardio: untouched. Historical artifacts: unchanged.

## Follow-ups flagged (not fixed here)

1. V3 engine: `describeGuardrailRisk` renders "Body fat moving outside the intended range of 8–9." (missing `%`) because the adapted legacy guardrail's `metricCapability` is a string without `canonicalUnit`. Shared engine defect; affects stored `whatCouldLowerIt` text (not shown on the Goal page, which uses supports/holding-back).
2. Briefing engine: Sep 23 Midweek "What To Watch" still says calorie totals come from logged meals — check day-selection precedence vs HealthKit-graduated days (existing Midweek open thread).
3. Home goal progress (`resolveHomeGoalTrajectory` callers other than the Goal) still receives unfiltered DEXA lists.
4. Confidence sheet shows stored "… with 49 days left" from Sep 23 (see content gate item 3).

## Recommended release order (after Founder content acceptance)

1. Server `0a245c5c` (backward compatible with Build 60; Build 60 immediately shows the corrected facts but keeps its legacy layout).
2. Build 61 from Native `efadb35e` (contains c15f0881 Performance Phase 2 + local-day correctness), after the prospective Cardio acceptance already gating Build 61.

## Flags

AUTHORITY_REVERIFIED: YES · ACTIVE_GOAL_FORENSICS_COMPLETE: YES · LATEST_DEXA_SELECTION_PROVEN: YES · GOAL_PROGRESS_ARITHMETIC_PROVEN: YES · AUG15_INCONSISTENCY_RESOLVED: YES · CONFIDENCE_V3_PIPELINE_PROVEN: YES · COACHING_LANGUAGE_CONTRACT_ENFORCED: YES · FICTIONAL_REVIEW_LANGUAGE_REMOVED: YES (Build 61; Build 60 keeps its hard-coded card until Build 61) · GUARDRAIL_COACHING_INTERPRETATION_PRESENT: YES · TRAINING_PROGRESS_CURRENT: YES · TURNING_POINTS_CURRENT_SELECTIVE: YES · LATEST_BRIEFING_COACHS_TAKE_PROJECTED: YES · COACHS_TAKE_PROVENANCE_VISIBLE: YES · STRATEGY_GRID_REMOVED: YES (Build 61) · REDUNDANCY_REDUCED: YES · COMPLETED_GOAL_UNCHANGED: YES · HISTORICAL_ARTIFACTS_UNCHANGED: YES · PERFORMANCE_BOUNDED: YES · PERFORMANCE_NATIVE_C15F0881_PRESERVED: YES · HEALTHKIT_PROSPECTIVE_CARDIO_PATH_UNCHANGED: YES · SERVER_TESTS_PASS_OR_NOT_APPLICABLE: YES · NATIVE_TESTS_PASS_OR_NOT_APPLICABLE: YES · PRODUCTION_WEBPACK_BUILD_PASS_OR_NOT_APPLICABLE: YES · FRESH_CONTEXT_REVIEWED: YES · SERVER_DEPLOYED: NO · TESTFLIGHT_UPLOADED: NO · PRODUCTION_MUTATED: NO · GH_REPORT_PUBLISHED: YES

**STOP — awaiting Founder content acceptance, then release authorization.**
