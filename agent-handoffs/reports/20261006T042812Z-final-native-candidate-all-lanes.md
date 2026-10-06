# PhysiqueOS final Native candidate: all lanes integrated, release gates green (Claude)

- **Task:** `final-native-layer-evidence-reliability` (prompt commit `fd2287cb`, `20261006T034000Z-final-native-layer-evidence-reliability.md`).
- **Status:** **FINAL Native candidate published. STOPPED.** No build-number bump, no TestFlight upload, no Server deploy, no production data mutation.
- **Generated (UTC):** 2026-10-06T04:28:12Z

## Final Native authority

| Item | SHA |
|---|---|
| **Final Native candidate** | **`96e724a9`** = `96e724a9f40f9178a16ea492958c3acd4b1b282e` on `claude/batch3-integrated-on-workout-preview-20261005` (pushed) |
| Parent 1: clean integrated authority | `fc693aeb919efc6fa68a236092a7fa7f75767a19` |
| Parent 2: Evidence reliability (Batch 3-resolved) | `9fa2428c9fb5204b03c8f9930c6ace83ce63c262` (resolution of Build 87 `c3d9d257` onto Batch 3; **`c3d9d257` was not merged directly**) |
| Production Server (unchanged) | `b7eb1e39`, deployment `6fa4e887` |
| CFBundleVersion in candidate | 87 (unbumped); release state last uploaded = 87 |

Included authorities:
- **Batch 2 RC** `793462b1`: Log/Logger, Sources, You/Settings, Home appearance, L13 Workout Match `79a1a33d`, Home briefing identity `b1488c2e`, peptide clock fix `81943379`.
- **Workout reliability** Native `e9f8a957` via preview `70ebf753`: Watch-finish recap/PR/confetti, superset context, 2-B refill, 2-C contextual recommendations, completed-set immutability, Watch ack, latency instrumentation.
- **Batch 3 A–E** `f5257ae1` and the macro-color correction `75160ae8`, merged at `09211edb`.
- **Contract restorations** `fc693aeb`.
- **Evidence reliability** `9fa2428c`, merged at `96e724a9`.

## Merge proof

- `fc693aeb` × `9fa2428c`: **0 conflicts** (ort auto-merge of `FounderServerAPITests.swift` only).
- **No unrelated commits:** the merge brings in exactly one commit, `9fa2428c`.
- **Patch identity:** `git diff fc693aeb 96e724a9` and the preview's own delta `git diff f5257ae1 9fa2428c` have the **identical patch-id** (`f9f1ecb4…`). The merge adds exactly the reviewed reliability change, no more.
- **Files changed:**
  - `EvidenceView.swift`, `EvidenceViewModel.swift`;
  - tests: `EvidenceReadModelTests`, `FounderServerAPITests`, `RecoverySleepAcceptanceUITests`.
- No Server, auth, endpoint, persistence or project changes. The generator is byte-stable.

## Evidence reliability behavior retained (code + tests on `96e724a9`)

| Behavior | Where | Test (passed) |
|---|---|---|
| Newest load wins (generation guard) | `latestLoadID` guard on success and failure | `testStaleResponseCannotOverwriteNewerSuccess`, `testStaleFailureCannotOverwriteNewerSuccess` |
| Cancellation is non-terminal | `Task.isCancelled` / `CancellationError` / `URLError.cancelled` → no state change | `testCancelledFirstLoadIsNotTerminal`, `testTaskCancellationDuringReadDoesNotBecomeFailure` |
| A failed refresh over loaded Evidence keeps the hub | `refreshFailed` + "Couldn't refresh. Showing Evidence loaded earlier — pull to refresh." | `testFailedRefreshKeepsLastLoadedHub` |
| Classified failure copy (transient / session / reconnect / generic) | `message(for:)` | `testFailureMessagesAreClassified` |
| Try Again; retry shows loading | `evidence.hub.retry` → `load(trigger: .retry)` | `testNetworkFailureThenRetrySucceeds`, `testRetryFromFailureShowsLoadingWhileInFlight` |
| Accessible Try Again | Button labelled "Try Again" | UI `RecoverySleepAcceptanceUITests` (exists, hittable, label) |
| Pull to refresh | `.refreshable { load(trigger: .pullToRefresh) }` | Code |
| Foreground retry only after a failure; no healthy-foreground reload | `retryAfterForegroundIfNeeded()` guarded by `needsRetry` | `testForegroundRetriesOnlyAfterFailure` |
| Full production path recovers from a host-resolution outage (−1003) | `ProductionNativeAPI` + `ProductionEvidenceAPI` + VM | `testEvidenceHubRecoversFromHostResolutionOutage` |
| Bounded `EvidenceHubLoad` diagnostics | os.Logger records id, trigger, outcome, category, prior state, duration and failure count. Never payloads, identifiers, credentials or error text | Code |
| Batch 3 locked Evidence chrome kept | `EvidenceStateCard(… "evidence.hub.failure")` + locked page | `EvidenceHubTimelineUITests` 3/3 |
| No persisted cache or new source of truth; no endpoint fallback; no Server/auth weakening | Last hub is in memory only; no new URLs, credentials or storage in the diff | Diff audit |

## Final release gates on exact SHA `96e724a9`

| # | Gate | Result |
|---|---|---|
| 1 | Project generation + byte stability | Stable (no diff) |
| 2 | Full `PhysiqueOSTests` | **2066 run, 0 failures** (1 skipped). 2056 + 10 reliability tests |
| 3 | Full `PhysiqueOSWatchTests` | **49/49** |
| 4 | Full `PhysiqueOSUITests` | **60/60, 0 failures** |
| 5 | Evidence reliability focused tests | 10/10 (table above) |
| 6 | Evidence Hub/Timeline UI incl. Try Again | `EvidenceHubTimelineUITests` 3/3; `RecoverySleepAcceptanceUITests` 3/3 (accessible Try Again) |
| 7 | Batch 3 Evidence A–E journeys | Hub/Timeline 3, Training/Nutrition/Weight 11, Photos/DEXA 4 (incl. DEXA regression inventory), Intake/Review 5: all pass |
| 8 | Workout Match L13 Dark + Mineral | `testCheckpoint5WorkoutMatchDark` and `MineralLight` pass; routing unit test passes |
| 9 | Home briefing identity journeys | `testBriefingParityJourneys` plus the two FounderCorrection Briefing journeys pass |
| 10 | Training Logger / workout reliability journeys | All 16 `TrainingAcceptanceUITests` pass. `FinishLifecycleTests` (Watch-finish recap parity, superset ack) and contextual recommendation decoding pass |
| 11 | Peptide deterministic regression | `testSandboxChangeDoseKeepsHistoryAndPauseResumeWorkAgainstTheFixture` and all Peptide suites pass |
| 12 | Recovery/Sleep acceptance | 3/3 |
| 13 | Generic iOS **Release** compile | **BUILD SUCCEEDED**: `PhysiqueOSWatch.app` + `PhysiqueOSLiveActivity.appex` (`com.apple.widgetkit-extension`) embedded |
| 14 | Release binary seam scan | `physiqueos.evidence-review` 0, `physiqueos.appearance-review` 0, `SYNTHETIC REVIEW MEDIA` 0, `synthetic-photos` 0, `EvidenceReviewWorkflowFixture` 0. The only "fixture" strings are the Sandbox-mode bundled fixtures shipped since Build 87 (e.g. `review-fixture-001` in `LogFixture.json`) |

**Failure classification:** **no failures** on `96e724a9`, so nothing needed classifying.

The full unit suite again rewrote the committed `home-screen-widget-v1` PNGs as a test side effect. They were restored and not committed, and the tree is clean.

## Environment status

- Production Server remains **`b7eb1e39` / deployment `6fa4e887`**.
- The DNS incident remains **resolved**: ns65/ns66 are synchronized, the SOA is 2026100600, the CNAME is correct, and the TTL is 600.
- **No build bump, no TestFlight upload, no deploy.**

Incorporated lane reports (unchanged):
- `agent-handoffs/reports/20261006T003500Z-evidence-app-open-load-failure-audit.md`
- `agent-handoffs/reports/20261006T010500Z-evidence-dns-resync-verification.md`
- `agent-handoffs/reports/20261006T031851Z-batch3-multilane-integration-candidate.md`

## Next steps (each needs Founder authorization)

### 1. Build-number bump (88)

On `claude/batch3-integrated-on-workout-preview-20261005` @ `96e724a9`:
1. Set `APP_BUILD_NUMBER = 88` in `ios/scripts/generate_project.py`.
2. In `ios/PhysiqueOSTests/TrainingLoggerTests.swift`, set the pinned `CFBundleVersion` to `"88"`.
3. Run `python3 ios/scripts/generate_project.py`.
4. Run the full unit suite again, then commit `chore(ios): Build 88` and push.

### 2. Archive and TestFlight

Archive into a dated folder (a copy, not a symlink, or the upload guard refuses it):

```
xcodebuild archive -project ios/PhysiqueOS.xcodeproj -scheme PhysiqueOS -configuration Release -destination "generic/platform=iOS" -archivePath ~/Library/Developer/Xcode/Archives/<date>/PhysiqueOS-Build88-<sha>.xcarchive -allowProvisioningUpdates
```

Then upload through the guarded tool. Run the dry run first, and only then the real upload:

```
~/.physiqueos-release/bin/physiqueos-asc-upload upload --archive <archive> --bundle-id com.physiqueos.native.dev --version 1.0 --build 88
~/.physiqueos-release/bin/physiqueos-asc-upload upload --archive <archive> --bundle-id com.physiqueos.native.dev --version 1.0 --build 88 --execute --confirm "UPLOAD com.physiqueos.native.dev 1.0 (88)"
~/.physiqueos-release/bin/physiqueos-asc-upload status --delivery-id <id>
```

Wait for **VALID**, then install through TestFlight on iPhone and Watch.

### 3. Physical Founder acceptance priorities

1. **Real Progress Photos:** intake (pose confirmation, staged upload) → review → Photos page/inspector, with real media.
2. **Evidence recovery:** cold-open Evidence repeatedly (incl. after network loss/airplane mode). Check Try Again, pull to refresh, foreground retry, and that "Couldn't refresh" keeps the loaded hub.
3. **Watch superset responsiveness:** Complete Set taps alternate rounds with prompt acknowledgement.
4. **Watch-finished workout:** the phone recap, PR and confetti match a phone finish.
5. **Contextual superset Suggested/Maintain** recommendations from 2026-10-06 onward (Leg Extension + Sissy Squat).
6. **Redesigned Evidence surfaces:**
   - Hub/Timeline, Training/Activity, Nutrition/Weight, Photos/DEXA (disclosures, chart scrubbing, vertical scroll);
   - Add Evidence + generic Review (Nutrition macro colors match Nutrition Evidence);
   - Workout Match L13.

STOPPED.
