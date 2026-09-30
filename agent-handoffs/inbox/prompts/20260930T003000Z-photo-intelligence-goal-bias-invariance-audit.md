Photo Intelligence corrective audit — Goal-bias invariance + legacy source-analysis contamination

STATUS

PAUSE the previously contemplated Photo Briefing realization-only copy correction.

A more important upstream concern was identified after Founder manually reviewed the actual Aug 22 -> Sep 19 production photo pairs.

This task must determine whether canonical visual interpretation is biased toward the prior Visible Abs/leanness objective or contaminated by legacy goal-aware source analyses.

Do not patch copy first.

CURRENT PRODUCTION

Photo Intelligence production Server/Web:
446bc964dc31318ea48261400e8b243cdd1d4ab1

Final Sep 19 zero-write replay:
agent-handoffs/reports/20260930T000750Z-photo-intelligence-sep19-final-production-replay.md

Replay artifact:
agent-handoffs/photo-intelligence/founder-cases/sep19-final-production-replay-20260930T000514Z.json

Review request:
agent-handoffs/inbox/review-requests/20260930T001631Z-chatgpt-review-photo-intelligence-sep19-final-production-replay.md

DO NOT implement the requested realization correction from that review yet.

FOUNDER CONCERN

Founder reviewed the actual Aug 22 and Sep 19 matched photos and raised a product-critical concern:

Photo Intelligence may have bias baked in toward the prior Visible Abs goal / leanness interpretation.

The Sep 19 production replay repeatedly selected:
- waist leanness increased;
- abdominal definition increased;
- back leanness increased;
- waist softness decreased;
- back conditioning increased;

while much of muscularity was classified stable, despite the active Goal being Build Lean Mass.

The concern is not that a Build Lean Mass system should force muscularity findings.

The concern is that the perception layer may still implicitly optimize for "does the user look leaner?" because historical/legacy photo interpretation was developed around Visible Abs.

FOUNDER MANUAL REVIEW OF ACTUAL AUG 22 -> SEP 19 PAIRS

Founder supplied actual pairs for review.

Human review concern:
- front relaxed does NOT strongly support "waist appears tighter";
- more defensible: overall shape broadly similar; possible subtle upper-body fullness; waist remains lean/controlled without obvious increased softness;
- rear relaxed does NOT strongly support "waist looks leaner";
- camera distance/framing differs materially;
- more defensible: back remains lean/muscular with no obvious increase in lower-back/waist softness; small width/taper changes are difficult to judge confidently.

The production PI assigned high comparability to all five matched views. Human review considers that too strong for at least some silhouette/width/taper judgments, especially rear relaxed.

Do not hard-code these human conclusions. Use them to motivate a general audit.

CORE ARCHITECTURAL INVARIANT

Canonical visual perception MUST be Goal-invariant.

For identical source image bytes and identical photo metadata:

Stage 1 — Visual observation:
- What visually changed?
- Regional direction.
- Apparent magnitude.
- Confidence.
- Comparability.
- Confounders.

MUST NOT depend on:
- active Goal;
- Goal phase;
- guardrail;
- strategy;
- DEXA;
- weight;
- training;
- nutrition;
- activity;
- sleep;
- desired outcome.

Stage 2 — Reliability/comparability:
MUST also remain Goal-blind.

Stage 3 — Goal interpretation:
Only here may Goal context affect:
- relevance;
- ranking;
- meaning;
- whether stable waist matters;
- whether fuller upper body matters;
- Goal-relative direction;
- coaching emphasis.

Stage 4 — Holistic synthesis:
Only here may independent canonical evidence such as DEXA/weight/training/etc. strengthen or qualify the coaching conclusion.

The same pixels MUST NOT become visually leaner merely because the Goal is Visible Abs, nor visually more muscular merely because the Goal is Build Lean Mass.

TEST 1 — THREE-WAY GOAL INVARIANCE

Using the exact canonical Aug 22 -> Sep 19 five-view source media:

Run the raw-image/canonical photo-only perception path three times with identical source bytes:

A. GOAL BLIND
No Goal/phase/guardrail context supplied to perception.

B. FALSE VISIBLE ABS CONTEXT
Supply Visible Abs only at the downstream Goal-interpretation boundary.

C. CORRECT BUILD LEAN MASS CONTEXT
Supply Build Lean Mass + body-fat guardrail only at the downstream Goal-interpretation boundary.

Compare byte/semantic identity of canonical perception fields.

These MUST remain identical across A/B/C:
- source/view classification;
- comparability dimensions;
- regional observations;
- direction;
- apparent magnitude;
- confidence;
- confounders;
- overall photo-only magnitude;
- photo-only reliability.

These MAY differ:
- relevance/ranking;
- Goal-relative interpretation;
- coaching narrative;
- holistic synthesis.

If current APIs make it impossible to run A/B/C without Goal context entering perception, that itself is an architecture defect.

Publish a field-level diff.

TEST 2 — LEGACY ANALYSIS CONTAMINATION

The Sep 19 production replay reconciled stored schema-13 computed source analyses created Sep 20.

Determine:
- exactly which producer/prompt/policy generated those source analyses;
- what Goal/phase/strategy context was supplied to that producer;
- whether they were generated under legacy Visible Abs-oriented assumptions/prompting;
- whether Goal-relative language or desired-outcome concepts are embedded in the structured visual observations;
- whether current canonical_photo_intelligence_set_v1 is truly re-analyzing pixels or primarily reconciling those historical analyses.

Then rerun the exact canonical Aug 22 + Sep 19 source image bytes through the CURRENT intended raw-image photo-only producer with all Goal/non-photo context removed from perception.

Compare:
1. legacy stored source analyses;
2. current raw-image goal-blind analyses;
3. current set-level reconciliation.

Identify material differences in:
- waist leanness;
- abdominal definition;
- back leanness/conditioning;
- shoulder/arm/chest muscularity/fullness;
- stable vs increased direction;
- confidence;
- comparability.

If current production has no truly Goal-blind raw-image producer and only wraps/reconciles legacy goal-aware analyses, report that plainly. Do not pretend the set-level layer solved perception isolation.

TEST 3 — COMPARABILITY CALIBRATION

Audit why all five Aug 22 -> Sep 19 views received high comparability.

Comparability must be metric-sensitive where appropriate.

Examples:
- camera distance/framing can materially compromise apparent width, taper, circumference/silhouette and regional size judgments;
- lighting can materially compromise subtle definition/vascularity judgments;
- arm/scapular position can compromise shoulder/back/lat size judgments;
- the same pair may remain useful for a broad "no obvious increase in softness" conclusion while being weak for "waist became narrower."

Do not require studio-identical photos.

But enforce:
As the apparent biological change becomes smaller, capture differences should have greater influence on confidence.

Audit whether current comparability:
- is too coarse/global;
- ignores geometric scale/framing;
- is inherited from legacy analysis;
- is assigned before metric-specific applicability;
- fails to distinguish stable/no-obvious-deterioration from directional improvement.

Add a concept of observation-specific/metric-specific comparability if required rather than globally downgrading an otherwise useful photo pair.

TEST 4 — STABILITY AS A VALID RESULT

Audit whether the interpreter has an asymmetric preference for positive directional changes.

For subtle comparisons, "stable" is a valuable canonical result.

Specifically verify policy supports:
- stable waist/leanness;
- stable muscularity;
- no obvious deterioration;
- insufficient evidence for directional change;

without treating those as failed/noisy outputs.

The engine must not manufacture improvement merely to create an interesting Photo Briefing.

TEST 5 — GOAL SWAP REGRESSION FIXTURES

Create deterministic fixtures demonstrating:

Same canonical perception:
- waist stable;
- upper-body fullness subtly increased.

Visible Abs interpretation may say:
- leanness appears maintained; limited further visual fat-loss progress.

Build Lean Mass interpretation may say:
- upper-body fullness with stable waist is supportive of the build.

The underlying visual fields must be identical.

Second fixture:
- waist softness visibly increased;
- muscularity increased.

Visible Abs and Build Lean Mass may interpret relevance differently, but neither may rewrite the visual observations.

Third fixture:
- waist visibly leaner;
- muscularity stable.

Again perception identical, interpretation differs.

HISTORICAL CONTEXT / TRAINING DATA

Do not use prior human conclusions as labels for the raw-image run.

Do not feed:
- ChatGPT photo assessments;
- the Sep 19 production replay prose;
- Case 1/2 human references;
- DEXA values;
into the perception prompt.

This is an invariance/audit test, not supervised prompt fitting.

CORRECTIVE IMPLEMENTATION

If bias/contamination is found:

Implement the narrowest architecture correction that guarantees:
- raw visual perception is Goal-blind;
- comparability is sufficiently observation-specific;
- Goal context enters only after canonical visual observations are frozen;
- legacy stored goal-aware analyses cannot silently become authoritative canonical PI inputs for new prospective Photo Events;
- existing historical artifacts remain immutable.

Do NOT rewrite historical Photo Briefings or historical analyses.

If legacy analyses need a provenance classification such as legacy_goal_context_contaminated or equivalent, design it generically and document migration/compatibility behavior.

For prospective events, ensure current producer provenance records:
- producer;
- model;
- prompt/policy version;
- explicit photo-only context boundary;
so future audits can prove what generated the observations.

HOLISTIC SYNTHESIS FOLLOW-UP

Only after perception invariance passes should you revisit the earlier copy issue.

Also audit the current convergence concept:
Evidence does not need to move in the same numerical direction to support the same Goal.

Example:
- lean mass increases;
- body fat rises from below guardrail into an accepted 8–9% guardrail;
- waist remains visually stable;
may all be Goal-compatible for Build Lean Mass.

Do not automatically classify that as conflicting/mixed merely because body-fat direction is "up" while visual leanness is "stable" or "up."

Goal-relative compatibility belongs in holistic synthesis, never perception.

But do not implement copy polish until the perception audit is resolved and replayed.

VALIDATION

Required:
- exact-source Aug 22 -> Sep 19 A/B/C invariance run;
- field-level identity/diff artifact;
- legacy-vs-current raw-image comparison;
- deterministic Goal-swap fixtures;
- metric-specific comparability tests;
- stable-result tests;
- photo-only contamination rejection;
- Case 1/2 frozen artifacts remain byte-identical;
- multi-view contract regression;
- holistic time-causality regression;
- fresh-context review.

Risk-scaled testing:
- Server/intelligence deterministic tests + private zero-write image replay;
- no lengthy Native simulator work;
- no Native work unless a contract incompatibility is discovered.

PRODUCTION SAFETY

Current deployed Photo Intelligence at 446bc964 remains in place while this audit occurs.

Do not:
- regenerate historical Photo Briefings;
- mutate Founder production data;
- deploy during the audit;
- change Native;
- touch auth;
- touch Claude/Fable peptide work;
- commit private image bytes/paths.

REPORTING

Publish:
1. goal-invariance audit;
2. legacy source-analysis provenance audit;
3. exact A/B/C field-level diff;
4. raw-image vs legacy result comparison;
5. comparability diagnosis;
6. any corrective implementation SHA;
7. tests;
8. fresh-context review;
9. recommendation for whether 446bc964 should remain live or be superseded.

Push-notify Founder when the audit diagnosis is ready, when a candidate is ready, or if input is required.

END TASK.
