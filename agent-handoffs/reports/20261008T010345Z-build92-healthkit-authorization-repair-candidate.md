# Build 92 HealthKit authorization repair candidate

Task ID: `build92-healthkit-authorization-repair-20261007`

## Outcome

The bounded candidate is committed and normally pushed to `codex/build92-healthkit-authorization-repair-20261007` at `6c52df29191ae27b1337bec0c8048f602052747c`. It is based directly on shipped Native Build 91, `106f05183ea3e2328496acce0636dc087116bbce`, and intentionally retains app build number 91. It is a tested candidate, not an app update or release.

## Root cause and remaining uncertainty

Source inspection confirmed multiple app-owned paths could reach raw HealthKit authorization. They included process-launch and foreground bootstrap, protected-data recovery, the Founder Sleep diagnostic, explicit DEXA enablement, and Watch workout creation or recovery. The prior implementation did not consistently preflight the exact scope, did not route every phone path through one shared request coordinator, and allowed Watch automatic recovery to request authorization. Those conditions could cause the app to ask HealthKit repeatedly even when the currently requested type and direction set had already been answered.

The candidate removes those demonstrated app-originated causes. Every exact scope now calls Apple's request-status preflight first. An `unnecessary` response completes without a raw request; `shouldRequest` may present only from a deliberate phone foreground context or direct Watch action; unknown status and errors fail closed with recoverable truth rather than an invented grant. This status is not treated as read authorization, and empty HealthKit reads remain empty.

Apple operating-system behavior is not claimed as proven. A sheet caused by a genuinely unanswered type or direction, a changed type set, or altered operating-system authorization state remains legitimate and must not be suppressed. Confirming whether any residual operating-system behavior exists requires later physical-device acceptance under the release lane; this task did not reset permissions or exercise Founder hardware.

## Implementation

- A single process-wide iPhone authorization coordinator is shared by automatic HealthKit synchronization, the Founder Sleep diagnostic, and DEXA writeback. It serializes requests and coalesces duplicate in-flight work across launch, foreground bootstrap, protected-data recovery, and diagnostic entry.
- Background launch and protected-data recovery preflight without presentation. A queued foreground pass can retry a request-required result rather than losing the foreground opportunity.
- Automatic startup scopes include only active activity, nutrition, and workout reads. Dormant Sleep is excluded from startup and requested only for its active persisted flow or the Sleep-only diagnostic.
- DEXA enablement uses the shared coordinator with write-only Body Fat Percentage and Lean Body Mass. It does not add DEXA reads or a Body Mass write, and existing write-status and reconciliation handling remain intact.
- Watch uses its separate exact scope: Workout write plus Heart Rate, Active Energy Burned, and Basal Energy Burned reads. Automatic phone-start recovery preflights but cannot show a sheet; direct Watch start or retry can present legitimate first or newly required consent.
- Existing exactly-once Watch workout start, late phone-start recovery, active-state truthfulness, finish, and save behavior remain covered by the focused lifecycle tests. No durable granted cache or health-value logging was introduced.

## Changed files

Candidate `6c52df29191ae27b1337bec0c8048f602052747c` changes 17 files, with 555 insertions and 129 deletions:

- `ios/PhysiqueOS/App/AppEnvironment.swift`
- `ios/PhysiqueOS/Contracts/HealthKitCapabilityModels.swift`
- `ios/PhysiqueOS/Networking/DEXAHealthKitWriteback.swift`
- `ios/PhysiqueOS/Networking/HealthKitAuthorizationCoordinator.swift`
- `ios/PhysiqueOS/Networking/HealthKitAutomaticSynchronizationCoordinator.swift`
- `ios/PhysiqueOS/Networking/HealthKitFounderCanaryCoordinator.swift`
- `ios/PhysiqueOS/Networking/HealthKitService.swift`
- `ios/PhysiqueOS/Networking/HealthKitTypeRegistry.swift`
- `ios/PhysiqueOS/Presentation/You/HealthKitSleepCanaryView.swift`
- `ios/PhysiqueOSTests/DEXAHealthKitWritebackTests.swift`
- `ios/PhysiqueOSTests/HealthKitAutomaticSynchronizationCoordinatorTests.swift`
- `ios/PhysiqueOSTests/HealthKitCapabilityTests.swift`
- `ios/PhysiqueOSTests/HealthKitFounderCanaryTests.swift`
- `ios/PhysiqueOSTests/HealthKitSleepIngestionTests.swift`
- `ios/PhysiqueOSWatch/WatchWorkoutHealthController.swift`
- `ios/PhysiqueOSWatch/WatchWorkoutStore.swift`
- `ios/PhysiqueOSWatchTests/WatchWorkoutFinishStateTests.swift`

## Validation

Expensive tests were serialized with the other active native lane. Before each Xcode invocation the process census was clear of other `xcodebuild` and lane test processes. A single lane-owned DerivedData directory was reused.

- Touched Swift source parser validation: passed.
- `git diff --check`: passed.
- Focused iPhone Xcode test: passed 112 tests, zero failures. The suites covered capability and authorization behavior, automatic synchronization, Founder diagnostic, Sleep ingestion, and DEXA writeback.
- Focused Watch Xcode test: passed 56 tests, zero failures. The suites covered exact-scope preflight, first and repeated authorization behavior, automatic versus direct presentation, phone-start recovery, and workout finish lifecycle.
- Both selected simulators were verified shut down after testing.

Early compile diagnostics found during the implementation loop were corrected before the final gates: explicit async task typing, HealthKit service actor isolation, and coordinator sendability at the controlled concurrency seam. The results above are the final clean gates.

No permission reset, simulator UI permission exercise, Xcode release build, Server deployment, production write, build-number bump, TestFlight upload, reinstall, pairing change, or Founder-hardware workout occurred.

## Watch and variant-lane overlap

There is one narrow shared-file overlap in `ios/PhysiqueOSWatch/WatchWorkoutStore.swift`: the HealthKit start call now passes `.automatic` for a phone-start recovery and `.direct` for a direct Watch start. No variant picker, `variantLabel`, Watch row contract, or training-variant semantics were changed. Later integration should preserve both that three-line presentation-routing hunk and the variant lane's independent semantics.

## Storage safety

- Initial free-space census: 31,586,468 KiB available, approximately 30.12 GiB.
- Immediately before Xcode testing: 32,150,592 KiB available, approximately 30.66 GiB.
- After tests and before cleanup: 30,788,644 KiB available.
- The completed lane-owned DerivedData measured 954,332 KiB. After confirming no matching build or test process was active, only that exact directory was removed.
- After cleanup: 31,580,064 KiB available, approximately 30.12 GiB. The observed filesystem delta from the immediate pre-cleanup reading was 791,420 KiB; concurrent system activity explains why it differs from the directory's measured size.

Archives, release receipts, all other worktrees and caches, other DerivedData, simulators, production data, and protected user data were left untouched.

## Release effect

This repair should be included in the next Native release, Build 92. It prevents unnecessary app-originated raw authorization requests while preserving legitimate first-time and newly required consent, Watch workout creation and recovery, HealthKit data integrity, and DEXA writeback. It does not itself constitute Build 92 integration or delivery; those remain separate authorized release work.
