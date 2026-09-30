# Photo PI Goal hierarchy and coach realization — replay authorization checkpoint

Status: **implementation complete and pushed; validation green; zero-write raw-image replay blocked on explicit privacy authorization**

Repository: `dustinginn/physiqueos`  
Branch: `codex/photo-intelligence-guarded-deploy-20260929`  
Implementation candidate: `9a89ff903fd587839c53e5f896d5ae9c08d1aaa0`  
Frozen perception candidate: `0d0f189e8ccddaf69c5d4b833b8c2a82ce49723b`  
Task: `agent-handoffs/inbox/prompts/20260930T060000Z-photo-pi-goal-hierarchy-coach-realization.md`

## Outcome so far

The downstream implementation is complete on a clean descendant of `0d0f189e`. The corrected Goal-blind perception service and its adversarial boundary test are byte-unchanged from the frozen candidate.

The final production-data replay has not run. A guarded attempt to open the established read-only production console was rejected because the intended replay would download the ten private Founder comparison images and submit them to the configured OpenAI vision provider. The task requests the replay, but the safety gate requires an explicit acknowledgment of that private-image transfer after the risk is stated. No alternate or indirect upload was attempted.

## Goal projection root cause and fix

`PhotoEventContextService.snapshotGoal()` reduced the authoritative Goal to only `id`, `title`, and `status`. This removed `type`, `target`, accepted `guardrails`, `progressMeasurement`, and `successCriteria` before Photo Intelligence and holistic synthesis. `snapshotPhase()` similarly removed phase purpose, guardrails, and success criteria.

The candidate now projects those authoritative fields through structured clones, preserving:

- active Goal numeric targets and guardrails;
- accepted text-only guardrails such as `Maintain approximately 8–9% body fat.`;
- multiple guardrails without inventing defaults;
- historical/completed Goal targets and guardrails;
- active phase purpose, guardrails, and success criteria;
- missing guardrails as an explicit empty list.

## Evidence-role hierarchy

`photo_briefing_holistic_v2` now emits an explicit Goal-relative hierarchy:

- `primary_objective`: canonical target metric/direction/amount/unit and measurement authority;
- `guardrail`: accepted Goal/phase guardrails, metric/range, source text, and measurement authority;
- `supporting_evidence`: photos and weight, neither permitted to establish the primary objective;
- `execution_evidence`: training and nutrition/activity, neither permitted to establish the primary objective or causality.

The projection is driven by canonical Goal/phase configuration. The body-fat range parser supports explicit numeric bounds and canonical text ranges; it does not invent a Founder-specific guardrail when none exists.

## Goal-relative compatibility

The candidate no longer treats every metric as though it must move in the same numerical direction. It separately evaluates:

- primary objective: `progressing`, `stable`, `regressing`, or `unavailable`;
- each guardrail: `within_range`, `above_range`, `below_range`, or `unavailable`;
- photo support: `stable`, `directional`, `challenging`, or `unavailable`.

Explicit result states include `jointly_supportive`, `objective_progress_guardrail_conflict`, `objective_not_progressing`, `qualified`, and `insufficient_goal_context`.

The deterministic Sep 19 acceptance fixture resolves `+5.0 lb` DEXA lean-mass change, `8.1%` inside the accepted `8–9%` body-fat range, and stable photos as `jointly_supportive`. Visual stability is explicitly not a conflict with measured objective progress and does not become a visual muscle-gain claim.

## Realization changes

The ordinary Photo Briefing path now:

- leads the Hero with the measured primary objective rather than preservation of leanness;
- keeps exact DEXA values in the Interpretation rather than repeating them in Hero and Coach sections;
- emits one natural sentence beneath each matched pose;
- removes raw finding stacks and duplicate headline/supporting observations from the actual viewer payload;
- avoids abdominal commentary in rear-pose captions;
- emits one concise holistic paragraph organized objective -> guardrail -> photos;
- emits a separate forward-looking Coach's Insight;
- preserves the existing Snapshot and Next UI positions;
- preserves completion-specific copy separately from this ordinary-event change.

No copy claims visible muscle gain or contractile-muscle gain. DEXA remains attributed to measured lean mass; photos remain supporting evidence; no causal claim is made about training, nutrition, activity, or strategy.

## Validation on exact candidate `9a89ff90`

Passed:

- focused downstream tests: **3 files, 43/43**;
- full relevant available suite excluding the private-only fixture: **7 files, 78/78**;
- unchanged Goal-blind perception and adversarial provider-boundary tests;
- frozen Case 1/2 artifact tests;
- multi-view reconciliation tests;
- Photo observation tests;
- Goal/guardrail projection tests;
- cutoff/holistic tests;
- hierarchy and compatibility tests;
- realization and structural redundancy tests;
- targeted ESLint: passed;
- `git diff --check`: passed;
- production `next build`: passed outside the sandbox; the first sandboxed attempt failed only because Turbopack could not bind its internal localhost port. The successful build completed with the repository's existing NFT tracing warnings.

One additional suite selection attempted `CanonicalPhotoSessionReadService.test.js`; 17 tests passed and one could not start because this checkout intentionally lacks `private/founder/runtime-store.json`. This is a missing private fixture, not a product assertion failure, and that file was not sought or reconstructed.

Frozen-boundary checks:

- diff from `0d0f189e` for `CanonicalPhotoPerceptionService.js`: empty;
- diff from `0d0f189e` for its adversarial test: empty;
- frozen Case 1/2 JSON files: unmodified;
- Native: untouched.

## Fresh review

A clean diff review after the implementation confirmed:

- no perception prompt, schema, provider input, observation, comparability, magnitude, confidence, or boundary change;
- hierarchy derives the primary metric and accepted guardrails from the projected Goal contract;
- stable photos cannot manufacture visual size gain;
- primary-objective progress cannot erase an out-of-range guardrail;
- an intact guardrail cannot manufacture primary-objective success;
- user-facing sections contain no raw observation concatenation or repeated exact DEXA values;
- completion/historical serving behavior remains separate and stored historical artifacts still return before regeneration.

Fresh raw-image execution review remains pending with the replay.

## Production authority and safety

Read-only authority was reverified immediately before the blocked console attempt:

- app: `bf57cf56-48cc-4cd6-90e4-a23ee5381741`;
- active deployment: `1fa2121a-5729-49c3-9865-a79f1724bb3f`;
- active web/worker source SHA: `4a81f5b4cac981f9241e40b556341246b83c3309`;
- phase: `ACTIVE`;
- intended transaction: `REPEATABLE READ READ ONLY` with rollback verification;
- intended mode: `preview=true`, `ignoreExisting=true`;
- production writes: none;
- history regeneration: none;
- deployment: none;
- Native: untouched.

No private photo bytes, object-store paths, credentials, raw production records, or local private harness output were committed or pushed.

## Blocker and exact next step

Before the new full raw-image replay can run, the Founder must explicitly authorize this disclosed transfer:

> Download the five Aug 22 and five Sep 19 private Founder JPEG analysis renditions inside the read-only production console, verify each against canonical SHA-256 metadata, and submit the five matched pairs to the configured OpenAI vision provider for a fresh Goal-blind perception replay. Provider response objects will be temporary and deleted after the replay.

Once explicitly authorized, run the established production-console replay, publish the exact UI-order copy and full provenance/zero-write report, and stop without deploying.

## Local state

Implementation SHA `9a89ff90` is pushed. This checkpoint/latest-pointer update is the only pending local change at report creation. The replay submit bundle in `/private/tmp` contains code only and was not executed; it contains no photo bytes or credentials and will not be pushed.

