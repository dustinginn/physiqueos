Task id: healthkit-activity-nutrition-canonical-testday-20260921

Goal

Advance PhysiqueOS HealthKit from the already-proven validation-only canary to a controlled canonical proving period for BOTH Activity and Nutrition together, while keeping all HealthKit-derived canonical data quarantined from V3/Confidence/briefing evidence eligibility.

This is the first operational canonical HealthKit test. Do not assume another validation-only canary is required; audit the existing canary/activation state first and reuse what is already proven.

Founder intent

For one controlled real-world test day, HealthKit should be allowed to populate/reconcile canonical:
- Activity
- Nutrition daily totals

but NOT strategic intelligence.

Required architecture invariant

HealthKit source observation
-> canonical PhysiqueOS Activity/Nutrition record where appropriate
-> separate evidence eligibility gate
-> V3/Confidence/briefings only after later explicit Founder authorization.

Do not collapse these layers.

HealthKit provenance/transport must not itself decide strategic meaning.

Authority

Reverify current authority before any change.

Expected production Server:
ba250af13e66b967a4dc8add09c5c5942b0606dd
deployment c353b945-0d36-4867-9f6e-386cb15f4b13
schema 000014

Accepted Native:
bbb46e19084a7b7e0860a1d5e84e20e2f6649d1a
Build 48 / 1.0 (48)
origin preservation ref native/build48-accepted should point exactly there.

Fresh phone Remote Control sessions have been proven to spawn at Build 48.

Read existing HealthKit foundation first

Before changing anything:
- inspect current Server HealthKit ingestion/canary/activation-policy code and production state;
- inspect Build 48 Native HealthKit N0/N1/canary code;
- inspect prior HealthKit handoffs/reports;
- determine exactly what validation-only behavior is already proven;
- determine whether the Founder needs to perform any additional Build 48 canary action. Do not repeat an already-completed canary without evidence that it is necessary.

Produce a concise current-state map:
HealthKit type -> Native read -> transport -> Server observation -> validation status -> canonicalization status -> evidence eligibility -> V3 eligibility.

Controlled test-day design

Use one explicitly bounded Founder-local test date. Prefer the current Founder-local date if operationally safe and if the activation can be completed before meaningful data is lost; otherwise choose the next full local day and state why.

Activity scope

Canonicalize/reconcile the HealthKit activity signals already proven by canary and intended for PhysiqueOS daily Activity authority.

At minimum determine the canonical source for:
- Apple Watch/Fitness active calories / Move energy
- any other daily Activity field already in the approved HealthKit contract

Do not silently expand to unrelated HealthKit metrics.

Requirements:
- correct Founder-local day attribution;
- observed/effective date, not ingestion timestamp, owns the day;
- repeated sync is idempotent;
- HealthKit revisions reconcile/update the same canonical day rather than create duplicates;
- deterministic coexistence/precedence with existing manual/screenshot Activity;
- provenance retained;
- late delivery before the new 03:00 briefing generation can canonicalize to the correct prior day;
- new-day observations must not leak into prior-day canonical Activity.

Nutrition scope

Canonical Nutrition authority is DAILY TOTALS, not meal detail.

HealthKit Nutrition test should canonicalize/reconcile daily:
- calories
- protein
- carbohydrates
- fat

Use the source-neutral NutritionDay/daily-total semantics established by the V3 correction.

Requirements:
- individual meals are NOT required;
- a HealthKit/device aggregate daily total can be usable canonical Nutrition without meal objects;
- preserve source/basis/reliability/provenance;
- do not fabricate meals;
- repeated sync is idempotent;
- revisions reconcile/update the same day;
- deterministic coexistence/precedence with MyFitnessPal screenshot/manual daily totals;
- conflicts beyond existing tolerance are surfaced/reconciled, never silently overwritten;
- partial meal detail must not override a trustworthy asserted/device daily total;
- correct Founder-local day attribution.

If HealthKit does not actually expose one or more of calories/protein/carbs/fat through the current Native permission/read contract, do not invent support. Report the exact missing type/authorization and implement only what Apple's HealthKit and the existing architecture legitimately provide.

Strategic quarantine — hard requirement

For the entire proving period:
- HealthKit-derived Activity and Nutrition may become canonical.
- They MUST NOT become V3 eligible evidence.
- They MUST NOT alter Confidence.
- They MUST NOT alter briefing narrative/strategy interpretation.
- They MUST NOT trigger historical briefing regeneration.
- They MUST NOT alter current Goal/phase/strategy.
- They MUST NOT become evidence merely because source=HealthKit.

Implement an explicit, testable activation/evidence policy boundary rather than relying on accidental absence from adapters.

Existing non-HealthKit canonical evidence should continue behaving normally.

Training/workouts

Do not make HealthKit strength workouts authoritative for Workout Logger.

Preserve:
Workout Logger = exercises/sets/reps/load authority.

Do not implement the later Apple-strength-workout linking UX in this task.

Do not automatically canonicalize broad workout history unless it is already part of the approved foundation and necessary for Activity daily totals.

Cardio/workout automation is later unless existing architecture requires a minimal read for Activity totals.

Production data safety / activation policy

Audit whether moving from validation-only to canonical requires a production activation-policy mutation.

If yes:
- implement/test the policy mechanism first if needed;
- dry-run exact effect;
- require explicit Founder authorization in chat before the production policy write if the local classifier requires it;
- the task itself authorizes the controlled test-day activation, but do not work around a classifier denial;
- scope activation by Founder owner + exact test date + domains Activity/Nutrition;
- V3/evidence eligibility remains disabled;
- provide an immediate rollback/deactivation path that does not delete canonical history.

Do not perform broad historical HealthKit backfill.

Prefer test-day bounded canonicalization. Historical validation-only observations remain validation-only unless separately authorized.

Server implementation

Work from current production Server authority, not old superseded HealthKit foundation branches.

Reuse/cherry-pick/reconcile old HealthKit foundation work only after proving exact relevance and reviewing the diff against current production.

Required Server properties:
- idempotent observation identity
- deterministic canonical day identity
- source/effective-time normalization
- bounded activation policy
- canonical reconciliation
- explicit strategic eligibility quarantine
- safe retry
- no source-ingestion path directly publishing V3 evidence

Native implementation

Work from accepted Build 48 authority.

If Build 48 already has everything necessary to perform operational Activity/Nutrition sync after Server activation, do not make a Native build merely for ceremony.

If Native changes are actually required:
- keep them narrowly HealthKit operational;
- preserve existing HealthKit entitlements/usage strings unless new HealthKit quantity types legitimately require authorization;
- no unrelated backlog fixes;
- full Native review/gates before any Build 49.

Do not automatically create Build 49 unless a Native code change is required for this test.

Background delivery

For the controlled day, determine whether background delivery is already safely implemented/proven.

If not, first prove foreground/manual sync canonicalization. Background delivery can be the immediate next slice after canonical correctness.

Do not let background scheduling complexity obscure canonical correctness.

3 AM integration

Production Server now generates recurring Midweek/Weekly/Monthly at 03:00 Founder local.

Test:
- prior-day HealthKit observation delivered/canonicalized 00:00-02:59 lands on prior canonical day;
- new-day observation remains new-day;
- strategic quarantine means neither influences V3 yet even if canonical before 03:00.

Test-day acceptance

Activity:
- one canonical day, no duplicate
- expected Apple Watch/Fitness active-energy value within source semantics
- correct local date
- provenance identifies HealthKit/Apple source appropriately
- repeated sync no duplicate
- revision updates/reconciles same day
- manual/screenshot coexistence deterministic

Nutrition:
- one canonical day, no duplicate
- calories/protein/carbs/fat populated for the HealthKit-supported daily totals
- no meal objects required/fabricated
- correct local date
- provenance/source basis retained
- repeated sync no duplicate
- revision updates/reconciles same day
- MFP/manual coexistence deterministic

Strategic:
- V3 eligible HealthKit Activity count = 0 for proving period
- V3 eligible HealthKit Nutrition count = 0
- Confidence unchanged solely because canonical HealthKit data arrived
- no briefing mutation/regeneration
- no Goal/strategy mutation

Testing

Before production activation:
- unit tests for Activity canonicalization/idempotency/revision
- unit tests for Nutrition daily-total canonicalization/idempotency/revision
- conflict/precedence tests with manual/screenshot sources
- timezone/day-boundary tests
- 00:00-02:59 late-delivery tests
- new-day exclusion tests
- explicit V3/evidence quarantine tests
- retry/idempotency tests
- no Training authority contamination
- existing HealthKit validation-only tests
- V3 golden/regression tests
- relevant Server full-suite comparison against pristine production base
- ESLint/diff/build/migration/access gates
- Native tests only if Native code changes

Independent review

Fresh-context review exact final candidate(s), challenging:
- canonical identity/idempotency
- revision semantics
- Activity source precedence
- Nutrition daily-total authority
- timezone
- strategic quarantine
- no Workout Logger contamination
- rollback/deactivation
- production activation scope
- HealthKit privacy/permissions
- no historical backfill
- 3 AM interaction

Deployment

If Server code changes are required and gates/review clear, deploy through established production process with zero-write pre/post deployment audit before activation.

Code deployment itself must not activate canonical HealthKit writes unless the activation policy is explicitly enabled.

If Native code changes are required, stop after a reviewed/archive-ready candidate unless a new TestFlight build is actually needed to perform the test; then report that requirement before broadening scope.

Controlled production activation

After code authority is verified and the exact test date/domains are known, activate only:
owner Founder
domains Activity + Nutrition
exact test-day scope
canonicalization ON
strategic evidence eligibility OFF
historical backfill OFF

If the policy system supports shadow/dry-run first, run it and compare predicted canonical mutations before apply.

Record activation audit marker without exposing sensitive health values in GitHub handoff.

Observation period

Do not require the Claude session to remain alive all day.

After activation, publish an interim handoff stating:
- activation successful
- exact test date
- what the Founder should do normally (wear Watch, log nutrition through normal source)
- whether any manual sync action is required in Build 48
- what not to upload manually if avoiding duplicate/conflict is part of the test
- when to run the read-only acceptance audit

If a future audit is needed after enough data accumulates, create/recommend a separate follow-up task rather than background-waiting.

Do not schedule automations outside the PhysiqueOS task system.

Founder behavior

The goal is a normal day, not synthetic data.

Do not ask the Founder to change workouts/nutrition merely for testing.

If current architecture requires a manual Build 48 canary/sync button, give exact minimal steps only after proving it is still required.

GitHub protocol

Claim/complete through established inbox protocol.
Any terminal blocker requiring Founder action is a mandatory handoff publication point.

Completion/interim report:
- current-state HealthKit map
- whether prior canary is already sufficient
- test date
- Server/Native changes
- activation policy
- canonicalization domains
- strategic quarantine proof
- tests/review/deploy
- exact Founder action for the test day
- exact later audit plan
- blockers

Explicit flags:
PRIOR_HEALTHKIT_CANARY_SUFFICIENT
ACTIVITY_CANONICALIZATION_READY
NUTRITION_CANONICALIZATION_READY
ACTIVITY_TESTDAY_ACTIVATED
NUTRITION_TESTDAY_ACTIVATED
HISTORICAL_BACKFILL_DISABLED
HEALTHKIT_ACTIVITY_V3_ELIGIBLE
HEALTHKIT_NUTRITION_V3_ELIGIBLE
CONFIDENCE_IMPACT_ENABLED
WORKOUT_LOGGER_AUTHORITY_UNCHANGED
NUTRITION_DAILY_TOTAL_AUTHORITY_PRESERVED
THREE_AM_LATE_SYNC_COMPATIBLE
SERVER_DEPLOYED_IF_REQUIRED
NATIVE_BUILD_REQUIRED
PRODUCTION_ACTIVATION_MUTATION_APPLIED
READY_FOR_CONTROLLED_TEST_DAY
FOLLOWUP_AUDIT_REQUIRED
