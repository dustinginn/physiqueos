PhysiqueOS Training prescription authority audit

Continue in this current Codex conversation and current provided work environment.

Do NOT create/delegate to sub-chats, child tasks, additional Codex sessions, or additional worktrees.

TASK TYPE

AUDIT ONLY.

Do not implement schema changes.
Do not mutate Training Strategy.
Do not deploy Server.
Do not mutate production.
Do not touch Native Build 89/90.

AUTHORITIES

Current production Server:
b7eb1e397f0238df9ae904fd182ddbb51602e8d8

Validated eligibility candidate:
999a225a38ced9ddb16a65bbe840896472265468

Refined progression-step candidate:
a7d3ef8ac90d6ebc92cf00d34645496105f57a3a

Refinement report:
2a5027a91a423ef118182c2b09ae848f4a66de84

Proven production-read tooling:
d789ce2770eda2f9bdb13a48bbc572901f2c61e2

GOAL

Determine whether PhysiqueOS already contains trustworthy intended per-exercise prescription authority that can be promoted/reused for true double progression, rather than asking Founder to recreate rep ranges manually.

We need to know whether existing program/workout configuration already defines, directly or derivably:

- working-set count;
- rep-range minimum;
- rep-range maximum;
- current target reps;
- rep increment;
- current prescribed load;
- load-reset rep target;
- progression-specific prescription identity/version.

Do not assume absence merely because active Training Strategy lacks these fields.

PART 1 — SOURCE AUDIT

Trace all plausible prescription sources in current repository architecture:

- Operating Plan Training Strategy/protocol;
- Training protocol builder;
- workout/program/template models;
- scheduled/planned workout structures;
- Training Logger draft/read models;
- Suggested Today / suggested progression;
- exercise-performance records;
- session-generation logic;
- canonical Training evidence;
- exercise registry;
- historical/legacy training program configuration;
- fixtures only as evidence of schema intent, not production authority;
- Server and Native contracts.

For every source report:
- what prescription fields exist;
- whether they are prospective authority or observed evidence;
- persistence location;
- versioning/effective-date semantics;
- exercise identity linkage;
- whether values survive into Logger;
- whether they survive finalization;
- whether Server can safely consume them for progression.

Distinguish clearly:
PLAN/PRESCRIPTION
from
PERFORMED EVIDENCE.

PART 2 — CURRENT PROGRAM DATA AUDIT

If repository/source audit identifies one or more plausible persisted production sources, Founder explicitly authorizes a narrowly bounded READ-ONLY production inspection using proven d789ce27 tooling.

Do not perform production reads if source audit proves no plausible source exists.

Production inspection may retrieve ONLY prescription/configuration fields for the Founder's currently active Training program and exercise identities.

No broad workout-history export is needed.

Determine:
- how many currently active/planned exercise prescriptions exist;
- canonical exercise IDs;
- working sets;
- target reps or rep ranges;
- planned/prescribed loads if present;
- template/program identity;
- effective/version dates;
- whether prescription values are explicit or inferred/generated;
- coverage completeness across currently used exercises.

Do not emit owner identifiers.
Do not emit unrelated health/nutrition/photo data.
Do not mutate anything.

PART 3 — THREE KNOWN CASES

Specifically determine whether existing authoritative configuration can establish intended prescriptions for:

- cable_machine_front_raise;
- spider_curl;
- pull_up.

For each, report only:
- authoritative source;
- working-set count;
- rep target/range if present;
- load prescription if present;
- version/effective authority;
- whether sufficient for refined step engine;
- any ambiguity.

Do NOT infer prescription from performed history.

PART 4 — COVERAGE

If an existing source is found, quantify coverage for the current Training program:

- total active/current exercise prescriptions;
- complete for true double progression;
- partial;
- absent;
- ambiguous/duplicate;
- stale.

Define complete as having enough authority to distinguish below-range rep progression from top-of-range load progression without guessing.

Do not publish an unnecessary long list of the Founder's exercises in the main report. Put bounded technical details in the audit artifact if needed.

PART 5 — PROMOTION OPTIONS

Recommend the safest architecture based on findings.

Possible outcomes:

A. Existing canonical prescription source is sufficient.
Recommend direct consumption by progression engine; no duplicated strategy data.

B. Existing source is authoritative but incomplete.
Recommend minimal extension/versioning of that source.

C. Existing source is complete enough but not currently canonical.
Recommend one-time promotion into immutable Training Strategy/prescription authority, with provenance and effective date.

D. No trustworthy source exists.
Recommend a Founder/program-authoring flow to establish explicit prescriptions.

Avoid duplicating the same prescription in multiple authorities.

Prefer one canonical source with read projections.

PART 6 — MIGRATION / VERSIONING

If promotion is possible, determine:
- whether a database migration is required;
- whether existing configuration can be transformed losslessly;
- whether Founder approval is needed per exercise or only for exceptions;
- whether an immutable new Training protocol version is required;
- whether historical workouts remain evidence only;
- how future edits should version/reset prescription context;
- how rep-only edits vs load/context edits affect exposure.

Do not perform migration.

PART 7 — PRODUCT IMPLICATIONS

Explain how this authority would support:

- weighted low-rep compounds;
- bodyweight + external-load movements;
- high-rep isolation work;
- machine/cable exercises;
- different rep ranges by exercise;
- future user-created programs;
- future phase/program changes.

Do not create exercise-name heuristics.

PART 8 — OUTPUT

Publish a main-visible report-only handoff.

Report:
- all plausible sources audited;
- whether existing prescription authority exists;
- current-program coverage if production read was justified;
- Cable/Spider/Pull-Up authority findings;
- recommended A/B/C/D architecture;
- migration/versioning needs;
- Founder decisions required next;
- exact recommended implementation sequence;
- confirmation no code/schema/strategy/production mutation occurred.

Status:
Training prescription authority audit complete — next architecture decision ready.

STOP.

END TASK.