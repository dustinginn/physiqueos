# Goal Adaptation V3: simplicity with sophistication (focused design board)

- **Task id:** `claude-goal-adaptation-v3-simplicity-20261010`
- **Prompt:** inbox `20261010-claude-goal-adaptation-simplicity-sophistication-v3.md` at `790fa4a6`
- **Generated:** 2026-10-10T17:55Z
- **Status:** design complete; awaiting Founder review.
- **Scope:** design only.
  - No implementation, production access, deployment, TestFlight or release-pointer change.
  - No overlap with Codex P0 or Claude Recovery.
  - Prior boards and artifacts untouched.

## Where to look

| Item | Value |
|---|---|
| **Interactive board** | **https://claude.ai/artifact/RtfbuRvTT2FnpMGrki3m9p** (new artifact, version 1; private until shared) |
| Design branch | `claude/goal-adaptation-v3-simplicity-20261010`, branched from `dcc61f35`; design only, never merge |
| **Exact SHA** | **`1ea3ca7c67a7dd96293be59207d35d30f06b5cbc`** |
| Commit | https://github.com/dustinginn/physiqueos/commit/1ea3ca7c67a7dd96293be59207d35d30f06b5cbc |
| Folder | `agent-handoffs/artifacts/goal-adaptation-v3-simplicity-20261010/`: board, 54 PNGs, `validation.json`, two source audits, source |

**Key files:**
- Quick Calibration, Blend selected (Q2, Mineral Light): https://github.com/dustinginn/physiqueos/commit/1ea3ca7c67a7dd96293be59207d35d30f06b5cbc#diff-a0f3d486ea1e23bf8bd7c8f2fb709f5bf88a9202fb8ac38e1b72a54617ec05af
- One-screen energy editor (F4, Dark): https://github.com/dustinginn/physiqueos/commit/1ea3ca7c67a7dd96293be59207d35d30f06b5cbc#diff-759029147769fd4994eee4f5a34fe0e2bb5583f47ae170b90ab70fcfb96e09f3
- Learned training (T1, Dark): https://github.com/dustinginn/physiqueos/commit/1ea3ca7c67a7dd96293be59207d35d30f06b5cbc#diff-543cd45413a31dd7aee1011bb8cda83be4c0a7294f626de1bd2d954aa6449dec
- RMR audit: https://github.com/dustinginn/physiqueos/commit/1ea3ca7c67a7dd96293be59207d35d30f06b5cbc#diff-b225bec0b3be7cfe9a07931300ef9ad1536e608c38ceb8b32a00a1c92f8b4bc1
- Training audit: https://github.com/dustinginn/physiqueos/commit/1ea3ca7c67a7dd96293be59207d35d30f06b5cbc#diff-b17d04154d7fae5fbdb917daf913087f8d1289c5f35fac7fcd64467a4d48785a

## Principle

The engine does the work; the user sees only meaningful decisions.

- **Updates on its own, with one-tap explanations:** estimates and learned patterns, meaning resting energy, maintenance and training.
- **Never changes without the user's approval:** targets, phase, limits and goal date.
- **Kept unchanged:**
  - Option B comparison and the Approach A plan hub;
  - 1:1 activity arithmetic;
  - recommendation last in briefings, no new briefing sections;
  - guardrail, phase and deadline behaviour;
  - goal history;
  - no automatic resumption.

## Source audit: what exists vs what's missing

Read from Server production `85a98025`, Native Build 94 `49829781` and the dormant Phase B candidate `99f11ae6`.

### Resting energy (RMR), maintenance and activity data

**Exists in production:**
- **DEXA-report RMR.** BodySpec PDF parse or manual entry, stored per scan (`PdfInterpreter.js:191-223`, `dexaScan.js:39`).
- **Energy math.** `EnergyDailyReconciliationService.js:119-152` computes expenditure = **DEXA RMR + Apple Health active energy** and balance = intake − expenditure. Used across Weekly, Midweek, Monthly, Photo, V3 period evidence, Energy Evidence and PI services.
- **Approved targets.** Phase-review-only targets (`caloricIntakeTarget` and `activityExpenditureTarget`) with `adjustmentAuthorization: user_required` and no auto-adjust.
- **Outcome check, narrative only.** V3 flags `estimate_vs_outcome_tension`.
- **Manual, voice and screenshot activity entry.**

**Missing:**
- No RMR equation of any kind (Mifflin, Harris, Katch, Cunningham) and no lean-mass RMR. RMR changes only when a new scan arrives.
- No source type that separates measured from DEXA-report from equation RMR. The BodySpec value is itself an estimate but is labelled "dexa". No ± range.
- No Apple Health basal energy. The Watch reads it only for the live workout display.
- **No maintenance/TDEE estimate in production.** "Maintenance calibration" is a label only. The only estimator is the dormant Phase B `EnergyCalibrationV1`.
- **No sex or age data.** The fields exist but are null; height is in seed data only. Native collects none of it, so a provisional RMR without DEXA is not possible today.
- **No Fitbit or other connectors.** Apple HealthKit is the only automated source. The source-neutral pieces are the canonical `activity_day` and the `wearable_estimate` type.

### Training

**Exists in production:**
- Learned usual training **weekdays** for any workout, with missed-run and frequency-change detection, in briefings (`BriefingIntelligence.js`). Untracked days are never counted as missed.
- Per-lift volume, best set, PRs and trend status. Comparisons respect the Build 92 variant and superset partners. Supersets are never double-counted.
- Exercises map to 11 muscle groups.
- The Logger's "Suggested today" (6+ sessions).
- Per-region goal progress.

**Missing:**
- The **11 → 6 plan-area mapping**.
- A **per-area weekly learner**.
- Weekly sets or tonnage per area, and e1RM.
- A travel or deload marker.
- Evaluation of stored strategy expectations.

**Dormant:** a planned-vs-observed comparator exists in Monthly V3, but production passes null to it, and it has a Sunday week-start bug and a vocabulary mismatch.

**Likely existing bug:** the Goal phase-review priority filter has a case and taxonomy mismatch (`GoalTrainingProgressService.js:7, 130`).

## Design changes (27 focused screens, Dark + Mineral Light)

### 1. Quick Calibration, balance first (Q1–Q6, interactive)

**What the user sees.** The Weekly briefing ends, after Coach's Take, with "**Deepen your daily deficit by 200**" (−450 → −650 planned). The evidence is good logging and activity, but a weight trend of −0.2 lb/week; the real deficit is ≈ −250.

**Four equal choices.** None is preselected; Accept stays disabled until one is chosen.

| Choice | Eat | Activity goal |
|---|---|---|
| Eat less | 1,567 | 900 |
| Move more | 1,767 | 1,100 |
| Blend | 1,667 | 1,000 |
| Custom | two small inputs, starting at 150 + 50 | |

All arithmetic is 1:1.

**Accepting:**
- Inline "Plan updated" with View change and Undo.
- One atomic write of the balance and its dependent targets.
- 3-week observation window.

**"Why 200?"** Maintenance estimate 2,117 → ≈ 1,917.

**Escalation.** The briefing escalates to the plan hub only when the phase limit, date or guardrail is affected.

**Triggers.** Weekly and Monthly are primary, DEXA is eligible, Photo is conditional, Midweek never originates.

### 2. Evolving RMR and maintenance (M1–M3)

- **"Why these numbers?" shows three layers.** Resting energy (with its source label) → maintenance learned from results (with a range) → your approved targets.
- **New user without a scan.** A provisional RMR from sex, age, height and weight, read from Apple Health where possible; only missing fields are asked, once. Shown as a wide range that narrows after about 3 weeks.
- **After a new scan.** The estimates move; approved targets do not. A briefing suggests a change only if it matters.

### 3. Learned training (T1–T4)

- **"Learned from your recent workouts"** shows the observed frequency and usual days, how lifts are trending, a coach suggestion, and optional goals. Each is clearly separated.
- **Still learning:** no pattern is claimed until about 3 weeks and 6 workouts.
- **A light or travel week** is not treated as a new routine.
- **No mandatory split.**

### 4. Simplified plan

| Area | V3 design |
|---|---|
| Energy (F4) | One screen: balance + Suggested / Eat less / Move more / Blend / Custom. No weekly day-by-day split; daily targets are averages. |
| Activity (A1, A2) | One number. A short, non-prescriptive example ("≈ 2,200 more steps a day; any activity counts"). "Activity data · Apple Health" wording. A no-data route. No device claims. |
| Recovery (R1–R3) | Add your own priority (stretching, mobility, custom). Optional sleep goal. |
| Supplements (S1, S2) | Add/edit, optional amount, how often, reminder. |
| Photos & DEXA (P1) | Both optional. |
| Review (F5) | Only numbers that change. |
| Stale drafts (F6) | Generic revalidation, replacing "edited elsewhere". |
| Leaning setup (F2) | Two decisions; everything else carries forward, with "Your plan" visible early. |

## Backend contract gaps (for later phases; none built)

| Gap | What's needed |
|---|---|
| Quick Calibration write | Single and dependent-target atomic update; recommendation id (idempotent), revalidation fingerprint, version provenance. Phase C coordinator. |
| Production maintenance estimate | Promote Phase B `EnergyCalibrationV1` with ranges; reconcile with RMR + active. |
| RMR source and between-scan estimate | Source-type enum; lean-mass estimate from the last scan plus weight trend; ± range. |
| Profile for a provisional RMR | Apple Health sex, birth date, height and body mass (new permissions), stored server-side; ask only what's missing. |
| Learned training per area | 11→6 mapping; per-area weekly learner (Monday weeks, 4–8 week window, ≥3 weeks and ≥6 workouts); fix and wire the Monthly V3 comparator. |
| Recovery priorities and sleep goal | Reuse recurring support for custom items; add a sleep-goal field. |
| Other activity sources | Connector interface on top of the existing `activity_day` contract. |

## Validation

Headless Chrome; `validation.json` is on the branch.

**Rendering:** 0 page errors and 0 horizontal overflow at desktop 1600 (Dark and Light), laptop 1280 and mobile 390. The lightbox opens on Q2.

**Energy editor (F4):**

| Case | Result |
|---|---|
| Default | −450 → eat 1,767, goal 900; formula 2,117 − 450 + 100 |
| Eat less | 1,667 / 800 |
| Move more | 2,117 / 1,250, with the at-maintenance warning |
| Blend | 1,892 / 1,025 |
| Custom: typed 1,800 | +133, goal 933 |
| −750 with Eat less | held at the 1,600 floor, "−517 limited" |
| Rate | ≈ 0.7–1.3 lb/week; likely −591 to −310 |

**Quick Calibration:**

| Case | Result |
|---|---|
| No choice | shows −650 proposed; "Choose how to add 200" |
| Eat less | 1,567 / 900 |
| Move more | 1,767 / 1,100 |
| Blend | 1,667 / 1,000 |
| Custom default | 1,617 / 950 (−650) |
| Custom: eat less 400 | floor 1,450 and over-300 messages; routes to plan review |

**Remnant scan:**
- 0 matches for "75%" or "credit".
- 0 weekly split editor.
- 0 prescribed walks.
- "Fitbit" appears once, only in the audit table as "missing".
- "Edited elsewhere" appears only in before/after text describing its removal.

**Captures:** 27 screens × 2 themes. Spot-checked F4, Q2 and T1.

## Before/after decision summary

| Area | Before | Now |
|---|---|---|
| Quick Calibration | Intake-only | Balance first, then how |
| Energy editor | Two steps plus weekly split | One screen |
| Activity | Prescriptive sessions and days | One number |
| Wearable wording | Apple Watch | Activity data / Apple Health |
| Maintenance | Fixed | Evolving estimates with sources |
| Training | Configured | Learned, goals optional |
| Sleep, priorities, supplements | Concepts or fixed | Optional and easy to add |
| Photos and DEXA | Large editor | Optional toggles |
| Conflicts | Web merge screen | Generic revalidation |
| Review | Included walks | Numbers only |

## Decisions still open (Founder)

1. **Provisional RMR without a scan** needs sex and age, which the app doesn't have. Read them, plus height and weight, from Apple Health with a new permission, and ask only for what's missing?
2. **RMR between scans:** estimate from the last scan's lean mass plus the weight trend, with a range, or hold the last DEXA value until the next scan?
3. **Quick Calibration choice:** four equal options with none preselected (as drawn), or preselect the last choice?
4. **Learned training areas:** a lift that works several areas (for example, pull-ups) counts for the main area only, or for each?

Provisional values otherwise unchanged: 25% intake floor, +500 extra-activity cap, ±300 quick-step limit, 3-week observation window.

## Storage and safety

| | |
|---|---|
| Disk | ≈ 16 GiB free (above the 15 GiB floor). Screens rendered at 1.5× to keep the branch small (≈ 14 MB). |
| Worktrees | none created |
| production_mutated / deployed / Native / TestFlight | false / no / no / no |
| `latest.*` | unchanged |
| Secrets | none |
