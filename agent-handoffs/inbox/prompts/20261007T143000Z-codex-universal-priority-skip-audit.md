PhysiqueOS Build 91 — audit universal Priority Skip capability

Start a dedicated Codex audit conversation/work environment for this cross-cutting Priority behavior.

Do NOT create/delegate to sub-chats, child tasks, additional Codex sessions, or unnecessary worktrees.

TASK TYPE

AUDIT / ARCHITECTURE ONLY.

Do not implement yet.
Do not mutate production.
Do not deploy Server.
Do not modify the isolated Claude Build 91 candidates.

CURRENT AUTHORITIES

Shipped Native:
Build 90
32baf1d5f43120cd07088df1210e1dc84ed26a78

Current production Server:
e7ffc6716706ae4d2140008a1655bfed95a93889

Build 91 Claude B OP + Watch candidate, isolated:
b944ad1e5503ffa6d924e733abb2f3ba68e90ce2

Build 91 Evidence candidate, isolated:
a399387b0aa37a2d0e70d0acfac11334796a7d62

FOUNDER OBSERVATION

Founder could not Skip the current Fadogia supplement priority.

Founder product direction:

There is no current priority type the Founder can presently identify that should lack Skip.

Treat Skip as a DEFAULT APP CAPABILITY for current actionable priorities, not a feature each individual domain must remember to implement.

Desired principle:

Any current actionable priority supports Skip by default unless an explicit, narrowly justified domain rule says skipping is invalid.

Skip must be a canonical execution disposition, not a UI-only dismissal and not a fake completion.

GOAL

Audit the entire current Priority system and determine the smallest clean architecture for universal Skip.

Answer:

1. What production priority types exist?
2. Which are actionable/current versus informational/non-actionable?
3. Which currently expose Skip?
4. Which do not?
5. Why did Fadogia not expose Skip?
6. Are differences caused by:
   - priority model capability;
   - execution item type;
   - Home inline action mapping;
   - Priority Detail;
   - Morning Check-In;
   - peptide/supplement domain handling;
   - workout/logger integration;
   - Server command routing;
   - Native command availability;
   - legacy per-domain UI;
   - another source?
7. Is there already one canonical skip command/state that can become the default?
8. What explicit exceptions, if any, are actually necessary?

AUDIT ALL PRIORITY SOURCES / TYPES

Trace all priority-generation paths and canonical types currently reachable in production, including where applicable:

- Training/workout;
- cardio/activity;
- nutrition;
- supplement;
- peptide;
- recovery;
- sleep;
- tracking/routine;
- evidence/upload;
- DEXA/scheduled evidence;
- check-in;
- briefing/review;
- goal/strategy;
- any generic/manual/execution-item priority;
- any other type discovered in source.

Do not assume this list is complete.

Enumerate actual source truth.

SURFACE MATRIX

For every actionable priority type, audit behavior on all applicable surfaces:

- Home inline priority;
- Priority Detail;
- Morning Check-In;
- Log / Logger-linked priority;
- Operating Plan execution surfaces where the same execution item appears;
- notification/deep-link action if applicable;
- Watch if priorities can be acted on there;
- any other current action surface.

Report:
- Complete;
- Skip;
- Snooze/defer if present;
- domain-specific action;
- disabled/hidden conditions;
- command invoked;
- resulting canonical state.

FADOGIA ROOT CAUSE

Trace the exact current Fadogia priority end-to-end:

canonical protocol/execution item
-> priority generation
-> Native projection
-> Home/Detail rendering
-> available commands
-> completion/skip state.

Determine exactly why Founder could not Skip it.

Do not infer from screenshots alone.

CANONICAL SKIP SEMANTICS

Audit the existing canonical data/command model for:
- skipped state/disposition;
- skippedAt / execution date;
- reason if any;
- completion versus skip distinction;
- recurrence scheduling after skip;
- next occurrence generation;
- evidence/history;
- briefing/intelligence interpretation;
- goal/confidence interpretation;
- peptide/supplement adherence;
- Morning Check-In behavior;
- notifications.

Determine whether Skip today is:
A. one canonical generic command;
B. several domain-specific commands;
C. a mixture.

Identify the desired single authority.

DEFAULT CAPABILITY MODEL

Design the smallest clean capability rule.

Preferred direction unless source proves unsafe:

- current actionable priority => canSkip = true by default;
- informational/non-actionable item => no action surface;
- explicit canSkip=false only for a narrowly justified semantic exception;
- capability should be Server/canonical-model owned where the Server owns priority semantics;
- Native should present the capability, not infer it from priority names/types;
- every surface consumes the same capability;
- domain-specific completion behavior remains domain-specific where necessary, but Skip disposition should route through one canonical execution authority.

Audit whether an additive field such as:
capabilities.skip = true/false
or
canSkip
fits existing contracts.

Do not commit to exact naming if a better existing capability model exists.

EXCEPTIONS

Do not invent exceptions merely because legacy UI omitted Skip.

For each proposed exception require:
- concrete domain reason;
- why skipped is semantically invalid;
- what the user should do instead.

If no current actionable priority requires an exception, say so explicitly.

RECURRENCE / SCHEDULING

This is important.

Verify Skip behavior for recurring items:
- skipping today does not pause/disable the protocol;
- next scheduled occurrence remains valid;
- skip applies only to the intended occurrence/date;
- duplicate skips are idempotent;
- late/stale skip is handled safely;
- skip after completion cannot corrupt state;
- completion after skip has explicit precedence/fail-closed behavior.

For every-other-day supplement such as Fadogia, verify the next recurrence semantics.

PEPTIDES / SUPPLEMENTS

Audit separately because historical implementation may differ.

Confirm whether:
- peptide Skip already exists canonically;
- supplement Skip uses the same authority;
- Home inline completion versus Priority Detail dose-aware completion inconsistency still matters;
- pause/resume is distinct from Skip;
- Skip does not alter protocol schedule.

Do not merge Pause and Skip semantics.

TRAINING / LOGGER

Determine how Skip should behave if the priority is a planned workout or Logger-linked action.

Skipping a priority must not fabricate a completed workout.

Audit whether it:
- marks only the execution occurrence skipped;
- affects Suggested Today;
- affects training evidence;
- affects progression eligibility;
- affects weekly plan interpretation.

No implementation yet.

INTELLIGENCE / BRIEFINGS

Trace how skipped priorities are currently interpreted by:
- Daily/Midweek/Weekly/Monthly briefings;
- Confidence;
- coaching;
- adherence/completion metrics.

Skip should remain truthful:
not completed,
not failed evidence unless strategy explicitly interprets it,
not silently erased.

Identify any places where universal Skip would require downstream distinction.

PRODUCTION DATA

Prefer source/schema audit first.

If source audit requires confirmation of the Founder's current Fadogia execution item shape or available projected commands, Founder authorizes ONE narrowly bounded READ-ONLY production inspection using the established safe production path.

Limit any production read to:
- current Fadogia priority/execution projection;
- its protocol/execution capability fields;
- no unrelated health/training/nutrition history.

No production write.

TEST MATRIX

Design a regression matrix covering:

- every actionable priority type;
- Home;
- Priority Detail;
- Morning Check-In where applicable;
- Log/Logger where applicable;
- generic Skip capability;
- explicit exception if any;
- Fadogia;
- peptide;
- supplement;
- workout;
- recurring every-other-day item;
- one-time item;
- completed item;
- already skipped item;
- stale occurrence;
- duplicate Skip;
- offline/retry;
- next recurrence;
- briefing/adherence projection;
- accessibility/tap target.

BUILD 91 INTEGRATION PLAN

Recommend where this should land.

Founder intends this for the next build after current workout feedback.

Determine:
- Server changes;
- Native changes;
- whether it should be added to Claude B's Build 91 OP + Watch candidate after audit;
- expected conflicts;
- migration/backfill needs;
- whether Server can safely deploy independently before Native;
- backward compatibility.

Do not implement or merge.

OUTPUT

Publish a main-visible report-only handoff containing:

- exact priority type inventory;
- surface/capability matrix;
- Fadogia root cause;
- canonical Skip authority;
- current inconsistencies;
- explicit exceptions, if any;
- recommended default capability architecture;
- recurrence semantics;
- peptide/supplement findings;
- Training/Logger findings;
- intelligence/briefing impact;
- Server/Native contract implications;
- regression test matrix;
- exact Build 91 implementation plan;
- recommendation IMPLEMENT UNIVERSAL SKIP or HOLD;
- confirmation no implementation/deployment/production mutation.

Status:
Universal Priority Skip audit complete — Build 91 implementation decision ready.

Notify:
PhysiqueOS Priority Skip audit — universal capability recommendation ready.

STOP.

END TASK.