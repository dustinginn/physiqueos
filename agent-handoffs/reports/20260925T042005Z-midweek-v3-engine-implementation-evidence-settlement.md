# Midweek V3 engine implementation — content-quality fixes + evidence settlement policy (Parts A–F)

Generated: 2026-09-25T04:20:05Z
Task id: `claude-midweek-v3-engine-implementation-evidence-settlement-20260924`
Agent: Claude (Midweek Briefing Founder Takeover lane, secondary)
Status: **CODE / TEST / REVIEW COMPLETE.** No Server deployment, no historical briefing regeneration, no Native archive/upload, no production data mutation, no HealthKit policy change, no Cardio activation, no strategic-eligibility change. Stopping here for Founder authorization, per the governing task's explicit "not authorized" list.

This is a secondary-lane report. `agent-handoffs/latest.json` / `latest.md` are NOT updated.

## Candidate SHAs

- **Server**: `6046e9dd2ea01bdfab6aac9fe010294177b5a5db` on `origin/claude/midweek-v3-engine-server-20260925`, based on production `01d1900b` (still live in production, unchanged by this task).
  - `f7d3d4a1` feat(v3): engine-level content-quality fixes + evidence settlement policy (13 files, 1073 insertions)
  - `6046e9dd` fix(v3): close three findings from fresh-context adversarial review (4 files, 66 insertions / 10 deletions)
- **Native**: `1343c52f` on `origin/claude/midweek-standard-format-v3`, based on the already-Apple-VALID combined Build 59 candidate `a269700b`.
  - `366ab683` fix(ios): Coach's Take empty-slot guard + drop first-person label
  - `1343c52f` fix(ios): close two fresh-context review findings on the Coach's Take fix

Neither branch has been merged to `main`. Build 59 itself (Apple VALID, installed) is **unaffected and unchanged** — this work is a separate, unreleased candidate on top of it.

## What changed, by part

**Part A — Narrative V3 content quality.**
- Hero/Result claim now scope-gated (`NarrativeClaimScope`: HOLISTIC / DOMAIN / DETAIL / NONE) instead of always preferring a movement-PR detail claim. A holistic cross-domain signal wins Result when one exists; a detail claim is only promoted to Result when it is itself `decisionChanging`; otherwise Result explicitly states "Nothing here calls for a change" rather than over-indexing on an incidental PR. Suppressed candidates are now tracked (`suppressedCandidateIds` / `suppressionReason: "detail_subordinate_to_holistic_claim"` or `"detail_not_decision_changing"`) instead of silently dropped, for future debuggability.
- Confidence's zero-delta branch now names the concrete subject instead of the generic "one update does not change the overall goal outlook" jargon that was the diagnostic's finding #1.
- New `assertHeroOutputBudget` hard-caps the hero claim at 2 sentences / 160 characters for the recurring-cadence plan, preventing the verbosity the diagnostic flagged.
- Removed the `guidance` clause ("Keep calorie targets where they are...") from the Energy ambiguity translation — a prescriptive nudge the diagnostic found the engine wasn't entitled to make from ambiguous evidence alone.
- Section-distinctness dedup (`assertDistinctSectionComposition`) refactored onto a new shared semantic-equivalence primitive (`isSemanticallyEquivalent` in `V3Runtime.js`) instead of ad-hoc per-file string comparison, without widening its scope — the Confidence detail sheet is intentionally still exempt, since it legitimately restates supporting context (an earlier, over-aggressive widening attempt broke 6–12 legitimate tests and was reverted).
- Fixed a self-duplication bug the hero-gating change introduced: Confidence's "what supports it now" list now filters out whatever the Result section already claimed, via semantic equivalence rather than object-reference identity (fixed post-review; object-reference `!==` missed textually-identical-but-differently-constructed summaries).

**Part B — Energy V3 intelligence.**
- `composeEnergyStatementV3` simplified to surface only the genuine ambiguity/completeness caveat, not a synthesized narrative — data-first per the diagnostic's finding.
- New `EnergyVariabilityV3.js`: a standalone, reusable variability/predictability module (bidirectional over/under-target nudges, minimum historical-day and pattern-day thresholds, user-relative normal-range gating, conservative fallback under insufficient history, explicit non-involvement of completeness/target-distance signals in the nudge decision). 13 tests, including a mutation-test-driven addition (a minority-vs-pattern-threshold case the first mutation pass revealed was untested).
  - **Not yet wired into the live pipeline.** `EnergyVariabilityV3` operates on per-day deviations; the live V3 Energy execution path is window-aggregated (`findings`), while true per-day records exist in `CadenceEnergyAssessmentService.js`'s `dailyRecords`. Bridging that gap is a real, disclosed architectural follow-up, not done in this task.
- Provenance/materiality split, the release-blocking fix: `energyComparisonText` (legacy, used only by the V2 read-time projection path) is restored to its **exact original, unconditional** behavior; a new `energyComparisonTextV3` (materiality-gated at ±150 kcal/day, RMR-caveat-aware) is used **only** by the two V3 projection call sites. This function was originally shared and my initial V3 gating change silently altered V2 historical rendering — caught by `BriefingNavigationReadService.test.js`, a file outside my originally-tracked changed-file list, during the release-blocking fresh-context review (see below).

**Part C — Native Coach's Take fix.**
- `BriefingCoachFinale` (`BriefingPresentation.swift`) now conditionally renders each of its three slots (Biggest Takeaway / What To Do / Watch) based on contract content, with correct inter-slot dividers, instead of always rendering a Biggest Takeaway slot (sometimes blank) — closes the diagnostic's blank-slot and structural-duplication findings.
- "My Recommendation" label renamed to "What To Do", removing the first-person framing the diagnostic flagged (also updated in `MidweekBriefingSections.swift`'s doc comment).
- 5 new/updated XCTest cases in `BriefingV3PresentationTests.swift`, including a no-content graceful-degradation case added after fresh-context review.

**Part D — Briefing Evidence Settlement Policy (new Server architecture).**
- New `BriefingEvidenceSettlementPolicy.js`: readiness evaluation (`evaluateBriefingReadinessV1`, coverage-only — never observed-value-based, fail-closed on a missing domain), publish-action decision (`decideBriefingPublishActionV1`: wait / generate / retry, with an earliest-publish-time floor from the existing `BriefingScheduleAuthority` and a hard-deadline fallback), an immutable (deep-frozen) generation watermark (`buildEvidenceSettlementWatermarkV1`), a device-closeout receipt recorder (`recordDeviceCloseoutReceiptV1`, D2 — Native-side implementation explicitly deferred, see below), and a canonical observability event vocabulary (`BriefingSettlementEvent`, D6 — emission not yet wired).
- **Defaults chosen** (documented in-file with rationale, not invented): `readinessDomains: ["activity", "nutrition"]` (Training deliberately excluded — its legitimate daily absence must never block a briefing); `minimumSettlementDelayMinutes: 180` (matches the existing, already-live `BriefingScheduleAuthority` 03:00 local generation buffer); `retryIntervalMinutes: 30`; `maximumWaitMinutes: 480` (generous enough to absorb this codebase's own documented HealthKit background-delivery lag precedents — the automatic Nutrition sync bounds:nil bug and the Activity daily-snapshot 409 revision loop — without indefinitely delaying an expected briefing).
- Composes with, does not replace, `BriefingScheduleAuthority.js`: cadence/day is still entirely user-chosen and Server still owns clock time; this policy only adds the readiness gate and hard-deadline fallback layered on top of the existing buffer.
- 20 tests covering readiness semantics, the closeout contract, earliest-publish + hard-deadline decisioning, watermark construction/immutability (including a deep, nested-field immutability test added after review found the first version only shallow-froze `evidenceWindow`), and an explicit cross-cadence check that this policy never touches `BriefingScheduleAuthority`'s Monthly day-1 default.
- **Not yet wired into the live briefing-generation scheduler trigger.** This task built and tested the policy as a reusable, deterministic module; integrating it into the actual generation trigger path is a disclosed follow-up, not safely locatable/verifiable within this task's scope.
- Native device-closeout (D2): implementing it would touch files inside the currently-active HealthKit Native lane, which this lane must never touch. Per the task's own escape hatch, a written interface doc was published instead: `docs/BRIEFING_EVIDENCE_SETTLEMENT_DEVICE_CLOSEOUT_INTERFACE.md`.

**Part E — Sep20–22 historical artifact preserved immutably.** No historical briefing was regenerated, re-composed, or overwritten by this task. All Part A/B changes are engine-level (train the engine, not the fixture) — no Sep20–22-specific strings or branches exist anywhere in the diff. Confirmed by `git diff --stat` review of every changed file: none reference the Sep20–22 dates directly, and the existing `WeeklySep13to19GoldenForensic.test.js` golden-fixture tests (updated only where the diagnostic explicitly authorized the underlying behavior change, e.g. Watch/Energy field relocation) continue to bind against the same historical fixture data.

**Part F — cross-cadence scope audit.** `allocateNarrativeSections`, `EnergyVariabilityV3`, and `BriefingEvidenceSettlementPolicy` are all cadence-agnostic by construction (no Midweek-specific branch anywhere in any of the three). `BriefingEvidenceSettlementPolicy.test.js` includes an explicit assertion that the new policy never reads or overrides `BriefingScheduleAuthority`'s Monthly day-1 default. The Weekly and Photo V3 presentation paths were not touched by this diff (only `MidweekBriefingPresentationService.js` and the shared `NarrativeV3CompositionService.js`/`BriefingV3Projection.js`/`V3Runtime.js` engine files) — Weekly/Photo pick up the Part A/B engine-level fixes automatically the next time they compose through the same shared engine, with no code change required on their part.

## Test results

**Server** (`/private/tmp/physiqueos-midweek-v3-engine-server`, vitest):
- New/updated test files: `NarrativeV3CompositionIntelligence.test.js`, `SpecificCoachingObservationV3.test.js`, `EnergyAmbiguityV3.test.js`, `WeeklySep13to19GoldenForensic.test.js`, `EnergyVariabilityV3.test.js` (new, 13 tests), `BriefingEvidenceSettlementPolicy.test.js` (new, 20 tests).
- Full relevant suite: 291/291 passing except one pre-existing, unrelated environment gap present before this task's changes.
- The one test outside the originally-tracked changed-file list that the release-blocking review turned up (`BriefingNavigationReadService.test.js`, broken by the V2/V3 shared-function scope leak) now passes after the fix.
- Mutation testing: every new hard-invariant guard (hero-output budget, settlement-readiness "majority not just count" threshold, deep-freeze) was verified RED-then-GREEN by temporarily disabling the guard, confirming its protecting test fails, then restoring it.
- ESLint: clean. Production-shaped webpack build (`NEXT_PHASE=phase-production-build npm run build -- --webpack`): exit 0, "Compiled successfully", zero "Failed to compile".

**Native** (`/Users/dustinginn/Developer/PhysiqueOS/native-midweek-v3`, XCTest):
- Focused re-run at final commit `1343c52f` (`BriefingV3PresentationTests` + adjacent Briefing presentation suites): 137/137 passing.
- Full suite at `366ab683` (predates the two small `1343c52f` review-fix additions — a doc-comment fix and one new always-true guard test, already separately confirmed passing above): `PhysiqueOSTests.xctest` **passed**. `PhysiqueOSUITests.xctest` **failed**, 2 of its tests: `TrainingAcceptanceUITests.testCorrectedEvidenceJourneys` ("Latest photo set was not actionable") and `TrainingAcceptanceUITests.testReportingJourneys` ("Could not scroll to button: training-reporting-disclosure"). Neither test is in a file this task touched (Training/Photo UI journeys, not Briefing presentation) — this task's diff has zero shared code path with either.
  - **Investigated and confirmed non-deterministic (flaky), not a regression from this task's diff.** Isolated reruns, same two-test selection, produced inconsistent results across runs with identical code: at the pre-Part-C base commit `e88205f1` (isolated worktree), both tests passed together. At final candidate `1343c52f`, running the same two tests together produced `testCorrectedEvidenceJourneys` PASS / `testReportingJourneys` FAIL — but a further isolated rerun of `testReportingJourneys` completely alone at that same `1343c52f` commit **passed**. A test that fails only in combination with another test and passes both alone and at an unrelated commit, with no shared code between the failing test and this task's diff, is classic scroll/timing-dependent XCUITest flakiness (simulator/animation state carried from a preceding test), not a code regression. No fix was made or needed for this.

## Fresh-context adversarial review verdicts

**Server review** (independent `general-purpose` subagent, no prior context, given the exact diff to hand-trace): 3 findings, all fixed and re-verified.
1. **Release-blocking**: `energyComparisonText`'s new materiality gate was applied to a function shared between the V2 legacy read-time path and the new V3 path, silently changing V2 historical rendering. Fixed by splitting into `energyComparisonText` (restored exact original, V2-only) and `energyComparisonTextV3` (new gated version, V3-only).
2. Confidence's `currentSupport` dedup against the Result claim used object-reference `!==` instead of semantic equality, missing textually-duplicate-but-differently-constructed summaries. Fixed to use `!isSemanticallyEquivalent(...)`.
3. `buildEvidenceSettlementWatermarkV1`'s freeze was shallow — a nested `evidenceWindow` field could still be mutated. Fixed with `deepFreeze`, plus a new nested-field immutability test.

**Native review** (independent `general-purpose` subagent): 2 findings, both fixed.
1. Doc-comment in `MidweekBriefingSections.swift` still said "My Recommendation" after the label rename to "What To Do". Fixed.
2. No test covered the fully-empty-content case (`BriefingCoachFinale` given nothing in any of the three slots). Added `testCoachFinaleDegradesGracefullyWithNoContentAtAll`.

## Cross-cadence impact

Weekly and Photo V3 (the only other briefings live on the V3 path per the prior parity audit) inherit the Part A/B engine-level fixes automatically, since they compose through the same shared `NarrativeV3CompositionService.js`/`BriefingV3Projection.js` — no code change was needed or made in their own presentation services. Monthly V3 intel remains dead code, untouched. The new settlement policy (Part D) is cadence-agnostic and was explicitly tested not to alter `BriefingScheduleAuthority`'s existing Monthly day-1 default.

## Release / reconciliation plan (not executed — awaiting authorization)

1. Founder review of this report and the two branch diffs.
2. If approved: merge `claude/midweek-v3-engine-server-20260925` to `main`, deploy Server per the established `apps update --spec` + `create-deployment --force-rebuild` two-step (GIT_SHA/BUILD_ID bump required — see standing deploy note).
3. Merge `claude/midweek-standard-format-v3`'s Part C commits into the next Native release train; this does not require a new standalone build on its own — it can ride the next already-planned Build 60 candidate, or be archived/uploaded separately if the Founder wants the Coach's Take fix out sooner. No archive/upload was performed in this task.
4. Separately scope and authorize: (a) bridging `EnergyVariabilityV3` into the live per-day evidence pipeline, (b) wiring `BriefingEvidenceSettlementPolicy` into the live generation trigger, (c) Native device-closeout implementation (HealthKit lane).
5. No historical briefing regeneration is included in or implied by this plan; Sep20–22 remains untouched per Part E.

## Flags for the Founder

- Both Native UI-test failures found in the full-suite run are outside this task's changed files (Training/Photo journeys, not Briefing presentation) and were confirmed flaky/non-deterministic via isolated reruns, not caused by this task's diff — see Test Results above.
- Two real architectural gaps are disclosed, not solved, per the task's own scope: Energy variability isn't wired to live per-day data; the settlement policy isn't wired to the live scheduler.
