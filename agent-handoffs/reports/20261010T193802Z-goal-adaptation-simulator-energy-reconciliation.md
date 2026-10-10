# Goal Adaptation simulator: energy model reconciliation

- **Task id:** `claude-goal-adaptation-simulator-energy-reconciliation-20261010`
- **Prompt:** inbox `20261010-claude-goal-adaptation-simulator-energy-reconciliation.md` at `fcb9ad06`
- **Status:** complete; awaiting Founder re-test of the simulator.
- **Scope:** design and simulation only. No Native, Server or production changes, no TestFlight, no change to `latest.*`.

## Branch, SHA and links

| Item | Value |
|---|---|
| **Design branch** | `claude/goal-adaptation-home-parity-simulator-20261010` |
| **SHA** | **`6c266b7c2db3cf9acd8c0959b9dfb939a67b725e`** (pushed; local = remote) |
| Commit | https://github.com/dustinginn/physiqueos/commit/6c266b7c2db3cf9acd8c0959b9dfb939a67b725e |
| **Simulator (Claude artifact, version 3)** | **https://claude.ai/artifact/X2SJbf84x6sfe5UQyydLCP** (private until shared) |
| Energy model source | https://github.com/dustinginn/physiqueos/commit/6c266b7c2db3cf9acd8c0959b9dfb939a67b725e#diff-3b118fec2866cec17cbd5d8def685b1e80a43da43a0987c0748f3cdb65de93a2 |
| Arithmetic tests | https://github.com/dustinginn/physiqueos/commit/6c266b7c2db3cf9acd8c0959b9dfb939a67b725e#diff-e2ecebd9a5af95ebad1f7045945417cda3c78ddca20d2461e34794fa994af27b · results https://github.com/dustinginn/physiqueos/commit/6c266b7c2db3cf9acd8c0959b9dfb939a67b725e#diff-e1a4cc30b6be0d498b956c58996034cfd4bf7af80facff844a65338ff534fc23 |
| End-to-end tests | https://github.com/dustinginn/physiqueos/commit/6c266b7c2db3cf9acd8c0959b9dfb939a67b725e#diff-20ec9597cb3e48f0d04b7c0b4be8614b2db6fbb5ebb47588003903f7659450ad · results https://github.com/dustinginn/physiqueos/commit/6c266b7c2db3cf9acd8c0959b9dfb939a67b725e#diff-1c00797cac20bdb51f3ff3bf5e69383fec53ef35c074c14cc1b761cc7ce9ea60 |
| Simulator page | https://github.com/dustinginn/physiqueos/commit/6c266b7c2db3cf9acd8c0959b9dfb939a67b725e#diff-351ba246854d40e5713c272d99a3da218b1185b54ec504953319c4662fb6b39b |
| Why-these-numbers screenshot (Founder case) | https://github.com/dustinginn/physiqueos/commit/6c266b7c2db3cf9acd8c0959b9dfb939a67b725e#diff-24118bfb8b3a3a81de7e768fbccec79b7e65fdbdd8ad1b0475fa2ba97102ff8d |

## What was wrong

- The simulator planned from **2,117 kcal "maintenance"** with no source shown.
- It never reconciled that figure with RMR or activity.
- It stored the plan balance as a fixed number, so the Review's −500 / 1,717 / 900 could not be explained against an RMR of about 1,850.
- The arithmetic **2,117 − 500 + 100 = 1,717** was internally consistent, but **2,117 was presented as if it were a known personal value.** It came from the dormant Phase B shadow calculation (Founder logged intake and DEXA, Jul–Oct), which is not validated.

## Corrected model

The model lives in `simulator/energy-model.js` as pure, tested functions, with every layer labelled by its source.

| # | Layer | How it's derived |
|---|---|---|
| 1 | **RMR** | Measured, DEXA report estimate, or equation (Mifflin–St Jeor from profile). Range ±5%, ±10% or ±10% respectively (illustrative). |
| 2 | **Usual activity** | Apple Health active energy over the last 4 weeks, workouts included. **None** when there is no wearable. |
| 3 | **Digestion (TEF)** | Assumed ≈ 10% of intake. |
| 4 | **Bottom-up estimate** | (RMR + usual activity) ÷ (1 − 10%). Without a wearable: RMR × a chosen activity factor. Shown with a range. |
| 5 | **Outcome-calibrated maintenance** | From logged intake versus the weight / body-composition trend, in **logged** calories. **Used only when logging is sufficient** (≥ 70% of days for 3+ weeks). |
| 6 | **Approved targets** | Eat and activity goal. **They never change unless the user approves.** |

**How the plan is built:**
- Planning maintenance is **(5)** when available, otherwise **(4)**, marked **provisional** with a wide range.
- Plan arithmetic is **1:1**:
  - eat = planning maintenance + planned balance + extra activity;
  - activity goal = usual activity + extra activity.
- Usual activity is counted once, inside maintenance. There is no discount factor.
- **The planned balance is derived** (eat − planning maintenance − extra activity). If estimates move, approved targets stay put and only the displayed balance changes. Unapproved drafts recalculate.
- **Quick Calibration** updates the calibrated maintenance, for example 2,117 → 1,867 after a −250 step. The eat and activity changes restore the planned balance, 1:1.

**Founder case, reconciled on "Why these numbers?"** (scenario A, all simulated):

| Line | Value |
|---|---|
| RMR | 1,850 (DEXA report estimate) |
| Usual activity | 800 |
| Digestion | ≈ 172 |
| Bottom-up estimate | ≈ **2,944** (range 2,516–3,372) |
| Maintenance from results | **2,117** (1,977–2,258), labelled *calibrated, illustrative* |
| Plan | eat = **2,117 − 500 + 100 = 1,717**; activity goal = **800 + 100 = 900** |
| Naive "RMR + activity goal − eat" | **1,850 + 900 − 1,717 = 1,033**, shown and labelled **"not your deficit"** |
| With digestion | ≈ 1,205 |
| Gap (bottom-up − calibrated) | **827**, explained as typical under-logged food, wearable over-estimates and RMR estimate error. The plan follows results and shows both; nothing is silently chosen. |

## Energy Lab (new, side panel)

**Scenarios:**

| Scenario | Inputs | Result |
|---|---|---|
| A · Founder illustrative, with DEXA | RMR 1,850 (DEXA report), usual 800, calibrated 2,117 | Leaning default −450 / +100 → **1,767 / 900** |
| B · No DEXA (equation RMR) | Mifflin–St Jeor on an illustrative profile (male, 38, 193 cm, 81.2 kg) = **1,833**; usual 800; not calibrated | Provisional **2,926** (2,500–3,352) → leaning draft **2,576 / 900**, with a "starting estimate" warning. Real (simulated) maintenance is lower, so Quick Calibration appears with a −300 step (the quick-step limit). |
| C · No wearable, partial logging | RMR 1,833 × 1.4 = **2,566**; no activity goal; Move more / Blend unavailable | Leaning eat **2,116**. No Quick Calibration until logging is complete; then Quick Calibration offers eat-only options. |

**Editable fields:**
- RMR and its source;
- usual activity (blank means no wearable);
- digestion %, or the activity factor when there is no wearable;
- calibration on/off and its value;
- logging completeness;
- draft balance and extra activity.

**Live readout:**
- bottom-up estimate;
- calibrated value;
- maintenance used;
- eat and goal;
- planned balance formula;
- naive sum;
- gap;
- the simulated "true" maintenance, which is hidden from the app.

**Rules:**
- Changing an assumption never changes approved targets.
- Picking a scenario restarts the simulation.

## Validation

**Arithmetic** (`energy-model.test.mjs`): **25/25 passed**. It covers:
- planning source;
- 1,717 / 900;
- naive 1,050 at 1,700 and 1,033 at 1,717;
- bottom-up 2,944 and gap 827;
- bottom-up difference −1,205;
- floor 1,600, and −750 limited to −517;
- 1:1 (+200 activity gives +200 eat and +200 goal);
- Mifflin 1,833;
- scenario B provisional 2,926 and range 2,500–3,352;
- B 2,576 / 900;
- C 2,566, no goal, eat 2,116;
- partial logging blocks calibration;
- the derived balance after recalibration.

**End-to-end** (`test-sim.mjs`, headless Chrome, desktop and 390 mobile): **57/57 passed**. It covers:
- the full prior journey;
- the Founder −500 case (1,717 / 900, source labelled);
- Why-screen reconciliation lines;
- Quick Calibration blend exact arithmetic (recalibrated maintenance, restored balance);
- scenario B provisional and a capped Quick Calibration step;
- an Energy Lab edit that recomputes the draft (calibrated 1,917 → 1,567) while the approved target stays 2,500 (derived balance +583);
- scenario C eat-only, no activity goal, logging gate;
- **no inert controls**: every rendered data-act and data-ctl has a handler, and every data-act in the source has a handler;
- no page errors;
- no horizontal overflow on mobile.

## Preserved

- Goal Adaptation flow, Option B, Approach A plan hub.
- Quick Calibration with eat less / move more / blend / custom.
- Home strict-parity content and wording.
- No prescriptive walks.
- Linked Phase 4.
- Goal progress for PROGRESS.

## Required real-engine changes for later (not built)

1. **An energy contract with explicit layers.**
   - RMR source enum and range: production today only has the DEXA-report RMR, labelled "dexa".
   - Usual activity aggregate.
   - Digestion assumption.
   - Bottom-up estimate.
   - Outcome-calibrated maintenance (promote Phase B `EnergyCalibrationV1`) gated on logging sufficiency.
   - Planning-maintenance provenance.
   - Approved targets kept separate, with a derived balance.
2. **Profile data for an equation RMR.** Sex and age are not collected today, so this needs an Apple Health characteristics permission.
3. **No-wearable path.** A user-chosen activity factor; activity-based options disabled.
4. **Quick Calibration write.** Recalibrate maintenance and update targets atomically, versioned, with the ±300 step limit.
5. **Narrative.** Show "Why these numbers?" with the naive sum explicitly marked as not a deficit, and never present the deficit as exact.

## Outstanding issues

- Every number is illustrative. **2,117 is not a validated personal maintenance value.**
- The ranges (±5% / ±10% RMR, ±25% wearable, ±15% activity factor) are illustrative assumptions for review.

## Founder decisions requiring review

1. Re-test the simulator, starting from your Review case, and accept the energy explanation.
2. Confirm the planning rule: plan from **outcome-calibrated maintenance** when logging is sufficient, otherwise from a **provisional bottom-up** estimate shown with its range.
3. Confirm that the provisional ranges and the 10% digestion assumption are acceptable for display.

## Storage and safety

| | |
|---|---|
| Free disk | ≈ 18.7 GiB at start (above the 12 GiB floor) |
| Task footprint | a few MB |
| production_mutated / deployed / Native / TestFlight | false / no / no / no |
| `latest.*` | unchanged |
