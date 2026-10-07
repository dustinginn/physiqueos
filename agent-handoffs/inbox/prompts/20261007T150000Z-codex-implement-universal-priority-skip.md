PhysiqueOS Build 91 — implement Universal Priority Skip

Continue in the SAME dedicated Codex Priority Skip conversation and current provided work environment.

Do NOT create/delegate to sub-chats, child tasks, additional Codex sessions, or unnecessary worktrees.

AUDIT AUTHORITY

Universal Priority Skip audit:
1579963b8d95a491e45919cc0959a2222ef9114f

Founder decision:
IMPLEMENT UNIVERSAL SKIP.

CURRENT AUTHORITIES

Shipped Native Build 90:
32baf1d5f43120cd07088df1210e1dc84ed26a78

Current production Server:
e7ffc6716706ae4d2140008a1655bfed95a93889

Claude Build 91 OP + Watch candidate, isolated:
b944ad1e5503ffa6d924e733abb2f3ba68e90ce2

Claude Build 91 Evidence candidate, isolated:
a399387b0aa37a2d0e70d0acfac11334796a7d62

GOAL

Implement the Founder-approved universal Priority Skip capability as one isolated Build 91 Server + Native/Web compatibility candidate.

Do NOT deploy.
Do NOT integrate with Claude candidates yet.
Do NOT bump Build 91.
Do NOT upload TestFlight.
Do NOT mutate production.

PRODUCT RULE

Every current OPEN ACTIONABLE PRIORITY OCCURRENCE is skippable by default.

Skip is unavailable only when:
- the item is informational/non-actionable;
- no occurrence exists for that date;
- the occurrence is already terminal;
- the source is paused/inactive/not scheduled;
- another concrete canonical semantic makes skip invalid.

There are currently NO domain-family exceptions among real actionable priority occurrences.

Do not create a per-domain allowlist.

Do not infer Skip capability in Native from priority type/name.

SERVER owns capability and command.

CANONICAL AUTHORITY

Keep:
priority.skip.v1

Keep the existing dated PriorityOccurrenceReconciliation state as the canonical skip disposition.

Do not create:
- supplement.skip;
- peptide.skip;
- evidence.skip;
- dexa.skip;
- workout.skip;
- other domain-specific skip commands.

GENERALIZE THE COMMAND

Refactor the current Reminder-centric support rule into a Server-owned occurrence disposition resolver.

Client submits only projected priority identity/date/version/command authority as established by contract.

Server resolves the canonical disposition target.

Support at least:

1. Reminder-backed occurrences
- ordinary reminder;
- peptide;
- recovery;
- supplement;
- reminder-backed evidence.

Continue to lock/version the Reminder where that is the canonical occurrence authority.

2. Execution-backed actionable occurrences without Reminder
- DEXA execution/stage where current production projects a real actionable priority.

Lock/version the canonical execution item and re-check evidence/terminal state in the same transaction.

Do not let clients choose table/collection/target type.

RECONCILIATION IDENTITY

Generalize reconciliation entries to carry canonical priorityId.

Preserve reminderId as a backward-compatible alias for existing records/contracts while readers migrate to:
priorityId ?? reminderId

No historical backfill.

Do not break previous-day reconciliation.

CAPABILITY PROJECTION

Use command presence/canonical capability as the authority.

Preferred:
- skipCommand present => can skip;
- skipCommand absent => cannot skip.

If the current contract already has a clean capability structure, use it rather than duplicating booleans.

Do not add a separate Native-maintained canSkip matrix.

Project Skip for every current open actionable occurrence, including:
- ordinary reminders;
- peptide;
- recovery;
- supplement/Fadogia;
- Morning Weight;
- Progress Photos;
- DEXA.

Grouped/daypart wrappers are presentation containers, not canonical occurrences.

Expose child occurrence capability rather than inventing aggregate group Skip unless current UX has an explicit child-action model.

INFORMATIONAL ITEMS

Do NOT add Skip to:
- Protein Goal fallback;
- Close Activity Ring fallback;
- Sleep 8+ Hours fallback;
- dose-change informational notice;
- Briefings;
- Goals/strategies themselves;
- non-occurrence evidence recovery prompts;
- other informational items discovered by audit.

FADOGIA — REQUIRED

Remove the old semantic exclusion that deferred supplement Skip.

Fadogia must project the same canonical skip capability as other actionable Support occurrences.

Skipping Fadogia:
- records only that dated occurrence skipped;
- does not write dose;
- does not mark complete;
- does not pause protocol;
- does not change cadence;
- does not move next scheduled date.

For the audited every-two-day anchored schedule, regression must prove a skipped on-cycle occurrence leaves the next anchored occurrence unchanged.

HOME

Native Home currently exposes inline Complete but not Skip.

Add a consistent Skip affordance for current actionable priorities.

Do not overcrowd the tile.

Use the existing Build 90/91 visual language and accessibility-sized targets.

Prefer a compact secondary action/menu if that best preserves hierarchy, but do not hide Skip behind domain-specific conditions.

The capability must come from Server projection.

Home inline Skip must:
- invoke the exact projected priority.skip.v1 command;
- preserve idempotency/version semantics;
- refresh the affected Home occurrence;
- remove/resolve it as skipped;
- provide truthful feedback.

Do not route Home Skip through completion.

PRIORITY DETAIL

Generalize Mark Skipped placement so every actionable detail template can render it when skipCommand is present.

This includes evidence-backed templates.

For Morning Weight / Progress Photos / DEXA:
- primary domain action remains Add/Log/Upload/Manage as appropriate;
- Mark Skipped is a secondary occurrence disposition;
- Skip does not create evidence.

Preserve existing completion templates and dose-aware completion behavior.

NOTIFICATIONS

Use existing generic projected skip command.

Extend specialized evidence notifications so an actual scheduled priority occurrence may offer Skip where platform/action-count UX allows.

Do not infer by domain name.

Keep Snooze local-only and semantically distinct.

If iOS notification action limits require prioritization, document the chosen action ordering and preserve the domain primary action.

WEB

Bring Web Home and Priority Detail into capability parity where those surfaces currently act on priorities.

Use Server-projected command.

No web-specific domain allowlist.

MORNING CHECK-IN / PRIOR DAY

Keep previous-day.reconcile.v1 for prior-day disposition.

Do NOT weaken priority.skip.v1 today-only semantics.

Change the prior-day presentation logic:

A scheduled priority occurrence with missing evidence:
- Add/Resume Evidence;
- Mark Skipped.

An evidence recovery prompt with NO scheduled priority occurrence:
- recovery action only;
- no Skip.

Paused/inactive/not-scheduled:
- no occurrence;
- no Skip.

Use the same canonical dated reconciliation state.

RECURRENCE

Preserve:
- Skip applies to one occurrence/date only;
- recurrence anchor/cadence unchanged;
- next occurrence remains scheduled;
- future occurrence cannot be pre-skipped;
- late skip routes to Morning Check-In;
- duplicate Skip idempotent;
- completion first => skip reports already_completed;
- skip first => completion reports already_skipped;
- stale expected version fails/refreshes safely.

PEPTIDES / SUPPLEMENTS / RECOVERY

Preserve completion-specific domain behavior.

Skip remains generic identity/date/version disposition.

Pause/resume remains protocol lifecycle and is NOT Skip.

A paused date has no occurrence and therefore no Skip.

Do not alter peptide dose recording.

TRAINING / LOGGER

Do not turn Suggested Today into a Priority.

Do not change Training Logger progression.

If generic execution resolver could technically resolve Training execution items, do not project Skip unless Daily Focus actually projects a real priority occurrence.

No fake workout evidence.

No progression success from Skip.

DEXA

Support the actual current DEXA priority occurrence when actionable.

Skip:
- marks that occurrence skipped;
- does not cancel/delete the DEXA schedule;
- does not create DEXA evidence;
- does not mutate Coaching Updates;
- next schedule/config remains intact.

Coordinate contract compatibility with Claude B's isolated Next DEXA Scan work, but do not merge that branch.

INTELLIGENCE / BRIEFINGS

Do NOT suddenly reinterpret skipped priorities as negative adherence evidence.

Preserve current downstream semantics unless a consumer already understands reconciliation.

Expose truthful skip disposition where existing read contracts need it.

Document that future coaching/adherence intelligence can consume skip distinctly from completion/missing, but do not broaden this implementation into a new adherence model.

SERVER/NATIVE BACKWARD COMPATIBILITY

Server deployment must remain compatible with Build 90:
- additive command/capability projection;
- existing fields unchanged;
- existing clients ignoring new capabilities remain safe.

Native Build 91 may consume the expanded projection.

If Build 90 receives newly present skipCommand on templates it does not render, it must remain safe.

No migration/backfill expected.

CONFLICT MANAGEMENT

Claude B candidate touches Priority Detail only for the crumb title and OP routing per its report.

Audit exact overlap before implementation.

Keep Universal Skip commits separable.

Do not merge Claude B.

Claude A Evidence should have no meaningful overlap.

If overlap exists, report exact files/hunks for later integration.

TESTS — SERVER

Add comprehensive tests for:
- ordinary reminder;
- peptide;
- recovery;
- supplement/Fadogia;
- Morning Weight;
- Progress Photos;
- DEXA execution-backed priority;
- informational fallback no Skip;
- paused/inactive/not-scheduled no Skip;
- current open occurrence defaults to Skip;
- no per-domain allowlist;
- reminder target resolution;
- execution target resolution;
- priorityId + reminderId compatibility;
- idempotent replay;
- stale version;
- already completed;
- already skipped;
- future;
- previous-day rejection;
- recurrence unchanged;
- every-two-day Fadogia next date unchanged;
- no evidence/dose write;
- no protocol schedule mutation;
- DEXA schedule unchanged;
- grouped child behavior;
- notification projection;
- Web projection;
- Morning Check-In scheduled-evidence vs recovery-only distinction.

TESTS — NATIVE

Add/adjust:
- Home actionable priority Skip;
- Home informational item no Skip;
- Priority Detail manual;
- peptide;
- supplement;
- recovery;
- Morning Weight;
- Progress Photos;
- DEXA;
- confirmation/feedback;
- stale/uncertain retry behavior;
- accessibility tap targets;
- notification action;
- prior-day Morning Check-In;
- no completion/evidence fabrication.

Run:
- focused priority suites;
- Daily Focus;
- Priority Detail;
- Home;
- Morning Check-In;
- notifications;
- peptide/supplement/recovery;
- evidence priorities;
- DEXA;
- web priority tests;
- full relevant Server gate;
- full PhysiqueOSTests if Native changes;
- relevant iPhone UI;
- generic Release compile;
- verify_release_configuration.py;
- Release seam scan;
- git diff --check;
- generator determinism if project inputs change.

PRODUCTION DATA

No production read should be necessary; the audit already performed the one authorized Fadogia confirmation.

Do not read production again unless a new blocker requires separate authorization.

NO DEPLOY / NO BUILD 91 INTEGRATION

Do NOT:
- deploy Server;
- mutate production;
- merge Claude A/B;
- create final Build 91 integration;
- bump;
- archive;
- upload TestFlight;
- update latest release authority.

OUTPUT

Push one isolated Universal Priority Skip candidate based on current production/Build 90 authorities as appropriate for Server + Native compatibility.

Publish main-visible report-only handoff with:
- exact Server/Native candidate identities;
- architecture;
- removed Fadogia exclusion;
- capability projection;
- surface changes;
- recurrence semantics;
- evidence-backed behavior;
- Morning Check-In behavior;
- files changed;
- tests/gates;
- backward compatibility;
- migration/backfill;
- overlap with Claude A/B;
- recommended deployment/integration sequence;
- explicit status READY FOR BUILD 91 INTEGRATION or HOLD.

Do not deploy.

Status if green:
Universal Priority Skip implemented — isolated candidate ready for Build 91 integration.

Notify:
PhysiqueOS Universal Priority Skip — implementation candidate ready.

STOP.

END TASK.