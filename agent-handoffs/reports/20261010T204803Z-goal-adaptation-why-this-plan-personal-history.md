# Goal Adaptation simulator: "Why this plan?" with personal cut history

- **Task id:** `claude-simplify-why-this-plan-personal-history-20261010`
- **Prompt:** `agent-handoffs/inbox/prompts/20261010-claude-simplify-why-this-plan-personal-history.md` at commit `61afe17e`.
- **Status:** complete; awaiting Founder review.
- **Scope:** design, simulation and a read-only code audit. No Native, Server or production change; no production or database reads; no TestFlight. `latest.*` and Codex work untouched.

## Branch, SHA and links

| Item | Value |
|---|---|
| **Design branch** | `claude/goal-adaptation-home-parity-simulator-20261010` |
| **SHA** | **`bbd574557e2934741f5c3a27b8967eadd37ce24b`** (pushed; local = remote) |
| Previous head | `13f442b9` (guardrail ↔ phase target sync) |
| Commit | https://github.com/dustinginn/physiqueos/commit/bbd574557e2934741f5c3a27b8967eadd37ce24b |
| **Simulator (Claude artifact, version 6, same URL)** | **https://claude.ai/artifact/X2SJbf84x6sfe5UQyydLCP** (private until shared). Path: Options → Lean out first → Daily energy → "Why this plan?" |
| Previous-cut source audit | https://github.com/dustinginn/physiqueos/commit/bbd574557e2934741f5c3a27b8967eadd37ce24b#diff-f9e47ca81f5206047b0ec615bc6f9bad3ad03fbb6d4efe469ea590bcb1b9beb7 |
| History module | https://github.com/dustinginn/physiqueos/commit/bbd574557e2934741f5c3a27b8967eadd37ce24b#diff-bf16ea5722d8936dbb716e5840504fc178c9fc03bc5037c057ed0d0e07cfa159 |
| History tests | https://github.com/dustinginn/physiqueos/commit/bbd574557e2934741f5c3a27b8967eadd37ce24b#diff-18a8b5e232ca1c24b4541ec723c97fef57bb2d348b10185b30cb7dcedac23f46 · results https://github.com/dustinginn/physiqueos/commit/bbd574557e2934741f5c3a27b8967eadd37ce24b#diff-b3707cbb09d686a3f042e60e21380a49f2dcf75dd4f31733a1b36d22557d1248 |
| Simulator source | https://github.com/dustinginn/physiqueos/commit/bbd574557e2934741f5c3a27b8967eadd37ce24b#diff-8943ab94439f2fd643924052f7d5aa18a76c099f28a6ac0424990ac9380130a9 |
| End-to-end tests | https://github.com/dustinginn/physiqueos/commit/bbd574557e2934741f5c3a27b8967eadd37ce24b#diff-20ec9597cb3e48f0d04b7c0b4be8614b2db6fbb5ebb47588003903f7659450ad · results https://github.com/dustinginn/physiqueos/commit/bbd574557e2934741f5c3a27b8967eadd37ce24b#diff-1c00797cac20bdb51f3ff3bf5e69383fec53ef35c074c14cc1b761cc7ce9ea60 |
| Built simulator page | https://github.com/dustinginn/physiqueos/commit/bbd574557e2934741f5c3a27b8967eadd37ce24b#diff-351ba246854d40e5713c272d99a3da218b1185b54ec504953319c4662fb6b39b |
| Screenshot 15 · default page (iPhone width) | https://github.com/dustinginn/physiqueos/commit/bbd574557e2934741f5c3a27b8967eadd37ce24b#diff-15b978cf24b9d3cffe83895f3c9a0c28bab346331082aca005b302d7a78321dc |
| Screenshot 14 · details opened, Founder case | https://github.com/dustinginn/physiqueos/commit/bbd574557e2934741f5c3a27b8967eadd37ce24b#diff-24118bfb8b3a3a81de7e768fbccec79b7e65fdbdd8ad1b0475fa2ba97102ff8d |

## The page now

It is called **"Why this plan?"**, everywhere the old "Why these numbers?" link appeared. It fits in about 1.5 iPhone screens, with no wizard and no other redesign.

**Opening line:** "Built from how your body responded last time, then adjusted for where you are now."

1. **What worked last time** (tagged SIMULATED): "Visible Abs · May 24 – Jul 18"
   - You ate about 1,700 a day and averaged about 850 active calories.
   - You lost about 0.8 lb a week.
   - DEXA showed lean mass held, and your lifts held.
   - Footnote: the goal and dates are from your goal history; the numbers are illustrative, and the app would read them from that cut's logged food, activity, weigh-ins and DEXA scans.
2. **What's different now:**
   - 9.7% body fat after building, with 7.1 of 10 lb of progress kept.
   - Maintenance near 2,117 (likely 1,977–2,258, illustrative). When uncalibrated it says "isn't calibrated yet … could be off by a few hundred".
   - Usual activity about 800.
3. **So the plan:** "Eat 1,717 · move 900" (Founder case: −500 with +100 extra).
   - A daily gap of about 500: ≈ 0.8–1.4 lb/week, a little faster than last time, so the next DEXA checks lean mass. At −450 it reads "about the pace that held your lean mass last time".
   - About what you ate last time, with 100 more activity doing part of the work.
   - Activity goal: your usual 800 plus 100, close to what you sustained last time.
   - "Targets are calibrated over time … if they drift for three weeks you'll get a small change to approve."
4. **"See calculation details"** (optional, collapsed by default):
   - maintenance used, 2,117 (calibrated, illustrative), with its range;
   - eat: 2,117 − 500 + 100 extra = 1,717;
   - activity goal: 800 usual + 100 extra = 900;
   - resting energy ≈ 1,850, DEXA report estimate;
   - one line: "A formula estimate from resting energy and activity is ≈ 2,944. Your results point lower, so the plan follows your results."

**Removed from the default page:** the digestion card, the bottom-up walkthrough, the naive RMR + activity − food sum (1,033, "not your deficit"), and the speculation about why the estimates differ. Uncertainty is still visible on the main page (the maintenance range, the illustrative or uncalibrated label, the rate range).

**Without a previous cut** (scenarios B and C): "No earlier cut on record yet, so this plan starts from an estimate and learns from your results." In B the details show the provisional 2,926. In C activity is folded into the estimate and no activity goal is shown. For a surplus plan (Keep building), the history card is omitted.

**Provenance** (`personal-history.js`): only the goal name and the dates are marked `record`. They come from the Server's goal record and its hardcoded cut window. Every outcome number is `sim`, and no values were read from production. If fewer than 70% of days were logged, the food average is labelled "rough" rather than hidden. The coach comparisons are presentation thresholds: pace within ±0.2 lb/week, intake within ±100, activity within +100.

## Source audit: what the existing Server can access about a previous cut

Full write-up: `source-audit/previous-cut-evidence-audit.md` on the design branch.

The audit read production code at `85a98025` on `combined-app-platform-cutover`; `origin/main` `src/` has been stale since 2026-08-11. It also covered the dormant Phase B branch `99f11ae6`. Key files were spot-checked by hand.

**Already available (verified in code):**
- **Goal record:** completed goals stay listable, and the transition is additive (`preservationMode: additive_immutable_chapter`). Visible Abs `goal.completion` holds pointers to the final DEXA (Jul 18), photos and briefings, not outcome numbers.
- **Cut window:** hardcoded as `EVIDENCE_CONTEXT_WINDOWS["visible-abs"] = 2026-05-24 → 2026-07-18`.
- **Cut-window energy:** `getEnergyEvidenceReport({context:"visible-abs"})` already computes average intake, expenditure and balance, with complete-day counts.
- **Targets in force during the cut:** append-only `protocolVersions` (`protocol_nutrition_founder_cut`: calorie range and protein minimum; `protocol_activity_founder_cut`: active-kcal target). `resolveProtocolVersionAtDate()` returns the targets in force on any date.
- **Outcome data**, append-only and range-queryable: `weightEntries`, `dexaScans` (body-fat %, lean, fat, RMR), `trainingPerformanceEvents`, and cut-era briefings in `dailyBriefings`.
- **`DEXAEventContextService`** already compares each scan with the previous one, across goals.

**Gaps (documented, not built):**
1. No saved per-goal outcome summary. `CompletedGoalPreviewService` is preview-only and its recap and highlight prose are **hardcoded strings**, so it is not usable as evidence.
2. Nothing joins cut-era outcomes to the cut's protocol targets, so adherence to the cut is never computed.
3. Nothing compares one goal with another. V3's `V3EvidenceUniverse` "never adds evidence from another Goal, Phase", and `priorGoalHistory` is a fixed label.
4. A goal's type can't tell a cut apart from other goals (all are `body_composition`); the window and dates are hardcoded per goal id.
5. `operatingPlan` targets are overwritten; only protocol versions keep target history.
6. Cut-era logging coverage is unknown and **may be sparse** (inferred from the Phase B fixture, where 9 of 28 days were logged). If so, the dormant `EnergyCalibrationV1` (at least 21 days, at least 70% logged) would exclude that period.

**Build on existing intelligence, don't duplicate it.** A future "previous cut" summary would be a read-only composition of:
`EnergyEvidenceService` (energy) + `resolveProtocolVersionAtDate` (targets) + `dexaScans`/`DEXAEventContextService` (composition) + `trainingPerformanceEvents` (lifts) + weight trend, over the goal's evidence window.

It should be computed when needed or saved on goal completion, and passed to V3 as explicit read-only context. It would not be a new engine.

## Validation results

| Suite | Result |
|---|---|
| Personal history unit tests (`personal-history.test.mjs`) | **11/11 passed** (provenance tags, no-history scenarios, pace/intake/activity comparisons, rough-coverage rule) |
| End-to-end (`test-sim.mjs`, headless Chrome, desktop + 390 mobile) | **120/120 passed** |
| Energy arithmetic (`energy-model.test.mjs`) | **25/25 passed** (unchanged; `energy-model.js` not modified) |
| Guardrail (`guardrail-model.test.mjs`) | **32/32 passed** (unchanged) |

**New end-to-end checks:**
- Links renamed.
- Section order is history → now → plan.
- SIMULATED tags and the provenance footnote are present.
- The "now" values and the plan targets are correct.
- The coach comparisons and the calibration note are shown.
- The default page contains none of: digestion, bottom-up, 1,033, "not your deficit", 2,944, "under-logged".
- Details are collapsed by default, show the exact formulas (2,117 − 500 + 100 = 1,717; 800 + 100 = 900) and the 1,850 DEXA report estimate, and collapse again.
- Scenario B: no history, provisional 2,926. Scenario C: no activity goal.
- At 390 px, no horizontal overflow on the page or inside elements, and the content is at most 1,400 px tall.

**Also re-verified:** Quick Calibration, energy edits, the guardrail and phase target sync, Phase 4 resume, Home parity, no inert controls, no page errors.

## Preserved

- Every approved Goal Adaptation flow, Option B and Approach A.
- 1:1 energy accounting; 2,117 is still labelled illustrative and was not replaced with fabricated personal data; no 75% discount; no double counting.
- Guardrail editing and phase target sync.
- Home strict parity.
- The briefings.

## Founder decisions requiring review

1. Approve the three-part "Why this plan?" structure and its tone.
2. When the real cut-era data is wired in and logging coverage is low, should food be shown as "rough" (as designed), or omitted in favour of weight and DEXA outcomes only?
3. Which cut window should define "last time": the Server's evidence window (May 24 – Jul 18, as shown) or the goal record dates (transition committed Jul 21)?
4. Authorize a future read-only production check of the actual Visible Abs cut values and logging coverage before any real copy shows them.

## Storage and safety

| | |
|---|---|
| Free disk | ≈ 13 GiB (floor 12; small screenshots only) |
| production_mutated / deployed / Native / Server / TestFlight | false / no / no / no / no |
| Production or database reads in this task | none |
