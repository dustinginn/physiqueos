# Goal Adaptation simulator: body-fat guardrail editing

- **Task id:** `claude-goal-adaptation-simulator-guardrail-editing-20261010`
- **Request:** Founder chat on 2026-10-10. Add guardrail editing to the Goal Adaptation simulator.
- **Status:** complete; awaiting Founder re-test.
- **Scope:** design and simulation only. No production, Native or Server change, no TestFlight, `latest.*` unchanged.

## Branch, SHA and links

| Item | Value |
|---|---|
| **Design branch** | `claude/goal-adaptation-home-parity-simulator-20261010` |
| **SHA** | **`da018eed78347ca26d84200864a96564ebccb3d1`** (pushed; local = remote) |
| Commit | https://github.com/dustinginn/physiqueos/commit/da018eed78347ca26d84200864a96564ebccb3d1 |
| **Simulator (Claude artifact, version 4)** | **https://claude.ai/artifact/X2SJbf84x6sfe5UQyydLCP** (private until shared) |
| Guardrail model | https://github.com/dustinginn/physiqueos/commit/da018eed78347ca26d84200864a96564ebccb3d1#diff-f424b393f6478ffc26b48a1f17c84e8a68f880a0f98bfe1c27b6bfe9c0394ff2 |
| Guardrail unit tests | https://github.com/dustinginn/physiqueos/commit/da018eed78347ca26d84200864a96564ebccb3d1#diff-b529d7ebc996b2878698f22312a8e58664e756cee90296fdbb1be8bd72fd6851 · results https://github.com/dustinginn/physiqueos/commit/da018eed78347ca26d84200864a96564ebccb3d1#diff-bd791ef55fb25d711d5149499f3c8f1bc04125a748333cdc9c2bde32d1be0719 |
| End-to-end tests | https://github.com/dustinginn/physiqueos/commit/da018eed78347ca26d84200864a96564ebccb3d1#diff-20ec9597cb3e48f0d04b7c0b4be8614b2db6fbb5ebb47588003903f7659450ad · results https://github.com/dustinginn/physiqueos/commit/da018eed78347ca26d84200864a96564ebccb3d1#diff-1c00797cac20bdb51f3ff3bf5e69383fec53ef35c074c14cc1b761cc7ce9ea60 |
| Simulator page | https://github.com/dustinginn/physiqueos/commit/da018eed78347ca26d84200864a96564ebccb3d1#diff-351ba246854d40e5713c272d99a3da218b1185b54ec504953319c4662fb6b39b |

**Screenshots:**

| Screen | Link |
|---|---|
| Lean setup (target + guardrail) | https://github.com/dustinginn/physiqueos/commit/da018eed78347ca26d84200864a96564ebccb3d1#diff-40439b4937df89e1253cdb8a0a595afc6428bad11567653e00e12b080aac4784 |
| Guardrail editor | https://github.com/dustinginn/physiqueos/commit/da018eed78347ca26d84200864a96564ebccb3d1#diff-5beffa472decdc7c20e1e1bad00cd714241962eb0c3059d3a98a82d720e5a4a5 |
| Review | https://github.com/dustinginn/physiqueos/commit/da018eed78347ca26d84200864a96564ebccb3d1#diff-87fd6372c6c9ef7e78b3a781b8ff6886edb56866a49a11b454fa38dec256a6f0 |
| Home during leaning | https://github.com/dustinginn/physiqueos/commit/da018eed78347ca26d84200864a96564ebccb3d1#diff-ccbe4be79777ef1958b6115badfddfc29e2e9f62dc4a4e3408f0212f90727558 |

## What was added

### 1. One simple editor, reachable where it matters

Body-fat guardrail options:
- **Keep** the current range.
- **Change the range** (lower and upper limits, in 0.5% steps).
- **Remove the guardrail.**

**Applies to:**
- **This phase only** (labelled "Leaning phase only" or "Next phase only"). The override expires when that phase ends.
- **Goal, going forward.**

**Opened from:**
- Leaning setup ("Body-fat guardrail" row);
- Keep building;
- the Approach A plan hub (listed under "Changing" once edited, otherwise "Carrying forward");
- the phase-complete "What's next" screen.

There is no separate workflow; every edit joins the same plan draft.

### 2. Phase target kept distinct from the guardrail

- The leaning setup shows a separate **Phase target**: "Ends at body fat ≤ X%" (default 9%, adjustable in 0.5% steps). Copy: "The phase target is what ends this phase. The guardrail is the range your goal protects."
- **Completion now uses the phase target, not the guardrail.**
- Goals shows the goal guardrail, any phase-only guardrail, and the phase target separately.

### 3. Resuming in linked Phase 4

- "What's next" shows **"Guardrail when building resumes"**. Any leaning-only guardrail is marked as ending with the phase, so the **goal guardrail** applies unless edited there.
- Review names the phase **"Phase 4 · Lean Mass Build (linked to Phase 2)"**.

### 4. Review and approve

- Review lists **"Body-fat guardrail: original → proposed"** (for example `8–9% (goal)` → `8–10% this phase only · goal 8–9%`) alongside phase, phase end, goal date, balance, eat and activity goal.
- Errors disable Approve.
- **One approval** applies everything and creates exactly one version. The version detail records the guardrail change, which preserves goal history; Undo restores the previous guardrails.

### 5. Validation

Covered by `guardrail-model.js`.

**Errors (block approval):**
- the upper limit is less than 0.5% above the lower limit;
- the range is outside 4–20%;
- **building** (Keep building, resume, custom) while body fat is above the effective upper limit;
- the phase target is at or above current body fat;
- the phase target is above the effective guardrail's upper limit.

**Warnings (shown, approval allowed):**
- removing the guardrail (body fat is still shown but no longer triggers reviews);
- a phase-only scope (the goal guardrail returns afterwards);
- a phase target below the guardrail's lower limit.

### 6. Home (strict parity)

- Only the existing GUARDRAIL box text changes. It shows the effective range, with "This phase only · goal 8–9%" when a phase override is active.
- When the guardrail is removed, it reads "No body-fat guardrail" in the same slot, so the layout is unchanged.
- Home rendering, the energy model and the 1:1 arithmetic are otherwise unchanged.

## Validation results

| Suite | Result |
|---|---|
| Guardrail unit tests (`guardrail-model.test.mjs`) | **17/17 passed** |
| Energy arithmetic (`energy-model.test.mjs`) | **25/25 passed** (unchanged) |
| End-to-end (`test-sim.mjs`, headless Chrome, desktop and 390 mobile) | **81/81 passed** (all 57 earlier checks plus 24 guardrail checks) |

**The 17 guardrail unit checks cover:**
- keep, phase-only change, goal change, goal remove and phase remove;
- text formatting;
- an inverted range;
- a target above the guardrail, and a target within it;
- a target at or above current body fat;
- target 9.5% allowed with a phase-only 8–10% guardrail;
- Keep building at 9.7% with 8–9% blocked; with 8–11.5% allowed; with the phase guardrail removed allowed with a warning;
- resume at 8.9% with 8–9% allowed; with a new goal range of 7–8.5% blocked;
- out-of-bounds ranges.

**The new end-to-end paths:**
1. **Keep building.** 8–9% is blocked at 9.7%, then raised to 8–11.5% for this phase. Review shows original and proposed. One version. Goal stays 8–9%; Home shows "8–11.5% · This phase only · goal 8–9%".
2. **Leaning.** Target 9.5% is blocked against 8–9%, then cleared with a leaning-only 8–10%. An inverted range is blocked. The hub lists the guardrail as changing. Review shows the guardrail change and "Body fat ≤ 9.5%". One approval; state is goal 8–9, phase 8–10, target 9.5.
3. **Completion and resume.**
   - The phase completes on its own target (≤ 9.5%, above 9%).
   - "What's next" shows the leaning-only guardrail expiring and the goal 8–9% applying.
   - Resume is blocked while above 9%, then cleared by a goal-wide 8–9.5%.
   - Review shows Phase 4 linked to Phase 2.
   - The plan resumes with goal 8–9.5% and no override; Home H4 shows 8–9.5%.
   - Goals history keeps both guardrail changes, and Undo restores the earlier state.
4. **Remove the guardrail for the goal** from the plan hub. A warning appears; Review shows "None (goal)"; Home shows "No body-fat guardrail" in the same slot.

Also checked: no inert controls, no page errors, no horizontal overflow on mobile.

## Preserved

- Option B comparison and Approach A plan hub.
- The energy model and Energy Lab (1:1; 2,117 labelled illustrative).
- Quick Calibration.
- Strict Home visual parity (content only).
- Linked Phase 4 and goal progress for PROGRESS.
- No prescriptive activity.
- No new briefing sections; Midweek never proposes.

## Required real-engine changes for later (not built)

1. **A structured guardrail contract.**
   - Production stores the guardrail as free text, parsed by regex, with a second frozen copy in `phaseStrategies` that can diverge.
   - Needed: `{enabled, min, max, scope: goal|phase, effective period}` as the single source, with a phase-scoped override that expires at phase end.
2. **A phase target field**, separate from the guardrail (for example `completionCriteria.bodyFatAtOrBelow`), used for phase completion.
3. **The coordinator write** applies guardrail, phase and plan changes in one approval, with version history.
4. **V3 and briefings** read the effective guardrail (phase override, else goal).

## Founder decisions requiring review

1. Accept the guardrail editor and its scopes: "this phase only" vs "goal, going forward".
2. Should building (Keep building or resume) stay **blocked** while above the guardrail's upper limit, as built, rather than allowed with a warning?
3. Default phase target: the guardrail's upper limit (9%), or a point inside the range?

## Storage and safety

| | |
|---|---|
| Task footprint | a few MB |
| Free disk | ≈ 18.7 GiB |
| production_mutated / deployed / Native / TestFlight | false / no / no / no |
| `latest.*` | unchanged |
