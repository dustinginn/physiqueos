Task id: claude-healthkit-phase1-cardio-strategic-graduation-closeout-20260926

Continue in the current Claude HealthKit lane.

Founder decision: HealthKit Cardio is accepted as operationally live and settled for Phase 1, with one known presentation defect: Log / Logged Today Training currently omits canonical Cardio even though Training Day correctly contains it. That Log defect is not a blocker to graduating the underlying HealthKit Cardio pipeline.

Accepted Cardio behavior already proven:
normal Apple Watch/HealthKit -> Native automatic sync -> Server observation;
automatic canonical Cardio workout creation;
explicit HKMetadataKeyIndoorWorkout/isIndoorWorkout prospective fidelity;
outdoor_walking / indoor_walking classification only from explicit metadata, never inference;
Training Day presentation;
Cardio detail;
Activity accounting with no workout-energy double count;
no Logger/link/claim semantics for Cardio;
no duplicates in accepted prospective case;
historical observations without recoverable Indoor/Outdoor metadata remain generic;
no manual confirmation UI for routine Cardio.

Founder now authorizes the final Phase 1 Cardio strategic graduation work: connect trustworthy canonical HealthKit Cardio to the normal evidence-eligibility pipeline so V3 Confidence and Narrative can use Cardio when strategically material.

ARCHITECTURAL RULE

Preserve the established layers:
HealthKit source observation -> canonical PhysiqueOS Activity/Workout record -> evidence eligibility -> V3 strategic interpretation.

Do NOT make source provenance itself decide strategic meaning.
Do NOT make every HealthKit Cardio workout strategic evidence merely because it is trustworthy.
Canonicalize/reconcile first; evidence eligibility must apply normal domain/materiality/goal relevance rules; V3 Confidence/Narrative remain Server-owned interpretation.

Reverify current production authority and latest HealthKit/Confidence/Narrative V3 implementation before changing anything.

Read newest HealthKit reports plus current V3 Confidence/Narrative pointers/reports. Preserve all accepted historical briefings and confidence artifacts.

Task:
1. Audit the current strategic quarantine for HealthKit Cardio and identify the exact evidence-eligibility boundary.
2. Define and implement the smallest correct policy change that graduates canonical Cardio from blanket quarantine into normal evidence eligibility.
3. Ensure canonical Cardio can contribute to V3 Confidence and Narrative only when relevant/material under existing strategic evidence rules.
4. Preserve routine low-materiality Cardio as non-disruptive evidence; do not let ordinary walks mechanically move Confidence or force Narrative mentions.
5. Preserve Activity accounting separation and avoid double-counting Cardio as both daily Activity and workout evidence in strategic interpretation.
6. Preserve Strength reconciliation semantics separately; do not conflate Cardio graduation with the still-open Sep24 Strength confirmation defect.
7. Do not infer historical Indoor/Outdoor labels. Historical generic Cardio may remain generic while still being eligible under the correct strategic rules if otherwise appropriate.
8. Do not regenerate or rewrite historical briefings, Confidence, Narrative, Goal state, or recommendations. This is prospective behavior only unless a bounded zero-write simulation is used for validation.
9. Validate with deterministic tests and bounded zero-write simulations showing:
   a. strategically material Cardio can reach V3 evidence and influence interpretation appropriately;
   b. ordinary low-materiality Cardio does not mechanically change Confidence/Narrative;
   c. no Activity/workout double counting;
   d. historical strategic artifacts remain unchanged;
   e. existing Strength, Nutrition, DEXA, Training and Goal evidence behavior is preserved.
10. Fresh-context review the final candidate.

If the Server change is reviewed and safe, prepare a deployment recommendation but do not deploy unless this task's Founder authorization is sufficient under the lane's established deployment rules. Founder is authorizing completion of this Cardio strategic graduation and wants Phase 1 HealthKit wrapped; guarded Server deployment is authorized if all established review, zero-write, migration, health, and rollback gates pass. No schema change should be introduced unless proven necessary; stop if scope unexpectedly expands.

PHASE 1 CLOSEOUT

Also produce a concise HealthKit Phase 1 closeout assessment covering:
Cardio operational status;
Cardio strategic/V3 status after this task;
Activity/Nutrition automatic sync status as currently established;
Strength reconciliation status, explicitly noting the Sep24 Build61 confirmation failure remains an open defect and is not falsely declared complete;
reconciliation-review notification status;
known Logged Today Cardio presentation defect;
remaining Build62/UI patch items already observed during Founder acceptance;
what is complete enough to freeze before HealthKit Sleep;
what must remain open before/alongside Sleep.

Do not begin HealthKit Sleep in this task.

Known Build61 acceptance follow-ups to preserve, not necessarily implement here:
Active Goal Your Journey needs Home-style phase progress bars.
Log / Logged Today Training must include canonical Cardio.
Completed Visible Abs Goal must render actual first and completion progress photos.
Build61 Sep24 Strength reconciliation still fails and is under separate diagnosis.
Reconciliation-review notification natural-event acceptance remains pending.

Publish GH report/pointers with exact candidate/deployed SHA, policy before/after, tests, zero-write validation, V3 Confidence/Narrative integration proof, historical immutability proof, deployment status, and Phase 1 closeout.

END TASK.
