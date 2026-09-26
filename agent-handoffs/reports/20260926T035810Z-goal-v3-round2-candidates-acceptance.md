# Active Goal V3 — Round 2: content architecture + HealthKit completeness engine fix (STOP for Founder)

Generated: 2026-09-26T03:58:10Z
Task id: `claude-active-goal-v3-content-architecture-round2-20260925` (prompt `agent-handoffs/inbox/prompts/20260925T224000Z-claude-active-goal-v3-content-architecture-round2.md`)
Content gate: `agent-handoffs/reports/20260926T035810Z-goal-v3-round2-founder-content-preview.md`
Previous round: `agent-handoffs/reports/20260926T031806Z-goal-v3-candidates-acceptance.md` (Founder did not approve round-1 content).
Lane pointer: `agent-handoffs/goal-v3/latest.json` only.

## Authority

- Production unchanged: Server `09f04dc5`, deployment `e979ee19` ACTIVE (reverified before each read). `combined-app-platform-cutover` still `09f04dc5`.
- Native installed Build 60 `00321dcc` unchanged.

| | SHA | Branch | Relationship |
|---|---|---|---|
| Server | `2a23eee762472081815d9122b97c0f0a9f1b8969` | `claude/active-goal-v3-server-20260925` | round-1 `0a245c5c` + `6fe25d5e` (engine) + `1297808d` (content) + `2a23eee7` (review fixes) |
| Native | `fb4df07df0ba95050c6a70c2aceda791d99791c5` | `claude/active-goal-v3-current-state-coaching-20260925` | round-1 `efadb35e` + `ecf42ce3` + `fb4df07d`; clean descendant of `c15f0881` |

## Current Goal facts (unchanged, production read-only 2026-09-26T03:56Z)

Baseline Jul 18 147.5 lb lean / 12.8 lb fat / 7.7% / 167.4 lb → latest Sep 12 153.3 / 14.2 / 8.1% / 174.7; +5.8 lb = 58% of 10 lb, 4.2 lb left. Confidence V3 79% Moderate (Sep 23 Midweek). Latest published briefing: Sep 23 Midweek. Training since Aug 15: 38 training days, 15 of 23 comparable movements improving.

## Round-2 content architecture (Server + Native)

- **Order:** Hero/Confidence → Journey → Current progress (Body Composition table + progress) → Guardrail → Training → Turning points → **Coach's Take (last)** with Open Briefing.
- **Primary-page dedupe rule:** a quantitative fact appears numerically once; the dedupe map in the preview proves it on production data. The only repeats are 8.1% (table + guardrail pill, allowed as essential) and 10 lb (hero destination + canonical V3 thesis, verbatim).
- **Current progress:** share + remaining only. **Guardrail:** reading + status pill, one line of coaching with no restated numbers. **Training:** comparable-movement trend + weakness, no goal thesis. **Turning points:** concise; each carries only its unique fact (Aug 15 +0.8 lb, Sep 12 +5.0 lb since Aug 15 + guardrail entry); never repeats the table (including when the phase-start/latest scan's delta equals the composition change).
- **Confidence sheet:** "As of the <date> <briefing>" from publisher metadata at the top of the sheet; the as-of date follows the publishing artifact when it is the latest briefing, so it cannot disagree with the Coach's Take after an authorized regeneration. Build 60 receives the same line as its sheet's closing statement. Canonical V3 text never rewritten.

## HealthKit completeness — diagnosis and shared engine fix

- **Source:** `AmbiguityVocabularyV3` `energy_intake_uncertainty` ("calorie totals come from logged meals rather than a confirmed full-day total"), raised for `meal_derived_unverified` nutrition days (`nutritionDayAuthority`).
- **Production proof (read-only):**
  - Graduation policy for evidence and projection is enabled for activity + nutrition from 2026-09-22 (open-ended).
  - Sep 13–21 are MyFitnessPal meal-sum days (meal_derived_unverified).
  - Sep 22–24 are Apple Health `projected_alone` full-day totals (device_aggregate) with no ambiguity.
  - The Sep 25 HealthKit day is partial and there is no Sep 26 day yet.
  - The graduation overlay precedence is correct: a complete device day supersedes meal-derived legacy days, and a partial day never outranks.
- **Verdict:** the Sep 23 sentence is stale-but-accurate historical output (both surfaced days were pre-graduation meal logs), so it stays immutable. There is still a **live defect**: the clause fired for the whole window if any day was meal-derived. It would have claimed logged meals for the Sep 20–26 Weekly (2 of 7 days), and a hidden intake limitation still tempered the estimate through the wearable item.
- **Fix, shared engine (`6fe25d5e`, `2a23eee7`):**
  - `CadenceEnergyObservationsV3` adds `intake_meal_derived_days_<n>_of_<m>`.
  - `EnergyAmbiguityV3` treats a minority of meal-derived days as low materiality (no tempering, not surfaced). The wearable item counts the window as "otherwise weak" only when the intake item itself tempers.
  - When meal-derived days are the majority, the clause names the share ("on 4 of the 7 days with calorie totals, …").
  - When every day is meal-derived, the established wording is kept.
  - Missing, partial or conflicting totals remain high.
- **Tests:** `EnergyIntakeCoverageV3.test.js`, the full chain from reconciled days to observations to ambiguity to the Energy statement:
  - all-HealthKit weeks: no ambiguity;
  - the transition week: firm, with no Energy caveat;
  - majority meal-derived: the share is named;
  - all meal-derived: wording unchanged;
  - stored reasons read as before;
  - high severity wins.
- **Cross-cadence:**
  - Every V3 publisher (Midweek, Weekly, Monthly, DEXA/Photo event) goes through `adaptCadenceEvidenceObservationsV3` → `StrategicInterpretationV3Engine`.
  - Only windows with meal-derived intake change. All V3 goldens and forensic replays (Weekly Sep 13–19, Midweek Sep 13–15, the September Monthly stress test, DEXA/Photo regression) pass unchanged.
  - New uncertainty ids change only for newly generated artifacts, which were artifact-scoped already.
- **No historical briefing regenerated or mutated.**

## Validation

- **Server `2a23eee7`:**
  - Full unit suite: 9206 tests. The failure set is identical to baseline `09f04dc5` (306 environmental: Windows-only scripts and missing gitignored `private/founder/*.json`). 0 new failures; 50 new tests pass.
  - Production webpack on the exact SHA: **PASS**.
- **Native `fb4df07d`:**
  - Full `PhysiqueOSTests` on the existing iPhone 17 Pro simulator: **1421 tests, 0 failures**, no new warnings.
  - The UI-test target was not run: disk reserve is 18 GiB, below the 20 GiB preferred.
- **Fresh-context adversarial reviews (Server, Native):** only one blocker, a stale test assertion in `coachingLanguageBoundary.test.js`, now fixed. All medium/low findings fixed in `2a23eee7` / `fb4df07d`:
  - wearable tempering leak;
  - false "most … steady" training claim;
  - table repeats in turning points;
  - guardrail-only/1-day milestone copy;
  - as-of vs Coach's Take date agreement;
  - pill date repeat;
  - progress-block restatement for negative and awaiting cases;
  - VoiceOver;
  - robust provenance strip;
  - production-shaped fixture with an end-to-end sheet assertion;
  - brittle decode fields.
- **Production-shaped acceptance (read-only, 6 interleaved rounds, same transaction):**

  | | Median | Max | Compute | Queries | DB read |
  |---|---|---|---|---|---|
  | Baseline | 287 ms | 602 ms | 17–122 ms | 9 | 2.27 MB |
  | Candidate | 611 ms | 1523 ms | 51–166 ms | 11 | 2.35 MB |

  - Within the ≤3 s ceiling.
  - A separate earlier sample showed one 5.96 s database stall (compute 69 ms, identical queries); shared-DB latency, not the read model.
- **Completed Visible Abs goal:** digest `4a3430ff1ff5a17e` identical for baseline and candidate.
- **Read-only discipline:** 7 production console reads in total across both rounds, all `REPEATABLE READ READ ONLY` with rollback verified. Production mutated: NO.

## Follow-ups (not in scope)

1. V3 `describeGuardrailRisk` omits `%` ("range of 8–9.") in stored `whatCouldLowerIt`. That list is not shown on the Goal page.
2. Home goal progress callers still receive unfiltered DEXA lists.
3. Tie case: exactly half the days meal-derived is treated conservatively as moderate/tempering (e.g. 1 of 2 in a short Midweek). Confirm this is intended.
4. The Confidence sheet on the Goal still shows supports/limits only; the V3 could-raise/could-lower/assumptions lists are served but not rendered.

## Recommended release order (after Founder content acceptance)

1. Server `2a23eee7`. It is Build 60 compatible and carries the shared engine fix before the Sep 27 Weekly if deployed in time.
2. Build 61 from Native `fb4df07d`, which contains `c15f0881` Performance + local-day work, after the prospective Cardio acceptance.

## Flags

ROUND2_CONTENT_ARCHITECTURE_PASS: YES · COACHS_TAKE_LAST: YES · PRIMARY_PAGE_DEDUP_PASS: YES (8.1% guardrail and 10 lb canonical thesis by design) · CONFIDENCE_PROVENANCE_VISIBLE: YES · HEALTHKIT_COMPLETENESS_RULE_DIAGNOSED: YES · FUTURE_BRIEFING_ENGINE_FIXED_OR_ALREADY_CORRECT: FIXED · HISTORICAL_BRIEFINGS_UNCHANGED: YES · LATEST_COACHS_TAKE_VERBATIM: YES · LATEST_DEXA_CURRENT: YES · GOAL_PROGRESS_CURRENT: YES · TRAINING_PROGRESS_CONCISE: YES · TURNING_POINTS_CONCISE: YES · COMPLETED_GOAL_UNCHANGED: YES · PERFORMANCE_BOUNDED: YES · PERFORMANCE_NATIVE_C15F0881_PRESERVED: YES · HEALTHKIT_PROSPECTIVE_CARDIO_PATH_UNCHANGED: YES · SERVER_TESTS_PASS: YES · NATIVE_TESTS_PASS: YES · PRODUCTION_WEBPACK_BUILD_PASS_OR_NOT_APPLICABLE: YES · FRESH_CONTEXT_REVIEWED: YES · SERVER_DEPLOYED: NO · TESTFLIGHT_UPLOADED: NO · PRODUCTION_MUTATED: NO · GH_REPORT_PUBLISHED: YES

**STOP — awaiting Founder round-2 content acceptance, then release authorization.**
