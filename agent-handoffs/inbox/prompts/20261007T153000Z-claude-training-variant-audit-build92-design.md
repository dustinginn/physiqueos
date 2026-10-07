PhysiqueOS Training Logger — execution variant authority audit + Build 92 Create Variant design requirements

Start ONE new Claude Remote Control conversation dedicated to Training execution variants.

Use the normal persistent PhysiqueOS Remote Control host/worktree workflow. Let Remote Control create the isolated worktree in the established way.

Do NOT reuse the Build 91 Evidence or OP/Watch conversations.
Do NOT create child sessions, sub-chats, additional agents, or manually create another worktree.

TASK TYPE

AUDIT ONLY for current behavior.
ARCHITECTURE / PRODUCT REQUIREMENTS for Build 92 Create Variant.

Do NOT implement production changes.
Do NOT change Build 91 candidates.
Do NOT deploy Server.
Do NOT mutate production.
Do NOT bump/upload Native.

CURRENT AUTHORITIES

Shipped Native:
Build 90
32baf1d5f43120cd07088df1210e1dc84ed26a78

Current production Server:
e7ffc6716706ae4d2140008a1655bfed95a93889

Adaptive Progression V1 remains part of current Server lineage.

FOUNDER OBSERVATION

During a physical Build 90 workout, the Logger exercise overflow menu currently shows:

Execution variant
Ordinary

with no alternate choices.

Founder remembers previously having at least two execution variants available, including:
Static Hold.

Founder wants:

1. NOW:
audit whether those prior variants still exist on the Server/canonical data and determine why they are no longer offered in the Logger.

2. BUILD 92:
introduce the ability to create a new execution variant on the fly from the Logger.

The Build 92 feature should create a canonical reusable variant, not merely a local label for one set/session.

CURRENT AUDIT GOAL

Trace the entire execution-variant authority chain:

canonical exercise identity
-> variant definition/registry
-> relationship/context if applicable
-> historical Training evidence
-> Logger draft/session projection
-> available variant choices
-> overflow menu rendering
-> finalization
-> Exercise Performance Records
-> progression partitioning.

Determine whether Static Hold and any other historical Founder variants:

A. still exist canonically and are being filtered/not projected;
B. exist only in historical Training evidence;
C. exist in a legacy registry/config no longer consumed;
D. were migrated/renamed;
E. were deleted/lost;
F. never existed as canonical reusable definitions and were inferred from historical execution;
G. another source-truth outcome.

Do not assume the Founder's recollection is wrong.

SOURCE AUDIT

Trace all source/schema/code related to:

- executionVariant;
- execution variant;
- variant;
- ordinary;
- static hold;
- isometric;
- exercise variant registry;
- exercise relationship;
- execution relationship;
- superset/standalone;
- Exercise Performance Records partition;
- Logger variant selector;
- Logger draft mutation;
- Training finalization;
- progression exact-context partition;
- canonical exercise registry.

Identify:
- canonical field names;
- allowed values;
- enum/open-string semantics;
- persistence collection/table;
- whether variants are global, per exercise, per user, or evidence-derived;
- whether variants have stable IDs or only names/slugs;
- whether ordinary is a sentinel/default;
- how display labels are derived;
- how retired/deleted variants behave;
- whether variant identity participates in progression context.

BUILD 90 NATIVE

Trace the exact Build 90 menu shown in the Founder screenshot.

Determine:
- where the list of available variants comes from;
- whether Native receives only current variant or a full choice list;
- whether choices are hard-coded;
- whether choices are derived from exercise history;
- whether a filter suppresses Static Hold;
- whether only variants compatible with current exercise are shown;
- whether variant switching is a local draft mutation or Server command.

Explain exactly why the menu currently contains only Ordinary.

PRODUCTION READ

If source audit identifies canonical/historical stores that can answer whether Founder Static Hold still exists, Founder explicitly authorizes ONE bounded READ-ONLY production inspection.

Use the established safe production path.

Limit the read to:
- Training exercise/variant definitions relevant to the current Founder program;
- historical variant identities necessary to locate Static Hold and other previously used variants;
- no unrelated health/nutrition/photo/goal data.

Prefer targeted lookup for:
Static Hold
static_hold
isometric
and variant records attached to exercises where Founder used them.

Do not emit owner identifiers.
Do not emit unnecessary workout history.
Do not mutate anything.

Report:
- exact variant identifiers/labels;
- exercises linked;
- active/retired status if applicable;
- last evidence date only if useful;
- whether reusable definition still exists;
- whether Logger projection currently exposes it.

CURRENT BUG / PRODUCT CLASSIFICATION

Classify current Build 90 behavior as one of:

- REGRESSION: canonical choices exist but Logger no longer exposes them;
- DATA/PROJECTION GAP: canonical variants exist but current contract lacks choice projection;
- LEGACY MODEL LIMITATION: variants exist only as historical evidence;
- EXPECTED CURRENT MODEL: no alternate canonical variant exists;
- UNKNOWN with exact next diagnostic.

If this is a regression that should be corrected before Build 92, recommend whether it belongs in Build 91.

Do NOT implement it in this task.

BUILD 92 — CREATE VARIANT PRODUCT REQUIREMENTS

Design the smallest clean architecture for:

Create Variant

from the Logger overflow/menu.

Founder direction:
a user should be able to create an execution variant on the fly while logging a workout.

The new variant must become canonical and reusable.

Do not implement yet.

Audit/design requirements:

ENTRY POINT

From:
Execution variant menu.

When alternate variants are listed, include:
Create Variant…

Do not make the creation path dominate the common Ordinary/known-variant selection flow.

CREATE FLOW

Recommend a lightweight sheet/popover appropriate for Logger.

At minimum determine whether it needs:
- display name;
- canonical slug generated by Server;
- description/notes;
- execution semantics;
- load semantics;
- rep semantics;
- timed/static-hold semantics;
- progression partition behavior;
- exercise scope.

Avoid overbuilding V1.

STATIC HOLD

Use Static Hold as the primary example.

Determine whether a Static Hold variant needs different performance fields:
- duration instead of reps;
- duration plus load;
- reps still meaningful or not;
- how sets display;
- Watch logging implications;
- performance records;
- progression semantics.

Do NOT assume Create Variant can safely be only a text-name field if variant semantics affect logging.

VARIANT SCOPE

Recommend whether a created variant is:
- specific to one canonical exercise;
- reusable across exercises;
- user-global;
- system-global.

Prefer the narrowest semantics that avoid accidental cross-exercise contamination.

IDENTITY

Recommend stable canonical identity:
- immutable variant ID;
- user-facing name;
- normalized slug if useful;
- createdAt;
- active/retired;
- exercise linkage;
- provenance user_created/system.

Do not key progression solely on mutable display text.

DUPLICATES

Design:
- case-insensitive duplicate detection;
- normalized-name collisions;
- existing retired variant;
- system variant with same name;
- rename behavior;
- deletion/retirement behavior.

Do not let deleting a variant invalidate historical evidence.

LOGGER INTEGRATION

After successful creation:
- variant becomes selected for the current exercise draft;
- menu immediately includes it;
- future sessions for that exercise can select it;
- switching variants preserves/clears set prescription only according to explicit semantic compatibility;
- finalization writes canonical variant identity;
- offline/error behavior fails safely.

PROGRESSION

Adaptive Progression V1 partitions exact exercise/variant/relationship context.

Audit required Build 92 behavior:
- new variant starts its own progression context;
- no evidence leakage from Ordinary;
- rename does not reset progression if immutable ID stays same;
- retirement preserves historical progression evidence;
- load/rep/duration semantics determine whether progression engine can operate or must return unsupported/consider progression.

Do not broaden Adaptive Progression V1 in this audit beyond documenting the contract.

PERFORMANCE RECORDS

Determine how user-created variants affect:
- Exercise Performance Records;
- PRs;
- volume;
- reps-at-load;
- timed holds;
- history/detail presentation.

WATCH

Determine whether Build 92 Create Variant itself must exist on Watch.

Preferred initial direction:
creation on iPhone Logger only;
Watch consumes the already-selected canonical variant.

But audit whether Watch contracts need additive variant identity/semantics to log Static Hold correctly.

MIGRATION / BACKWARD COMPATIBILITY

Determine:
- schema migration needed;
- whether current string variants can migrate to stable IDs;
- how historical Ordinary/Static Hold evidence maps;
- whether a compatibility alias is required;
- Build 90 compatibility if Server gains variant definitions;
- whether existing historical variants can seed definitions without inventing semantics.

Do not perform migration.

BUILD 91 INTERACTION

Founder is currently assembling Build 91 from isolated candidates.

If current missing Static Hold is a clear regression with an existing canonical choice, recommend a narrowly scoped Build 91 restoration.

If fixing it requires the new canonical variant model, defer to Build 92 rather than rushing architecture into Build 91.

REPORTING

Publish a main-visible report-only handoff containing:

1. current canonical variant model;
2. exact Build 90 Logger choice path;
3. production Static Hold / historical variant findings if read was justified;
4. why only Ordinary appears now;
5. regression vs model limitation classification;
6. whether any Build 91 restoration is warranted;
7. Build 92 Create Variant recommended architecture;
8. minimal V1 create flow;
9. Static Hold semantic requirements;
10. progression implications;
11. Performance Record implications;
12. Watch implications;
13. migration/backward compatibility;
14. test plan;
15. exact recommended Build 92 implementation sequence;
16. Founder decisions needed.

No implementation.
No deploy.
No production mutation.
No Build 91 edits.

Status:
Training execution variant audit complete — Build 92 Create Variant architecture ready for Founder review.

Notify:
PhysiqueOS Training variants — audit and Build 92 Create Variant plan ready.

STOP.

END TASK.