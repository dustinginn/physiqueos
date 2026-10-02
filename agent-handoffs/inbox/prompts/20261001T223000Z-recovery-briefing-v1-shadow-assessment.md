Recovery Briefing V1 — Founder visual revision + Server shadow assessment

READ FIRST

Design/architecture final report:
agent-handoffs/reports/20261001T215335Z-recovery-briefing-v1-design-architecture.md

Sleep Server closeout:
agent-handoffs/reports/20261001T203806Z-healthkit-sleep-server-midnight-window-closeout.md

Standing GH protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

IMPORTANT:
Every stop/final report must be published and re-read from origin/main. Feature-branch-only reports do not count.

FOUNDER APPROVAL

Founder approves the Recovery V1 direction with one important visual simplification.

Approved semantics:
- Green / Yellow / Red / Not enough data.
- No Recovery Score.
- prior 28 reliable nights as the candidate personal baseline.
- persistence + magnitude gates.
- Green normally has no commentary.
- Midweek V1 Green/Yellow only; no Red.
- foam rolling is execution context only and cannot set/escalate status.
- Recovery status does not automatically move Goal Confidence.
- training may corroborate a severe Sleep pattern but cannot manufacture one.
- association is not causation.
- historical Sleep remains permanently non-strategic.
- candidate policy is approved for PROSPECTIVE SHADOW CALIBRATION, not shipping policy.

FOUNDER VISUAL REVISION

Recovery must render as ONE contiguous card.

Remove:
- Recovery-specific secondary hero/summary above the card;
- separate Recovery headline card;
- nested/inset bordered commentary card.

The existing overall Briefing hero / Result / What It Means / Coach's Take architecture remains responsible for briefing-level narrative.

Recovery is one subordinate card.

GREEN example structure:

Recovery                                      Green

6h 47m
period average        +2m vs 28-night baseline

[Sleep graph]

Foam rolling                              4/7

No commentary block by default.

YELLOW/RED:
same ONE card.
Optional commentary appears as ordinary inline text below the graph, not a separate card/container.

Example:

Recovery                                      Yellow

6h 05m
period average        -41m vs baseline

[graph]

Sleep was persistently below baseline.
Five nights were materially low. Training performance held.

Foam rolling                              7/7

Status must remain accessible without color alone.

TASK

Two outputs:

1. revise the non-shipping prototype to the approved one-card hierarchy;
2. implement the Server-only Recovery V1 SHADOW assessment infrastructure.

Do NOT publish Recovery into real Briefings yet.

A. PROTOTYPE REVISION

Update the existing prototype artifacts.

Required:
- one Recovery card;
- no Recovery-specific hero;
- no nested commentary card;
- preserve graph;
- preserve status pill;
- preserve period average + baseline comparison;
- preserve lightweight foam row;
- commentary inline only when triggered;
- Green no commentary;
- Not enough data remains neutral.

Regenerate at least:
- Weekly Green;
- Weekly Yellow;
- Weekly Red;
- Midweek Green;
- Monthly Yellow;
- insufficient data;
- Green imperfect foam;
- Yellow training holds;
- Red corroborated.

Publish revised screenshot paths in final report.

B. SHADOW POLICY VERSION

Implement a dedicated versioned policy:
recovery_status_policy_v1

Implement stored/serializable assessment schema:
recovery_briefing_v1

Use the design report's proposed schema as starting authority.

This is SHADOW ONLY.

C. ASSESSMENT SERVICE

Implement:
RecoveryBriefingAssessmentServiceV1
or equivalent.

Inputs:
- exact closed briefing period/cadence/timezone;
- canonical eligible Sleep duration evidence;
- authoritative foam-rolling schedule/execution occurrences;
- bounded training corroboration inputs where sufficient;
- evidence cutoff.

Outputs:
- assessment id;
- schema/policy versions;
- status;
- reason codes;
- period coverage;
- personal baseline;
- period Sleep summary;
- graph/trend projection;
- foam execution;
- optional training corroboration;
- commentary visibility/copy;
- data limitations;
- evidence lineage;
- confidenceCoupling = none;
- foamCanSetStatus = false;
- causality = not_inferred.

D. BASELINE

Implement the approved candidate:
- prior 28 reliable nights immediately BEFORE current period;
- exclude current period entirely;
- no lookahead;
- minimum 14 usable baseline nights;
- center = median total Sleep minutes;
- robust spread = max(15 min, 1.4826 * MAD).

Historical timezone uncertainty:
- may support total Sleep duration only when existing Server reliability semantics say duration is reliable;
- never support clock-time consistency claims.

E. CANDIDATE STATUS RULES

Implement exactly as SHADOW policy parameters from the approved report.

Weekly:
- coverage >=5/7 plus baseline;
- Yellow requires >=3 material-low nights, run >=2, and period average >= material threshold below baseline;
- Red sleep-only extreme requires >=5 severe-low nights, run >=4, and period average >= severe threshold below baseline;
- Red corroborated requires Yellow + >=2 severe nights + independently material training constraint.

Midweek:
- all 3 Sun-Tue nights plus baseline;
- Yellow >=2 sequential material-low and average >= max(45 min, robust spread) below baseline;
- NO Red in V1.

Monthly:
- coverage >=20 nights plus baseline;
- Yellow >=2 week-like Yellow subperiods OR >=12 material-low nights;
- Red sleep-only extreme >=60% severe and monthly average >= severe threshold below baseline;
- Red corroborated = Monthly Yellow + >=6 severe nights + independent material training constraint.

Night flags:
material low <= baseline median - max(30m, robust spread)
severe low <= baseline median - max(75m, 2*robust spread)

These are calibration policy parameters, not medical thresholds.

F. FOAM ROLLING

Use schedule-authoritative occurrences only.

Display:
scheduled / completed / missed / excused where available.

Rules:
- foam cannot set status;
- foam cannot escalate status;
- foam cannot rescue status;
- no invented pre-schedule denominator;
- historical observed completions may be shown only under existing authority semantics;
- no physiological claim.

G. TRAINING CORROBORATION

Implement conservatively.

For SHADOW calibration:
- compare current period to preceding comparable training baseline;
- planned rest/deload/travel/illness/injury/schedule changes must be excluded or limitation flagged where known;
- absence alone is insufficient;
- training corroboration cannot make normal Sleep non-Green;
- causality always not_inferred.

Do not implement repeated association as status logic.

If repeated-association calculation is included, it is commentary research metadata only and not user-facing/shipping.

H. SHADOW EXECUTION

Create a shadow runner/service that can evaluate newly due briefing periods prospectively WITHOUT:
- changing the Briefing artifact;
- publishing Recovery;
- changing V3 observations;
- changing Confidence;
- changing Narrative;
- changing recommendations;
- changing evidence eligibility;
- changing settlement readiness.

Preferred:
- explicit shadow assessment store/collection with clear non-strategic provenance;
or
- operational shadow output if persistence would risk strategic coupling.

If persisted:
- collection must be categorically excluded from strategic readers;
- include shadow=true;
- include policy/schema version;
- no client read path;
- no historical artifact linkage that implies publication.

Choose safest architecture and document.

I. HISTORICAL SAFETY

Do not write historical shadow assessments for July-Sep unless the design report's existing zero-write aggregates are sufficient.

No historical Briefing rewrite.
No historical Confidence mutation.
No historical strategic evidence.
No backfill of shadow state unless separately authorized.

The historical zero-write replay remains calibration evidence only.

J. OCT 2 CANARY

Sleep remains validation_only and strategic OFF.

Do not manually trigger Sleep.

Shadow Recovery may consume a prospective Sleep night ONLY if:
- it arrives naturally;
- existing policy permits the shadow runner to read validation-only Sleep for NON-STRATEGIC calibration;
- the assessment is categorically barred from strategic publication.

If that boundary is not already safe, keep shadow input synthetic/zero-write until canary acceptance.

Do not weaken Sleep quarantine.

K. BRIEFING INTEGRATION SEAM — NO PUBLICATION

Add only the minimal future integration seam if useful.

Do NOT:
- add recoveryAssessment to production artifacts yet;
- alter Weekly/Midweek/Monthly presentation contracts;
- alter Native/Web clients;
- alter briefing schedule/precedence;
- add Sleep to settlement readiness.

The final report should specify the exact additive seam for the later publication phase.

L. TESTS

Assessment:
- no-lookahead;
- current period excluded from baseline;
- minimum baseline;
- deterministic median/MAD;
- material/severe boundaries;
- one/two isolated low nights remain Green where required;
- Weekly Yellow/Red;
- Midweek no Red;
- Monthly rules;
- insufficient coverage;
- missing data cannot become Red;
- foam metamorphic invariant: changing foam cannot change status;
- training cannot create non-Green status from normal Sleep;
- causality not inferred;
- timezone uncertainty;
- deterministic assessment id/digest.

Property/metamorphic:
- reorder evidence same result;
- future evidence cannot change closed period;
- removing evidence cannot increase certainty;
- foam changes cannot alter status;
- narrative copy cannot alter status.

Isolation:
- no V3 observation delta;
- no Confidence delta;
- no Narrative/recommendation delta;
- no Briefing artifact mutation;
- no historical mutation;
- shadow store excluded from strategic readers.

Prototype verifier:
- exactly one Recovery card;
- no Recovery-specific hero;
- no nested commentary container;
- Green no commentary;
- status text not color-only.

M. REVIEW

Fresh independent review focused on:
- no strategic leakage;
- no historical mutation;
- baseline/no-lookahead correctness;
- threshold implementation;
- foam invariance;
- training non-causality;
- shadow-store isolation.

N. DEPLOYMENT

This task MAY deploy Server shadow infrastructure only if:
- it is categorically non-strategic;
- no production Briefing/client output changes;
- no historical writes;
- no V3/Confidence/Narrative changes;
- tests/review prove isolation;
- deployment is independently reversible.

If those conditions are not satisfied, stop at reviewed candidate and report.

Do not enable client-facing Recovery.

O. REPORT

Publish to origin/main:
agent-handoffs/reports/<timestamp>-recovery-briefing-v1-shadow-assessment.md

Include:
- exact base/candidate/deployed SHA if any;
- revised one-card prototype screenshots;
- assessment contract;
- baseline/status rules;
- foam/training semantics;
- shadow architecture/store;
- strategic isolation proof;
- tests;
- Oct 2 canary status if naturally observable;
- future additive Briefing integration seam;
- rollback;
- next recommended phase.

Before stopping:
- push implementation/prototype branch;
- publish report to origin/main;
- update latest pointers;
- fetch/reverify origin/main;
- re-read exact report from main;
- give Founder exact main report commit SHA.

END TASK.
