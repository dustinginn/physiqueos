PhysiqueOS Build 92 — Training Execution Variants Server Foundation V1

Continue in the SAME Claude Training execution-variant conversation and current Remote Control-provided worktree.

Do NOT create another Claude session, child task, sub-chat, additional agent, or additional worktree.

AUDIT AUTHORITY

Training variant audit / Build 92 architecture:
63bf054e6991a0afa3f4239b54e62f6f09fc222d

Audit report:
agent-handoffs/reports/20261007T151537Z-training-variant-audit-build92-design.md

CURRENT AUTHORITIES

Shipped Native:
Build 90
32baf1d5f43120cd07088df1210e1dc84ed26a78

Current production Server:
e7ffc6716706ae4d2140008a1655bfed95a93889

Build 91 work remains isolated and must not be modified.

FOUNDER DECISIONS — LOCKED

D1 Variant scope:
PER CANONICAL EXERCISE.

D2 Timed logging mode:
DEFER.
Do NOT add duration/timed-hold logging to Build 92 V1.

Reason:
manual duration would imply false precision because an actual rep can contain eccentric -> transition -> static hold -> transition -> concentric phases, and PhysiqueOS cannot currently measure the isometric phase accurately.

Build 92 V1 variants are execution-context identities, not measured tempo telemetry.

All V1 variants inherit the exercise's existing normal Logger fields/semantics:
sets / reps / load as currently applicable.

Examples:
- Static Hold
- 3-Second Pause
- Slow Eccentric
- 1½ Rep

The label describes execution intent.
PhysiqueOS does NOT treat a duration embedded in a label as measured data.

D3 Historical Static Hold:
YES, preserve/seed canonical definitions eventually for:
- Spider Curls;
- Pendulum Squat Machine.

BUT:
Do NOT mutate production or perform the seed in this task.
Prepare the seed plan/tooling separately and require explicit Founder authorization before production mutation.

D4 Legacy Super Set variant:
EXCLUDE from canonical variant choices.
It is relationship context misfiled as a variant.
Do not seed it.
Do not rewrite historical evidence in this task.
Prepare a separate cleanup recommendation only.

D5 Rename/retire:
Server capability may be designed/implemented in V1 if small and clean.
Native Build 92 initial UI should focus on CREATE + SELECT.
Do not bloat Native V1 with management UI.

D6 Retired-name collision:
REACTIVATE the existing same-exercise canonical variant rather than create a duplicate, provided identity/semantics are compatible.

D7 Build 91 stopgap:
NO.
Do not restore the old hard-coded variant list in Build 91.

D8 Progression:
Preserve exact variant partitioning.
A new variant begins with its own evidence context.
Adaptive Progression must fail closed / provide no deterministic target until sufficient compatible evidence exists.
Do not broaden Adaptive Progression V1 heuristics in this task.

D9 Timed-hold Performance Records:
DEFER with timed logging.

D10 Web Logger:
YES.
Move Web Logger to the same canonical Server-projected per-exercise choices rather than its hard-coded variant constants.

TASK TYPE

IMPLEMENT SERVER FOUNDATION + WEB CONTRACT CONSUMPTION.

Do NOT implement the Native Create Variant UI yet unless a tiny model/decoder addition is required to prove backward compatibility.

Do NOT deploy.
Do NOT mutate production.
Do NOT seed historical definitions.
Do NOT modify Build 91 candidates.
Do NOT bump/upload Native.

GOAL

Create the canonical Build 92 Training Execution Variant V1 authority so Logger choices are real Server-owned per-exercise definitions rather than hard-coded UI constants or occurrence-history guesses.

The foundation must support:

- stable immutable variant identity;
- per-exercise scope;
- user-created canonical variants;
- create;
- select/projection;
- optional rename/retire/reactivate if small;
- backward compatibility with legacy occurrence string keys;
- progression/performance partitioning by stable identity with legacy alias support;
- Web Logger consuming the canonical projection;
- later Native Build 92 Create Variant UI.

CANONICAL MODEL

Add a canonical variant-definition collection in the existing canonical training record persistence model, following repository conventions.

Preferred conceptual fields:

id
canonicalExerciseId
name / displayName
canonicalKey or normalizedKey
legacyKeys[]
status active|retired
provenance system|user_created|legacy_seed
createdAt
updatedAt / version as repository conventions require

Do NOT add:
- duration;
- loggingMode;
- tempo;
- static-hold seconds;
- rep-phase timing;
- arbitrary per-variant set schema.

All V1 variants inherit normal exercise logging semantics.

Ordinary remains the default/sentinel context.

Decide whether Ordinary should be materialized as a definition or remain the sentinel.
Prefer keeping it sentinel unless materializing it materially simplifies identity without breaking legacy contracts.

IDENTITY

New canonical definitions require immutable stable IDs.

Do not use mutable display text as long-term progression identity.

Preserve compatibility with existing occurrence data that stores:
executionVariant.key / label / rawLabel.

Design one resolver that maps an occurrence to:
- canonical variant ID when a definition/legacy alias exists;
- legacy key identity when no definition exists;
- Ordinary sentinel when absent.

Do not rewrite historical evidence.

CREATE COMMAND

Add a Server-owned command using the established canonical Training Catalog command patterns.

Conceptually:
training-variant.create.v1
or repository-consistent naming.

Input should be minimal:
- canonicalExerciseId;
- displayName;
- idempotency/version metadata required by existing command architecture.

Server owns:
- normalization;
- slug/key;
- duplicate detection;
- identity;
- persistence;
- provenance.

Do not let clients provide arbitrary IDs or persistence keys.

DUPLICATES

Per exercise:
- case-insensitive/normalized duplicate active name -> return existing/conflict recovery cleanly;
- same normalized name on retired variant -> reactivate rather than duplicate;
- legacy alias collision -> resolve to existing definition;
- same name on another exercise is allowed because scope is per exercise.

Do not globally merge variants across exercises.

RENAME / RETIRE

If implementation is small and fits existing command patterns, add Server commands now:
- rename;
- retire/reactivate.

Rules:
- rename changes display name/current normalized key but stable ID remains;
- preserve prior normalized key in legacyKeys so historical evidence resolves;
- retirement removes it from future choice projection but never invalidates historical evidence;
- selected/current historical rows remain readable.

If this materially expands scope, implement model/create/select first and report rename/retire as immediate Server follow-up.
Do not compromise create/select quality.

LOGGER READ PROJECTION

Extend the canonical Server training-logger read additively.

Expose choices PER EXERCISE, not one global array.

Each choice should contain enough for clients to:
- stable id;
- display label;
- canonical/current key;
- active status if needed;
- selection payload compatible with current finalize contract.

Do not expose retired choices as normal selectable options.

Build 90 must remain safe if it ignores the additive projection.

WEB LOGGER

Remove hard-coded:
Static Hold
3-Second Pause
Slow Eccentric
as the choice authority.

Consume the Server per-exercise canonical projection.

Ordinary remains available.

If an exercise has no definitions:
Ordinary only.

Do not infer global choices from history.

Do not add Create Variant Web UI unless trivial; the key requirement is eliminating the hard-coded list and consuming canonical choices.

FINALIZATION

Native/Web finalize currently sends legacy executionVariant key/label/rawLabel.

Build 92 foundation should accept:
- new stable variant ID where provided;
- legacy occurrence shape for backward compatibility.

Server must resolve/validate that:
- variant belongs to canonical exercise;
- active selection is legitimate;
- stable ID maps to canonical definition.

Persist enough compatibility information that:
- existing readers still work;
- future readers can use stable identity.

Do not break Build 90 finalize.

PROGRESSION

Update exact-context identity resolution so canonical stable variant ID is preferred.

Legacy historical evidence must resolve through:
definition legacyKeys
when possible.

New user-created variant has no borrowed Ordinary evidence.

No deterministic recommendation until its own compatible evidence satisfies current Adaptive Progression eligibility/selector requirements.

Do not change eligibility thresholds or adaptive selector policy.

PERFORMANCE RECORDS

Use stable variant identity for new records/context where compatible.

Legacy records remain resolvable via alias/key.

Do not merge Static Hold records into Ordinary.

Do not add timed-hold record types.

HISTORY

Update listPreviouslyUsedExecutionVariants or replace it with the canonical definition authority where appropriate.

Do not automatically turn every historical freeform variant into a selectable definition.

This is critical because legacy Super Set is misclassified.

Only explicit definitions are selectable.

HISTORICAL STATIC HOLD SEED PLAN

Prepare, but DO NOT execute, an idempotent bounded seed operation for:

Spider Curls:
canonicalExerciseId spider_curl
display Static Hold
legacyKeys includes static_hold
provenance legacy_seed

Pendulum Squat Machine:
canonicalExerciseId pendulum_squat_machine
display Static Hold
legacyKeys includes static_hold
provenance legacy_seed

The operation must:
- create only if missing;
- reactivate compatible retired definition if present;
- never duplicate;
- never rewrite evidence;
- never touch Super Set;
- be separately Founder-authorized before production execution.

Provide exact seed candidate/tooling and dry-run tests if appropriate.

SUPER SET

Add a regression ensuring historical variant key super_set does NOT become a selectable definition merely because it exists in evidence.

Do not mutate those historical sessions.

Prepare separate cleanup recommendation for later.

NATIVE CONTRACT PREPARATION

Do only the minimum Native model/decoder work needed for additive contract compatibility if useful.

Do NOT build the Create Variant sheet/menu UI in this task.

The next Native task will implement:
Execution variant
- Ordinary
- canonical per-exercise choices
- Create Variant…

and select the newly created variant immediately.

WATCH

No Watch creation UI.

Audit/add contract identity only if needed so a phone-selected variant remains truthfully represented.

Do not add timing fields.

TESTS

Server:
- per-exercise variant definitions;
- stable IDs;
- Ordinary sentinel;
- create;
- duplicate normalized name;
- same name different exercise;
- retired-name reactivation;
- rename alias if implemented;
- retirement if implemented;
- additive Logger projection;
- no global list;
- no history inference;
- Super Set excluded;
- legacy Static Hold key resolves;
- stable ID finalize;
- legacy key finalize;
- wrong-exercise ID rejected;
- Build 90 legacy finalize remains valid;
- progression partition by stable identity;
- no Ordinary evidence leakage;
- records partition;
- history resolution;
- seed dry run/idempotency;
- no evidence rewrite.

Web:
- no hard-coded variant choices;
- per-exercise Server choices;
- Ordinary-only when none;
- selection/finalize;
- backward compatibility.

Run:
- focused Training Logger;
- canonical persistence;
- Training evidence;
- progression;
- performance records;
- web Logger;
- Core navigation;
- full relevant Server gate;
- git diff --check.

If Native decoder/model changes:
- focused Native Training tests;
- full PhysiqueOSTests as warranted;
- generic Release compile;
- seam scan.

NO PRODUCTION READ

The audit already established production truth.

Do not read production again without a new blocker and separate authorization.

NO DEPLOY / NO BUILD 91

Do NOT:
- deploy Server;
- seed production;
- mutate production;
- touch Build 91 Claude/Codex candidates;
- integrate Build 91;
- bump Native;
- archive;
- upload TestFlight;
- update release authority.

OUTPUT

Push one isolated Build 92 Training Variant Server Foundation candidate.

Publish main-visible report-only handoff with:
- exact candidate SHA;
- canonical model;
- commands;
- per-exercise projection;
- backward compatibility;
- Web migration;
- progression/record partition behavior;
- rename/retire disposition;
- historical Static Hold seed plan/tool identity;
- Super Set cleanup disposition;
- files changed;
- tests;
- migration/DDL needs;
- production deployment sequencing recommendation;
- exact next Native Build 92 task;
- Founder authorization needed before seed/deploy.

Status if green:
Build 92 Training Variant Server Foundation ready for Founder review.

Notify:
PhysiqueOS Build 92 Training Variants — Server foundation candidate ready.

STOP.

END TASK.