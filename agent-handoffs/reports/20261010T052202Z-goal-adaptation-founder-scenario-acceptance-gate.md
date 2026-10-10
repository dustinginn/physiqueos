# Goal Adaptation: Founder scenario acceptance gate (Phase 0/A, actual engine)

- Task id: `claude-goal-adaptation-founder-scenario-acceptance-gate-20261010`
- Prompt: inbox `20261009-claude-goal-adaptation-founder-scenario-acceptance-gate.md` at `9475cfdb`
- Generated: 2026-10-10T05:22Z
- **Status: gate built and run; awaiting Founder behavioural review.**
  - **Result:** 26/26 scenarios match their expectations.
  - **Outcomes:** 12 would open a proposal for user approval; 14 correctly do not adapt.
  - **Safety:** 0 automatic changes.
- **Scope:** Engine dormant. Nothing deployed, nothing persisted, no production change, no Native change.

## Where to review

- **Desktop review board:** https://claude.ai/artifact/KbgjJ4EZt3A17dCShAXLK8
  - Compact filterable matrix, plus one drilldown per scenario: evidence, engine reasoning, eligibility, rung, before/after, engine coaching, illustrative copy, and expected-vs-actual checks.
  - Private to the Founder; share it from the page menu.
- **Branch:** `claude/goal-adaptation-phase0-phaseA-20261010` at **`5d4701e757872cf83f4c92901dd10465fa4bae38`**. Never merge; candidate only.
- **Artifacts:** in folder `goal-adaptation-scenario-gate-20261010/` under `agent-handoffs/artifacts/` on that branch.
  - [scenario-board.html](https://github.com/dustinginn/physiqueos/commit/5d4701e757872cf83f4c92901dd10465fa4bae38#diff-7b0560631e7f3ae7e480a7155c486b740ff577df58d6fdb7280dfa26e2afd005) and [results.json](https://github.com/dustinginn/physiqueos/commit/5d4701e757872cf83f4c92901dd10465fa4bae38#diff-30fb92e31114d13f1d2b100bb156160bdac89db7048ab5075c14f860bc3795cb) (the deterministic engine output for all 26 scenarios).
  - Fixtures: [GoalAdaptationScenariosV1.js](https://github.com/dustinginn/physiqueos/commit/5d4701e757872cf83f4c92901dd10465fa4bae38#diff-f70d9b4e640d72e15cfaf3022afc2dd7e6f972ad4d92c3ec155bca42531805e0). Runner: [runGoalAdaptationScenarios.js](https://github.com/dustinginn/physiqueos/commit/5d4701e757872cf83f4c92901dd10465fa4bae38#diff-cc8fcf82e6bf1b7d66da295acb98934c12f8fc4f60f5758caf4b8a9db516c41a).
  - Screenshots: [matrix, 1440 Dark](https://github.com/dustinginn/physiqueos/commit/5d4701e757872cf83f4c92901dd10465fa4bae38#diff-c6c6f4bb714b35533597a3ff795e4054044af661f2c72b6f9220207da5a800ec) · [matrix, 1440 Mineral](https://github.com/dustinginn/physiqueos/commit/5d4701e757872cf83f4c92901dd10465fa4bae38#diff-e760856959cd4ed0032092dc3930f3cf6034a0845dd868d540b5acd9dff14b9e) · [matrix, 1280](https://github.com/dustinginn/physiqueos/commit/5d4701e757872cf83f4c92901dd10465fa4bae38#diff-6b68f04d403921cb5fc0efb853a4cdc7c39377527bbbc2ef72e93c31b2efe315) · [mobile, 390](https://github.com/dustinginn/physiqueos/commit/5d4701e757872cf83f4c92901dd10465fa4bae38#diff-507dc82d6641f1e556b636e629c4955c844ed19dfbc5120619db03be6aa67560) · [drilldown F1](https://github.com/dustinginn/physiqueos/commit/5d4701e757872cf83f4c92901dd10465fa4bae38#diff-3e716f010c8c2d3e9ae8d5fd85ac2e974633e1a33673bd141c2e853c44c507f8) · [drilldown E1](https://github.com/dustinginn/physiqueos/commit/5d4701e757872cf83f4c92901dd10465fa4bae38#diff-75a9a8124bed9a6ce0d7c385a18abe930f42758f1cd5c91a892eeb2fa08b4b07) · [drilldown G1](https://github.com/dustinginn/physiqueos/commit/5d4701e757872cf83f4c92901dd10465fa4bae38#diff-986d736a65b2676aa69150457d44aa7392ec3d14e788798e560410a23433710c).
  - Every file at once: https://github.com/dustinginn/physiqueos/commit/5d4701e757872cf83f4c92901dd10465fa4bae38
- **Reproduce:**
  - `npx vitest run --config vitest.unit.config.js src/domain/goalAdaptation/scenarios`
  - `node scripts/goal-adaptation/renderScenarioBoard.mjs <outDir>`

## Scenario matrix

All values come from the actual engine. "V3 before" is the stored production recommendation (Founder rows only).

| ID | Scenario | Type | Source | Evidence | Eligibility | Engine rung | Outcome | V3 before | Result |
|---|---|---|---|---|---|---|---|---|---|
| F1 | Founder, Oct 9 DEXA: about 71% of +10 lb, 22 days left, body fat above 8–9% | Mass building | Founder (prod, sanitized) | sufficient, scan, adherence adequate | eligible | **resolve constraint conflict** | Proposal | continue with guardrail monitoring | PASS |
| F2 | Founder, Oct 7 Midweek: frozen 49-day runway corrected to 24 days | Mass building | Founder (prod, sanitized) | sufficient, scan, adherence adequate | eligible | **pace unverified** | No adaptation | continue current strategy | PASS |
| F3 | Founder, Oct 4 Weekly: pace not verified for 22 days | Mass building | Founder (prod, sanitized) | sufficient, scan, adherence adequate | eligible | **pace unverified** | No adaptation | continue current strategy | PASS |
| F4 | Founder, Sep 20 Weekly: on track, nothing to change | Mass building | Founder (prod, sanitized) | sufficient, scan, adherence insufficient data | eligible | **none** | No adaptation | continue current strategy | PASS |
| M1 | Healthy mass build on track with a recent scan | Mass building | Synthetic | sufficient, scan, adherence adequate | eligible | **none** | No adaptation | not run | PASS |
| M2 | First reading below the preferred range while building | Mass building | Synthetic | sufficient, scan, adherence adequate | eligible | **below range watch** | No adaptation | not run | PASS |
| M3 | Body fat below range for three weekly evaluations | Mass building | Synthetic | sufficient, scan, adherence adequate | eligible | **below range review** | Proposal | not run | PASS |
| M4 | No DEXA ever, but weight, training and nutrition are well logged | Mass building | Synthetic | sufficient, no scan, adherence adequate | eligible | **none** | No adaptation | not run | PASS |
| M5 | No DEXA, weight gain stalled for four weeks despite on-plan eating | Mass building | Synthetic | sufficient, no scan, adherence adequate | eligible | **strategy review** | Proposal | not run | PASS |
| L1 | Leaning plateau over 10 days (likely water or scale noise) | Leaning | Synthetic | sufficient, no scan, adherence adequate | eligible | **none** | No adaptation | not run | PASS |
| L2 | Leaning plateau that has persisted for four weeks | Leaning | Synthetic | sufficient, no scan, adherence adequate | eligible | **review timeline** | Proposal | not run | PASS |
| L3 | Overly aggressive cut: lean mass dropping in week 2 | Leaning | Synthetic | sufficient, scan, adherence adequate | eligible safety exception | **guardrail review** | Proposal | not run | PASS |
| S1 | Strength plateau across five weeks of comparable sessions | Strength | Synthetic | sufficient, no scan, adherence not applicable | eligible | **strategy review** | Proposal | not run | PASS |
| S2 | Strength progressing on comparable sessions | Strength | Synthetic | sufficient, no scan, adherence not applicable | eligible | **none** | No adaptation | not run | PASS |
| MT1 | Maintenance drift: weight 2.5 lb above the 170–174 lb range | Maintenance | Synthetic | sufficient, no scan, adherence adequate | eligible | **guardrail review** | Proposal | not run | PASS |
| MT2 | Maintenance holding inside the range | Maintenance | Synthetic | sufficient, no scan, adherence adequate | eligible | **none** | No adaptation | not run | PASS |
| C1 | New phase, day 12: still in calibration | Mass building | Synthetic | sufficient, no scan, adherence adequate | calibrating | **calibrating** | No adaptation | not run | PASS |
| E1 | Insufficient evidence: few weigh-ins, and HealthKit nutrition sparse | Mass building | Synthetic | insufficient, no scan, adherence insufficient data | insufficient evidence | **evidence coaching** | No adaptation | not run | PASS |
| A1 | Poor plan adherence with full data coverage, but on track and in range | Mass building | Synthetic | sufficient, no scan, adherence consistent nonadherence | adherence coaching | **adherence coaching** | No adaptation | not run | PASS |
| A2 | Consistent overeating is pushing body fat above range | Mass building | Synthetic | sufficient, no scan, adherence consistent nonadherence | eligible sustainability review | **sustainability review** | Proposal | not run | PASS |
| G1 | Conflicting choice: keep building with the firm 8–9% ceiling and keep Oct 31 | Mass building | Founder (prod, sanitized) | sufficient, scan, adherence adequate | eligible | **resolve constraint conflict** | Proposal | continue with guardrail monitoring | PASS |
| T1 | Time-limited leaning phase ends before the outcome | Leaning | Synthetic | sufficient, no scan, adherence adequate | eligible | **phase time limit review** | Proposal | not run | PASS |
| GA1 | Goal achieved | Mass building | Synthetic | sufficient, no scan, adherence adequate | eligible | **goal achieved** | Proposal | not run | PASS |
| D1 | User kept the plan; next Weekly has no material new evidence | Mass building | Founder (prod, sanitized) | sufficient, scan, adherence adequate | eligible | **resolve constraint conflict** | No adaptation | not run | PASS |
| D2 | User kept the plan; a new scan shows body fat breached | Mass building | Synthetic | sufficient, scan, adherence adequate | eligible safety exception | **resolve constraint conflict** | Proposal | not run | PASS |
| P1 | Photo Event without proven photo reliability | Mass building | Founder (prod, sanitized) | sufficient, scan, adherence adequate | eligible | **resolve constraint conflict** | Link only | continue with guardrail monitoring | PASS |

Every required case is covered:
- Founder Oct 9 (F1) and the Oct 6/7 frozen-runway correction (F2);
- a healthy build (M1);
- below range, first reading (M2) and sustained (M3);
- a short leaning plateau that is likely noise (L1) vs a persistent plateau (L2);
- an overly aggressive cut (L3);
- a strength plateau on comparable sessions (S1);
- maintenance drift (MT1);
- no DEXA (M4, M5);
- under-28-day calibration (C1);
- insufficient evidence with HealthKit present (E1);
- poor adherence with full coverage (A1, A2);
- a hard guardrail vs keeping an unlikely deadline (G1);
- a time-limited phase that misses its target (T1);
- goal achieved (GA1);
- deferral suppressed vs resurfaced (D1, D2);
- and Midweek (F2) and Photo (P1) never originating a proposal.

No-adaptation outcomes: F2, F3, F4, M1, M2, M4, L1, S2, MT2, C1, E1, A1, D1, P1.

## Before (existing V3) vs after (Phase A)

| | Existing V3 (production) | Phase A shadow |
|---|---|---|
| Runway | Frozen at the last scan (Sep 12 → "49 days" until Oct 9) | Shrinks daily (F2: 24 days on Oct 7). Measured pace stays evidence-only. |
| Recommendation | Ladder ignores the schedule. Oct 9 was `continue_with_guardrail_monitoring`. | Rungs run after the projection. Oct 9 is `resolve_constraint_conflict`, and a proposal may originate. |
| Guardrail | Symmetric bands | Direction-aware: above range is unsafe during a build, below range is coaching |
| Evidence and adherence | Not part of any decision | Goal-specific coverage (DEXA never required). Adherence is judged separately and never inferred from missing days. |
| Deferral / supersede | None | "Keep my current plan" suppresses the recommendation until there is material new evidence (D1 vs D2) |
| Adaptation path | None | A proposal for user approval only; `automaticChangeAllowed: false` everywhere |

## Not exercisable yet

- **Phase B:**
  - ranked options with per-option timing ranges;
  - energy calibration;
  - persisted recommendations, revalidation on entry and at approval;
  - notification and Home delivery.
- **Phase C:** atomic approval (goal-contract revision, temporary phase, Operating Plan versions, Your Journey events).
- **Phase C/D:** narrative wiring into published briefings, and all Native screens.

Coaching marked "Engine output" on the board is real engine text. Text marked "Illustrative" is V2 design copy.

## Founder review required before any deploy or Phase B

1. **Behaviour:** do all 26 decisions match your intent?
2. **Draft thresholds:** see `20261010T052201Z-goal-adaptation-phase0-phasea-candidate.md`.
3. **New rungs:** confirm `guardrail_review`, `strategy_review` and the time-only `pace_unverified` behaviour described there.

## Storage

- Free disk 24 GiB at start and 23 GiB at end, so the 15 GiB floor was never approached.
- Artifacts total 4.3 MB.
- Only task temp files were used; the restored runner copies were removed.

## Safety

| | |
|---|---|
| production access | read-only control-plane checks only in this gate (production data was read for Phase A, see the companion report) |
| production writes / deploy / TestFlight / Native | none / none / none / none |
| goal edits, release pointer | none, unchanged |
