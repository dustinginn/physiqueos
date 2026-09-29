Photo Intelligence multi-pose extension — Back Pose Case 3 human reference frozen before PI run

Parent task:
agent-handoffs/inbox/prompts/20260929T143000Z-photo-intelligence-blind-founder-validation.md

Canonical/holistic candidate:
codex/photo-intelligence-canonical-holistic-20260929 @ a6ece665dbe267fe52978a3a8632c1f67a416fa8

PURPOSE

Founder has decided future Build Lean Mass progress-photo capture will include multiple poses/views and will generally move to a monthly cadence.

Cases 1 and 2 remain sufficient for the initial front-view intelligence calibration. Additional pose cases are now intended primarily to validate and extend the canonical architecture for multi-view physique evidence, not to manufacture another mandatory release-gate benchmark.

The first additional pose is a back-view comparison.

BACK POSE CASE 3

Baseline:
2026-06-13

Comparison:
2026-07-18

Goal context:
Visible Abs / cut phase.

Founder will send the exact two images directly to Codex after this instruction.

IMPORTANT EXPERIMENTAL NOTE

Unlike Cases 1 and 2, the human reference for this pose is already frozen in this GH instruction before Codex receives/runs the images.

Therefore:
- this is NOT a blind validation case;
- do not label it blind;
- do not claim independent human-vs-PI validation;
- use it as an architecture/calibration/multi-view development case;
- still run the photos through PI without manually forcing the expected observations;
- report genuine disagreements rather than rewriting output to match the reference.

HUMAN REFERENCE — BACK POSE CASE 3

Dominant story:
Clear positive change, primarily improved back conditioning/definition and a tighter lower-back/waist region. The resulting shoulder/back-to-waist taper is substantially stronger.

Overall human assessment:
- visual change: moderate-to-major;
- direction toward Visible Abs/cut objective: strongly positive;
- confidence meaningful visual change occurred: high.

Regional assessment:
- lower back / waist: major improvement in apparent leanness;
- upper-back definition: moderate-to-major improvement;
- rear delts: moderate increase in definition;
- arms/triceps: moderate increase in definition;
- lat definition: moderate improvement;
- lat size: possible but not reliably distinguishable from pose/leanness;
- back-to-waist taper: major visual improvement.

Detailed human observation:
By Jul 18, the upper back appears considerably sharper. Borders around the shoulder blades, rear delts and upper-back musculature are easier to distinguish. The waist/lower-back region appears noticeably tighter with less apparent flank/lower-back softness. This makes the upper back appear wider relative to the waist.

Rear-delt and upper-arm/triceps contours are also clearer.

Important restraint:
Do NOT confidently convert the stronger back shape into "substantial lat growth."

The pose differs materially:
- Jun 13 elbows are farther outward / arms nearer horizontal;
- Jul 18 elbows are higher;
- shoulder/scapular positioning differs.

Those differences can materially alter lat and upper-back presentation.

The high-confidence conclusion is:
"The back is visibly leaner and more defined, and the resulting shoulder-to-waist/back-to-waist proportions are stronger."

Comparability:
Moderate.
Useful similarities:
- same general environment;
- same shorts;
- back-facing orientation;
- broadly comparable double-arm pose.

Important limitations:
- arm angle/scapular position differ materially;
- lighting differs.

These limitations should reduce confidence in size/hypertrophy claims but should NOT suppress the obvious conditioning change. Lower-back/waist tightening and broader muscular definition are too widespread to explain solely through pose.

Illustrative coach-style semantic target:
"The cut is showing just as clearly from the back. Your waist and lower back are noticeably tighter by July, while much more detail is showing through your upper back, rear shoulders and arms. That combination gives you a significantly stronger taper from shoulders to waist. The different arm position makes it harder to judge whether your back actually gained size, but the improvement in definition and overall shape is clear."

Do not treat that wording as a required template.

COPY / VOICE REQUIREMENT

Founder accepts the intelligence quality of the current engine but finds the holistic replay prose too technical.

User-facing Photo Briefing copy should sound like a capable physique coach.

Prefer:
- clear physique takeaway;
- what visibly changed;
- why it matters to the Goal;
- concise uncertainty only where it changes the conclusion.

Avoid exposing internal-engine language such as:
- "independent evidence converges";
- "photo-level direction";
- "visual confidence field";
- "canonical evidence";
- "signal";
- "read";
unless the term is genuinely natural in context.

The structured/internal result should remain rigorous and fully attributed underneath.

MULTI-VIEW ARCHITECTURE DIRECTION

Extend the canonical design from a single front pair toward a progress-photo SET containing multiple view/pose observations.

Future monthly sets may include, where available:
- front;
- back;
- side;
- other consistent physique poses.

Requirements:

1. Each source image retains its own:
- source ID/provenance;
- date/set identity;
- view/pose classification;
- visible regions;
- comparability dimensions;
- per-view observations;
- confidence/reliability.

2. Compare like-with-like poses/views where possible.
Do not compare a back image against a front image merely because both belong to adjacent sets.

3. Produce one canonical set-level visual assessment that reconciles all available views.
Do not generate four unrelated mini-briefings.

4. Preserve per-view provenance beneath the set-level synthesis so a conclusion can be traced to the pose(s) supporting it.

5. Cross-view corroboration may strengthen confidence only where the same underlying conclusion is genuinely supported from multiple useful views.

6. Absence of a region/view is not "no change."

7. Conflicting views should be represented as uncertainty/mixed evidence rather than silently choosing the more favorable image.

8. Goal-relative relevance may rank different views/regions differently, but must not alter the underlying visual observations.

9. Photo-only PI remains separate from holistic evidence synthesis exactly as established in the current canonical candidate.

10. Do not make multi-pose capture mandatory for historical evidence or fail existing front-only Photo Events. The contract must be additive/backward compatible.

MONTHLY LEAN-MASS CADENCE

Product direction:
- during a cut, weekly/biweekly photos may be useful because visible changes can occur relatively quickly;
- during Build Lean Mass, Founder intends to move to approximately monthly progress-photo sets so enough time exists for meaningful visual change to accumulate.

Do not hard-code one universal cadence into PI.
Cadence belongs to Goal/phase/support scheduling/product policy.
PI should correctly interpret whatever valid comparison interval it receives.

HELD-OUT CASE REQUIREMENT

Remove the previous requirement that a third unseen Founder photo pair must block initial graduation.

Cases 1 and 2 are sufficient for the current front-view calibration stage.

Future monthly real Founder photo sets will provide prospective production validation.

Case 3 and subsequent pose-development cases can improve multi-view architecture without being falsely labeled held-out/blind release validation.

CASE 3 EXECUTION

After Founder sends the exact Jun 13 and Jul 18 back photos:

- run them through the current/calibrated photo-only PI path;
- preserve photo-only isolation;
- produce structured back-view observations;
- assess pose-specific comparability;
- produce set-compatible structured output;
- produce coach-style sample Photo Briefing copy;
- compare honestly against the human reference above;
- identify whether any mismatch is perception, pose/comparability reasoning, magnitude, regional ranking, or narrative realization.

Do not use DEXA/weight/training/etc. to alter the photo-only observations.

A separately labeled holistic synthesis may be demonstrated only if useful and only with time-causal evidence.

IMPLEMENTATION

If multi-view support requires contract/service changes, implement them additively on the existing Photo Intelligence candidate branch or a clean descendant.

Do not deploy yet.
Do not mutate Founder production data.
Do not upload TestFlight.
Do not commit private photo bytes or local paths.

TESTING

Risk-scaled:
- deterministic contract/policy/service tests;
- private zero-write image replay;
- no lengthy simulator work;
- no Native simulator unless a specific Native multi-view consumption question exists that deterministic tests cannot answer.

REPORT

Publish:
- Case 3 photo-only result;
- human-vs-PI development comparison;
- multi-view contract changes;
- tests;
- fresh-context review if implementation changes;
- updated deployment recommendation.

END ADDENDUM.
