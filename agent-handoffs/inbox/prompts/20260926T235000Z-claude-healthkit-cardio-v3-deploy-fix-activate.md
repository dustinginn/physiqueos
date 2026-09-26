Task id: claude-healthkit-cardio-v3-deploy-fix-activate-20260926

Continue in the current Claude HealthKit Server lane.

Founder explicitly authorizes proceeding with the Cardio -> V3 strategic graduation sequence described in:
agent-handoffs/reports/20260926T233000Z-healthkit-cardio-v3-graduation-phase1-closeout.md

CURRENT AUTHORIZATION AND REQUIRED ORDER

1. Deploy the already-reviewed inert Cardio/V3 candidate:
cc8bd0b706e155223b112d44a95d93680d0a0054

Use the established guarded production push/deploy sequence. Reverify current production authority first. Candidate must still be a clean descendant of expected production 524f1882072cb5c17c4fe61f7210f0f7d1c6e67c with only the reviewed Cardio graduation diff. Stop on unexpected divergence.

This deployment is authorized specifically because it is inert under the current live graduation policy. Do not add cardio_training to the live evidenceEligibility domains during this first deploy.

Postdeploy verify source/runtime SHA/buildId, live/ready, migrations, policy unchanged, zero-write strategic digests/historical artifacts unchanged, Cardio operational controls intact, Strength untouched.

2. Fix the pre-existing PhotoEventNarrativeService resistance-training semantic defect identified by fresh-context review.

The problem:
deriveExecutionSupport currently treats any active evidence_type training record as resistance-training support. Once Cardio becomes strategically eligible, Cardio-only evidence could incorrectly support resistance-training language.

Use the established resistance-specific semantics already present in WeeklyNarrativeService as the reference behavior. Prefer reuse/shared semantics over duplicating divergent logic where appropriate, but keep the change minimal and bounded.

Required deterministic tests must prove at minimum:
Cardio-only strategic training evidence cannot satisfy resistance-training consistency;
real resistance/strength evidence still can;
mixed Cardio + resistance behaves correctly;
existing Photo Event narrative behavior outside this distinction is unchanged.

Fresh-context review the fix.

3. Only after the Photo Event semantic fix is reviewed and safely deployed, perform a final pre-activation audit for cardio_training strategic eligibility.

Reconfirm:
Cardio canonical/presentation pipeline remains accepted;
no Activity/workout strategic double counting;
duplicate suppression remains intact;
Strength reconciliation remains separate;
historical generic Cardio is not relabeled Indoor/Outdoor;
historical briefing/Confidence/Narrative/Goal artifacts will not be regenerated;
ordinary low-materiality Cardio does not mechanically alter Confidence or force Narrative mention;
material Cardio can enter the normal evidence pipeline prospectively.

4. If and only if all gates above pass, Founder authorizes adding cardio_training to the live HealthKit graduation evidenceEligibility domains using the established guarded policy operation.

Preserve existing activity and nutrition domains. This is a prospective eligibility-policy activation, not a historical regeneration.

After activation, verify the live policy contains activity, nutrition, cardio_training and that Strength remains outside this Cardio graduation path.

Perform bounded zero-write validation of the resulting live evidence projection and V3 seams. Do not manufacture a briefing or rewrite historical strategic artifacts merely to prove activation. Natural future V3 briefing generation is the live acceptance point.

5. Publish a final HealthKit Cardio Phase1 closeout report/pointer.

It must state clearly:
inert candidate deploy SHA/deployment;
Photo Event semantic-fix SHA/deployment;
live graduation policy before/after;
cardio_training activation status;
V3 Confidence/Narrative integration status;
historical immutability;
duplicate/double-count controls;
Strength separation;
Logged Today Cardio Native presentation defect remains open for the next batched Native build;
Strength Sep24 Build62 confirmation failure remains open under separate deeper diagnosis;
reconciliation-review notification natural-event acceptance remains pending;
whether Cardio is now fully graduated for Phase1.

Do not begin HealthKit Sleep.
Do not cut/upload another Native build.
Do not touch or retry Sep24 Strength.
Do not mutate Founder evidence records.
Do not regenerate historical briefings/Confidence/Narrative.
Do not browser-login to any service.
Stop and report on any unexpected authority, migration, policy, health, or review failure.

END TASK.
