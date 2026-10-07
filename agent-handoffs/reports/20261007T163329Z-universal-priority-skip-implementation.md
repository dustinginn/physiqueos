# PhysiqueOS Build 91 — Universal Priority Skip implementation

## Status

**HOLD.** The Universal Priority Skip implementation is complete and green in two isolated local candidate commits, but the required remote publication could not be completed. The push was rejected because repository ownership for the configured remote could not be verified. No alternate remote or publication workaround was attempted.

Local implementation state:

- Server/Web candidate: `738ce66849a1361b4ce0ed069a4a04eac6abc4ef`
- Native candidate: `a379fa128aeffc8192980232d5c0c1ad4b696943`
- Recommendation once the remote is verified and the refs are published: **READY FOR BUILD 91 INTEGRATION** using the sequence in this report.

This work did not deploy Server, mutate production, merge either Claude candidate, create the final Build 91 integration, bump a build, archive, upload TestFlight, or change release authority.

## Authorities and isolation

| Authority | Commit | Treatment |
|---|---|---|
| Implementation task | `73051651b8965c9b297a785c96dbfe5343e00835` | Read in full and followed |
| Universal Skip audit | `1579963b8d95a491e45919cc0959a2222ef9114f` | Approved design authority |
| Production Server base | `e7ffc6716706ae4d2140008a1655bfed95a93889` | Base for isolated Server/Web candidate |
| Shipped Native Build 90 base | `32baf1d5f43120cd07088df1210e1dc84ed26a78` | Base for isolated Native candidate |
| Claude A Evidence candidate | `a399387b0aa37a2d0e70d0acfac11334796a7d62` | Diff-audited only; not merged or changed |
| Claude B OP + Watch candidate | `b944ad1e5503ffa6d924e733abb2f3ba68e90ce2` | Diff-audited only; not merged or changed |

The same dedicated Codex conversation and provided work environment were used. No sub-chat, child task, additional Codex session, or new worktree was created. The audit's already-authorized production confirmation was sufficient; this implementation performed no production read.

## Candidate identities

### Server/Web

- Branch: `codex/universal-priority-skip-server-20261007`
- Base: `e7ffc6716706ae4d2140008a1655bfed95a93889`
- Commit: `738ce66849a1361b4ce0ed069a4a04eac6abc4ef`
- Subject: `feat: implement universal priority skip`
- Diff: 30 files, 1,258 insertions, 257 deletions

### Native

- Branch: `codex/universal-priority-skip-native-20261007`
- Base: `32baf1d5f43120cd07088df1210e1dc84ed26a78`
- Commit: `a379fa128aeffc8192980232d5c0c1ad4b696943`
- Subject: `feat: add universal priority skip to native surfaces`
- Diff: 19 files, 637 insertions, 128 deletions

### Report

- Branch: `codex/universal-priority-skip-implementation-20261007`
- Base: implementation task commit `73051651b8965c9b297a785c96dbfe5343e00835`
- This report is intentionally separate from both product candidates.

## Implemented architecture

The implementation keeps one Server-owned capability and one canonical write/state path:

1. `priority.skip.v1` remains the only current-day Skip command.
2. `PriorityOccurrenceDispositionService` resolves the projected priority occurrence to its canonical authority on the Server. The client supplies only the projected identity, occurrence date, expected version, and command envelope; it cannot select a table, collection, or source type.
3. Reminder-backed occurrences continue to lock and version the Reminder. Execution-backed DEXA occurrences lock and version the canonical execution item and re-check evidence and terminal state in the transaction.
4. `PriorityOccurrenceReconciliation` remains the one dated disposition state. New entries carry canonical `priorityId`; `reminderId` remains a backward-compatible alias, and readers use `priorityId ?? reminderId` semantics. No historical backfill is needed.
5. Command presence is the capability. An exact projected `skipCommand` means Skip is available; its absence means it is not. Native and Web do not infer eligibility from title, priority type, protocol category, or workflow name.
6. The canonical first-terminal-write rules remain intact: completion first yields `already_completed`; Skip first yields `already_skipped`; duplicate Skip is idempotent; stale versions fail safely.

The shared resolver defaults every real, current, open actionable occurrence to skippable. It omits the command only when there is no occurrence, the item is informational/non-actionable, the source is paused/inactive/not scheduled, or the occurrence is already terminal. There is no domain-family allowlist.

## Fadogia and recurrence

The old supplement exclusion was removed from `ReminderOccurrenceCompletion`; no supplement-specific exception or replacement allowlist was added. Fadogia now receives the same projected `priority.skip.v1` command as peptide, recovery, and ordinary Reminder occurrences.

A Fadogia Skip writes only the dated skipped disposition. It writes no dose, no completion history, no evidence, and no protocol mutation. It does not pause the protocol or move the schedule. Regression coverage proves the audited every-two-day cadence remains anchored: skipping the on-cycle `2026-10-07` occurrence leaves `2026-10-09` as the next occurrence.

All other recurrence invariants are preserved: Skip applies to one date, future occurrences cannot be pre-skipped, prior-day disposition remains owned by Morning Check-In, and the next scheduled occurrence receives its own open state.

## Capability and surface parity

### Home

- Server/Web and Native Home consume the exact projected command.
- Native uses a compact secondary menu with an accessibility-sized target rather than crowding the tile.
- Skip has independent confirmation, in-flight, acknowledgement, failure, refresh, and notification-cleanup behavior; it never routes through completion.
- Acknowledged terminal state clears the local capability even if the follow-up refresh is uncertain.
- True daypart groups expose child-bound controls. The presentation wrapper does not invent an aggregate occurrence or aggregate Skip.
- Informational fallbacks remain without Skip.

### Priority Detail

- Mark Skipped is a shared secondary occurrence action rendered from `skipCommand` across manual, dose-aware, Morning Weight, Progress Photos, and DEXA templates.
- Each domain's primary action remains unchanged: Add/Log Weight, Upload Photos, manage the DEXA appointment or upload results, or domain-aware completion.
- Terminal, paused, inactive, unscheduled, setup-only, and informational states do not render Skip.
- The exact projected command is submitted; Native validates the command type, version, identity, and date before submission.

### Notifications

- Existing generic command-driven notification categories remain the authority.
- Scheduled evidence occurrences can use a skip-only action set while retaining the domain primary/open action and local Snooze where the platform action budget permits.
- Snooze remains local-only and is not treated as a canonical disposition.
- Notification Skip uses the exact projected command and retains bounded stale-version recovery and cleanup behavior.

### Web

- Web Home and Priority Detail share `PrioritySkipService` and submit the projected `priority.skip.v1` command.
- No Web-specific family matrix or domain allowlist was introduced.
- Existing completion and navigation remain independent of Skip.

### Prior-day Morning Check-In

- Prior-day disposition continues to use `previous-day.reconcile.v1`; today's `priority.skip.v1` constraint was not weakened.
- A scheduled priority occurrence with missing Morning Weight, Progress Photos, or other evidence offers Add/Resume Evidence plus Mark Skipped.
- An evidence-recovery prompt without a scheduled priority occurrence remains recovery-only and has no Skip.
- Paused, inactive, and not-scheduled sources produce no occurrence and therefore no Skip.
- Both current-day and previous-day flows resolve through the same dated reconciliation state.

## Domain invariants

- **Peptides:** Skip writes no dose. Dose-aware completion and protocol pause/resume are unchanged.
- **Supplements:** Fadogia and other open occurrences use the generic capability. Protocol schedule and support configuration are unchanged.
- **Recovery:** Existing completion context remains; Skip is the generic dated disposition.
- **Morning Weight / Progress Photos:** intentional Skip creates no weight, photo, check-in evidence, or completion record.
- **DEXA:** the generalized execution-backed resolver marks only the exact projected occurrence skipped. It does not cancel or delete the schedule, create scan evidence, alter Coaching Updates, or change the next configured DEXA state.
- **Training / Logger:** Suggested Today remains a Logger suggestion, not a Priority. No workout evidence is fabricated, no Logger completion is called, and Adaptive Progression is unchanged.
- **Briefings / Confidence / adherence:** Skip remains distinct from completion and missing evidence. No consumer was changed to count Skip as negative adherence evidence, progression success, completion, or Confidence evidence. Existing Daily Focus consumers see the terminal occurrence removed from remaining work without a new scoring interpretation.

## Legitimate no-Skip cases

The implementation retains only occurrence-semantic exceptions:

- informational Protein Goal, Close Activity Ring, and Sleep 8+ Hours fallbacks;
- dose-change notices, Briefings, Goals, and strategies;
- recovery prompts with no scheduled priority occurrence;
- grouped/daypart presentation wrappers, while their real children carry capabilities;
- already completed or skipped occurrences;
- paused, inactive, outside-cadence, not-scheduled, or setup-only sources;
- any state where no canonical actionable occurrence exists.

Legacy omission, specialized evidence completion, supplement identity, or lack of a Reminder is not treated as an exception.

## Files changed

### Server/Web candidate

- `src/app/actions.js`
- `src/app/priorities/[priorityId]/actions.js`
- `src/app/priorities/[priorityId]/page.js`
- `src/application/commands/CanonicalPersistenceCommandPorts.js`
- `src/application/commands/PrioritySkipCommand.test.js`
- `src/application/commands/UniversalPrioritySkip.test.js`
- `src/application/priorities/PrioritySkipService.js`
- `src/application/priorities/PrioritySkipService.test.js`
- `src/components/cards/TodaysFocusCard.jsx`
- `src/components/focus/FocusTile.jsx`
- `src/components/focus/PrioritySkipForm.jsx`
- `src/components/focus/PrioritySkipWebParity.test.js`
- `src/domain/services/DailyFocusService.js`
- `src/domain/services/DexaPriorityDetailService.test.js`
- `src/domain/services/ExecutionBackedDailyFocus.test.js`
- `src/domain/services/ExecutionPriorityDetailService.test.js`
- `src/domain/services/MorningEvidenceRecoveryService.js`
- `src/domain/services/MorningEvidenceRecoveryService.test.js`
- `src/domain/services/MorningPriorityReconciliationService.js`
- `src/domain/services/MorningPriorityReconciliationService.test.js`
- `src/domain/services/PriorityDetailService.js`
- `src/domain/services/PriorityDetailSkip.test.js`
- `src/domain/services/PriorityOccurrenceDispositionService.js`
- `src/domain/services/PriorityOccurrenceReconciliation.js`
- `src/domain/services/ReminderOccurrenceCompletion.js`
- `src/domain/services/ReminderOccurrenceCompletion.test.js`
- `src/domain/services/SupplementSupportManagementService.test.js`
- `src/screens/HomeScreen.jsx`
- `src/screens/MorningCheckInScreen.jsx`
- `src/screens/PriorityDetailScreen.jsx`

### Native candidate

- `ios/PhysiqueOS/Contracts/MorningCheckInReadModel.swift`
- `ios/PhysiqueOS/Contracts/PriorityOccurrenceCapabilities.swift`
- `ios/PhysiqueOS/Contracts/PriorityReadModel.swift`
- `ios/PhysiqueOS/Networking/MorningCheckInAPI.swift`
- `ios/PhysiqueOS/Networking/PriorityNotificationCategories.swift`
- `ios/PhysiqueOS/Networking/ProductionCommandAPI.swift`
- `ios/PhysiqueOS/Networking/ProductionDailyDriverAPI.swift`
- `ios/PhysiqueOS/Presentation/Home/FocusTileView.swift`
- `ios/PhysiqueOS/Presentation/Home/HomeView.swift`
- `ios/PhysiqueOS/Presentation/Home/HomeViewModel.swift`
- `ios/PhysiqueOS/Presentation/Home/PriorityDetailView.swift`
- `ios/PhysiqueOS/Presentation/Home/PriorityDetailViewModel.swift`
- `ios/PhysiqueOS/Presentation/Home/TodaysFocusCardView.swift`
- `ios/PhysiqueOS/Presentation/Logging/ManualWeighInView.swift`
- `ios/PhysiqueOSTests/CompletionFeedbackAndNotificationCapabilityTests.swift`
- `ios/PhysiqueOSTests/HomeReadModelTests.swift`
- `ios/PhysiqueOSTests/MorningCheckInModelTests.swift`
- `ios/PhysiqueOSTests/PriorityNotificationSchedulerTests.swift`
- `ios/PhysiqueOSUITests/FoamRollingPriorityDetailUITests.swift`

## Verification

### Server/Web

| Gate | Result |
|---|---|
| Universal/relevant priority regression matrix | **PASS** — 33 files, 332 tests |
| Phase 4 regression selection | **PASS** — 17 files, 156 tests |
| Final focused post-refinement selection | **PASS** — 7 files, 78 tests |
| Production Web build | **PASS** — 19 existing NFT tracing warnings only |
| Changed-source ESLint | **PASS** |
| `git diff --check` | **PASS** |

The broad repository-wide Server gate is not fully green for environment/baseline reasons unrelated to this candidate:

- Phase 3 reached 33/34 files and 319/320 tests; the sole failure is the unavailable private fixture `private/founder/runtime-store.json`.
- `validate-phase3` and `validate-phase4` stop on that same missing private Founder runtime.
- Broader Vitest attempts also encounter sandbox port restrictions and stale unrelated tests.
- Global lint retains four pre-existing `module` assignment errors in monthly briefing code and two existing image warnings.

These are reported as blockers to claiming an unqualified whole-repository Server gate. The changed code and complete relevant priority matrix are green.

### Native / UI / Release

| Gate | Result |
|---|---|
| Focused priority matrix | **PASS** — 193/193 |
| Final Home/terminal refinement selection | **PASS** — 37/37 |
| Notification suite | **PASS** — 78/78 |
| Exact-final full `PhysiqueOSTests` | **PASS** — 2,165 tests, 0 failures, 1 intentional live-capture skip |
| Home locked-dark and Skip-safety UI | **PASS** |
| Prior-day Morning Check-In disposition/atomic-action UI | **PASS** |
| Priority Detail family/touch-target UI matrix | **PASS** — manual, peptide, Fadogia supplement, paused, Morning Weight, completed weight, Progress Photos, DEXA, completed, skipped, setup failure, command failure/not-found variants |
| Generic unsigned Release build | **PASS** |
| `verify_release_configuration.py` | **PASS** — version 1.0 (90), AppIcon, app-only HealthKit, matching App Group, Live Activity and Home widget |
| Release seam scan | **PASS** — no pilot/review fixture seams; `priority.skip.v1` present in Release app |
| Project generator determinism | **PASS** — `project.pbxproj` SHA-256 remained `1ed3fd6c1a25bb1a432c41624be97895fe1ef706eaca9f528a04783fcb100217` |
| `git diff --check` | **PASS** |

The Release build retains only pre-existing warnings: the unnecessary `nonisolated(unsafe)` marker in `PhysiqueOSApp.swift` and two `UIApplication.shared` main-actor warnings in `BackgroundExecutionAssertion.swift`. UI tests regenerated 14 existing widget snapshots; those test artifacts were restored exactly, and both candidate branches are clean.

## Backward compatibility and data

- The Server change is additive and remains compatible with shipped Build 90.
- Existing fields and command names are unchanged. Older clients safely ignore expanded capability projection on templates they do not render.
- Build 90's already command-driven Detail/notification paths can consume newly present supplement Skip without a new domain command; Build 91 adds full Home/evidence-template parity.
- Cached Native payloads lacking the expanded command decode with Skip unavailable; Native does not invent a capability.
- Existing reconciliation entries continue to resolve through `reminderId`; new writes add `priorityId` and retain the alias where applicable.
- No schema migration, historical rewrite, or backfill is required.

## Claude candidate overlap

### Claude A Evidence `a399387b`

There is **zero file overlap** with the combined Server/Web and Native Universal Skip candidates. No merge was performed.

### Claude B OP + Watch `b944ad1e`

There are exactly two overlapping Native files, with disjoint source hunks:

1. `ios/PhysiqueOS/Presentation/Home/PriorityDetailView.swift`
   - Universal Skip: base hunks `@@ -134,0 +135 @@`, `@@ -244,0 +246,4 @@`, `@@ -276,19 +281,20 @@`, and `@@ -296 +302,4 @@`; these place the universal action, retain evidence-primary behavior, and extract the shared Skip control.
   - Claude B: base hunks `@@ -71,0 +72,6 @@`, `@@ -231 +237 @@`, `@@ -237 +243 @@`, and `@@ -378 +384 @@`; these add navigation context and route Operating Plan destinations through the crumb title.
2. `ios/PhysiqueOSUITests/FoamRollingPriorityDetailUITests.swift`
   - Universal Skip: base hunks `@@ -35 +35 @@`, `@@ -37,4 +37,4 @@`, and `@@ -66,0 +67,3 @@`; these expand action-family and touch-target coverage.
   - Claude B: base hunk `@@ -204 +204 @@`; this changes the Operating Plan title expectation.

The textual hunks are disjoint, but both files require explicit semantic review after integration because they cover the same Priority Detail surface. No Claude B file was merged or modified here.

## Recommended deployment and Build 91 integration sequence

1. Verify that the configured Git remote is an authorized destination for this repository, then publish the Server/Web candidate, Native candidate, and this report-only branch without rewriting the local commits.
2. Integrate and deploy Server/Web commit `738ce668` first from production Server base `e7ffc671`. It is additive and safe for Build 90; do not deploy it from this task.
3. Integrate Claude B and Native commit `a379fa12` on the authorized Build 91 integration branch. Manually verify the two disjoint overlap files above, especially navigation context plus the shared Skip action zone.
4. Integrate Claude A. It has no file overlap, but re-run destination/evidence UI coverage because evidence-backed priorities now expose a secondary disposition.
5. Run the combined Server/Web/Native priority matrix, full Native tests, relevant iPhone UI, Release compile/configuration/seam gates, and an integrated smoke test against the deployed compatible Server.
6. Only in the separately authorized release task should Build 91 be bumped, archived, uploaded to TestFlight, or selected as release authority.

## Delivery blocker

An authorized push was attempted for the Server candidate. The security reviewer rejected it because ownership of the configured remote repository could not be verified, making disclosure to that destination unsafe. That condition applies equally to the Native and report refs, so they were not pushed. No additional push was attempted, no remote was changed, and no code was copied to an alternate service.

The implementation itself is locally complete and green. The task remains **HOLD** until the destination is verified and the three refs are published, after which the implementation is ready for the Build 91 integration sequence above.

## Notification

**PhysiqueOS Universal Priority Skip — implementation candidate complete locally; HOLD pending verified remote publication.**

**STOP.**
