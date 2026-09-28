# Briefing Intelligence: final semantic restraint — real Sep 20–26 preview for Founder review (candidate `e83b27d0`, not deployed)

Task: `briefing-intelligence-final-semantic-restraint-preview-20260927` (handoff `agent-handoffs/inbox/prompts/20260928T020000Z-briefing-intelligence-final-semantic-restraint-preview.md`).
Branch `codex/weekly-v3-weekly-pattern-narrative`, continued from `a1ea5aab`. Commits: `5d5a207c`, `2d39d1a7`, `e83b27d0` (all pushed).

**Status.** **Release-ready recommendation.** The final preview and review are clean: no High finding in either review round, every finding is fixed with tests, the real copy changed only where the two rules apply, and there are 0 new test failures. Candidate `e83b27d0` is recommended for Founder/ChatGPT approval to deploy under a separate authorization. One non-blocking Founder decision (§3) concerns a pre-existing, DEXA-gated effectiveness sentence in the Confidence detail sheet.

**Confirmations.**
- Nothing is deployed, and production was not mutated.
- The published Sep 20–26 Weekly was not regenerated.
- No Native build was cut or uploaded, and HealthKit Sleep was not implemented.
- The queued Native Log-tab → active Workout Logger item is untouched.

## What changed (general rules, not phrase edits)

A new shared module, `shared/BriefingClaimRestraint.js`, holds both rules. The realizer and the section-text audit use it.

1. **Performance is not proof of effectiveness.**
   - Every insight kind has a claim scope:
     - exercise progression is **performance**;
     - a scan or guardrail is a **measurement**;
     - the scale is a **trajectory**;
     - routine, intake and activity are **execution**;
     - logging reliability is **observability**.
   - The takeaway's "what is going well" is phrased within that scope. Exercise bests say the performance gains are real; a scan says what it measured; the routine "held".
   - None of these becomes "the training / approach is working", paying off, or producing the outcome. That wording needs a finding with explicit authoritative causal support, and nothing in the evidence model emits one today.
   - Goal Confidence names only goal-level evidence beside the outlook, never training performance.
   - Exercise progression stays in the recap ("Training kept moving forward, with new bests on seven lifts") and in What To Do (the Hack Squats example).
2. **Logging guidance looks forward.**
   - Guidance about incomplete or unreliable past logs is prospective: "complete logs from here on will make the next check clearer".
   - It never implies those days can be repaired, unless a limitation carries an explicit retroactive-correction action (none exists in the product).
   - Watch no longer repeats the logging point.
3. **The audit enforces both rules.** The section text audit flags effectiveness language that lacks causal support, and repair-the-past language that lacks a correction action. It is a diagnostic recorded with the narrative and enforced by tests, not a production gate.

The architecture, section contracts, budgets, synthesis and weight-pace policy from `a1ea5aab` are unchanged.

## 1. How this preview was produced

- **Export.** The same private zero-write canonical export (production SHA `49211870`, `REPEATABLE READ READ ONLY`, rolled back) and the same offline replay, which reproduces the stored assessment bit-exactly on production code.
- **Candidate run.** Candidate `e83b27d0` ran on those inputs. The output is engine output, neither hand-edited nor post-processed.
- **Evidence and synthesis are unchanged versus `a1ea5aab`:**
  - selected insights: identical;
  - omissions: identical;
  - section allocation: identical.
- **Audits.** Structural: pass. Text, including claim restraint: pass. The Weekly is 182 words (budget 230).

## 2. All generated narrative, with a diff versus `a1ea5aab`

| Section | `a1ea5aab` | **Final candidate `e83b27d0`** | Changed? |
|---|---|---|---|
| Hero headline (`summary`) | Strong training week, but a quiet finish. | Strong training week, but a quiet finish. | no |
| Hero paragraph / What It Means (`sections.meaning`) | Training kept moving forward, with new bests on seven lifts, but the routine slipped late in the week. The September 12 DEXA showed lean mass up 5 lb with body fat at 8.1%; the scale alone can't say how much of any recent gain is lean mass, and the next DEXA will. | Training kept moving forward, with new bests on seven lifts, but the routine slipped late in the week. The September 12 DEXA showed lean mass up 5 lb with body fat at 8.1%; the scale alone can't say how much of any recent gain is lean mass, and the next DEXA will. | no |
| Goal Confidence (`sections.confidence`) | Confidence holds. The September 12 DEXA still sets the outlook, and this week's training fits it; a short break in routine isn't enough to change that. | Confidence holds. The September 12 DEXA still sets the outlook, and a short break in routine isn't enough to change it. | **yes** |
| Coach's Take — Biggest Takeaway (`sections.result`) | The training is clearly working; the part to protect is the end of the week, where the routine has slipped before. | The performance gains are real; the part to protect is the end of the week, where the routine has slipped before. | **yes** |
| Coach's Take — What To Do (`coachTake`) | Keep pushing the same lifts; Hack Squats went from 6 to 12 reps at 115 lb. Your weight has been rising about 1.7 lb a week over the last four weeks, in the direction the goal wants. Thursday through Saturday's food logs were too patchy to read; logging those days fully will make next week's picture clearer. | Keep pushing the same lifts; Hack Squats went from 6 to 12 reps at 115 lb. Your weight has been rising about 1.7 lb a week over the last four weeks, in the direction the goal wants. Thursday through Saturday's food logs were too patchy to read; complete logs from here on will make the next check clearer. | **yes** |
| Into Next Week (`sections.action`) | Get the usual training rhythm back this week. | Get the usual training rhythm back this week. | no |
| What To Watch (`sections.watch`) | Watch the weekly weight average and whether Friday and Saturday get their usual training back. | Watch the weekly weight average and whether Friday and Saturday get their usual training back. | no |
| Confidence detail — why (`confidenceExplanation.why`) | You are more than halfway to the 10 lb lean-mass goal. The build plan is clearly working. There is enough time to finish ahead of schedule if this level of progress continues. | You are more than halfway to the 10 lb lean-mass goal. The build plan is clearly working. There is enough time to finish ahead of schedule if this level of progress continues. | no |
| Still Unresolved | (none) | (none) | no |
| Energy module statement | — | — | no |

**The changes, and the rule behind each:**
- **Biggest Takeaway:** "The training is clearly working" became "The performance gains are real". Performance scope only; no effectiveness claim.
- **What To Do:** "logging those days fully will make next week's picture clearer" became "complete logs from here on will make the next check clearer". The guidance is prospective.
- **Goal Confidence:** "this week's training fits it; a short break in routine isn't enough to change that" became "a short break in routine isn't enough to change it". Training performance is no longer named beside the outlook.

## 3. For the Founder: one pre-existing effectiveness claim left in place on purpose

The Confidence detail sheet (`confidenceExplanation.why`) still reads "The build plan is clearly working." This is not new. It comes from `NarrativeV3CompositionService`. The same class of wording ("is working", "is doing its job") appears in the V3 strategy-meaning paths.

- **Why it is still there.** These lines only appear when V3's `strategyEffectiveness.feasibility === "demonstrated"`. The strategic interpreter derives that from the goal's direct outcome findings (the Sep 12 DEXA's lean-mass result), never from exercise performance. So it does not violate this handoff's rule about exercise progression.
- **Why it is flagged.** It is a causal reading of an outcome measurement: the plan produced the lean-mass change. The new shared restraint treats a scan as authoritative for its measure, not for what caused the change.
- **Decision needed.** Should a DEXA-demonstrated feasibility count as authoritative support for "the plan is working"? If not, those V3 paths should get the same measurement-scoped wording, for example "the last DEXA showed lean mass up 5 lb since the phase began". That would be a small, separate change. I did not make it silently.

## 4. Validation

- **Shared Briefing Intelligence tests.** 134/134 pass. New tests for this pass:
  - Across every generated Weekly (5 goal types × 18 situations × 8 seeds), no section contains effectiveness or causal language. Exercise progression is still credited as performance in the recap and takeaway, over 50 times.
  - Incomplete-logging guidance is always prospective ("from here on"), and no section implies the past can be repaired.
  - Goal Confidence never names training, lifts or bests.
  - The audit flags effectiveness and repair-the-past wording, and allows it only with explicit causal-support or retroactive-correction flags.
  - The detection covers the common tenses and forms, and ordinary non-causal wording is not flagged.
- **Unchanged invariants stay green:** section roles, anti-redundancy, word budget, weight restraint, Confidence abstraction, holistic synthesis, information budgets, determinism and historical immutability.
- **Full repository.** `e83b27d0`: 9050/9358 passed. The 303 failures are the same environmental set as the production-SHA baseline (8913/9221, 303 failures), so **0 new failures**.
- **V3 goal-generic guard.** Clean.

## 5. Fresh-context review (semantic claims)

| Round | Commit | Verdict | Findings (fixed in the next commit) |
|---|---|---|---|
| 1 | `5d5a207c` | PASS-WITH-FIXES (no High) | Sep changes confirmed legitimate; training named beside Confidence; regex gaps and false positives; watch "fills back in"; audit described as more than a diagnostic; the Confidence-sheet effectiveness claim flagged for the Founder (§3) |
| 2 | `2d39d1a7` | PASS-WITH-FIXES (no High) | two untested paths (canonically on-pace scale takeaway; limitation-only Watch); remaining regex precision; photo phrase claimed a direction; dead branch; one double-"and" takeaway |
| — | `e83b27d0` | fixes applied, with tests | real Sep 20–26 copy unchanged from `2d39d1a7`; no further review round after these detection and test refinements |

## 6. Follow-ons (unchanged from `a1ea5aab`, not in this candidate)

- Decide the §3 question (DEXA-demonstrated effectiveness wording).
- Wire the accepted Phase Expected Trajectory `weightTrajectory` into Weekly goal facts, only if you declare an expected weekly range.
- Phase 2 realizers on the shared section contracts: Midweek, Monthly, DEXA and Photo.
- Phase 3: Sleep, which needs separate authorization.
- The queued Native Log-tab item stays approved for the next consolidated Native build.
