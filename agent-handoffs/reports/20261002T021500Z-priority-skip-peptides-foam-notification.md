# Priority Skip — peptides + Foam Rolling notification capability (final)

- Task id: `priority-skip-peptides-foam-notification-20261002`
- Prompt: `agent-handoffs/inbox/prompts/20261002T014600Z-priority-skip-peptides-foam-notification.md`
- Generated (UTC): 2026-10-02T02:15:00Z
- Status: **complete — Server DEPLOYED (additive contract); Native patch integration-ready, NOT uploaded (awaits consolidation with the Codex Home Screen Widget).**

## Exact authority
| Item | Value |
|---|---|
| Repository | `dustinginn/physiqueos` |
| Production Server before | `5804e88dac0db6bb04cf43647d6387efeab25906` (deployment `35f5cea0`, reverified) |
| **Production Server now** | **`2d967e48cb6a01e4a327934bbd81a405d3c26486`**, deployment **`421cae1a-dbc6-494c-9f73-9b8778e45efd` ACTIVE** (9/9) |
| Server branch | `claude/priority-skip-capability-server-20261002` (`14414229` feature + `2d967e48` review fixes), fast-forwarded onto `combined-app-platform-cutover` |
| SHA parity | control-plane `source_commit_hash` web+worker = 2d967e48; `/health/live` and `/health/ready` buildId `physiqueos-2d967e48-20261002`; fresh web + worker log envelopes `gitSha` = 2d967e48; ready status `ready`, 9/9 checks ready (schema `000014`, no migration) |
| **Native candidate** | branch `claude/priority-skip-peptides-foam-native-20261002`, **`88d597b25d49f773a12b7dcff3930b0f237a7a46`** (`b00e22b7` feature + `88d597b2` review fixes) |
| Native base | Build 78 shipping source `5911dd2a6f968c5a355ec68d3313f0e5e644d529` |
| Native build number | unchanged (78 in source); **no bump, no archive, no upload** |

## Audit (before)
- Peptide Priority Detail: never skippable (`protocol_reminder` excluded from the skip rule); `priority.skip.v1` returned `422 PRIORITY_SKIP_UNSUPPORTED`. Peptide notification: `specialized_workflow_required` + dose-aware `completionCommand` → Native `specializedActionable` (Complete + Snooze).
- Foam Rolling (recovery Support): skippable in Detail; notification specialized with completion command but no skip field → no notification Skip.
- `notificationAction` had no skip field; Build 78 Native guessed Skip from `direct_completion_allowed`.
- Peptide `skipped` was already a canonical state (Morning Check-In prior-day reconciliation); Home and the notification horizon already drop a skipped occurrence by reminder id; no consumer (adherence, dose history, effectiveDose, Briefing/V3/Confidence) treats a skip as taken.

## Contract change (Server, additive, backward compatible)
- One skip rule `isPrioritySkipSupportedReminder(reminder, { protocol })`, shared by read and write: ordinary `priority_detail` reminders; Protocol Support whose linked protocol is **peptide** or **recovery**. Never supplement Support, Morning Weigh-in, Progress Photos, DEXA. Write side resolves the linked protocol, and refuses a paused peptide date (`422 PRIORITY_OCCURRENCE_PAUSED`) after the idempotent already_completed / already_skipped checks.
- Every `notificationAction` (Home `todaysFocus`, notification horizon, Priority Detail) now carries `skipCommand`: `{ commandType: "priority.skip.v1", expectedVersion, payload: { priorityId, occurrenceDate } }` or `null`, independent of `classification`. Present only for an open, versioned, skip-eligible occurrence; on a notification it means "may be skipped on its own day" (the write still enforces today-only). Past-dated detail and paused occurrences carry `null`.
- Priority Detail: a today-open peptide gets `skippable: true` + `skipCommand`; a skipped peptide reads `status: "Skipped"`, `completable: false`, `completionContext: null`, no `doseAdjustable`, `skipContext`, "Skipped for this occurrence. No dose was recorded."
- Old clients ignore the new key (Native `JSONDecoder` ignores unknown keys; no Server allowlist strips it). Docs: `docs/NATIVE_PRODUCTION_CONTRACT_V1.md` updated.

## Peptide semantics
- Complete unchanged: dose-aware with the Server-planned dose/protocol (`completeReminderFromEvidence`, `effectiveDose`); "Took a different amount" unchanged.
- Skip = intentionally not taken for that occurrence: writes only the dated `dailyCheckIns` reconciliation entry (`status: skipped`) and bumps the reminder version (If-Match serialization). No `completionHistory`, no `effectiveDose`/amount, no evidence. Proven by tests. After a skip, completion returns `already_skipped` (first terminal state wins).

## Foam Rolling semantics
- Notification: existing Complete (Server-planned context, no dose) + new Skip + Snooze, via the same `priority.skip.v1`.

## Native patch (integration-ready)
- Decodes `notificationAction.skipCommand`; `PriorityOccurrenceCapabilities` exposes plainCompleteAllowed / specializedCompleteAllowed / skipAllowed / snoozeAllowed / requiresDetail. **Skip comes only from the Server skipCommand** (identity must match the completion command and the notification's own occurrence).
- Categories: `simpleCompletion` (Complete ✓, Skip, Snooze), `directCompletion` (Complete, Snooze), **`specializedSkippable`** (planned-dose Complete, Skip, Snooze — peptides, Foam Rolling), `specializedActionable` (planned-dose Complete, Snooze — supplements), **`skipOnly`** (Skip, Snooze), `specializedWorkflow`/`openOnly` (none). Dose/protocol can never route to plain Complete.
- Notification Skip submits only identity + version (no dose); background action with `.authenticationRequired`; Apple completion handler held until write + reconciliation; duplicate callbacks consumed once; stale version re-reads Home's skipCommand once; already-completed withdraws the reminder; failures change nothing and stay retryable; skip haptic only after success and only in foreground. Snoozed copies keep the skip command. Build 78-delivered `simpleCompletion` banners keep working through a narrow fallback; nothing else falls back.
- Priority Detail: existing Mark Skipped (subordinate to Mark Complete, confirmation dialog) now appears for peptides from the Server contract; peptide copy: "Today's dose will be recorded as skipped (not taken). No amount is recorded…".

## Tests / review
- **Server:** changed/added suites green except 7 known base failures (time-of-day label drift, identical on 5804e88d). Full unit suite candidate 9842 tests vs base 9827: **0 new deterministic failures** (3 script tests flaked under machine load and pass in isolation on both trees). New coverage: rule matrix (peptide/recovery/supplement/orphan/inactive/workflow), skipCommand shape and absence, peptide skip writes no dose/completion/evidence, idempotent replay, completion-after-skip no-op, already_completed, stale 412, paused 422, supplement 422, past/future 422, Home peptide skipCommand, Home drops skipped peptide, supplement null, detail open/skipped/paused/past/future/completed, Foam notification skipCommand.
- **Native:** full unit suite on exact `88d597b2`: **1873 tests, 1 known pre-existing failure** (`PeptideSupportEditorViewModelTests.testSandboxChangeDose…`, also fails on Build 77/78). Focused notification/detail/contract suites 361/361. New coverage: old/new decode, resolver, Complete+Skip coexistence, peptide/Foam/supplement/paused/skip-only, no dose on skip, peptide Complete keeps dose, snooze keeps skip, Build 78 fallback, no fallback for specialized, mismatched identity refused, already-completed, stale retry, duplicate, haptic once, peptide Detail skip writes no completion, "Took a different amount" unchanged. Not run: UI journeys (notification actions are not drivable from XCUITest), Release archive (no build requested).
- **Independent reviews:** Server review — no P0/P1, "nothing blocks deploy"; P2s fixed in `2d967e48` (past-dated detail skipCommand, Skipped-not-Paused, unconditional supplement test) and delta re-reviewed: no blockers. Native review — no P0, no code P1; P1 = deploy order (now satisfied); P2s fixed in `88d597b2`.

## Integration instructions (next consolidated Native build)
1. Server `2d967e48` is already live — required first (Native Skip depends on `skipCommand`; without it simple reminders lose notification Skip).
2. Merge `claude/priority-skip-peptides-foam-native-20261002` @ `88d597b2` with the Codex Home Screen Widget candidate onto Build 78 `5911dd2a`. This patch touches only: `Contracts/PriorityOccurrenceCapabilities.swift`, `Contracts/PriorityReadModel.swift` (additive type), `Networking/PriorityNotification{Categories,Delegate,Scheduler}.swift`, `Presentation/Home/PriorityDetailView.swift` (copy), two test files. No project/generator, Info.plist or extension changes.
3. Then bump the build number (79 if 78 is still latest), run the full suite, Release archive and the guarded upload.
4. Before upload, confirm on device or a read-only probe that Home `notificationOccurrences[].notificationAction.skipCommand` is non-null for a peptide and Foam Rolling.

## Founder acceptance (after the consolidated build)
- Peptide notification: long-press → Complete, Skip, Snooze. Skip → Home/Detail show Skipped; no dose recorded; Complete still records the planned dose.
- Peptide Priority Detail: Mark Complete + "Took a different amount" unchanged; Mark Skipped present (confirmation).
- Foam Rolling notification: Complete, Skip, Snooze.
- Supplement notification: Complete, Snooze (no Skip). Morning Check-In/weight: no actions.
- Note: Build 78 (already installed) now shows Mark Skipped on peptide Priority Detail immediately (it renders the Server's `skippable` generically); its notifications are unchanged until the next build.

## Known limitations / risks
- No un-skip: a mis-tapped notification Skip makes that day's dose unloggable (completion returns already_skipped; Morning Check-In excludes it). Notification Skip has no confirmation (iOS actions cannot confirm). Consider an Undo in a later scope.
- A peptide skip writes a same-day dailyCheckIn, as recovery skips and Morning Check-In already do; the Briefing focus drops the skipped peptide by the existing rule. No Briefing/V3/Confidence/Sleep/Recovery code changed; no historical records mutated.
- Supplement Skip remains a deferred product decision.

## Rollback
Server: fast-forward is not reversible without a force push; rollback = push `5804e88d` to `combined-app-platform-cutover` (Founder-authorized force), restore the 4 spec stamps (`PHYSIQUEOS_GIT_SHA`/`PHYSIQUEOS_BUILD_ID` on web+worker), `create-deployment --force-rebuild`. Build 78 is compatible with both.

## Housekeeping
Disk: 21 GiB at start; fell to 12 GiB during the final Native suite because of concurrent sessions (below the 15 GiB floor). I then deleted only this lane's own DerivedData, result bundles, a duplicate job-local archive copy and private simulator (→ 14 GiB) and ran no further heavy operations. The retained Build 78 archive in Xcode Archives was not touched. No local-only work; no Founder data.
