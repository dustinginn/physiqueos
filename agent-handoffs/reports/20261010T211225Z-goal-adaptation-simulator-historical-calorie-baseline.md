# Goal Adaptation simulator: historical calorie baseline corrected (Founder blocker)

- **Task id:** `claude-fix-simulator-historical-calorie-baseline-20261010`
- **Prompt:** `agent-handoffs/inbox/prompts/20261010-claude-fix-simulator-historical-calorie-baseline.md` at commit `eb644ed4`.
- **Status:** complete; awaiting Founder acceptance.
- **Scope:** design and simulation only.
  - No new production or database reads. The evidence is the already-committed Oct 10 read-only snapshot plus the values the Founder reported.
  - No Native, Server or production change; no TestFlight.
  - `latest.*` and Codex P0 work untouched.

## Branch, SHA and links

| Item | Value |
|---|---|
| **Design branch** | `claude/goal-adaptation-home-parity-simulator-20261010` |
| **SHA** | **`23203217b7948de557fe13fd9f49af396e915811`** (pushed; local = remote) |
| Previous head | `bbd57455` ("Why this plan?" v1) |
| Commit | https://github.com/dustinginn/physiqueos/commit/23203217b7948de557fe13fd9f49af396e915811 |
| **Simulator (Claude artifact, version 7, same URL)** | **https://claude.ai/artifact/X2SJbf84x6sfe5UQyydLCP** (private until shared). Path: Options → Lean out first → Daily energy → "Why this plan?" |
| Reconciliation write-up | https://github.com/dustinginn/physiqueos/commit/23203217b7948de557fe13fd9f49af396e915811#diff-22c7b342f948a42cec7c3817776f5184c8b115b96a31858d20594fa33071e45f |
| Energy model (`calibrateFromPeriods`) | https://github.com/dustinginn/physiqueos/commit/23203217b7948de557fe13fd9f49af396e915811#diff-3b118fec2866cec17cbd5d8def685b1e80a43da43a0987c0748f3cdb65de93a2 · tests https://github.com/dustinginn/physiqueos/commit/23203217b7948de557fe13fd9f49af396e915811#diff-e2ecebd9a5af95ebad1f7045945417cda3c78ddca20d2461e34794fa994af27b · results https://github.com/dustinginn/physiqueos/commit/23203217b7948de557fe13fd9f49af396e915811#diff-e1a4cc30b6be0d498b956c58996034cfd4bf7af80facff844a65338ff534fc23 |
| Cut history (provenance) | https://github.com/dustinginn/physiqueos/commit/23203217b7948de557fe13fd9f49af396e915811#diff-bf16ea5722d8936dbb716e5840504fc178c9fc03bc5037c057ed0d0e07cfa159 · tests https://github.com/dustinginn/physiqueos/commit/23203217b7948de557fe13fd9f49af396e915811#diff-18a8b5e232ca1c24b4541ec723c97fef57bb2d348b10185b30cb7dcedac23f46 |
| Simulator source | https://github.com/dustinginn/physiqueos/commit/23203217b7948de557fe13fd9f49af396e915811#diff-8943ab94439f2fd643924052f7d5aa18a76c099f28a6ac0424990ac9380130a9 |
| End-to-end tests | https://github.com/dustinginn/physiqueos/commit/23203217b7948de557fe13fd9f49af396e915811#diff-20ec9597cb3e48f0d04b7c0b4be8614b2db6fbb5ebb47588003903f7659450ad · results https://github.com/dustinginn/physiqueos/commit/23203217b7948de557fe13fd9f49af396e915811#diff-1c00797cac20bdb51f3ff3bf5e69383fec53ef35c074c14cc1b761cc7ce9ea60 |
| Built simulator page | https://github.com/dustinginn/physiqueos/commit/23203217b7948de557fe13fd9f49af396e915811#diff-351ba246854d40e5713c272d99a3da218b1185b54ec504953319c4662fb6b39b |
| Screenshot 15 · Why this plan? (iPhone width) | https://github.com/dustinginn/physiqueos/commit/23203217b7948de557fe13fd9f49af396e915811#diff-15b978cf24b9d3cffe83895f3c9a0c28bab346331082aca005b302d7a78321dc |
| Screenshot 14 · Founder case with details open | https://github.com/dustinginn/physiqueos/commit/23203217b7948de557fe13fd9f49af396e915811#diff-24118bfb8b3a3a81de7e768fbccec79b7e65fdbdd8ad1b0475fa2ba97102ff8d |

## 1. Evidence audit: what exists and how complete it is

| Evidence | Source | Coverage | Role now |
|---|---|---|---|
| Visible Abs cut, May 24 – Jul 18: **2,062 average on logged days** | Founder's Nutrition Evidence Period Summary (as reported) | **10 of 56 days (18%)** | Shown with a coverage warning; **not used for calories** |
| Cut final month, DEXA Jun 20 → Jul 18: fat −5.6, lean +1.3, weight −4.3 lb | Oct 10 snapshot¹ | intake 9 of 28 days | **Pace only:** about 1.1 lb/week with lean held |
| Build Lean Mass, Jul 18 → Oct 9: monthly intake 2,349 / 2,714 / 2,568 | Oct 10 snapshot¹ | **27/28, 28/28, 27/27 days** | **Maintenance** |
| Same period, DEXA: fat 0 / +1.4 / +3.2 lb; lean +0.8 / +5.0 / +1.3 lb | Oct 10 snapshot¹ | 4 scans | **Maintenance** |
| Same period, activity 980 / 880 / 832 a day | Oct 10 snapshot¹ | 27/28, 28/28, 27/27 days | **Usual activity** |

¹ Sanitized per-period aggregates from the 2026-10-10 read-only extraction (Server `85a98025`). They are already committed as the Phase B test fixture (`fixtures/founderLeanMassGolden.js` on `99f11ae6`). They agree with the Founder's screenshots: weekly intake mostly 2,300–3,028 with 6–7 logged days a week.

## 2. Reconciliation

**The 12 Build Lean Mass weeks** (82 of 83 days logged):
- About 2,546 logged a day.
- DEXA: fat +4.6 lb and lean +7.1 lb, which stores (4.6 × 4,250 + 7.1 × 830) ÷ 83 ≈ **307 a day**.
- So maintenance ≈ 2,546 − 307 = **2,240 in logged calories** (2,020–2,350 by month), at the ~900 a day of activity actually recorded.

**This is consistent with your evidence.** You gained weight in every month, so maintenance sits below what you ate. The approved 2,500 target against 2,240 is a planned +260, and the measured surplus at 2,546 logged is +307.

**Where 2,117 came from.** It is the dormant Phase B calibration on the same three months, with two choices this design drops:
- each month was re-scaled to an 800 activity goal (subtract recorded 980 / 880 / 832, add 800);
- recency weighting pulled the result toward the lowest month (2,024).

The simulator showed it as a personal value without explaining either choice. It is **retired from the simulator**; the details panel says why.

**The previous cut** logged too few days (10 of 56) to tell what you ate, so it doesn't set calories. Its measured DEXA month sets the pace to aim for.

## 3. What changed in the simulator

- **Fabricated values removed:** 2,117, and the previous-cut 1,700 intake / 850 activity / 0.8 lb a week / "lifts held". A regression sweep checks that none of them, and no "illustrative" label, appear on any linked screen or the panel.
- **"Why this plan?"** (short and coach-like, with no digestion card and no arithmetic by default):
  1. **Your last cut** [Records · Oct 10]
     - Visible Abs · May 24 – Jul 18
     - Final month: fat −5.6, lean +1.3, about −1.1 lb/week.
     - ⚠ "Food was logged on only 10 of 56 days (2,062 average on those days). That's too few to know what you ate, so the cut sets your pace, not your calories."
  2. **Your last 12 weeks** [Records · Oct 10]
     - Food logged on 82 of 83 days: about 2,550 (2,349–2,714 by month).
     - DEXA fat +4.6, lean +7.1, so about 310 a day stored.
     - That puts maintenance near **2,240** in the calories you log (2,020–2,350 by month), moving about 900 a day.
  3. **So the plan:** "Eat 1,890 · move 1,000" (default)
     - 450 under maintenance: ≈ 0.6–1.3 lb/week, about the pace that kept your lean mass in your last cut.
     - Activity goal: your usual 900 plus 100 (you've averaged above your 800 goal).
     - Calibrated as you go.
  4. **"See calculation details":** 2,546 − 307 ≈ 2,240; the stored-energy formula; by-month values; the excluded cut month; eat and activity formulas; provisional densities; ± about 160 a day DEXA error; why 2,117 was replaced; "snapshot, not a live read".
- **Downstream screens all derive from 2,240:**
  - Daily Energy reads "Maintenance used: 2,240 (from your records)".
  - Review: eat 2,500 → 1,890, activity 800 → 1,000, balance +260 → −450. Its footer reads "2,240 − 450 + 100 = 1,890 · 900 + 100 = 1,000".
  - Founder case: 1,840 / 1,000.
  - Floor: 1,700.
  - Quick Calibration starts from 2,240.
  - Projections use the 2,020–2,350 range.
  - The hub, Home and Goals use the same values.
  - The approved Move goal stays 800 until a change is approved.
- **Scenarios B and C** (illustrative users with no records) are unchanged: "No earlier cut on record yet."

## 4. Validation results

| Suite | Result |
|---|---|
| Energy arithmetic (`energy-model.test.mjs`) | **30/30 passed** |
| Personal history (`personal-history.test.mjs`) | **11/11 passed** |
| Guardrail (`guardrail-model.test.mjs`) | **32/32 passed** (unchanged) |
| End-to-end (`test-sim.mjs`, headless Chrome, desktop + 390 mobile) | **131/131 passed** |

**Energy (30 checks):**
- the sparse cut month is excluded, never imputed;
- 82/83 coverage; intake 2,546 (2,349–2,714);
- DEXA +4.6 / +7.1 / +11.6;
- stored 307; maintenance 2,240; by month 2,325 / 2,353 / 2,024, so range 2,020–2,350;
- usual 900, approved goal 800;
- no 2,117 anywhere in the scenario;
- maintenance below every month's intake;
- targets: −500/+100 → 1,840/1,000; −450/+100 → 1,890/1,000; approved plan +260; floor 1,700; −750 limited to the floor;
- 1:1 activity; insufficient coverage → no estimate;
- B and C unchanged.

**Personal history (11 checks):**
- 2,062 on 10 of 56 days (18%), which cannot set calories;
- no fabricated cut values remain;
- provenance tags are only record / founder / snapshot;
- measured pace 1.08 lb/week;
- the only cut comparison is pace;
- B and C have no history.

**End-to-end (131 checks).** New or changed:
- the "Why this plan?" order and copy;
- the prior cut's 10/56 coverage warning;
- recent 82/83 coverage;
- the maintenance line with records provenance;
- no fake comparisons; no 2,117 and no "illustrative" on the main page; no digestion, bottom-up or naive sum;
- the details reconciliation;
- energy-screen, Review and Founder-case arithmetic;
- the Quick Calibration starting point;
- a **cross-screen consistency and stale-number sweep** over Home, DEXA briefing, Options, lean setup, Daily Energy, Why and its details, hub, Review, Home while leaning, Goals, Weekly + Quick Calibration, and the control panel.

**Unchanged and still passing:** guardrail 6.5–8.5 ↔ phase target sync, Option B, Approach A, linked Phase 4, Home strict parity, 1:1 activity, no inert controls, no page errors, no overflow at 390 px.

## 5. What remains hypothetical

1. **Energy densities** (fat 4,250, lean 830 kcal/lb) are provisional policy. The +5.0 lb lean month is likely partly water and glycogen, so the monthly spread (2,020–2,350) is shown rather than hidden.
2. **The records are an Oct 10 snapshot, not a live read.** A real implementation must recompute from the store, building on `EnergyEvidenceService`, `dexaScans` and the dormant `EnergyCalibrationV1`.
3. **Activity:** usual activity (900) is the recorded mean over the period. The 1:1 credit for extra activity is approved policy, not a measurement.
4. **Simulated outcomes:** the weekly simulation's "true maintenance" is set to 2,240 only to play out weeks. Weekly results, Quick Calibration offers and completion timing are simulated.
5. **Cut intake:** what you ate during the cut is unknown (18% of days logged). The page never states it.

## 6. Founder decisions requiring review

1. Accept the records-based baseline: about 2,240 logged kcal/day (2,020–2,350 by month), at about 900 usual activity. This retires 2,117.
2. The real engine should **not** re-scale maintenance to a planned activity goal, and should **not** recency-weight a single month. It should use the qualifying span at the activity actually recorded and show the monthly spread. This affects the dormant Phase B `calibrateEnergy`.
3. Should the simulator show the Oct 10 snapshot as "Records · Oct 10", or should real values appear only after a fresh, authorized read-only check?
4. Provisional fat and lean energy densities. Should lean-mass changes count at a lower density, or be excluded from short windows?

## Storage and safety

| | |
|---|---|
| Free disk | ≈ 15 GiB (floor 12) |
| production_mutated / deployed / Native / Server / TestFlight | false / no / no / no / no |
| New production reads | none |
