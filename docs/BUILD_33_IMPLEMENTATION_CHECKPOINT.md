# Build 33 reconciled implementation checkpoint

This is an implementation-side acceptance record, not a deployment or physical-device acceptance claim. The matching Build 33 server is not deployed. Native remains version 1.0 (32); no shipping-number increment or TestFlight upload is authorized.

## Authority and scope

Continued the existing branches, preserving all earlier Build 33 work:

- Native: `claude/native-v1-build33-operating-plan-notifications-training`, takeover `7fd3f28e7b98d61cd069214c2cf63275c8525dbf`; intermediate Supplement checkpoint `bb9b7f4f`.
- Server: `claude/server-build33-operating-plan-notifications-training`, takeover `de9d71ddb443629848c44d53db204ea428d59804`; intermediate Supplement checkpoint `6bfa4a0e`.
- Accepted production authority: `dc5f48f29c3e7d24a7c40b3c411619d635209618`. No Build 33 deployment or production mutation occurred.
- Pre-existing untracked server `scripts/auditDexaConfirmationFailure.mjs` remains untouched and unstaged.
- Confidence V3, Narrative V3, HealthKit, their worktrees, archives, signing/account material and forensic artifacts remain outside this work.

## Concurrent-writer reconciliation

Claude's confirmed concurrent heads were Native `56df385eb620df9c673ead22346370e807f93e8c` and server `96a82d82f65b124f1de4cdfcd3d978e05406068d`. Their Supplement ancestors are Native `bb9b7f4f78e79b241553804d2a0e16f4ec3e9de8` and server `6bfa4a0eaea84a0fad75ca88ca63bb94766e1b93`. Claude is stopped; Codex now owns both worktrees exclusively.

Both pre-collision Codex Peptide heads are in ancestry. The server Peptide service/API transition remained unchanged; the only subsequent Peptide view change replaced a sandbox formatting call with shared presentation formatting. The statement that the execution/dosing editor was deferred is contradicted by current source and decode/round-trip tests. No cherry-pick, replacement branch, reset, forced push or second Peptide transition was necessary.

| Area | Comparison / resolution |
| --- | --- |
| Peptides | Same canonical implementation retained; shared formatting and runtime fence are compatible additions |
| Nutrition / Training / Recovery / Tracking | Existing domain transitions retained; typed landing and bounded roll-up are additive |
| Energy | Compatible addition: canonical read, enforced intentionally read-only contract |
| Supplements | Compatible addition: shared Web/Native Support and strategy/lifecycle transitions, dual/version fences |
| Coaching Updates | Compatible addition: shared composite transition, all participant fences, atomic persistence |
| Landing / roll-up / reads | Compatible composition: server-owned typed destinations and bounded canonical read contracts |
| Atomicity / concurrency | Shared metadata fence strengthens cross-transport consistency; domain-specific tokens remain required |
| Sandbox / Home / notificationAction | Explicit production branches and canonical invalidation/propagation retained; no second schedule state |
| Workout durability | Earlier committed scope reference was incorrect; preserved corrective diff remains necessary and is applied on top |
| My Library / duplicate creation | Earlier Native error handling was incomplete; corrective membership acknowledgement and explicit candidate selection supersede it |
| Workout Detail | Structured-summary suppression retained; corrective telemetry/header and Apple-only de-duplication strengthens the invariant |

The workout diff and its three original fixture-independent tests were backed up before editing. Claude's commits did not overlap `src/app/evidence/review/[reviewId]/actions.js`. At the concurrent HEAD, `executeEvidenceReviewConfirmation` referenced `committedPackage`, which is local to a different function (`createHandlers`), causing a ReferenceError before confirmation branching. The correction examines the authoritative reviewed `evidencePackage`, excluding removed Training items. Four deterministic tests now prove the persistence barrier, immediate real Core Log read visibility, failure rejection/replay, unchanged non-Training asynchronous confirmation, and excluded-Training scope safety. Only `canonical_commit` is synchronous for Training; supporting evidence and downstream continuation remain asynchronous.

A second defect existed at the HTTP boundary: the generic continuation-error handler converted Training canonical failures into accepted staged receipts, and Native accepted such receipts without checking confirmation durability. The Training-only boundary now rejects failed/pending canonical confirmation with a retry-safe 503. The real confirmation action projects explicit `trainingSessionDurable` only after canonical_commit has executed or a completed checkpoint has been durably validated. Native requires that acknowledgement (or fully confirmed status), without polling or waiting for downstream work. Tests cover both failure/pending responses and same-idempotency-key Native retry. Other evidence types retain asynchronous accepted receipts.

Catalog corrections reuse the existing exact-name/alias policy in one shared helper that retains all distinct conflicts. A conflict creates no identity or membership. Native surfaces existing candidates for explicit selection, then persists membership and re-fetches the authoritative catalog. Failed membership writes no longer claim durable membership. No first-match guess or duplicate matcher was introduced in Swift.

Changed presentation error messages no longer expose canonical identity/revision/version terminology; unknown Evidence statuses/types use neutral labels, not raw backend enums. Workout Summary renders typed telemetry once, without repeating calories/duration in the header or generated Apple-only summary. Legacy summary content remains available only when neither typed telemetry nor structured exercises exists.

Date/time review covered presentation formatter call sites and shared calendar-date, chronology, editor schedule, greeting, notification and telemetry boundaries. Two corrective regressions cover local-noon date anchoring at UTC-12/UTC+14 (fixed UTC noon fails at UTC+14), invalid calendar dates, and friendly fractional-instant/date-only workout labels. Canonical schedule/calendar ownership is unchanged.

## Full Build 33 requirement audit

Implementation classification does not substitute for Founder device acceptance. Inherited working behavior is preserved rather than recreated. Final automated results are appended after validation.

| # | Requirement | Classification | Source / evidence |
| --- | --- | --- | --- |
| 1 | Training diagnostic/internal copy cleanup | COMPLETE | Training presentation uses user-facing summaries; new catalog/confirmation wording cleaned |
| 2 | Midweek Priority Muscle Groups share canonical Training assessment | COMPLETE | Midweek uses TrainingPerformanceIntelligenceReport → WeeklyTrainingPresentation → shared priority selector; Native consumes projection |
| 3 | Workout confirmation latency | COMPLETE | Supporting evidence prewarm/post-commit seam; only Training canonical_commit synchronous; device timing pending |
| 4 | Workout Complete polish | COMPLETE | Existing unified completion/performance presentation retained |
| 5 | Upload auto-opens Review when quickly ready | COMPLETE | ProductionEvidenceUploadView bounded three-second follow-up routes to real review |
| 6 | Fast evidence confirmation completes in-flow | COMPLETE | EvidenceReviewDetailView bounded authoritative confirmation follow-up |
| 7 | Review-ready fallback notification | PARTIAL | Local running-app task suppresses viewed/confirmed reviews; terminated-app delivery is not implemented or proven; Founder scope clarification requested |
| 8 | Nutrition macro colors in Review | COMPLETE | Existing semantic Calories/Protein/Carbs/Fat tokens |
| 9 | Cached Home/Log/Evidence avoid blocking reloads | COMPLETE | Retained view models + cache-first canonical reads; no load-state reset on ordinary re-entry |
| 10 | Date/time audit and fixes | COMPLETE | Calendar date vs instant boundaries, chronology/editor/notification regression suites; extreme-offset and fractional-date corrections |
| 11 | Home priority completion animation | COMPLETE | Acknowledged checkmark hold, collapse/reflow, reduced-motion handling |
| 12 | Actionable notifications | COMPLETE | Server classification/time; canonical direct command, local Snooze, specialized routing, stale cancellation; physical delivery unproven |
| 13 | Notification diagnostics / physical delivery | AWAITING FOUNDER PHYSICAL ACCEPTANCE | TestFlight-reachable diagnostics, timezone/settings/errors/pending/next-fire/classification preserved |
| 14 | Evidence internal provenance hidden | COMPLETE | Redundant internal-reference UI removed; source labels/canonical provenance retained |
| 15 | Workout logged requires durable TrainingSession | COMPLETE | Corrected real confirmation action + controlled canonical persistence barrier tests |
| 16 | Immediate Log visibility | COMPLETE | Actual evidence-review-queue cache invalidation + real Core Log read after durable canonical commit |
| 17 | Unique Apple/Logger strength reconciliation | COMPLETE | Both orders, ambiguity/cardio separation, provenance and replay tests |
| 18 | Unified Workout Detail | COMPLETE | Telemetry/header/generated-summary de-duplication; exercise/set/relationship tests; UI journey expectation corrected |
| 19 | My Library / All Exercises | COMPLETE | Canonical performed-history UNION explicit membership; failed writes do not fabricate membership |
| 20 | Full-catalog duplicate prevention | COMPLETE | Shared canonical exact/alias conflicts, explicit existing/candidate choice, one new identity + membership |
| 21 | All eight Operating Plan domains | COMPLETE | Eight-domain production-shaped read/navigation and canonical save/readback tests |
| 22 | Typed production landing routes | COMPLETE | Server destination projection retained by Native adapter/router; no Swift Web-route parsing |
| 23 | No production OperatingPlanSandboxStore path | COMPLETE | Explicit authority branches; auxiliary fixture builders fail closed; source/decode tests |
| 24 | Domain concurrency | COMPLETE | Domain-specific token matrix below; stale editor rejection tests |
| 25 | Single-source schedules for Home/notifications | COMPLETE | Canonical execution/reminder edits, Home projection and Native reconciliation invalidation |
| 26 | Energy intentionally read-only | COMPLETE | Server assertion and Native validation; no write/editor |
| 27 | Coaching composite atomicity | COMPLETE | One canonical transaction across cadence/Photos/DEXA, rollback/receipt replay tests |
| 28 | Peptide specialized/dose-aware priority | COMPLETE | Existing canonical completion classification retained |
| 29 | Supplement Support/strategy/lifecycle | COMPLETE | Shared canonical transitions; create/edit/pause/restore/history/reminder/version tests |
| 30 | No HealthKit implementation | COMPLETE | No HealthKit worktree or implementation changed |
| 31 | No Confidence V3 / Narrative V3 integration | COMPLETE | Separate worktrees and architecture remain untouched |
| 32 | No production mutation during development | COMPLETE | Isolated tests/builds only; no deploy/upload/production commands |

The old unconditional structured-workout “Session Details” UI expectation is SUPERSEDED by the approved unified presentation. No known scope item is silently marked complete because unrelated tests pass. The Review-ready running-app limitation remains explicit pending Founder clarification.

## Landing and bounded protocol roll-up

`OperatingPlanReadService` projects existing canonical Web destination authority into typed `{id, parameters}` destinations on the server. Native decodes `plan.strategy` / `plan.support` and routes through the shared router. It never interprets arbitrary Web href strings or maps display card names to routes. The production landing adapter no longer discards destinations.

An item without an established detail/editor href gets a typed, server-projected read-only configuration-status destination, not fixture content or an inert card. Existing canonical Web domain availability remains unchanged.

`operating-plan-protocol-domain` is a bounded owner-scoped read for Recovery, Peptides and Supplements, using the same extracted `StrategyDomainReadService` model as Web. It projects current methods, presentation summaries, canonical identities/current versions, lifecycle state and typed Support destinations; no runtime store is shipped to Swift. Ambiguous execution counterparts fail closed. Native Supplement roll-ups include paused methods. Its server-owned landing projection retains Supplements even if all are paused, so canonical Restore remains reachable; Web keeps its prior active-only landing default.

## Eight-domain reachability and concurrency matrix

Every row below has a typed landing destination, tappable card, bounded canonical production read, no production sandbox dependency, focused decode/navigation tests, and fail-closed production read errors. Writes reject invalid/stale editors without accepting partial success.

| Domain | Production destination/read | Canonical write | Intentionally read-only | Canonical concurrency |
| --- | --- | --- | --- | --- |
| Energy Strategy | Strategy detail / `operating-plan-energy-strategy` | None | Yes | Coherent bounded canonical read; no editor token |
| Nutrition | Strategy detail/editor / `operating-plan-nutrition-strategy` | `operating-plan.nutrition-strategy.save.v1` | No | `expectedCurrentVersionId`; canonical active-protocol successor |
| Training | Current strategy detail/editor / `operating-plan-training-strategy` | `operating-plan.training-strategy.save.v1` | No | Its own validated strategy successor using `expectedCurrentVersionId` |
| Recovery | Canonical protocol roll-up → execution Support / `operating-plan-recurring-support` | `operating-plan.recurring-support.save.v1` | No | Execution `executionRevision` / expected revision; atomic execution + reminder |
| Peptides | Canonical roll-up → Peptide Support / `operating-plan-peptide-support` | `operating-plan.peptide-support.save.v1` | No | Execution `executionRevision`; atomic execution/phases/history + reminder |
| Supplements | Canonical roll-up → Support or Strategy editor / `operating-plan-supplement-support`, `operating-plan-supplement-strategy-editor` | Support, strategy create/edit and lifecycle commands | No | Support: `supplementVersionId` **and** execution revision; Strategy/Pause/Restore: `expectedCurrentVersionId` |
| Tracking | `tracking` → canonical Morning Weigh-In Support | Same recurring-Support command | No | Execution `executionRevision`; atomic execution + reminder |
| Coaching Updates | Strategy detail/composite editor / `operating-plan-coaching-updates` | `operating-plan.coaching-updates.save.v1` | No | Global runtime revision + scoped semantic digest; Coaching version; Photos version + digest; DEXA execution revision |

The eight-domain production-shaped test follows every typed landing destination into its bounded read, including Recovery's execution destination, Tracking's canonical execution, and each domain roll-up. Focused canonical command tests cover save/readback, invalid/no-op edits and optimistic concurrency for the editable domains.

| Domain | Home propagation | Notification propagation | Save/readback and focused validation |
| --- | --- | --- | --- |
| Energy Strategy | Existing canonical strategy composition | No new schedule mutation | Real canonical read, intentional read-only contract, unavailable/wrong-domain rejection |
| Nutrition | Canonical strategy successor consumed by existing readers | No separate local schedule | Successor/unchanged/invalid/stale tests; Native decode/submission |
| Training | Canonical strategy successor consumed by existing readers | No separate local schedule | Successor/unchanged/invalid/stale tests; Native decode/submission |
| Recovery | Canonical execution/reminder fields | Home notification time follows canonical reminder/execution | Focused Web/canonical recurring-Support and Native tests, exact schedule propagation |
| Peptides | Canonical execution/reminder + phases | Specialized, dose-aware workflow retained | Dose-only, schedule-only, combined, phase/history, reminder, end/open-ended and stale tests |
| Supplements | Canonical active strategy/lifecycle + execution/reminder | Saved `08:40` reaches Home's specialized notification action | Web shared-transition tests; create/edit/pause/restore/duplicates, dual stale fences, end/open-ended/history and Native payload readback |
| Tracking | Canonical Morning Weigh-In Support | Morning Check-In semantics retained | Canonical recurring-Support read/write; Native decode/round-trip and guarded failures |
| Coaching Updates | Coaching/Photos/DEXA canonical composite | DEXA `08:30` reaches Home's specialized notification action; photo reminder enablement/recurrence canonical | Web/extracted transition readback equivalence; all stale fences; composite readback/history; injected mid-persistence rollback; receipt replay; Native single composite submission |

## Supplements

Web and Native invoke shared canonical Support and Strategy/lifecycle transitions rather than parallel mutation implementations. Support preserves quantity/unit, frequency/days/time/start/end/open-ended behavior, canonical identities, relationships, reminders, completion and timeline history. Strategy uses the existing successor policy, canonical Goal selection and duplicate-name validation. Pause/Restore retains lifecycle history and version safety. Native does not supply domain matching, lifecycle or schedule policy.

## Coaching Updates atomicity

The Web's existing composite mutation was extracted into prepare/apply/verify functions. Both transports retain the same Coaching Updates, Progress Photos recurrence, photo-reminder enablement and DEXA appointment transition and protected historical evidence checks. The existing requirement for a valid future DEXA appointment in a composite save remains unchanged.

Native receives only presentation/editor fields and concurrency tokens. The server reconstructs a requested recurrence from canonical state, retaining timezone/anchor/relationship semantics, prepares every participant before mutation, verifies the result and persists changed protocols/versions/executions/reminders in one canonical command transaction. The runtime revision advances in the same transaction. An injected second-record persistence failure rolls back records and the receipt; an exact replay returns the existing receipt without duplicate successor versions.

Canonical Native command transactions now share the Web runtime's owner advisory lock and advance canonical runtime metadata when records change. This closes the pre-existing gap where a Native dependency edit could leave the Web/Native composite revision fence stale. Domain-specific version/revision checks are retained, not replaced by the global fence. Coaching's read rows and runtime metadata are projected from the same SQL statement snapshot; canonical source ordering is preserved for digest parity. Missing revision authority fails closed. No unrelated runtime reconstruction is added.

## Sandbox isolation proof and explicit exclusions

- Landing, current strategy detail/editor, protocol roll-ups and all production Support paths have explicit authority branches and use typed production APIs. Read/save errors do not access fixture fallbacks.
- Editors clear loaded models/tokens before production loading and gate presentation on canonical editor context.
- Shared schedule formatting was moved into presentation code; production UI no longer invokes a Sandbox store merely to format a time.
- The legacy Training protocol-creation builder contains a hardcoded fixture Goal/version. It is blocked in production. The active canonical Training strategy remains production-reachable/editable; this checkpoint does **not** claim a new production Training protocol-creation workflow.
- The standalone legacy DEXA appointment sandbox editor is blocked in production. Canonical DEXA configuration is available through the atomic Coaching Updates editor; this checkpoint does **not** claim a separate production DEXA save contract.
- The Goal phase-transition router is blocked under Founder Production, consistent with the existing transition write restriction, so its sandbox Energy mutation cannot be reached through production routing.
- Sandbox implementations remain intentionally available only for Sandbox authority, tests and previews. Focused source-boundary assertions, typed destination/decode tests, fail-closed API tests and full Native regression validation cover these boundaries.

## Preserved Build 33 invariants

- Notification diagnostics remain available for physical acceptance: explicit timezone, authorization/delivery settings, denied notice, captured scheduling errors, pending requests, trigger/next-fire reporting and reconciliation classification. Server owns `notificationAction`; direct completion uses `priority.complete.v1`; local Snooze remains local; specialized workflows remain specialized. Physical delivery is **not** proven.
- Training confirmation executes only `canonical_commit` synchronously; all subsequent orchestration remains asynchronous. New fixture-independent tests uncovered and fixed an out-of-scope `committedPackage` reference from the earlier Build 33 implementation. The real Native confirmation action is tested against a canonical persistence barrier: no response before durability, immediate actual Core Log read visibility, failed persistence rejection, idempotent replay and unchanged non-Training async behavior. Native's actual Log cache key remains `evidence-review-queue` and is invalidated correctly.
- Apple exercise-less strength telemetry and Logger structured/telemetry-less observations reconcile only with exactly one compatible counterpart, in either order. Ambiguous strength days and cardio remain separate; provenance and replay protection remain intact.
- My Library remains canonical performed-history UNION explicit membership, with All Exercises separately browsable. Create New Exercise checks the full canonical catalog; no Swift duplicate policy, hard deletion or production Training mutation was added.
- Workout Detail renders workout telemetry once and structured exercises/sets once, retaining relationships; generated serialization is withheld when structured exercises exist.
- Evidence Review's redundant raw internal-provenance line remains removed; canonical provenance remains stored.

## Validation and storage closeout

Final automated gate results and final commit identities are recorded in the completion response. Broad missing-private-fixture and invalid-date failures are compared against the untouched takeover authority, not concealed as green results.

Only explicitly task-owned isolated build output and temporary parent-baseline test copies are disposable. No protected archive, worktree, signing material, DeviceSupport, simulator/runtime/device, forensic artifact or another macOS user's data is removed.

Remaining Founder physical acceptance: all eight live destinations against the authorized deployed server; production save/readback/stale-editor checks without fixture fallback; canonical schedule→Home→local-notification diagnostics/delivery; Workout logged→immediate Log visibility; one Apple/Logger strength workout and ambiguity/cardio controls; My Library/full-catalog duplicate selection; Workout Detail and Evidence presentation.

No production data mutation, server deployment, TestFlight upload or incremental recurring service cost occurred.
