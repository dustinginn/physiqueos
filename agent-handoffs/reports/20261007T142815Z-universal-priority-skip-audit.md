# PhysiqueOS Build 91 — Universal Priority Skip audit

## Decision

**Recommendation: IMPLEMENT UNIVERSAL SKIP.**

Every current, open, actionable priority occurrence should expose the same Server-owned Skip capability by default. No current actionable priority family has a domain reason that makes an occurrence-level `skipped` disposition invalid. The present exclusions are implementation history, not product semantics.

The smallest clean implementation is to keep `priority.skip.v1` as the one current-day write authority, keep the existing dated reconciliation record as the canonical state, and make command presence—not a per-domain allowlist or a Native type check—the shared capability consumed by Home, Priority Detail, notifications, web, and prior-day Morning Check-In presentation. Extend the command's Server-side occurrence resolver to execution-backed priorities that do not have a Reminder, rather than creating domain-specific skip commands.

This was an audit only. No product implementation, merge, deployment, production mutation, Native release-authority change, or edit to either isolated Claude Build 91 candidate was performed.

## Audited authorities

| Authority | Commit | Use in this audit |
|---|---|---|
| Staged audit specification | `164d0919be4d14f2fe50136125bcb65abc242015` | Read in full and followed |
| Shipped Native Build 90 | `32baf1d5f43120cd07088df1210e1dc84ed26a78` | Read-only source extraction |
| Production Server | `e7ffc6716706ae4d2140008a1655bfed95a93889` | Source authority and bounded production-read target |
| Claude Build 91 OP + Watch candidate | `b944ad1e5503ffa6d924e733abb2f3ba68e90ce2` | Diff-only conflict inspection; untouched |
| Claude Build 91 Evidence candidate | `a399387b0aa37a2d0e70d0acfac11334796a7d62` | Diff-only conflict inspection; untouched |

The existing work environment was used directly. No sub-chat, child task, additional Codex session, or new worktree was created.

## Executive findings

1. Fadogia is a normal active `supplement` protocol with a normal active `supplement_reminder`, a canonical execution item, a Reminder version, and an every-two-days schedule. Its data is not malformed.
2. Fadogia lacked Skip because `isPrioritySkipSupportedReminder` explicitly allows only peptide and recovery Support categories and explicitly treats supplements as a deferred product decision. The read projection therefore emitted no `skipCommand`, the command port independently rejected a direct attempt with `PRIORITY_SKIP_UNSUPPORTED`, and Native correctly hid Skip.
3. `priority.skip.v1` and the shared dated reconciliation state already provide the right semantics for Reminder-backed occurrences: one date, no fake completion, no dose/evidence write, idempotency, optimistic concurrency, and first-terminal-wins behavior.
4. Skip availability is nevertheless duplicated and incomplete. The Server action builder nulls Skip for specialized evidence workflows; Native Detail renders Skip only inside manual/dose-aware completion templates; Native and web Home have no inline Skip; web Detail has no Skip; prior-day evidence recovery does not offer the same disposition.
5. A supplement-only allowlist edit would fix the observed Fadogia case but would not implement the Founder direction. Morning Weight, Progress Photos, and DEXA are actionable occurrences and have no semantic reason to forbid an intentional occurrence-level Skip.
6. Training/Logger is not currently a Daily Focus priority source. “Suggested Today” is a Training Logger draft/category suggestion, not a priority occurrence. If planned workouts become priorities, Skip must affect only the occurrence disposition and must never synthesize training evidence or satisfy progression.
7. Same-day skip currently removes the occurrence from Home and the notification horizon. Daily Briefing uses that same filtered Daily Focus projection, so the item silently disappears from the current plan. Midweek/Weekly/Monthly, Confidence, coaching, and adherence do not currently consume priority reconciliation as a distinct semantic input. Universal Skip therefore needs an explicit downstream disposition projection before anyone treats it as adherence evidence.

## Source-truth priority inventory

“Priority” in production is primarily a computed dated occurrence, not a single persisted `Priority` record. `DailyFocusService` composes Reminders, protocols, execution items, evidence, and check-ins. The persisted execution-item model's `type` is open-ended, but only the paths below currently reach the production Daily Focus projection.

| Production source/family | Canonical source | Current actionability | Current completion authority | Current Skip |
|---|---|---|---|---|
| Ordinary/manual persistent reminder | Active, `always_visible` Reminder not claimed by a specialized execution family | Actionable | `priority.complete.v1` / Reminder completion history | Yes in Server contract, Native Detail, and notifications; absent from Home inline and web Detail |
| Peptide Support | Active peptide protocol + execution item + `protocol_reminder` | Actionable when scheduled, configured, and not paused | Dose-aware `priority.complete.v1` | Yes in Server contract, Native Detail, and notifications; absent from Home inline |
| Recovery Support, including Foam Rolling | Active recovery protocol + execution item + `recovery_reminder` | Actionable when scheduled and configured | Context-aware `priority.complete.v1` | Yes in Server contract, Native Detail, and notifications; absent from Home inline |
| Supplement Support, including Fadogia | Active supplement protocol + execution item + `supplement_reminder` | Actionable when scheduled and configured | Context-aware `priority.complete.v1` | **No today** by explicit category allowlist; prior-day Morning Check-In can record skipped |
| Morning Weigh-In | Evidence execution + weight Reminder, with a legacy synthetic fallback | Actionable through Morning Check-In / Log Weight | Weight evidence/check-in, never a manual priority completion | No current-day Skip |
| Progress Photos | Progress-photo Reminder; often wrapped in a daypart session | Actionable through Photos evidence capture | Confirmed photo evidence, never a manual priority completion | No current-day Skip |
| DEXA appointment / upload-results stage | `execution_next_dexa` (`dexa_appointment`), projected to a stage-specific synthetic priority ID | Actionable through appointment management or DEXA evidence upload | Confirmed DEXA evidence closes the execution | No Skip; no Reminder-backed command identity |
| Reminder-backed DEXA evidence, if present through the generic Reminder path | Reminder with `linkedEvidenceType=dexa` | Actionable through DEXA evidence | Confirmed DEXA evidence | No Skip because specialized workflow is excluded |
| Daypart grouped session | Presentation aggregation of weight/photo child occurrences | Not a canonical occurrence itself; children are actionable | Child evidence authorities | No aggregate Skip; child capabilities are currently hidden by the wrapper |
| Legacy reminder-only dose-change notice | Synthetic notice from protocol dose history | Informational transition/setup notice | None | Correctly none; it is not an execution occurrence |
| Protein Goal fallback | Derived from current check-in nutrition data | Informational/data-derived outcome | Nutrition/check-in evidence | Correctly none |
| Close Activity Ring fallback | Derived from current check-in activity data | Informational/data-derived outcome | Activity/check-in evidence | Correctly none |
| Sleep 8+ Hours fallback | Derived from current check-in recovery data | Informational/data-derived outcome | Sleep/check-in evidence | Correctly none |

### Items requested by the audit that are not current priority types

- Training/workout and cardio do not enter `buildDailyFocusCandidates`. Training Logger and “Suggested Today” are separate Log/Logger projections and writes.
- Nutrition, activity, and sleep appear in Daily Focus only as derived fallback targets, not canonical actionable priority occurrences. Active protocol expectations may create next-morning evidence-recovery prompts, which are not current-day priority occurrences.
- Briefings/reviews are separate artifacts/actions, not priority types.
- Goals/strategies own or contextualize occurrences but are not themselves Daily Focus priority occurrences.
- Generic execution items of the default model type `commitment` are not automatically projected. Generic current priorities come from persistent Reminders.
- Operating Plan is a configuration/lifecycle surface for the same protocol/execution source. It is not a same-day completion/skip surface.
- Watch Build 90 and the inspected Build 91 candidate are workout surfaces only. They do not display or mutate priority occurrences.

## Current surface/capability matrix

Legend: `C` = Complete, `S` = Skip, `Z` = local notification Snooze, `D` = domain action/navigation, `—` = not applicable or unavailable.

| Family | Native Home | Native Priority Detail | Notification | Morning Check-In for yesterday | Web Home / Detail | Operating Plan / Log | Canonical result |
|---|---|---|---|---|---|---|---|
| Ordinary Reminder | C inline; no S | C + S | C + S + Z | Completed / Skipped / Note | C inline / C only | D when linked | Complete writes Reminder history; Skip writes dated reconciliation |
| Peptide | Planned-context C inline; no S | Dose-aware C + S | Dose-aware C + S + Z | Completed / Skipped / Note | C inline / C only | OP pause/resume/edit | Skip writes no dose and does not alter schedule |
| Recovery | Context C inline; no S | C + S | C + S + Z | Completed / Skipped / Note | C inline / C only | OP edit/review | Same generic skip state |
| Supplement / Fadogia | Context C inline; no S | C; **no S** | C + Z; **no S** | Completed / Skipped / Note | C inline / C only | OP edit/review | Today's command is rejected as unsupported |
| Morning Weight | D to Check-In; no manual C/S | D to Log Weight; no S | D/open only; no S/Z | Scheduled evidence is routed to evidence recovery, not disposition choices | D only | Tracking configuration | Evidence satisfies occurrence |
| Progress Photos | Usually grouped D; no S | D to Upload; no S | D/open only; no S/Z | Scheduled evidence is routed to evidence recovery, not disposition choices | D only | Evidence/OP schedule | Evidence satisfies occurrence |
| DEXA | D to appointment/upload; no S | D to appointment/upload; no S | D/open only; no S/Z | No Reminder occurrence to reconcile | D only | OP DEXA management | DEXA evidence completes execution |
| Grouped daypart session | D only | Child destinations | D/open only | Child-specific behavior | D only | Check-In/Log | Wrapper has no canonical state |
| Protein/activity/sleep fallbacks | D/open only | Informational fallback | Open only | Evidence recovery only when an independent protocol expects it | D/open only | Evidence surfaces | Derived evidence state |

Additional surface facts:

- Native Home `FocusTileView` and `TodaysFocusCardView` accept only `onComplete`; `HomeView` invokes only the completion write API.
- Native Detail already has a canonical `skip()` write path, confirmation, feedback, notification cleanup, and accessibility-sized control, but `PriorityDetailView` places Mark Skipped only in manual/dose-aware templates. Evidence templates cannot show it even if the Server were to provide it.
- Native notification actions already consume `notificationAction.skipCommand`, support skip-only specialized actions, retry one uncertain submission with the same idempotency envelope, and perform a bounded exact-occurrence refresh on stale versions. No domain-name inference is needed.
- Web `FocusTile` has an inline completion form only. `PriorityDetailScreen` receives only `completeAction` and renders no Skip.
- Notification Snooze is device-local rescheduling. It does not write a canonical disposition and is not a substitute for Skip.
- Morning Check-In uses `previous-day.reconcile.v1`, not `priority.skip.v1`, because the latter is deliberately today-only. Both write the same canonical reconciliation shape through the same helper.

## Exact Fadogia root cause

### Bounded production confirmation

The one authorized read-only production inspection was used after the source/schema audit. It was restricted to the current Fadogia protocol, execution, Reminder, and exact-day check-in family. The transaction declared `REPEATABLE READ READ ONLY`, verified `transaction_read_only=on`, ended in an explicit rollback, and the control plane was unchanged before/after. Production remained on `e7ffc6716706ae4d2140008a1655bfed95a93889`, healthy and ready.

The current source shape was:

- protocol `protocol_fadogia_agrestis_founder`, category `supplement`, active;
- execution `execution_supplement_protocol_fadogia_agrestis_founder`, type `supplement`, active;
- cadence `every_x_days`, interval `2`, anchor/start `2026-09-15`, time `05:45`;
- Reminder `reminder_protocol_fadogia_agrestis_founder`, type `supplement_reminder`, active, linked to that protocol and execution, scheduled persistence;
- the inspected current occurrence had since been completed, so the read was used to confirm source shape rather than reconstruct the Founder's earlier UI state.

### End-to-end trace

1. `SupplementSupportManagementService` owns the active supplement protocol/execution/Reminder relationship.
2. `DailyFocusService.getExecutionBackedProtocolItems` includes protocol categories `peptide`, `recovery`, and `supplement`; Fadogia is scheduled on its anchored every-two-day cycle and projects as actionable.
3. Completion is projected with the same protocol-support completion path used by the other Support categories.
4. Skip calls `isPrioritySkipSupportedReminder(reminder, { protocol })`.
5. That function's support-category allowlist contains only `peptide` and `recovery`. Its source comment explicitly says supplement Skip was a deferred product decision.
6. `protocolSupportNotificationAction` therefore emits `skipCommand: null`; Priority Detail likewise projects `skippable: false` and `skipCommand: null`.
7. Build 90 Native does not infer capabilities. It decodes the Server fields, so it correctly shows Mark Complete and hides Mark Skipped. Home has no inline Skip for any type.
8. Even a handcrafted direct `priority.skip.v1` request is refused by the write-side copy of the same rule with `422 PRIORITY_SKIP_UNSUPPORTED`.

Therefore the defect is an explicit Server semantic allowlist plus incomplete shared-surface consumption. It is not caused by Fadogia data, recurrence, missing Native command support, dose handling, or a missing execution/Reminder link.

## Canonical Skip authority and state

### What already exists

- Command: `priority.skip.v1`.
- Current payload: `priorityId`, `occurrenceDate`, optional `note`; expected Reminder version is carried through `If-Match`/command metadata.
- Occurrence key: `<priorityId>:<YYYY-MM-DD>`.
- State: one entry in `dailyCheckIns[daily_check_in_<date>].reconciliation[]` with `key`, `reminderId`, `occurrenceDate`, `status: "skipped"`, optional `note`, and `recordedAt`.
- `recordedAt` is the durable skip timestamp; the command response calls it `skippedAt`. There is no duplicate skipped flag on the Reminder or execution item.
- The writer is `PriorityOccurrenceReconciliation`; both today's command and previous-day Morning Check-In use it.

### Safety semantics already present

- Today only, resolved in the user's timezone. Past returns `PRIORITY_SKIP_PAST_OCCURRENCE` and directs to Morning Check-In; future is rejected.
- Exact replay is idempotent, including a replay carrying the pre-skip version.
- The Reminder version is advanced without adding completion history, serializing a same-occurrence skip against completion.
- Completion first causes later Skip to return `already_completed` without writing.
- Skip first causes later completion to return `already_skipped` without writing.
- Thus the first terminal write wins. If malformed historical data contains both states, read projection should continue to prefer real completion while diagnostics flag the invariant breach.
- A paused peptide date is rejected. Paused means no occurrence existed; Resume remains an Operating Plan lifecycle action.
- Skip writes no dose, evidence object, evidence package, workout, or protocol schedule mutation.
- Native uncertain-response retry reuses the exact idempotency envelope; notification stale-version retry is bounded and re-reads the exact occurrence before retrying.

### Required generalization

The state shape is semantically generic, but its field name and locking path are Reminder-specific. To cover DEXA and future execution-backed workout priorities without domain commands:

1. Add canonical `priorityId` to reconciliation entries and retain `reminderId` as a backward-compatible alias while readers migrate to `priorityId ?? reminderId`. No backfill is required.
2. Make `priority.skip.v1` resolve the projected occurrence to a Server-owned disposition target:
   - Reminder-backed occurrence: lock/version the Reminder as today.
   - Execution-backed occurrence such as DEXA: lock/version the source execution item and re-check evidence/terminal state in the same transaction.
3. Never let clients select a collection or manufacture a target type. They submit the projected priority ID/date/expected version; the Server resolves the authority.
4. Keep one reconciliation writer and one command type. Do not add supplement-, DEXA-, evidence-, or workout-specific skip commands.

## Recurrence and scheduling

Skip is occurrence-scoped. Recurrence is calculated from the protocol/Reminder cadence and anchor, without consulting a prior skip.

- Skipping today does not pause, disable, reschedule, or end a protocol.
- The skipped occurrence is removed from Home and the notification horizon for that date.
- The next scheduled occurrence remains valid and receives its own occurrence key and current source version.
- For Fadogia's anchor `2026-09-15` and interval `2`, `2026-10-07` is on-cycle and the next occurrence is `2026-10-09`. A `2026-10-07` skip must not move that date.
- A future occurrence cannot be pre-skipped.
- A late previous-day action must go through Morning Check-In; stale current-day actions fail closed or refresh only the exact still-open occurrence.
- A notification retained after completion resolves to `already_completed`; one retained after Skip cannot create completion because completion resolves to `already_skipped`.

Existing recurrence tests already prove that a skipped daily item disappears only for its date and reappears on the next scheduled date, and that every-other-day Fadogia projections follow the anchored cycle.

## Peptides, supplements, and recovery

- Peptide Skip already uses the correct canonical state and deliberately carries no dose. Completion remains dose-aware.
- Recovery Skip already uses the same authority.
- Supplement completion already uses the same protocol-support machinery; its Skip omission is only the category allowlist. Supplements should use the same generic command.
- Home's planned-context completion versus Detail's editable dose behavior is a completion concern, not a Skip concern. Skip must remain identity/date/version only on every Support family.
- Pause/resume and Skip remain separate:
  - Pause changes future execution availability through a suspension window.
  - Skip records one existing occurrence as intentionally not done.
  - A paused date has no actionable occurrence and therefore no Skip button.
- Operating Plan schedule/support editors should not acquire a same-day Skip control. They configure the source; the occurrence surfaces act on today.

## Morning Check-In

Current prior-day execution reconciliation supports exactly `completed`, `skipped`, and `note`, validates the exact yesterday occurrence in the user timezone, and is idempotent. Only `completed` writes Reminder completion history; `skipped` and `note` do not.

The inconsistency is that evidence-linked scheduled priority items are diverted into the evidence-recovery lane, where the only actions are to add/resume evidence. That means a missed Morning Weight or Progress Photos occurrence cannot be truthfully marked Skipped the next morning, while a supplement can.

Build 91 should distinguish:

- a scheduled priority occurrence with missing evidence: offer Add/Resume Evidence **and** Mark Skipped, using the same dated reconciliation state;
- an evidence-recovery prompt with no scheduled priority occurrence: recovery action only, because there is no priority occurrence to skip;
- paused/inactive/not-scheduled sources: no prior-day occurrence and no reconciliation prompt.

Morning Check-In should continue to use the prior-day command boundary; it should not weaken the today-only constraint on `priority.skip.v1`.

## Training / Logger / Watch

### Current truth

- Training Logger and “Suggested Today” are a separate read/write system. The suggestion is a second presentation of Logger draft category selection, not a Daily Focus priority.
- Daily Focus does not project a planned workout, training session, or cardio item.
- A dated training execution may create a previous-day evidence-recovery prompt. That prompt asks for missing/partial evidence; it is not currently a priority disposition.
- Build 90 Watch and the inspected Build 91 Watch candidate are workout-only. There is no Watch priority action surface to change.

### Rule for a future planned-workout priority

If a planned workout becomes a current actionable priority, `priority.skip.v1` should mark only that planned occurrence's dated disposition. It must not:

- invoke `training-logger.complete.v1`;
- create a Logger draft/session;
- create canonical training evidence;
- satisfy exercise/progression eligibility;
- count as a completed weekly workout;
- rewrite Suggested Today or the weekly plan unless a separate, explicit planning policy consumes the skip.

The Logger can hide or annotate the skipped suggestion by consuming the same occurrence disposition, but it must not reinterpret Skip as training evidence.

## Intelligence, briefings, Confidence, coaching, and adherence

Current behavior:

- Home and the notification horizon read reconciliation and drop terminally reconciled occurrences.
- Daily Briefing calls `DailyFocusService.getDailyFocus` with the same check-ins, so a same-day skipped item disappears from `todayPriorities`. The briefing receives no explicit “skipped” fact.
- Midweek, Weekly, Monthly, Confidence V3, coaching, and current adherence/completion calculations do not read priority reconciliation as a semantic input. Searches for the reconciliation shape found no such consumer.
- Consequently, universal Skip does not currently lower Confidence or fabricate evidence, but it is silently absent rather than explicitly modeled downstream.

Required Build 91 contract:

- Add a read-only `priorityDispositionSummary` (open/completed/skipped/missed-or-unresolved, occurrence identity/date/source family) to briefing/intelligence inputs where priorities are discussed.
- `skipped` is not `completed`, does not satisfy evidence, and must not be silently converted to “missed.”
- Confidence remains evidence-authoritative. A skip is neutral execution context unless a separately reviewed strategy explicitly assigns it meaning; it must not directly change Confidence.
- Adherence metrics, if/when they consume priorities, must report skipped separately. Do not put skipped in the completion numerator or silently remove it from the denominator without an explicit metric definition.
- Daily planning may omit a skipped item from remaining recommendations while retaining the disposition in history/context.

## Legitimate exceptions

There is **no legitimate domain-type exception among current actionable priority occurrences**.

The following no-Skip states are legitimate because they are not open actionable occurrences, not because of their domain:

| State/item | Why Skip is invalid | User action instead |
|---|---|---|
| Already completed or already skipped | Occurrence is terminal; first terminal state wins | View terminal state |
| Paused, inactive, outside cadence, or not scheduled | No current occurrence exists | Resume/edit schedule in Operating Plan when appropriate |
| Setup-required execution | The system cannot yet identify a valid executable occurrence | Review/fix Support setup |
| Protein/activity/sleep fallback | Derived informational outcome, not a canonical user-executable occurrence | Open the relevant evidence/check-in surface |
| Legacy dose-change notice | Informational transition notice, not a completion obligation | Review execution plan |
| Grouped daypart session wrapper | Presentation aggregate, not one canonical occurrence | Act on or skip its canonical child occurrence(s) |
| Unscheduled evidence-recovery prompt | Recovery workflow with no scheduled priority occurrence | Add/resume evidence |

Lack of a Reminder ID, missing UI, specialized completion, or historical allowlisting is not a semantic exception. DEXA and evidence-driven priorities require occurrence authority work, not exclusion.

## Recommended shared capability architecture

### One Server-owned occurrence action contract

Introduce/refactor one resolver, conceptually:

`resolvePriorityOccurrenceActions({ source, occurrenceDate, state }) -> { completionCommand, skipCommand }`

Rules:

1. Resolve whether a canonical occurrence exists and is current, open, actionable, and versioned.
2. Default `skipCommand` to `priority.skip.v1` for every such occurrence.
3. Allow domain-specific completion to remain plain, planned-context, or evidence-only.
4. Set no skip command only when the item is not an open actionable occurrence. Any future domain exception must have a named reason code, a source test, and a documented user alternative.
5. Derive Home, Detail, and notification DTOs from this one result.

Command presence should be the capability. Do not add another independent `canSkip` boolean that can drift from `skipCommand`. Existing `skippable` may remain as a backward-compatible derived field (`Boolean(skipCommand)`) until old clients age out.

### Reuse the contract already closest to this design

`notificationAction.completionCommand` / `skipCommand` and Native `PriorityOccurrenceCapabilities` already model completion and Skip as independent capabilities. Make that occurrence action pair the shared wire authority rather than a notification-only detail:

- specialized evidence workflows may carry `skipCommand` while keeping `completionCommand: null`;
- protocol Support may carry both commands, with dose only on completion;
- Detail's top-level `skipCommand` is derived from the same object during compatibility;
- Home maps the same command to its inline action;
- notification categories continue to derive from command presence;
- Native and web never infer support from title, icon, Reminder type, protocol category, or workflow name.

### Presentation aggregates

- Preserve the canonical child occurrence for any one-item session instead of replacing it with `morning-check-in`/daypart synthetic identity.
- Multi-child grouped sessions should expose child action contracts. A “Skip all” control is optional and, if added, must submit an atomic Server batch of the same canonical occurrence dispositions; do not invent a group-level fake occurrence.

## Exact Build 91 implementation plan

### 1. Server canonical model and command

1. Add `resolvePriorityOccurrenceActions` beside the existing execution-contract code and move all skip eligibility into it.
2. Delete the peptide/recovery category allowlist and the workflow-based exclusions. A specialized completion workflow must not suppress Skip.
3. Make `resolveNotificationAction`, `protocolSupportNotificationAction`, Daily Focus, and Priority Detail consume that resolver. Verify Fadogia emits `priority.skip.v1` with no dose.
4. Extend `priority.skip.v1` with a Server-owned occurrence-source resolver:
   - Reminder source path preserves current behavior and optimistic locking.
   - Execution source path supports DEXA and future planned-workout occurrences, locks the execution version, and re-checks evidence/terminal state transactionally.
5. Evolve reconciliation entries additively with `priorityId`; retain/read `reminderId` for old records and clients. Continue using the one upsert helper.
6. Preserve first-terminal-wins, today-only, timezone, idempotency, pause, and no-evidence/no-dose invariants.
7. Change session projection so a single child keeps its canonical identity; project per-child commands for true groups.
8. Add an explicit disposition read projection for briefings/history; do not change Confidence scoring.

### 2. Server/web surfaces

1. Home DTO: expose the same skip command for every open actionable item/child.
2. Web Home: add an accessible secondary Skip action using the command's ID/date/version; keep row navigation and completion independent.
3. Web Priority Detail: add the same action and confirmation; do not derive by type.
4. Morning Check-In: let scheduled evidence priority occurrences choose Skipped while leaving unscheduled evidence recovery as recovery-only.
5. Notification projection: allow specialized skip-only actions and keep Snooze device-local.

### 3. Native on the final Build 91 integration branch

1. Keep `PriorityOccurrenceCapabilities` command-driven; remove comments/tests that encode domain allowlists.
2. Map Home and Detail from the same action contract. Keep top-level fields only as backward-compatible fallback.
3. Add Home inline Skip handling to `FocusTileView` / `TodaysFocusCardView` / `HomeView`, with confirmation, optimistic state, exact idempotency key, notification cleanup, error recovery, and a minimum 44-point accessible target.
4. Move Detail's Skip presentation outside manual/dose-aware completion controls so evidence-only actionable templates can render it too.
5. Preserve dose-aware completion and pause/resume behavior unchanged.
6. Update notification fixtures: supplements and evidence workflows with a Server skip command are skippable; lack of a command remains no Skip.
7. Do not add priority UI to Watch in Build 91; there is no current Watch priority surface.

### 4. Intelligence boundary

1. Feed explicit disposition summaries into Daily Briefing composition so the current plan can omit skipped work without erasing why.
2. Add guards proving Midweek/Weekly/Monthly, coaching, Confidence, training evidence, and adherence do not treat skip as completion/evidence.
3. Defer any strategy-specific interpretation of repeated skips to a separate product decision; store truthful facts now.

### 5. Integration order and candidate conflicts

1. Land the Server changes from the production Server authority, with contract tests first.
2. Integrate the two already-isolated Claude Build 91 candidates into the authorized Build 91 integration branch.
3. Apply the Native universal-Skip change to that integrated branch; do not modify either candidate in place.
4. Re-run Server, Native, notification, accessibility, and end-to-end matrices before selecting release authority.

Expected conflicts:

- Claude B changes `PriorityDetailView.swift` for Operating Plan navigation context. Universal Skip also needs the action zone, so this is one small semantic merge.
- Claude B changes `FounderServerAPITests.swift`; add new capability fixtures without overwriting its navigation assertions.
- Claude B does not change `FocusTileView`, `TodaysFocusCardView`, `HomeView`, the priority command API, or the priority capability contract, so Home/command work is otherwise low-conflict.
- The Evidence candidate changes Evidence presentation files, not priority action contracts. No direct conflict is expected; only destination-level UI verification is needed.
- Watch candidate changes workout Watch files only; no priority conflict exists.

### 6. Deployment, compatibility, and data

- No migration or backfill is required. Reconciliation is schemaless/additive; readers can accept `priorityId ?? reminderId`.
- Server can deploy independently after the regression gate. Old Native ignores unknown/additive fields and already understands `priority.skip.v1`, skip-only notification capability, and generic identity/date/version payloads.
- On shipped Build 90, a Server deployment would immediately unlock supplement Skip in Native Detail and notifications because those paths are command-driven; Home inline Skip and evidence-template Detail Skip still require Build 91 Native.
- Web parity should ship with the Server deployment.
- No Native release authority changes until the integrated Build 91 candidate passes the complete matrix.

## Regression matrix for implementation

### Server capability and state

| Case | Required assertion |
|---|---|
| Ordinary Reminder | Open current occurrence emits one skip command and writes one dated skipped entry |
| Fadogia supplement | Emits same command as peptide/recovery; write succeeds; no dose/completion/evidence; next every-two-day occurrence remains |
| Peptide | Skip coexists with dose-aware completion; no dose on skip; pause has no occurrence/command |
| Recovery | Same generic command; schedule unchanged |
| Morning Weight | Evidence completion remains evidence-only; Skip command exists for the open scheduled occurrence |
| Progress Photos | Evidence completion remains evidence-only; Skip command exists; no photo/evidence fabricated |
| DEXA one-time stages | Execution-backed command resolves exact stage/date, locks source, writes disposition only, and does not cancel appointment or fabricate scan |
| Generic/manual Reminder | No type registration is required; default is skippable |
| Future planned workout | Skip only occurrence; no Logger command, evidence, progression, or weekly completion |
| Informational fallbacks | No command because no canonical actionable occurrence exists |
| Grouped session | Single child preserves identity; multi-child commands remain child-bound; any batch is atomic |
| Completed | Skip returns `already_completed`, no write |
| Already skipped | Exact and stale-version replay return `already_skipped`, no duplicate |
| Stale open occurrence | `412 STALE_VERSION`; bounded exact refresh may retry once |
| Past/future | Today command rejects; yesterday is owned by Morning Check-In |
| Concurrent complete/skip | Exactly one terminal state; first write wins |
| Offline/uncertain response | Same idempotency envelope returns original receipt; no duplicate |
| Timezone rollover | “Today” and occurrence key use canonical user timezone |
| Recurrence | Daily/weekly/every-X-days/monthly next date is unchanged by skip |

### Surfaces

| Surface | Required assertion |
|---|---|
| Native Home | Complete and Skip independently follow command presence; successful Skip removes exact row; errors do not optimistically persist |
| Web Home | Same contract and confirmation; no nested-link/form regression |
| Native Detail | Manual, dose-aware, Morning Weight, Photos, and DEXA actionable templates all render Skip from the same command; terminal/paused do not |
| Web Detail | Same availability and command payload as Native |
| Notification | Complete/Skip/Snooze category matrix, skip-only specialized action, stale refresh, deep link, and cleanup |
| Morning Check-In | Supplement/peptide/recovery and scheduled evidence items can record prior-day skipped; unscheduled evidence recovery cannot |
| Operating Plan | Skip never pauses, resumes, or changes cadence/support configuration |
| Log/Logger | Current separation remains; future linked skip creates no workout/evidence |
| Watch | No priority actions are introduced accidentally |

### Downstream and quality

- Home, Detail, notification horizon, and next-morning selection agree on the terminal state.
- Daily Briefing retains an explicit skipped disposition while omitting it from remaining work.
- Midweek/Weekly/Monthly, coaching, Confidence, and adherence tests prove Skip is neither completion nor evidence nor an implicit failure.
- VoiceOver labels distinguish Mark Complete from Mark Skipped; confirmation copy names the occurrence/date intent.
- All touch targets are at least 44 points and Dynamic Type does not collapse the secondary action.
- Cached payloads without new fields continue to decode with Skip unavailable, never inferred.

## Verification performed for this audit

- Read the staged specification at `164d0919be4d14f2fe50136125bcb65abc242015` in full.
- Traced Server generation, detail, completion, skip, recurrence, Morning Check-In, briefing, Confidence, coaching, and Logger code paths at production Server commit `e7ffc671`.
- Extracted and inspected shipped Native Build 90 source at `32baf1d5` without modifying its worktree.
- Diff-inspected both isolated Build 91 candidates without checking them out or changing them.
- Ran the focused Server unit suite: 6 files, 76 tests passed.
- Ran the phase-3 skip command suite: 8 tests passed.
- Performed the single authorized bounded production read; transaction was read-only and rolled back; no temporary audit script remains.
- Working product source was not changed. This report is the only repository content produced.

## Final status

**Universal Priority Skip audit complete — Build 91 implementation decision ready.**

**Notify: PhysiqueOS Priority Skip audit — universal capability recommendation ready.**

**STOP.**
