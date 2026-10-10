# Goal Adaptation: Operating Plan customization redesign (overnight design board)

- **Task id:** `claude-goal-adaptation-operating-plan-design-20261010`
- **Prompt:** inbox `20261009-claude-goal-adaptation-overnight-operating-plan-design-board.md` at `136b1b9a`
- **Generated:** 2026-10-10T06:23Z
- **Status:** design complete; awaiting Founder morning review.
- **Scope:** design only.
  - No Phase B implementation, Phase C, Native, Server, onboarding, deployment or TestFlight change.
  - No production access or writes.
  - Release pointer unchanged.

## Where to look

| Item | Value |
|---|---|
| **Interactive board (Claude artifact, version 1)** | **https://claude.ai/artifact/8b6fBC336wGZA9cksEVGqM** (private until shared from its Share menu) |
| Design branch | `claude/goal-adaptation-operating-plan-design-20261010`, branched from the accepted V2 design branch (`7a23c4b0`); design only, never merge |
| **Exact SHA** | **`225204afb487990c5f7d974a4062f72cc1521600`** |
| Commit | https://github.com/dustinginn/physiqueos/commit/225204afb487990c5f7d974a4062f72cc1521600 |
| Artifact folder on the branch | `agent-handoffs/artifacts/goal-adaptation-operating-plan-design-20261010/` (board HTML, 120 screen PNGs, board captures, validation, audits, source) |

**Key files on GitHub:**
- Board source: https://github.com/dustinginn/physiqueos/commit/225204afb487990c5f7d974a4062f72cc1521600#diff-b2fb3ebae901eea07f60792c9a6cbbffcfd963bce15aca6a1656cbc040fdb796
- Native Operating Plan audit: https://github.com/dustinginn/physiqueos/commit/225204afb487990c5f7d974a4062f72cc1521600#diff-73cf372b95bd522cafe1823892ebfe1f59ce95857cccd3922479cc938ef38b33
- Goals editors and tokens audit: https://github.com/dustinginn/physiqueos/commit/225204afb487990c5f7d974a4062f72cc1521600#diff-e5807a6768e3693a048275a2885e79432647420f7aab100b26c5656ead5e99fb
- Server contract audit: https://github.com/dustinginn/physiqueos/commit/225204afb487990c5f7d974a4062f72cc1521600#diff-86347b664ed1899e82697f4b84dd55e838a7623c6bde3a773c8a831afad46563
- Plan hub (A1, Dark): https://github.com/dustinginn/physiqueos/commit/225204afb487990c5f7d974a4062f72cc1521600#diff-40b26135b3e580585b91ccba60b1ea1fee7dc1fcf322a77bad00ffe8d8ce3a86
- Energy step 1 (E1, Dark): https://github.com/dustinginn/physiqueos/commit/225204afb487990c5f7d974a4062f72cc1521600#diff-1bb440f141fabfbe0ce0a0bd50d8f21cbe9d072bdb81e716f44455f1cc7405d3
- Energy step 2 (E2, Mineral Light): https://github.com/dustinginn/physiqueos/commit/225204afb487990c5f7d974a4062f72cc1521600#diff-198a8f24b5760df6498be5215bb7b75f29656ae54f26087195852f11c49a3417
- Review and approve (RV1, Mineral Light): https://github.com/dustinginn/physiqueos/commit/225204afb487990c5f7d974a4062f72cc1521600#diff-75e878d0cea7d04415f1e73119ffd6186c00aa3497840369bad9ae11b01c69ac

## What the audit found

Three read-only audits ran at release commits, used for capabilities and contracts, not as visual templates:
- Native Build 94 `49829781`: Operating Plan editors;
- Native Build 94 `49829781`: Goals and Phase editors plus tokens;
- Server production `85a98025`: canonical edit contracts.

1. **Every Goals and Phase editor in Native is sandbox-only.** Goal, phase, guardrail and Phase Review edits exist in production only as Web server actions.
2. **Energy is read-only.** Its only production writer is Phase Review "Begin", which sets intake (500–10000) and activity (0–10000) kcal/day.
3. **Pieces the new design needs do not exist today:**
   - net-balance target;
   - "added activity above usual";
   - steps or cardio target;
   - macro grams;
   - consistency target;
   - training schedule, volume or intensity;
   - sleep target;
   - hybrid completion;
   - structured guardrail or firm/flexible flag.
4. **The body-fat guardrail is stored as free text and parsed by regex.** A second, frozen copy in `phaseStrategies` can diverge from it after a goal edit.
5. **Canonical Native commands exist today for:**
   - Nutrition (protein basis and ratio, carb and fat approach);
   - Training (frequency per area, focus, progression);
   - Recovery and Tracking recurring support;
   - Peptide support and pause/resume;
   - Supplement support, strategy and pause/restore;
   - Coaching Updates (briefing cadence, photos, DEXA, event briefings).
6. **There is no unsaved-changes handling anywhere.** Drafts are silently discarded. Each strategy commits on its own; there is no coordinated approval.
7. **Activity is compared to Apple Watch active energy, which already includes workouts.** The design therefore never double counts the usual activity.

## Design

### Three navigation approaches

All three use the same focused editors and a single approval.

| | Approach | Summary | Verdict |
|---|---|---|---|
| A | **Plan hub with a draft tray** | One page: what's changing first, then every other strategy collapsed but named. Tap a row for a focused editor; Cancel/Done return to the hub. A persistent tray shows the draft count and leads to one review. | **Recommended**: 3 screens for a typical adaptation (setup → plan → review), unaffected settings discoverable early, same rows reused by the standalone Operating Plan |
| B | Guided path | 7 steps, each defaulting to "Keep as is", with "Skip to review" | Alternative: slower when only 1–2 things change |
| C | Everything on one page | Inline accordion | Considered: dense and overwhelming by default |

### The new energy experience

Two of the screens are interactive prototypes: drag the sliders, use the presets, step by ±25, reset.

1. **Step 1 picks the daily balance.**
   - Range −750 to +500 kcal, with gentle, moderate and aggressive zones.
   - It shows the likely real balance from calibration uncertainty, plus an expected rate range (lb/week for loss, lb/month for gain) and the phase length.
   - Founder at −450: ≈ 0.6–1.3 lb/week, leaning 2–5 weeks.
2. **Step 2 splits the balance between eating and moving** with linked sliders that hold the chosen balance.
   - Presets: Suggested, Balanced, Intake-focused, Activity-focused.
   - Exact numeric entry asks whether activity or the balance absorbs the difference.
   - Weekly targets and the 7-day view are included.
   - The Apple Watch goal = usual (≈ 800) + added.
3. **Formula:** intake = maintenance + balance + 0.75 × added.
   - The usual activity is already inside the calibrated maintenance, so it is never counted twice.
   - Added activity is discounted because Watch estimates for extra exercise run high.
4. **Warnings:**
   - the intake floor (25% below maintenance = 1,600 for the Founder);
   - a large added-activity jump;
   - a rate faster than 0.85% of body weight per week.
5. **Other states:**
   - the surplus mode (keep building), with an explicit "within maintenance uncertainty" note;
   - the no-calibration state, which shows no deficit, rate or length and offers keep-current or "not calibrated" custom numbers.

### Coverage

| Area | Screens |
|---|---|
| Journey entry | J1–J2 |
| Phase, goal date, guardrail, check-ins | P1–P7 (completion by outcome, time or whichever first; structured guardrail with strictness and effective period; feasibility-band goal date) |
| Plan hub | A1–A6 |
| Energy | E1–E10 |
| Nutrition | N1–N3 |
| Activity | AC1–AC3 |
| Training | T1–T3 |
| Recovery and shared schedule editor | R1–R3 |
| Peptides | PE1–PE3 (no medical advice) |
| Supplements | SU1–SU2 |
| Coaching updates, photos, optional DEXA | CU1–CU3 |
| Tracking and a consolidated reminders view | TR1–TR2 |
| Cross-strategy conflict, failure, edited elsewhere | X1–X3 |
| Review, superseded, approved | RV1–RV3 |
| Approach B | B1–B3 |
| Approach C | C1 |
| Reuse outside Goal Adaptation | O1 |

**60 screens and states, each in Dark and Mineral Light (120 captures).**

**Coverage matrix** (board section "Coverage matrix"): **73 fields and concepts across 10 areas**, each mapped to a reviewed screen.
- Columns: what exists today (control and location), the contract, and the redesign status.
- Status counts: Canonical today, Canonical · Web only, New contract (Phase C), Concept only, Read-only.
- A second table maps every requested interaction state to screens:
  - save/cancel, reset, optional change, disabled, conflict;
  - dirty, unsaved, back navigation, preview/diff;
  - Dynamic Type, Dark/Mineral, missing evidence, out of range;
  - cross-strategy, revalidation, failure.

## Feasibility and contract mapping

| Capability | Today | Proposed |
|---|---|---|
| One approval for goal, phase and strategies | Each strategy commits alone; goal and phase are Web-only | Server `GoalAdaptationCommitCoordinator` (roadmap Phase C): one transaction with a review token and revalidation fingerprint |
| Balance, intake and added activity | Two stored energy targets, read-only outside Phase Review | Keep the two stored targets. Balance and added activity are UI inputs that resolve into them; store the calibration snapshot for revalidation. |
| Structured guardrail | Free text, plus a divergent frozen copy | Phase 0 structured guardrail `{min, max, strictness, effectivePeriod}` as the single source |
| Hybrid completion | `fixed_duration | target_date | completion_criteria` | `completion_criteria` plus a time-limit review milestone |
| Nutrition, training, recovery, tracking, peptides, supplements, coaching | Canonical Native commands | Reuse as coordinator participants, keeping per-strategy 412 stale handling (X3) |
| Steps, cardio sessions, weekly distribution, sleep and rest targets, macro grams, consistency, training schedule/volume/intensity, DEXA unschedule | None | Concept only; no backend proposed this round |

## Founder decisions

1. Approve **Approach A** (plan hub + draft tray), keeping B as a possible shell.
2. Confirm the energy order: **balance first, then the eat/move split**, with linked sliders.
3. **Activity credit 75%** (provisional). Alternatives: 100%, or 50% for large additions.
4. **Safety bounds** (provisional, matching Phase B): 25% intake floor, +500 added-activity cap, aggressive zone below −650.
5. **DEXA never required:** "back in range" is confirmed by DEXA when available, otherwise estimated from weight trend and photos (P1).
6. **Structured guardrail strictness**, "firm limit" vs "target range" (P5): a new field.
7. **Peptides:** pause/resume and existing schedule edits only, with no-advice copy.
8. **Draft lifetime:** keep the draft until the recommendation expires (14 days) or new evidence supersedes it.
9. **Which concept-only items to pursue next.**
10. **Consolidated "Tracking & reminders"** view (TR1).

## Validation

Board rendered headless in Chrome; `validation.json` is on the branch.

| Check | Result |
|---|---|
| Page errors | 0 (desktop 1600 Dark and Light, laptop 1280, mobile 390) |
| Horizontal overflow | 0 at all four widths |
| Filter | "validation" → 11 screens |
| Lightbox | opens; arrows and theme toggle wired |
| Interactive energy | Defaults: 1,750 eaten / +100 / −450 |
| | Added activity +300 → intake 1,900, balance held |
| | Intake-focused preset → 1,675 / +0 |
| | E4 at −750 with no added activity → held at the 1,600 floor with a red explanation |
| | E1 at −250 → gentle, ≈ 0.2–0.8 lb/week, 3–17 weeks |
| | Surplus +200 → ≈ 0.8–4.2 lb/month, with the uncertainty note |
| Screen captures | All 60 screens × 2 themes rendered in isolation; spot-checked visually (A1, A6 at 135%, E1, E2, E6, P5, RV1, X1) |

## Known gaps

- Peptide advanced dose-plan editing is linked, not redrawn; its safeguards stay as built.
- The supplement create and strategy editors are summarized, not fully drawn.
- VoiceOver is specified by ARIA labels on the interactive controls; no screen-reader walkthrough was recorded.
- Steps and kcal-per-walk conversions are rough illustrations.
- Nutrition and supplement values are illustrative (from Native fixtures).

## Recommended Phase B refinements

1. Return a **net balance**, with its uncertainty band, for each option. Today options carry intake ranges only.
2. Add **usual activity** (28-day Watch mean and range) to the calibration output.
3. Make the **activity credit** and **added-activity cap** provisional policy values.
4. Expose **phase length as a function of any chosen balance**, not just option ranges, so E1 is engine-backed.
5. Return a **surplus rate per month** with a "within maintenance uncertainty" flag.
6. **Snapshot the calibration** in the recommendation, so revalidation can move derived intake while keeping the user's choices (A4, RV3).

## Storage and safety

| | |
|---|---|
| Disk | 19–20 GiB free throughout (15 GiB floor never approached) |
| Branch artifacts | ≈ 29 MB of PNGs and source on the design branch |
| Temp files | Only the job temp directory was used; no worktrees were created |
| production_mutated / deployed / Native / TestFlight | false / no / no / no |
| Release pointer (`latest.*`) | unchanged |
| Codex DEXA and Claude Recovery lanes | untouched |
| Secrets or credentials | none |
