Task id: claude-healthkit-cardio-graduation-preparation-20260924

Continue in the existing persistent HealthKit Founder Takeover Claude conversation. Reasoning: high.

This task authorizes READ / PREPARE / TEST / REVIEW ONLY for Cardio graduation readiness. Do NOT deploy, upload, mutate workout policy, activate Cardio, reconcile deferred observations, or mutate production data.

Read first:
agent-handoffs/latest.json
agent-handoffs/latest.md
the report published by commit deaac49fc6cf5602491b2c6cef32945cec2cd48e
agent-handoffs/reports/20260924T230500Z-healthkit-corrections-cardio-readiness-implemented-reviewed.md
and relevant earlier Cardio/Strength reports linked there.

Expected current authority, reverify:
Production Server remains 01d1900bcbb9db32ce270e49c7d24e919ba0d7d7 until separately changed.
Installed Native remains Build59 / a269700b.
Reviewed HealthKit Native candidate: 6a108d25e2a05b63c9561be3aeb9952f4e9dafe1.
Reviewed prospective workout-type Server candidate: c58dcca97e7b1a32c829485b7f8dc3d8fa5bb5a5.
Midweek Claude is concurrently working on V3 Server/Native changes. Do not touch its worktrees.

Goal:
Prepare Cardio graduation so that after the current Strength/Native fixes and required Server type-fidelity code are live/accepted, the remaining Cardio work is a short sequence of already-reviewed production gates.

Do not execute those gates now.

PART A — reverify Cardio graduation machinery against latest candidates

Audit the already-built atomic workout-policy replace capability and deferred-Cardio reconciliation runner against current production lineage plus c58dcca9.

Prove:
- atomic replace can widen exactly current families:[strength] -> [cardio,strength] in one transaction;
- no disabled-policy gap;
- old-policy digest/version drift fence;
- exact target-family authorization;
- idempotent replay;
- audit row;
- Activity/Nutrition policy untouched;
- strategicEvidenceEligibility remains quarantined/off;
- historicalBackfill remains false;
- linkAutoConfirm remains false;
- deferred reconciliation runner accepts exact authorized identities only;
- requires family_not_in_activation_scope and live cardio policy;
- creates one canonical cardio workout per exact source identity;
- creates no Training Logger session, Strength link, claim, auto-confirm, or strategic evidence;
- preserves source telemetry/provenance available in stored payload;
- idempotent replay.

If c58dcca9 changes any classifier/constructor assumptions, update fixture tests/design only as necessary. Do not execute production mutation.

PART B — bounded live deferred-Cardio inventory immediately before future activation

Perform a READ-ONLY bounded production inventory of all Founder HealthKit workout observations from the Cardio-relevant policy boundary through NOW that are currently deferred solely because family_not_in_activation_scope and classify as cardio.

Important:
Do not assume the backlog is still four. Sep23/24 were previously known, but Sep25+ may now contain additional workouts.

Return exact reconciliation manifest fields for every current deferred cardio observation:
- source observation identity / UUID if retained;
- local date;
- stored source workout type/activity type;
- classifier family;
- start/end/duration;
- active energy and other retained telemetry;
- defer reason;
- canonicalization state;
- digest/precondition needed for future reconciliation;
- whether specific Indoor/Outdoor metadata is actually present.

Known historical limitation:
The four Sep23/24 stored deferred observations did not retain the new Indoor/Outdoor metadata. Do NOT infer or fabricate it during reconciliation.
Founder external knowledge says Sep23 was Outdoor Walk x2 and Sep24 Indoor Walk x2, but stored source payload is authoritative for what PhysiqueOS can safely canonicalize. These four may therefore display generic Walking/Cardio after reconciliation.
Prospective observations ingested after c58dcca9 is deployed must preserve Apple's specific type when metadata is present.

If new deferred observations after Sep24 contain specific type metadata under current live code, report exactly what is stored; do not infer missing metadata.

PART C — prepare exact future policy-replacement dry-run package

Without executing against production, prepare the exact command/input/authorization package that will later dry-run:
families:[strength] -> exactly [cardio,strength]

Bind it to:
- expected current policy digest/version read from production;
- effectiveLocalDate preserved unless current policy/source proves otherwise;
- openEnded true;
- strategicEvidenceEligibility unchanged/quarantined;
- historicalBackfill false;
- linkAutoConfirm false;
- exact authorization reference placeholder;
- no other policy field changes.

Define expected dry-run output and all stop conditions.
Do not apply.

PART D — prepare exact future deferred-reconciliation dry-run package

Build a machine-readable manifest from Part B that can later be fed to the bounded reconciliation runner.

Requirements:
- one exact observation identity per entry;
- expected observation digest/state;
- expected family cardio;
- expected stored workout type;
- expected no existing canonical workout;
- expected policy digest after Cardio activation;
- no bulk/date-range wildcard;
- manifest immutable/checksummed for the authorization gate;
- if backlog changes between preparation and execution, dry-run must stop and require manifest refresh rather than silently include/exclude observations.

Prepare dry-run invocation and expected output. Do not execute apply.

PART E — prospective workout-type fidelity activation dependency

Prove the required sequencing around c58dcca9:
- prospective type-fidelity Server code must be deployed before Cardio activation;
- once live, new Apple Health cardio observations should preserve specific Apple source type (e.g. Indoor Walk vs Outdoor Walk) when HK metadata provides it;
- family remains cardio;
- no inference from GPS/location/speed/date;
- Activity Detail exposes specific canonical/display type;
- historical four lacking metadata remain generic unless a separately-authorized correction mechanism is ever designed.

Add/confirm regression tests around the graduation runner using the shared classifier/constructor path so reconciliation cannot erase specific type metadata on observations that have it.

PART F — Activity accounting acceptance package

Prepare exact pre/post invariants for eventual Cardio activation/reconciliation.

Before and after:
- canonical whole-day Activity total for each affected date is invariant;
- workout calories are derived from canonical included workouts and each canonical workout contributes at most once;
- Strength requires its confirmed-link semantics for Activity workout attribution;
- Cardio contributes once canonicalized without requiring a nonexistent Logger confirmation;
- non-workout calories = max(daily active total - known included workout energy, 0) under the reviewed contract;
- no canonicalized Cardio workout is added on top of daily Activity total;
- missing workout energy remains explicitly unknown as designed;
- no duplicate workout identities;
- Strength telemetry/Logger relationship unaffected;
- no Cardio Logger sessions/links/claims;
- strategic counts/digests unchanged.

Prepare production read-only pre/post audit tooling/queries but do not run any write.

PART G — real-device Founder acceptance checklist

Prepare concise checklist for after future apply:
1. Activity whole-day totals remain the same.
2. Activity Detail shows each canonical cardio workout as its own row.
3. New/prospective workouts preserve Apple-specific workout type when source metadata exists.
4. Historical Sep23/24 four may show generic Walking/Cardio due to unrecoverable stored metadata; do not treat that as a new ingestion failure.
5. Strength detail remains healthy and candidate/confirmed semantics honest.
6. No Cardio appears as a structured Training Logger session.
7. Workout/non-workout calorie decomposition is sensible and no double counting.
8. Current-day Activity/Nutrition auto sync remains healthy.

PART H — exact future execution sequence

Return a gated sequence with explicit separate Founder authorizations:
Gate 1: deploy Server type-fidelity candidate c58dcca9, unless superseded by a clean combined Server candidate with Midweek.
Gate 2: install/accept combined Native containing 6a108d25 Strength fix.
Gate 3: refresh bounded deferred inventory immediately before activation.
Gate 4: production atomic policy-replacement DRY RUN only.
Gate 5: Founder reviews dry-run and separately authorizes APPLY.
Gate 6: verify policy post-state.
Gate 7: deferred reconciliation DRY RUN only against exact refreshed manifest.
Gate 8: Founder reviews and separately authorizes APPLY.
Gate 9: verify canonical workouts + Activity invariants.
Gate 10: Founder real-device acceptance.
Strategic eligibility remains a later separate project/gate.

TEST / REVIEW

Run focused fixture tests for:
- atomic policy replacement;
- manifest drift/refusal;
- reconciliation idempotency;
- no Logger/link/claim;
- exact source identity preservation;
- specific workout type preserved when metadata exists;
- generic historical type remains generic when metadata absent;
- daily Activity total invariant;
- no double count;
- Strength unaffected.

No need to create another release candidate unless a genuine preparation defect requires code changes. If code changes are needed, keep them isolated, test, production-build if Server, and fresh-context review; do not deploy.

Fresh-context adversarial review the complete Cardio graduation package, including manifest semantics, gate order, invariants, and abort conditions.

GITHUB

Publish a timestamped HealthKit Cardio-graduation-readiness report to agent-handoffs/reports/ on main and update HealthKit latest.json/latest.md.
Include current deferred count and manifest checksum, exact required Server/Native dependencies, tests, fresh-review verdict, and explicit statement that nothing was activated/mutated.

Stop for Founder direction.

Flags:
AUTHORITY_REVERIFIED
CARDIO_GRADUATION_MACHINERY_REVERIFIED
CURRENT_DEFERRED_CARDIO_INVENTORY_COMPLETE
DEFERRED_BACKLOG_COUNT
DEFERRED_MANIFEST_CHECKSUM_READY
HISTORICAL_TYPE_LIMITATION_PRESERVED
PROSPECTIVE_TYPE_FIDELITY_DEPENDENCY_PROVEN
POLICY_REPLACE_DRYRUN_PACKAGE_READY
DEFERRED_RECONCILIATION_DRYRUN_PACKAGE_READY
ACTIVITY_PRE_POST_INVARIANTS_READY
NO_DOUBLE_COUNT_GUARDS_READY
FOUNDER_ACCEPTANCE_CHECKLIST_READY
EXECUTION_GATES_READY
FRESH_CONTEXT_REVIEWED
SERVER_DEPLOYED
POLICY_MUTATED
CARDIO_ACTIVATED
DEFERRED_CARDIO_RECONCILED
PRODUCTION_DATA_MUTATED
GH_REPORT_PUBLISHED
