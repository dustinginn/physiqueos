# Build 92 Morning Weigh-In context incident — root cause and isolated fix candidate

- Task ID: `build92-urgent-morning-checkin-context-read-20261008`
- Agent: Codex
- GitHub incident: issue #9, left open pending a shipped fix and Founder physical acceptance
- Shipped Native baseline: Build 92, `beaf5eff9d3c4147fba4dec095e8092c0fae9b91`
- Live Server: `84cc64e4e7205b2540bf78ea43afd1cbfb068d06`
- Live deployment: `32143aa4-90d4-496a-81b2-17f35a609fde`, ACTIVE 9/9
- Candidate branch: `codex/build92-morning-checkin-context-native-20261008`
- Candidate commit: `01db8b2e2bfc67e8517d4fcdc90e58edb508c5fd`
- Production mutation: none
- Deployment, TestFlight upload, or release: none

## Outcome

The actual failure is a narrow Server-to-Native decode contract mismatch, not a Server outage or a lost write.

The Server domain action is originally `{label, href}`. Before a Native envelope is sent, the client-safe projection intentionally rewrites each route into `{label, destination}`. The live Morning Check-In response therefore carried a valid `primaryAction` with a label and typed destination but no `href`. Build 92 declared `MorningCheckInReconciliationAction.href` as a required `String`. Swift rejected that nested action, which rejected the entire Morning Check-In payload as `invalidResponse`. The initial view task silently swallowed that error with `try?`, left the Complete button enabled, and only surfaced “Today's check-in context could not be loaded” when the user tapped it.

The failing tap did not write. The shipped `save()` guard requires `productionCheckIn.today` before it constructs or invokes the write request. The bounded production census independently found no October 8 Weight or daily check-in record at inspection time. No actual weight value, item title, evidence contents, or screenshot is included here.

## Production evidence

- `/live` returned the expected build identity and `/ready` returned 9/9.
- Incident-window logs showed two expired access-token responses followed by a successful refresh challenge and refresh. Subsequent `core.navigation.morning-check-in` reads completed successfully server-side in approximately 1.2–1.7 seconds. This rules out a persistent outage, pairing failure, and request timeout as the observed terminal cause.
- A bounded, owner-scoped, repeatable-read/read-only transaction verified `transaction_read_only=on`, performed only parameterized Morning Check-In/weight metadata reads, and explicitly rolled back.
- Sanitized response-shape census: envelope contract/resource/authority matched; `today` matched the incident date; required reconciliation fields `id`, `occurrenceKey`, `date`, and `title` were present non-null strings; both reconciliation actions had labels and typed destinations; both omitted `href`, exactly as the client-safe projection requires.
- The census found no October 8 Weight record and no October 8 daily-check-in record at inspection time. Previous-weight presence was checked without retrieving or publishing its value.

## Smallest safe fix

Five iOS files changed from the exact Build 92 baseline:

1. `MorningCheckInReconciliationAction` now decodes the live typed `destination` and the legacy/unprojected `href`. At least one remains mandatory, so malformed actions still reject the response rather than silently discarding required reconciliation work.
2. Morning evidence routing prefers the typed destination. The Server's shared `log` destination remains mapped to evidence intake for non-training evidence; training still opens the logger.
3. `morning-check-in` uses reload policy rather than the generic 90-second cache because it supplies date-bound write authority.
4. The view has explicit loading/error/retry state, disables Complete until valid Server context exists, performs one bounded automatic retry only for transient network/5xx/session-recovery failures, and provides a single-attempt manual retry.
5. Reloads and retries preserve a value already typed by the Founder. The client does not fabricate today's date, substitute an empty reconciliation selection, weaken required identities, or remove the pre-write guard.

No Server change was needed.

## Verification

- Focused Swift tests: 51 passed, 0 failed.
  - 6 exact FounderServerAPI Morning contract tests.
  - 43 Morning Check-In decode, state, retry, failure, reconciliation, timezone, and weight-preservation tests.
  - 2 WeightRead idempotency/lost-ack tests.
- The regression matrix covers the exact live `{label,destination}` action, legacy `{label,href}`, missing action destination, missing required identities, transient retry success, persistent 5xx fail-closed behavior, auth/contract failures without inappropriate automatic retry, manual retry, stale/fresh date reads, prior-day evidence selection, retained typed weight, disabled submit without authority, and repeated/lost-ack write safety.
- Relevant Server tests: 63 passed, 0 failed.
  - `CoreNavigationReadService.test.js`: 34/34.
  - `MorningPriorityReconciliationService.test.js` plus `MorningEvidenceRecoveryService.test.js`: 29/29.
- Generic iOS Simulator Release build: succeeded with code signing disabled.
- `git diff --check`: passed.
- Production-source no-review-seam scan: passed.

Xcode work used a separate shutdown simulator and separate DerivedData after Claude's active UI cases completed. Claude's process, simulator, result bundles, and Recovery work were not interrupted. The physical Founder iPhone was not terminated, relaunched, installed to, or otherwise disturbed, preserving the existing field and device state.

## Immediate workaround

At the time of the bounded read, no October 8 Weight record existed. The independent Log > Weight flow can therefore record the weight once without depending on Morning Check-In context. It records weight only and does not complete the prior-day reconciliation. Recheck authoritative state before using this workaround later; do not submit a duplicate if a record now exists.

## Publication and next decision

The isolated candidate branch is published for review. It is not merged into the broader Build 93 work. There was no deploy, TestFlight upload, release, or production data change.

Founder decision required: review the candidate, then explicitly authorize any separate hotfix TestFlight/release workflow. Keep issue #9 open until a fixed build ships and Morning Weigh-In passes physical-device acceptance.

Backlog proposal: add a cross-platform golden fixture for the client-safe projected Morning Check-In envelope. Consider filtering resolved evidence reviews for response-size performance separately; that was not the cause of this incident.
