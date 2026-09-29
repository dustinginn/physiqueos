# Briefing Intelligence: measurement is not causation — real Sep 20–26 preview; release-ready (candidate `6abbed64`, not deployed)

Task: `briefing-intelligence-final-measurement-causality-restraint-20260927` (handoff `agent-handoffs/inbox/prompts/20260928T030000Z-briefing-intelligence-final-measurement-causality-restraint.md`).
Branch `codex/weekly-v3-weekly-pattern-narrative`, continued from `e83b27d0`. Commits: `1d5dfefa`, `559e9b09`, `6abbed64` (all pushed).

**Status: release-ready. Stopped at the deployment gate for Founder/ChatGPT authorization.**
- Nothing is deployed, and production was not mutated.
- The published Sep 20–26 Weekly was not regenerated.
- No Native build was cut or uploaded, and HealthKit Sleep was not implemented.
- The queued Native Log-tab → active Workout Logger item stays approved for the next consolidated Native build.

## The rule, applied across V3 realization

> An authoritative outcome measurement proves what changed. It does not, by itself, prove that the current plan caused the change.

**Scope.** Every V3 realization path that turned `strategyEffectiveness.feasibility === "demonstrated"` (or an equivalent outcome state) into effectiveness wording now states measured progress and compatibility with staying the course. The rewritten paths:

- **`NarrativeV3CompositionService`:** strategy meaning, Result, Action, Coach's Take, Watch, Confidence movement body, and the Confidence detail "why".
- **The V3 surface projection** (a shadow preview in production), **Confidence-explanation presentation copy**, **ambiguity vocabulary**, **the Photo interpreter's copy and its model prompt**, and **the Active Goal "next DEXA" lines**.

**Examples of the rewrites:**
- "The build plan is clearly working. There is no reason to second-guess the approach." → "The measured progress in lean mass is real, and nothing in the evidence calls for changing the build plan."
- "Confidence jumped because the plan delivered a standout result" → "Confidence jumped because the DEXA measured a standout result"
- "…not whether the plan works. That question has been answered." → removed
- "Don't change it." → "Nothing here calls for a change."

**What does not change.**
- DEXA evidence authority, Confidence scores and movement, and recommendations are all unchanged, and tests assert this.
- Positive coaching language stays, scoped to what was measured.

**Where the rule lives.** It uses the shared claim-restraint abstraction (`shared/BriefingClaimRestraint.js`):
- **Future causal support stays distinguishable.** `hasAuthoritativeCausalSupport` recognizes only an explicit `strategyEffectiveness.causalSupport === "authoritative"` marker. That is a future schema field; demonstrated feasibility is not causal support.
- **Every V3 narrative records its own audit** in `narrativePlan.claimRestraint.issues`. Tests hold it empty over every fixture and harness run.
- **It records, it does not block.** The audit is not a publication gate, because audited text can include upstream observation summaries that the composer did not write.

## 1. Real Sep 20–26 preview (private zero-write replay, engine output, not post-edited)

- **Confidence:** **79%, delta 0.** The recommendation is **continue_current_strategy**. Both are unchanged.
- **Unchanged versus `e83b27d0`:** the evidence picture, synthesis and section allocation are identical.
- **Claim-restraint audit:** `{"schemaVersion": "narrative_claim_restraint_v1", "issues": []}`. The Weekly section audit reports `[]`.

| Section | `e83b27d0` | **Final candidate `6abbed64`** | Changed? |
|---|---|---|---|
| Hero headline (`summary`) | Strong training week, but a quiet finish. | Strong training week, but a quiet finish. | no |
| Hero paragraph / What It Means (`sections.meaning`) | Training kept moving forward, with new bests on seven lifts, but the routine slipped late in the week. The September 12 DEXA showed lean mass up 5 lb with body fat at 8.1%; the scale alone can't say how much of any recent gain is lean mass, and the next DEXA will. | Training kept moving forward, with new bests on seven lifts, but the routine slipped late in the week. The September 12 DEXA showed lean mass up 5 lb with body fat at 8.1%; the scale alone can't say how much of any recent gain is lean mass, and the next DEXA will. | no |
| Goal Confidence (`sections.confidence`) | Confidence holds. The September 12 DEXA still sets the outlook, and a short break in routine isn't enough to change it. | Confidence holds. The September 12 DEXA still sets the outlook, and a short break in routine isn't enough to change it. | no |
| Coach's Take — Biggest Takeaway (`sections.result`) | The performance gains are real; the part to protect is the end of the week, where the routine has slipped before. | The performance gains are real; the part to protect is the end of the week, where the routine has slipped before. | no |
| Coach's Take — What To Do (`coachTake`) | Keep pushing the same lifts; Hack Squats went from 6 to 12 reps at 115 lb. Your weight has been rising about 1.7 lb a week over the last four weeks, in the direction the goal wants. Thursday through Saturday's food logs were too patchy to read; complete logs from here on will make the next check clearer. | Keep pushing the same lifts; Hack Squats went from 6 to 12 reps at 115 lb. Your weight has been rising about 1.7 lb a week over the last four weeks, in the direction the goal wants. Thursday through Saturday's food logs were too patchy to read; complete logs from here on will make the next check clearer. | no |
| Into Next Week (`sections.action`) | Get the usual training rhythm back this week. | Get the usual training rhythm back this week. | no |
| What To Watch (`sections.watch`) | Watch the weekly weight average and whether Friday and Saturday get their usual training back. | Watch the weekly weight average and whether Friday and Saturday get their usual training back. | no |
| Confidence detail — why | You are more than halfway to the 10 lb lean-mass goal. The build plan is clearly working. There is enough time to finish ahead of schedule if this level of progress continues. | You are more than halfway to the 10 lb lean-mass goal. The measured progress in lean mass is real. There is enough time to finish ahead of schedule if this level of progress continues. | **yes** |
| Confidence detail — whatIncreasedIt | You added 5.0 lb of lean mass since August 15. / Body fat stayed controlled at 8.1%. | You added 5.0 lb of lean mass since August 15. / Body fat stayed controlled at 8.1%. | no |
| Confidence detail — whatSupportsItNow | 4.2 lb remain with 49 days left. / Active calories averaged 789 kcal/day, 11 kcal/day below the 800 kcal/day target (wearable estimate read from screenshots). / Calorie intake averaged 2639 kcal/day, 139 kcal/day above the 2500 kcal/day target. | 4.2 lb remain with 49 days left. / Active calories averaged 789 kcal/day, 11 kcal/day below the 800 kcal/day target (wearable estimate read from screenshots). / Calorie intake averaged 2639 kcal/day, 139 kcal/day above the 2500 kcal/day target. | no |
| Confidence detail — whatIsHoldingItBack | One excellent response does not guarantee the same result until the next DEXA. | One excellent response does not guarantee the same result until the next DEXA. | no |
| Confidence detail — whatCouldRaiseIt | Consistent execution can strengthen confidence before the next DEXA. / The next DEXA showing that the progress continues. / Reaching the goal. | Consistent execution can strengthen confidence before the next DEXA. / The next DEXA showing that the progress continues. / Reaching the goal. | no |
| Confidence detail — whatCouldLowerIt | Meaningful missed work or persistent departures from the plan. / Body fat moving outside the intended range of 8–9. / Training performance materially declining. / Progress stalling or a new result contradicting the current outlook. / Falling far enough behind that there is no longer enough time to finish the goal. | Meaningful missed work or persistent departures from the plan. / Body fat moving outside the intended range of 8–9. / Training performance materially declining. / Progress stalling or a new result contradicting the current outlook. / Falling far enough behind that there is no longer enough time to finish the goal. | no |
| Confidence detail — nextEvidence | Watch the weekly weight average and whether Friday and Saturday get their usual training back. | Watch the weekly weight average and whether Friday and Saturday get their usual training back. | no |
| Confidence detail — assumptions | The outlook depends on appropriate continued execution. / The forecast uses a reduced recent rate, not an assumption that the latest result repeats exactly. / Consistent execution supports the outlook, but any progress since the last outcome check is still unconfirmed. / This is a coaching outlook, not a measured statistical probability. | The outlook depends on appropriate continued execution. / The forecast uses a reduced recent rate, not an assumption that the latest result repeats exactly. / Consistent execution supports the outlook, but any progress since the last outcome check is still unconfirmed. / This is a coaching outlook, not a measured statistical probability. | no |
| Still Unresolved | (none) | (none) | no |
| Energy module statement | — | — | no |

**Diff.** One Founder-facing sentence changed: the Confidence detail "why" went from "The build plan is clearly working." to "The measured progress in lean mass is real." Everything else in the Sep 20–26 Weekly is identical.

## 2. Validation

- **New `MeasurementCausalityRestraint.test.js`:**
  - A decisive DEXA still produces strong factual progress wording ("This is a huge win", "The measured progress in … is real").
  - No V3 surface contains effectiveness wording: the paired calibration fixtures, and the DEXA and Photo harness across summary, detail, sections, Coach's Take and Confidence explanation.
  - The DEXA Confidence body credits the measurement.
  - Every composed narrative records an empty audit.
  - DEXA Confidence (76) and the recommendation match the pre-change values.
  - Demonstrated feasibility is distinguishable from an explicit causal-support marker.
  - A source scan of every V3 realization module's string templates finds no causal-effectiveness template.
- **Earlier suites still green:** exercise performance stays performance-scoped, and 134 Briefing Intelligence tests pass (holistic, section contracts, budgets, claim restraint).
- **Historical immutability:**
  - Stored artifacts are served as stored; the accepted Sep 19 Photo text digest is unchanged.
  - DEXA/Photo regression golden digests were re-recorded, and the diff is limited to the causal sentences.
  - A note for the Founder: stored artifacts such as the Sep 19 Photo still carry the old wording until the next publication or an authorized regeneration.
- **Full repository:** `6abbed64` passed 9063/9371. The 303 failures are the same environmental set as the production-SHA baseline, so **0 new failures**.
- **V3 goal-generic guard:** clean.

## 3. Fresh-context review

| Round | Commit | Verdict | Findings (fixed in the next commit) |
|---|---|---|---|
| 1 | `1d5dfefa` | FAIL | "Confidence jumped because the plan delivered a standout result" was still reachable on DEXA/Photo; the invariant threw at publication on possibly-upstream text; "already answered the big question"; the "Don't change it" referent; the Photo model prompt said "appears to be working"; Active Goal "whether this phase is working"; minor copy |
| 2 | `559e9b09` | PASS-WITH-FIXES (no High) | Verified across 260 test files and a 22-run sweep: no causal claim is reachable from V3 production, and Confidence and recommendations are identical to base. One Medium: a carried-forward sentence named the upcoming check as the one that already happened. Minor wording; the empty-audit test covered only one fixture |
| — | `6abbed64` | fixes applied, with tests | The real preview is unchanged from `559e9b09`; no further round was run after these wording fixes |

**Out of scope, noted only:**
- Legacy V2-only paths still use causal phrasing: `DailyBriefingService`, `MonthlyNarrativeCompositionService`, `PINarrativeAssessmentService`, `SyntheticDEXAV2PreviewService`, and two legacy screens.
- The Photo model prompt still asks the model "whether confidence in the current strategy increased". Its upstream output only feeds the recorded audit.

## 4. Release-ready recommendation

**Candidate `6abbed64`** (branch `codex/weekly-v3-weekly-pattern-narrative`) is recommended for Founder/ChatGPT approval to deploy under a separate explicit authorization. It carries everything accepted from `a1ea5aab` and `e83b27d0`: the holistic synthesis, section contracts, weight-pace authority and claim restraint. It now applies measurement-not-causation across V3 realization.

Still open:
- the weight-pace policy decision, which is optional;
- whether to regenerate the published Sep 20–26 Weekly;
- the Phase 2/3 realizers.
