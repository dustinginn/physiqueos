# Goal Adaptation simulator: goal guardrail ↔ phase target sync

- **Task id:** `claude-guardrail-goal-phase-target-sync-20261010`
- **Prompt:** `agent-handoffs/inbox/prompts/20261010-claude-guardrail-goal-phase-target-sync.md` at commit `ce3b6ad1`.
- **Status:** complete; awaiting Founder re-test.
- **Scope:** design and simulation only. No production, Native or Server change, no TestFlight. `latest.*` and Codex work untouched.

## Branch, SHA and links

| Item | Value |
|---|---|
| **Design branch** | `claude/goal-adaptation-home-parity-simulator-20261010` |
| **SHA** | **`13f442b93d37515df35d616c86f128755bc37945`** (pushed; local = remote) |
| Previous guardrail head | `da018eed` (report `agent-handoffs/reports/20261010T194846Z-goal-adaptation-simulator-guardrail-editing.md`) |
| Commit | https://github.com/dustinginn/physiqueos/commit/13f442b93d37515df35d616c86f128755bc37945 |
| **Simulator (Claude artifact, version 5, same URL)** | **https://claude.ai/artifact/X2SJbf84x6sfe5UQyydLCP** (private until shared) |
| Guardrail model | https://github.com/dustinginn/physiqueos/commit/13f442b93d37515df35d616c86f128755bc37945#diff-f424b393f6478ffc26b48a1f17c84e8a68f880a0f98bfe1c27b6bfe9c0394ff2 |
| Simulator source | https://github.com/dustinginn/physiqueos/commit/13f442b93d37515df35d616c86f128755bc37945#diff-8943ab94439f2fd643924052f7d5aa18a76c099f28a6ac0424990ac9380130a9 |
| Guardrail unit tests | https://github.com/dustinginn/physiqueos/commit/13f442b93d37515df35d616c86f128755bc37945#diff-b529d7ebc996b2878698f22312a8e58664e756cee90296fdbb1be8bd72fd6851 · results https://github.com/dustinginn/physiqueos/commit/13f442b93d37515df35d616c86f128755bc37945#diff-bd791ef55fb25d711d5149499f3c8f1bc04125a748333cdc9c2bde32d1be0719 |
| End-to-end tests | https://github.com/dustinginn/physiqueos/commit/13f442b93d37515df35d616c86f128755bc37945#diff-20ec9597cb3e48f0d04b7c0b4be8614b2db6fbb5ebb47588003903f7659450ad · results https://github.com/dustinginn/physiqueos/commit/13f442b93d37515df35d616c86f128755bc37945#diff-1c00797cac20bdb51f3ff3bf5e69383fec53ef35c074c14cc1b761cc7ce9ea60 |
| Built simulator page | https://github.com/dustinginn/physiqueos/commit/13f442b93d37515df35d616c86f128755bc37945#diff-351ba246854d40e5713c272d99a3da218b1185b54ec504953319c4662fb6b39b |
| README section | https://github.com/dustinginn/physiqueos/commit/13f442b93d37515df35d616c86f128755bc37945#diff-dcd5b359ba2fe6b98242715a023e5f9644b7e7e781ffdc2facdb88d883e3b95f |

**Screenshots** (in `simulator/screens/` under the artifact folder on the design branch):

| Screen | Link |
|---|---|
| 16 · Lean setup after the goal change (target ≤ 8.5%, set automatically) | https://github.com/dustinginn/physiqueos/commit/13f442b93d37515df35d616c86f128755bc37945#diff-40439b4937df89e1253cdb8a0a595afc6428bad11567653e00e12b080aac4784 |
| 17 · Editor, "Changing your GOAL guardrail" | https://github.com/dustinginn/physiqueos/commit/13f442b93d37515df35d616c86f128755bc37945#diff-5beffa472decdc7c20e1e1bad00cd714241962eb0c3059d3a98a82d720e5a4a5 |
| 18 · Single Review | https://github.com/dustinginn/physiqueos/commit/13f442b93d37515df35d616c86f128755bc37945#diff-87fd6372c6c9ef7e78b3a781b8ff6886edb56866a49a11b454fa38dec256a6f0 |
| 19 · Home while leaning (6.5–8.5%, "Bring body fat to 8.5%") | https://github.com/dustinginn/physiqueos/commit/13f442b93d37515df35d616c86f128755bc37945#diff-ccbe4be79777ef1958b6115badfddfc29e2e9f62dc4a4e3408f0212f90727558 |
| 20 · Phase target you set conflicts with the new range | https://github.com/dustinginn/physiqueos/commit/13f442b93d37515df35d616c86f128755bc37945#diff-85ec46b1ecab23ab90f9a8223588b9dd96a9e0220df016fc955b34e810e84ac4 |
| 21 · What's next: Phase 4 carries 6.5–8.5% | https://github.com/dustinginn/physiqueos/commit/13f442b93d37515df35d616c86f128755bc37945#diff-602d86752a3b5dcbccc1a2fd1d880d247c41931c44654450907995455e8053e1 |
| 22 · Keep building conflict with one-tap fixes | https://github.com/dustinginn/physiqueos/commit/13f442b93d37515df35d616c86f128755bc37945#diff-89e86c1cca66f448c9b1534e2d032a15441a0b1e05add503f50d260425aa620d |

## What changed (Founder case: 8–9% → 6.5–8.5% while setting up Leaning)

1. **The editor defaults to "Goal, going forward".** The scope options are "Goal, going forward" (first) and "Leaning phase only". A goal-wide change shows the heading **"CHANGING YOUR GOAL GUARDRAIL"** and explains:
   > Build Lean Mass uses 6.5–8.5% going forward. This leaning phase aims to bring you back into it, so its phase target moves to 8.5% automatically. Phase 4 keeps 6.5–8.5% when building resumes.

   Lean setup repeats this in a "Goal guardrail · going forward" note (8–9% → 6.5–8.5%).
2. **The phase target is aligned automatically.** By default the phase target is the lowest upper limit that will apply: the goal's, or a leaning-only override if that is lower (`grAlignedTarget`). It follows each edit with no separate decision: 9 → 9 → 9 → 8.5 as the Founder steps 8–9 down to 6.5–8.5.
   - **Already inside the new range** (for example a goal of 8–10% at 9.7%): the target is set just below current body fat (9.5%), labelled "already inside your range". It never blocks.
   - **Guardrail removed:** the previous target (9%) is kept, labelled as such.
3. **You can still set the phase target yourself.** Using the ± steppers marks the target as yours, and later guardrail edits never overwrite it.
   - If your target stops fitting (for example 9% against a new 8.5% upper limit), Review is disabled and two one-tap fixes appear: **"Use 8.5% (aligned)"** and **"Edit guardrail"**.
   - If your target fits but differs from the aligned value, an **"Align to X%"** link appears.
4. **Phase 4 carries the guardrail forward.**
   - Review shows "When building resumes: Phase 4 · Lean Mass Build (linked to Phase 2) · guardrail 6.5–8.5%".
   - Goals shows "When building resumes 6.5–8.5%".
   - "What's next" shows "Phase 4 carries your approved goal guardrail forward (6.5–8.5%)", with nothing to resolve.
5. **One Review / Approve** shows, together with the energy and plan changes:
   - Goal guardrail: ~~8–9%~~ → 6.5–8.5% · goal, going forward (original, new and scope)
   - Phase ends: ~~≤ 9%~~ → Body fat ≤ 8.5% · aligned to the new goal upper limit
   - When building resumes: Phase 4 with its guardrail
   - Phase, goal date, daily balance, eat and activity goal (as before)

   One approval creates one version. History records "guardrail 6.5–8.5% (goal) · phase target ≤ 8.5%".
6. **Validation never dead-ends.**
   - The steppers can't produce an invalid range: pushing one limit past the other moves the other with it, and the range stays within 4–20% (`grStep`).
   - Choosing Keep resets the steppers to the current range.
   - The keep-building conflict offers "Raise upper limit to 11.5%" and "Lean out first instead".
   - A resume conflict offers "Raise upper limit to X%".
   - The editor now has **Cancel** (restores the guardrail and phase target exactly) and **Done**. **Undo** after approval works as before.
7. **Home (strict parity):** only text inside existing slots changes. The guardrail box reads "Maintain approximately 6.5–8.5% body fat" and the support line reads "Bring body fat to 8.5% while keeping lean mass."

## Validation results

| Suite | Result |
|---|---|
| Guardrail unit tests (`guardrail-model.test.mjs`) | **32/32 passed** (17 earlier + 15 new) |
| Energy arithmetic (`energy-model.test.mjs`) | **25/25 passed** (unchanged) |
| End-to-end (`test-sim.mjs`, headless Chrome, desktop + 390 mobile) | **109/109 passed** |

**New unit checks:**
- aligned target for: keep; goal 6.5–8.5; leaning-only 6.5–8.5; leaning-only 8–10; goal 8–10 at 9.7% (just below current body fat); goal removed;
- an auto-aligned target never conflicts;
- the step-below rule;
- repeated stepper edits (8–9 → 6.5–8.5);
- pushing one limit past the other, both directions; bounds clamped;
- conflict codes (`targetAboveRange`, `aboveUpperWhileBuilding`);
- a target you set inside a leaning-only range but above the goal is allowed with a warning.

**End-to-end paths tested:**
1. **Repeated edits to lower and upper limits.** Target 9,9,9,8.5 with no block. Upper 8.5 → 8 → 8.5: target 8 → 8.5, still automatic.
2. **Switching scope.** Leaning-only 6.5–8.5 keeps the goal at 8–9 with target 8.5 (aligned to the leaning-only limit). Switching back to goal gives 8.5.
3. **Cancel** restores 8–9% / 9%; Done keeps 6.5–8.5% / 8.5%.
4. **Phase target set by hand.**
   - Target 9% against the 8.5% limit is blocked and the fixes are shown.
   - Raising the limit to 9 leaves your 9% untouched and clears the block.
   - Cancel brings the conflict back; it is never silently resolved.
   - "Use 8.5% (aligned)" clears it.
   - A fitting 8% target survives later edits, and the "Align to 8.5%" link works.
5. **Review rows** for goal guardrail, phase ends and Phase 4. One approval, one version. State: goal 6.5–8.5, no override, target 8.5.
6. **Home and Goals** show 6.5–8.5% and 8.5% in the existing slots; Goals history shows the change.
7. **Completion and resume.** The phase completes at ≤ 8.5%. Resume carries 6.5–8.5% into Phase 4 with no conflict. Review shows Phase 4 linked and 6.5–8.5% unchanged. Approve moves to Phase 4 with 6.5–8.5%, Home H4 shows it, and Undo works.
8. **Edge cases.**
   - Goal 8–10 at 9.7%: target 9.5, no block.
   - Guardrail removed while leaning: target kept at 9%, with a warning.
   - Keep resets the steppers to 8–9.
9. **Leaning-only override path (kept from the previous version).**
   - A target set by hand to 9.5% is blocked against the 8–9% goal range.
   - A leaning-only 8–10% clears it, with a warning that the phase ends above the goal's 9% limit.
   - The steppers push past each other without inverting.
   - At resume, building is blocked above 9%; the one-tap "Raise upper limit to 9.5%" sets a goal-wide 8–9.5%.
   - Phase 4 resumes with 8–9.5%; Goals history and Undo are intact.
10. **Keep-building conflict.** One tap gives goal-wide 8–11.5%. Switching to phase-only keeps the goal at 8–9%. Review, one version, and Home shows "This phase only · goal 8–9%".
11. **Goal-wide removal from the plan hub** (now the default scope).
12. **Everything from earlier versions is unchanged:**
    - energy arithmetic, Quick Calibration and scenarios A/B/C;
    - the Option B comparison and the Approach A plan hub;
    - briefings: Midweek never proposes and the Photo Event never recommends;
    - no inert controls, no page errors, no mobile overflow.

## Preserved

- Option B comparison and Approach A plan hub.
- The energy model (1:1, with 2,117 labelled illustrative) and Energy Lab.
- Quick Calibration.
- Strict Home visual parity (content only).
- Linked Phase 4 and goal progress.
- No new briefing sections.

## Real-engine requirements (not built)

1. **Structured guardrail contract.** `{enabled, min, max, scope: goal|phase, effective period}` as the single source of truth, replacing the free-text guardrail and its frozen `phaseStrategies` copy.
2. **Phase target stored with its origin.** A field `completionCriteria.bodyFatAtOrBelow` plus `targetOrigin: aligned|custom`, so the server re-aligns only targets that were aligned automatically and never targets the user set.
3. **One atomic write** of guardrail, phase target, phase change and plan targets, with one version and Undo.
4. **Phase 4 resumption** reads the goal guardrail in force at resume time.

## Founder decisions requiring review

1. Confirm the alignment rule: the default phase target is the **lowest upper limit that applies** (goal, or a lower leaning-only limit). If you're already inside the new range, it goes just below current body fat.
2. Confirm the default scope is now **"Goal, going forward"** everywhere, including Keep building, with "phase only" one tap away. This answers decision 1 of the previous report.
3. Building above the upper limit stays **blocked**, now with a one-tap "Raise upper limit" fix. Is that acceptable, or should it be allowed with a warning? This is still open from the previous report.

## Storage and safety

| | |
|---|---|
| Free disk | ≈ 18 GiB (floor 12) |
| production_mutated / deployed / Native / Server / TestFlight | false / no / no / no / no |
| `latest.*` and Codex work | untouched |
