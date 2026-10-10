# Goal Adaptation: corrected Home + interactive simulator (both stages complete)

- **Task id:** `claude-goal-adaptation-home-parity-simulator-20261010`
- **Prompt:** inbox `20261010-claude-goal-adaptation-home-parity-interactive-simulator.md` at `8712c197`
- **Stage 1 report:** main `b4a78c2a`
- **Status:** both stages complete. The corrected Home awaits your review; the simulator uses those proposed Home states, marked provisional.
- **Scope:** design and simulation only. No production, Native, Server or TestFlight change. Release pointer unchanged.

## Links

| Item | Value |
|---|---|
| **Corrected Home review** | **https://claude.ai/artifact/GNdGemefiB7g3foKawU9sr** (version 2, adds interaction hooks only) |
| **Interactive simulator** | **https://claude.ai/artifact/X2SJbf84x6sfe5UQyydLCP** (version 1) |
| Branch | `claude/goal-adaptation-home-parity-simulator-20261010` @ **`b1352d9c741b1986a8a9ed094b987e9ee7666426`** (pushed; local = remote) |
| Commit | https://github.com/dustinginn/physiqueos/commit/b1352d9c741b1986a8a9ed094b987e9ee7666426 |
| Simulator source | https://github.com/dustinginn/physiqueos/commit/b1352d9c741b1986a8a9ed094b987e9ee7666426#diff-8943ab94439f2fd643924052f7d5aa18a76c099f28a6ac0424990ac9380130a9 |
| Simulator test results | https://github.com/dustinginn/physiqueos/commit/b1352d9c741b1986a8a9ed094b987e9ee7666426#diff-1c00797cac20bdb51f3ff3bf5e69383fec53ef35c074c14cc1b761cc7ce9ea60 |

Both artifacts are private until shared.

## Stage 1: corrected Home

- **Source of truth.** The Home replica follows the Build 94 sources: `HomeJourneyFieldView`, `ConfidenceRing`, `HomeHeaderView`, `HomeView` and `TodaysFocusCardView`.
- **What's preserved:**
  - connected left phase timeline;
  - 82pt ring in its 110pt frame, labelled **CONFIDENCE**;
  - the four fixed metrics;
  - "PRIMARY GOAL" chip;
  - 304pt GUARDRAIL box;
  - 104pt action and briefing strip;
  - priorities and tab bar.
- **What changes:** only the server's dynamic phase text, across four states (H1 build, H2 temporary leaning, H3 phase complete, H4 resumed).
- **Height:** the goal card equals the baseline (495pt); H3 is 20pt shorter.
- **Phase complete** is reduced to "Leaning complete" · "Back in range" · "Choose when to resume building." The choice is one Today's Priorities item.

## Stage 2: simulator walkthrough

1. **Start on Home** (building, 7.1 of 10 lb, Oct 31, 8–9%). Open the **DEXA** briefing; the goal decision card is last.
   - "Not now" offers three outcomes: remind me, keep my plan, remove from Home.
2. **Option B comparison.** Choose one of:
   - **Lean out first**;
   - **Keep building with new limits** (the firm 8–9% is disabled; upper range is adjustable; Oct 31 can be kept with a warning, or moved to Feb 15);
   - **Keep my current plan**;
   - **Make my own changes** (opens the plan hub).
3. **Leaning setup.** End by outcome, time or whichever comes first, with an adjustable time limit.
   - Daily energy shows a **one-time uncertainty explainer**, then the energy screen.
   - Energy: balance slider and ±25 steps, plus Suggested / Eat less / Move more / Blend / Custom, all live 1:1.
4. **Approach A plan hub.** Everything here is optional:
   - Training learned from the Logger; progression and optional workouts per week.
   - Recovery: add stretching or mobility; optional sleep goal.
   - Supplements: add or remove.
   - Photos and DEXA toggles.
5. **Review** shows only numbers that change. **Approve** creates a new version; Home shows "Leaning" with Lean Mass Build **paused** and progress kept, and Goals shows the temporary phase plus history.
6. **Simulate evidence** from the side panel: "Advance a week" or "Run to phase end", with the body response set to "As estimated" or "Slower".
   - **As estimated:** the phase completes in about 2 weeks.
   - **Slower:** about 3 weeks in, the **Weekly** ends with a **Quick Calibration**: "Deepen your daily deficit by 200", then Eat less / Move more / Blend / Custom, Accept, and a 3-week observation window.
   - **Midweek** never proposes.
7. **Phase complete.**
   - DEXA briefing shows the measured change, including a small lean-mass drop explained honestly, with the phase decision card last.
   - Home is concise, with a priority item.
   - Choose resume, maintain or keep leaning, then review and approve. Home returns to Lean Mass Build.
8. **Controls:** versions and **Undo** in Goals, back navigation everywhere, theme switch, and **Reset**.

**Locked rules honoured:**
- one primary goal;
- no automatic resumption;
- Option B and the Approach A plan hub;
- 1:1 arithmetic, with no 75% credit;
- no weekly scheduling editor;
- non-prescriptive activity;
- no mandatory split, DEXA or photos;
- no new briefing sections; Midweek never proposes;
- Home does not grow.

All values are labelled simulated; RMR and maintenance are shown only as concepts.

## Tests

**Simulator end-to-end test:** `simulator/test-sim.mjs`, headless Chrome — **34/34 passed**. It covers:
- start state;
- decision card last;
- Option B;
- back navigation;
- lean draft 1,767;
- hybrid weeks;
- explainer shown once;
- 1:1 splits (blend 1,892/1,025, eat less 1,667/800, −25 → 1,642);
- hub edits;
- review showing numbers only, with no walks;
- approve → v2;
- Home keeps the primary goal and the paused build;
- Quick Calibration after slower weeks (blend: eat −100, goal +100, balance −200);
- Midweek with no proposal;
- phase completion and DEXA decision;
- concise Home with a priority;
- honest lean change;
- resume;
- undo;
- reset;
- keep-building path (upper limit 11.5%);
- not-now path;
- no page errors;
- 390pt mobile with no horizontal overflow.

**Home review:** 0 errors and 0 overflow on desktop and mobile; goal card height parity confirmed.

## Storage

- This task's footprint is about **4.7 MB** in total.
- Free disk was **12.34 GiB** at publication, just above the 12 GiB hard floor. The drop since earlier (about 13 GiB) came from activity outside this task.
- To avoid pushing the Mac below the floor, **no further renders were made**. The prior report's list of reclaimable non-task items (Codex temp outputs ≈ 3.8 GiB, simulator data ≈ 4.7 GiB) still applies, and freeing space is now urgent.

## Founder review

1. Accept or correct the Home states H1–H4. The baseline is reconstructed from source; your screenshots are the authority.
2. Simulator feedback on the flow and the control panel.

## Safety

| | |
|---|---|
| production_mutated / deployed / Native / TestFlight | false / no / no / no |
| `latest.*` | unchanged |
| Data | illustrative and simulated only |
| Network | none (the simulator has no network calls or persistence) |
