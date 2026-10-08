# Build 92 consolidated Native candidate validated

Task: `agent-handoffs/inbox/prompts/20261007-build92-three-lane-native-integration.md` at `0f25f7660180505c4373fda88a08e11d82ef54fe`
Founder approval: `3630d60193b838ea792f0aab8b97525c0f9aa9f7`

## Result

The exact three Build 91-based Native candidates are integrated, the remaining Logger U01 seam is closed, combined validation is complete, and the isolated branch is published.

| Item | Authority |
|---|---|
| Shipped base | Build 91 `106f05183ea3e2328496acce0636dc087116bbce`, version `1.0 (91)` |
| Training Variants input | `39b818e214c858ab127f891e3010760ba2ad9b17` |
| Final redesign input | `f6b394233b21429044af100dc180657132da5e30` |
| HealthKit authorization input | `6c52df29191ae27b1337bec0c8048f602052747c` |
| Integrated branch | `codex/native-build92-three-lane-integration-20261007` |
| Integrated candidate | **`56c51e4f7f41b521845dcfc2b9f0583407494e3c`** |
| Live Server | `84cc64e4e7205b2540bf78ea43afd1cbfb068d06`; deployment `32143aa4-90d4-496a-81b2-17f35a609fde`, ACTIVE 9/9 |

The branch was normally pushed to verified `git@github.com:dustinginn/physiqueos.git`. No build bump, archive, TestFlight upload, release-pointer update, Native deployment, Server mutation, seed, or production data write was performed.

## Lineage, union, and overlap decisions

Each input commit has exact parent `106f05183ea3e2328496acce0636dc087116bbce`; all remote tips were freshly verified before publication. The integrated history retains the three candidate deltas as separate cherry-picked commits, followed by one bounded integration commit:

1. `e9344c6e` — exact Training Variants patch from `39b818e2`.
2. `33f27e86` — exact final redesign patch from `f6b39423`.
3. `045af2e9` — exact HealthKit authorization patch from `6c52df29`.
4. `56c51e4f` — Logger refusal presentation and stale UI-helper repair only.

The final Build 91 delta is **50 files, +2,193 / -304**. Candidate file lists contain one actual candidate-to-candidate overlap: `ios/PhysiqueOSWatchTests/WatchWorkoutFinishStateTests.swift` between Training Variants and HealthKit. The combined test file preserves both optional `variantLabel` coverage and HealthKit automatic/direct, exactly-once, recovery, finish, and save coverage. The shipping Watch path also preserves:

- per-exercise variant projection and display-only Watch `variantLabel`;
- `.automatic` HealthKit presentation for phone-start recovery;
- `.direct` presentation for a direct Watch start or retry;
- exactly-once workout start and late phone-start recovery.

The final redesign and Training Variants candidates have no actual shared file. The expected semantic vicinity in Training presentation was still audited: variant history/display remains present and the redesign's supporting-media loading/error treatment remains present. No whole-file conflict choice was made.

The approved DEBUG-only visual-review branch (`claude/native-build92-training-variants-visual-review-20261008`, head `7c17645e`) was not merged; `7c17645e` is not an ancestor of the candidate. Energy phase history is unchanged and deferred. Settings architecture remains separate.

## Logger U01 integration

The integration commit changes only:

- `ios/PhysiqueOS/Presentation/TrainingLogger/TrainingLoggerView.swift`
- `ios/PhysiqueOS/Presentation/TrainingLogger/TrainingLoggerViewModel.swift`
- `ios/PhysiqueOSTests/TrainingLoggerTests.swift`
- `ios/PhysiqueOSUITests/TrainingAcceptanceUITests.swift`

Result:

- Every rejected start/session, discard, cancel, set/rest, and note mutation maps to truthful inline red issue presentation without clearing the draft, sets, or selected variant.
- Paused, stale-revision, no-longer-present, nonmutable/submitting, invalid-set, unauthorized, origin, and device-persistence refusals have distinct non-success copy.
- Discard and cancel retain the exact saved workout when authority refuses the mutation.
- A same-day, same-mode double tap on the just-created pristine Area step is coalesced; prepared or saved sibling workouts are not collapsed.
- The two stale UI tests now account for Build 91 Log's legitimate auto-route into an active workout, return through the shipping Back control without mutating the draft, and select the exact `log.trainingLogger` identifier.
- New regression coverage pins refusal copy, non-destructive discard, double-tap identity, inline accessibility identity, and the shipping Log helper route.

## Preservation: DEXA and Sleep

The HealthKit candidate's exact authorization semantics survived integration:

- automatic launch/recovery paths preflight exact scopes and cannot present consent;
- deliberate foreground phone and direct Watch actions may present only when HealthKit says the exact scope should request;
- the process-wide coordinator serializes and coalesces duplicate iPhone requests;
- DEXA enablement remains write-only for Body Fat Percentage and Lean Body Mass, adds no DEXA reads or Body Mass write, and preserves write-status/reconciliation behavior;
- automatic startup remains limited to active Activity, Nutrition, and Workout reads;
- dormant Sleep is excluded from startup and requested only by its active persisted flow or Sleep diagnostic;
- request status is never mistaken for read authorization, and empty reads remain empty.

The full and focused suites retain DEXA writeback, Sleep ingestion/timing, automatic synchronization, HealthKit capability, Founder canary, Watch authorization, and workout lifecycle regressions.

## Validation

Heavy Xcode work was serialized. Process and storage census was taken before each stage; no other lane's `xcodebuild` was active when a gate began.

| Gate | Final result |
|---|---|
| Changed Swift frontend parse | Passed |
| Focused cross-lane contract gate | 961 contract cases green after correcting one over-broad source assertion; the corrected assertion was rerun green |
| Full `PhysiqueOSTests` | **2,223 executed, 0 failures, 1 expected live-capture skip** |
| Full `PhysiqueOSWatchTests` | **75 / 75 passed** |
| Functional iPhone UI | **10 / 10 passed** after repairing the two stale Log helper cases; covers Home Dark/Light, Evidence DEXA, Logger Dark/Light, Workout Match Dark/Light, Ordinary-only fallback, rest preference, and Save & Leave restoration |
| Watch UI, 49 mm | 10 executed: **9 passed, 1 known baseline limitation reproduced** |
| Watch UI, 42 mm | 10 executed: **9 passed, the same single known baseline limitation reproduced** |
| Generic unsigned Release | **BUILD SUCCEEDED**; dependency graph compiled iPhone app, Watch app, and combined Home widget/Live Activity extension |
| Release configuration | Passed: version `1.0 (91)`, AppIcon, app-only HealthKit capability, matching App Group, Widget/Live Activity extension |
| Project generator | Two consecutive runs reproduced `project.pbxproj` byte-for-byte; SHA-256 `ea54bdeec9d4feca206800f674b55cc592374d63d7e2201094579e8ac5ccee5d` |
| Release seam scan | 0 review launch flags/fixture type strings in app, Watch, or extension binaries |
| Diff hygiene | `git diff --check` clean; worktree clean at published SHA |

The one Watch UI failure is the pre-existing DEBUG fixture boundary in `testFinalSetFinishShowsConfirmationOnThePrimarySurfaceAndNotYetReturns`: after choosing **Not Yet**, the standalone Watch simulator has no paired phone WCSession acknowledgement. It failed at the same post-dismissal assertion on both sizes; all other Watch UI cases passed. It was reproduced and isolated rather than hidden with an excluded-test run.

One bounded Logger test attempt encountered a CoreSimulator launch-service `No such process` before execution. Restarting only the disposable iPhone simulator produced a clean 1/1 rerun. Two Watch UI invocations printed all results and then hung only while Xcode finalized the result log; their exact completed runner processes were terminated after the result counts were captured. These were infrastructure cleanup events, not product failures.

## Live Server compatibility

Claude's guarded report-only deployment record is `9e2084c8ee2385ced7a6e1d674eacf52f3523fb1`. This lane independently verified:

- active deployment `32143aa4-90d4-496a-81b2-17f35a609fde`, phase `ACTIVE`, success 9/9;
- both `web` and `worker` source SHA exactly `84cc64e4e7205b2540bf78ea43afd1cbfb068d06`;
- no pending deployment;
- `/api/v1/health/live` returns `status: ok`, build `physiqueos-84cc64e4-20261008`;
- `/api/v1/health/ready` returns `status: ready`, 9/9 true, zero failing checks, schema `000014` unchanged;
- a bounded GET to `/api/v1/native/read/training-logger` reaches the live route and correctly fails closed with `401 AUTHENTICATION_REQUIRED` without a Founder device session.

The deployment lane's accepted read-only console proof, under an asserted read-only transaction and explicit rollback, found the compiled optional `executionVariantsByExercise` contract, zero live variant definitions, zero `variantId` history rows, and unchanged historical evidence. Thus the current production projection is `{}`: Build 92 decodes Server support and offers Ordinary plus Create Variant for canonical exercises; Build 91 ignores the additive field and remains compatible. This integration lane did not extract a paired-device credential or create a real variant merely to smoke the write path. Server candidate tests cover the optional projection/empty fallback and canonical commands; Native tests cover missing-field Ordinary-only fallback, projected choices, create/select, legacy writes, and decode compatibility.

Home, Goals, canonical Universal Skip, HealthKit/DEXA, and Sleep contracts were not changed by the Server candidate. The live readiness and deployment identity are green; production data mutation by this lane is zero.

## Storage and cleanup

- Free space before the combined Release gate: **22 GiB** (above the task's 12 GiB start floor).
- Peak retained lane artifacts before cleanup: 1.1 GiB shared test DerivedData plus 657 MiB Release DerivedData; free space remained 22 GiB.
- Removed only `/tmp/physiqueos-b92-integration-deriveddata`, `/tmp/physiqueos-b92-integration-release`, and the three disposable lane simulators after confirming no active Xcode job.
- Free space after cleanup: **24 GiB**.
- Preserved Builds 85–91 archives, receipts, source/worktrees, credentials, SDK runtimes, other lanes' simulators/data, and all non-lane artifacts.

## Release boundary

This is a validated integrated Native candidate, not a release. `agent-handoffs/latest.json` and `agent-handoffs/latest.md` remain Build 91. No version/build change, archive, upload, TestFlight action, or release-pointer promotion is included. The next step requires a separate Founder-authorized Build 92 release task and retains the separate physical-device acceptance boundary.
