# Goal Adaptation: energy 1:1 accounting and Quick Calibration (design board)

| | |
|---|---|
| **Task id** | `claude-goal-adaptation-energy-1to1-quick-calibration-20261010` |
| **Prompt** | inbox `20261010-claude-goal-adaptation-energy-1to1-quick-calibration-board.md` at `e0b7e4f5` |
| **Generated** | 2026-10-10T16:51Z |
| **Status** | Design complete; awaiting Founder review |
| **Scope** | Design only. No implementation, deployment, production access, Native, Server or TestFlight change. Release pointer unchanged. Codex pre-beta P0, Claude Recovery and existing approved design artifacts untouched. |

## Where to look

| Item | Value |
|---|---|
| **Interactive board** | **https://claude.ai/artifact/B7mShDmQ1ie9KyY6AbtLKv** (new Claude artifact, version 1; private until shared from its Share menu) |
| Design branch | `claude/goal-adaptation-energy-1to1-quick-calibration-20261010`, branched from the prior board commit `225204af`. Design only; never merge. |
| **Exact SHA** | **`dcc61f35bfb50a0543c3175a503672c1d288a40c`** |
| Commit | https://github.com/dustinginn/physiqueos/commit/dcc61f35bfb50a0543c3175a503672c1d288a40c |
| Folder | `agent-handoffs/artifacts/goal-adaptation-energy-1to1-quick-calibration-20261010/`: board, 154 screen PNGs, board captures, `validation.json`, source |
| Superseded premise | The prior board (artifact 8b6fBC33, report main `7b98690c`) is left untouched as the historical record. Its activity discount is retired by this revision. |

**Key screens on GitHub:**

| Screen | Link |
|---|---|
| Energy step 2, 1:1 (E2, Mineral Light) | https://github.com/dustinginn/physiqueos/commit/dcc61f35bfb50a0543c3175a503672c1d288a40c#diff-bcd9ad0871d465f9dd664b5bd0a2477b96a25ce63e05301ba793b90297191061 |
| One-time intro (E0, Dark) | https://github.com/dustinginn/physiqueos/commit/dcc61f35bfb50a0543c3175a503672c1d288a40c#diff-5677756f68e78449e8f399e19e413deafcf54a4f69309a54702ee47445bc7c42 |
| Quick Calibration in the Weekly (QC1, Mineral Light) | https://github.com/dustinginn/physiqueos/commit/dcc61f35bfb50a0543c3175a503672c1d288a40c#diff-cb86f6572a783242df0fccd83bfc7f12a4a03ed238389168f8aeb17f9dad6d30 |
| Choose another amount (QC3, Dark) | https://github.com/dustinginn/physiqueos/commit/dcc61f35bfb50a0543c3175a503672c1d288a40c#diff-90630e9755180c8cae3c58e16866b3d1150bba9d91397560d73ad49828fde658 |
| Board: "What changed" comparison (desktop, Dark) | https://github.com/dustinginn/physiqueos/commit/dcc61f35bfb50a0543c3175a503672c1d288a40c#diff-737527a2dd209b6faf20efec625a80a97e9d7e849f735ac73a389c991b021666 |

## 1. Accounting correction: 1:1

**Plan arithmetic**

- **Eat** = estimated maintenance + selected net balance + added activity.
- **Apple Watch active-energy goal** = usual (historical) active energy + added activity.
- Usual activity is already inside calibrated maintenance, so it is never counted twice.

**Worked example (Founder):** 2,117 − 450 + 100 = **1,767 kcal**, with a Watch goal of 800 + 100 = **900**.

**Before vs now:**

| Item | Before | Now (1:1) |
|---|---|---|
| Suggested | 1,750 (2,117 − 450 + 75, rounded) | **1,767** (not rounded) |
| Balanced | +300 → 1,900 | **+225 → 1,892** (an even split of the 450) |
| Intake-focused | 1,675 | **1,667** |
| Activity-focused | +500 → 2,050 | **+350 → 2,017**. +500 is still possible and is flagged because it means eating above maintenance (2,167). |
| Typing 1,800 while keeping −450 | added +175 | **added +133** |
| Week | 12,250 | **12,369** eaten · +700 moved · −3,150 balance |
| Likely real balance | −595 to −290 | **−591 to −310** (maintenance range only) |
| Rate and length | ≈ 0.6–1.3 lb/wk · 2–5 weeks | **≈ 0.7–1.3 lb/wk · 2–5 weeks** |
| Floor case (E4) | — | −750 with 0 added = 1,367, held at the provisional 1,600 floor; effective balance −517, shown as "limited" |

**Where uncertainty is handled**

- Calibration ranges (E1, the "likely real balance").
- Outcome-based recalibration (Quick Calibration), not a fixed discount.
- The intro and explainers never quote error percentages.

**Rounding**

- Targets are no longer rounded to 25 kcal, so the chosen balance holds exactly (1,767, not 1,775).
- Sliders move in 1 kcal steps; the ±25 buttons and presets give round moves.
- The provisional floor is still rounded up to the next 25 (1,587.75 → 1,600).

**Audit of the 60 prior screens**

- Every affected figure and string was updated: P1, P4, A1–A4, E1–E10, N1–N2 (protein share 41% of 1,767; carbs ≈ 152 g), X1–X2, RV1–RV3, B1, C1, O1.
- The contract map now reads "+ added (1:1)".
- The prior "activity credit" decision is replaced by "settled: 1:1".
- The prior Phase B refinement about the credit is replaced by an outcome-based maintenance update.

**Editable targets:** E2 now has typed numeric fields for intake and added activity, linked to the sliders. Both preserve the selected balance.

## 2. New one-time intro (E0)

Shown once before Step 1. Message:

> Your targets are a starting point. Food logs and wearables have margins of error. Consistent targets help us see how your body responds, and PhysiqueOS recalibrates from weight and body-composition trends.

"Why these numbers?" (E9) carries the details. No error percentages are shown.

## 3. New Quick Calibration journey (QC1–QC16)

**What it is.** A small, briefing-native change to one target inside the current phase. It is not a full Goal Adaptation.

**Primary Founder scenario (illustrative evidence)**

- Leaning phase since Oct 9 at 1,767 kcal with a 900 Watch goal.
- Four weeks with 27 of 28 days logged and activity on plan.
- Weight trend ≈ −0.2 lb/week vs the expected 0.7–1.3.
- Outcome-based update: maintenance 2,117 → ≈ 1,967 (1,860–2,060).

The Weekly briefing ends, **after Coach's Take**, with:

> **1,767 → 1,617 (−150)** · Accept −150 · Choose another amount · Why?

| Screen | What it shows |
|---|---|
| QC1 | The suggestion at the very end of the Weekly. No new briefing sections. |
| QC2 | "Why": the evidence summary. The gap is in the estimate, not in the user. |
| QC3 (interactive) | Choose an amount with a slider, ±25, quick chips and an editable intake field. Shows weekly intake, expected balance against the updated maintenance, and what is unchanged (activity goal 900, training, routines). |
| QC4 (interactive) | −350 is below the provisional floor (1,500) and over the ±300 quick-step limit, so it routes to the full plan review. |
| QC5 | Inline "Plan updated · 1,617 kcal/day from today", with View change and Undo. |
| QC6 | Already applied. Accept is idempotent on the recommendation id, so a second tap or device makes no duplicate change. |
| QC7 | Stale suggestion revalidated on open and at Accept (−150 → −100 after the plan changed). |
| QC8 | Escalation to the full plan review (Plan Hub) when the phase limit, goal date or guardrail is affected, or several components must change. |
| QC9 | Versioned history with briefing provenance. Going back creates a new version. |
| QC10 | Three-week observation window (provisional); safety checks still run. |
| QC11 | Insufficient evidence: no card at all. Coaching stays in Coach's Take; there is no "too early" screen. |
| QC12 | Midweek never proposes; it only links to an open Weekly suggestion. |
| QC13–QC16 | Alternates: cut 2,200 → 2,000 (the prompt's example), mass 2,600 → 2,750 (Monthly), maintenance 2,400 → 2,300, strength progression Moderate → Conservative. |

**Triggers**

| Briefing | Proposes? |
|---|---|
| Weekly and Monthly | Primary |
| DEXA Event | When evidence supports it |
| Photo Event | Only if reliable and corroborated |
| Midweek | Never |

**Contract.** A new single-target calibration write through the Phase C coordinator: versioned, idempotent and revalidated. It changes dependent targets only and preserves goal, phase, guardrail and date. The strength alternate reuses the existing training command.

## 4. Preserved decisions

- Option B side-by-side choices.
- The recommendation is always last in the briefing, after Coach's Insight/Take, with no invented sections.
- Home dismissible priority; generic notification.
- Outcome, time or hybrid phase exit.
- The disabled conflicting firm limit.
- An unlikely deadline can be kept, with a warning.
- Customization is visible before the final review.
- Unaffected components carry forward by default.
- Honest lean-mass reporting, and no automatic resumption.
- The Plan Hub (Approach A) remains an Operating Plan navigation concept, not a reversal of Option B.

## Validation

The board was rendered in headless Chrome; `validation.json` is on the branch.

| Check | Result |
|---|---|
| Page errors | 0 (desktop 1600 Dark and Light, laptop 1280, mobile 390) |
| Horizontal overflow | 0 at all four widths |
| Filter | Working |
| Lightbox | Opens on the Quick Calibration sheet; keyboard ← → T Esc |
| E2 defaults | 1,767 / +100 / 900 / 12,369 / −3,150 |
| E2 presets | Balanced 1,892 · Intake-focused 1,667 · Activity-focused 2,017 · Suggested back to 1,767 |
| E2 added +300 | Eat 1,967 |
| E2 typed intake 1,800 | Added +133 |
| E2 dragged intake 1,700 | Added +33 |
| E2 typed added 133 | Eat 1,800 |
| Balance held | −450 throughout |
| E4 floor | 1,600, "−517 limited" |
| E5 | 2,167, with the above-maintenance warning |
| E1 | −591 to −310, ≈ 0.7–1.3 lb/wk, 2–5 weeks; at −250: 0.2–0.8 lb/wk, 3–14 weeks |
| E7 | +59 to +340, 0.7–4.1 lb/month |
| QC3 | Default −150 → 1,617, week 11,319, balance −450 · chip −200 → 1,567 · typed 1,700 → −67 · "No change" → "Keep current plan" |
| QC4 | −350 → floor and step-limit messages, Apply replaced |
| Remnant scan | **0** occurrences of "75%" in visible text or source; **0** of "credit". "1,750" appears only in the "Before" column of the comparison table. |
| Captures | 77 screens × 2 themes; visually spot-checked: E0, E2, QC1, QC3, QC4 and the "What changed" board section |

## Acceptance checklist

- [x] No activity discount in any calculation, slider, preset, rate or phase estimate, validation, screenshot, rationale, formula or contract proposal.
- [x] 2,117 − 450 + 100 = 1,767; Watch goal 900; usual activity not double-counted.
- [x] Linked sliders and typed numbers preserve the selected balance.
- [x] All presets, weekly totals and constraints recomputed; floor and cap labelled provisional.
- [x] One-time intro on uncertainty and recalibration (E0), with no error percentages.
- [x] Quick Calibration: briefing-native, Accept or Choose another amount, compact custom input, weekly intake and balance, unaffected items listed, inline confirmation, undo and history, no duplicate application, revalidation, escalation, observation window, no proposal without evidence, Midweek never proposes, alternate goals.
- [x] Prior approved designs preserved, with figures updated and sections marked NEW or UPDATED.
- [x] Dark and Mineral Light; desktop, laptop and mobile; keyboard and zoom (lightbox at 1×, Dynamic Type 135% screens).

## Open questions for the Founder

1. **Quick-step limit:** ±300 kcal before a full plan review is required?
2. **Observation window:** 3 weeks, or 4 to match the calibration checkpoint?
3. **Undo window:** until the next food log against the new target, or a fixed 24 hours?
4. **Default component:** intake by default (as drawn), or let the sheet choose between intake and activity?
5. **Provisional limits:** keep the floor at 25% below maintenance and the +500 added-activity cap for now?

## Storage and safety

| | |
|---|---|
| Disk | ≈ 18–19 GiB free (above the 15 GiB floor) |
| Branch additions | ≈ 36 MB (PNGs and source) |
| Temp files and worktrees | Job temp directory only; no worktrees created |
| production_mutated / deployed / Native / TestFlight | false / no / no / no |
| `latest.*` | unchanged |
| Secrets | none |
