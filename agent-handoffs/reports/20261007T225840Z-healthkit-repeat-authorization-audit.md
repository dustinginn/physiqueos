# Apple Health repeated authorization audit — Build 91

- **Task:** `healthkit-repeat-authorization-audit-20261007`
- **Authorized staging commit:** `5c86fbde86dd1eafd7dee7daff713f3f81b54049`
- **Latest shipped Native authority:** `106f05183ea3e2328496acce0636dc087116bbce`, PhysiqueOS 1.0 (91), VALID in TestFlight
- **Scope:** static source/release-evidence audit only. No product change, build, simulator, permission reset, workout, pairing change, production read/write, health-data access, or device operation.
- **Verdict:** **a bounded post-Build-91 fix is recommended before the next general Native release; no Build 91 rollback is justified by the available evidence.**

## Executive finding

Two things are true at once:

1. **Verified code defect:** PhysiqueOS asks HealthKit for authorization far more often than needed. The iPhone can issue the same full read request from two independent cold-launch paths, and the Watch issues its own request at every new HealthKit workout start. The phone coordinator has only a process-memory Boolean and no shared authorization single-flight; the Watch has a workout-start single-flight but no authorization-status preflight. The repository already implements `getRequestStatusForAuthorization`, but shipping production paths do not call it.
2. **The exact persistence failure remains unknown:** Apple documents that `requestAuthorization` returns without displaying a form if the person has already granted or prohibited every requested type. Builds 86 through 91 have the same app and Watch identities, HealthKit entitlements, phone read set, and Watch authorization set. Therefore the repeated calls explain *when* PhysiqueOS gives the OS an opportunity to present a sheet, but source evidence alone cannot prove why HealthKit considered the screenshot's Workout read permission unresolved. A completed identical authorization on the same installed target/device should not prompt merely because TestFlight updated the build.

The screenshot is consistent with a phone request containing `HKWorkoutType`, but a screenshot alone cannot identify which call triggered it or prove that the prior sheet completed under the same target identity and device. The report contains no screenshot or other Founder evidence.

## Apple contract used for the audit

Apple's documentation is decisive on the intended behavior:

- [`requestAuthorization(toShare:read:)`](https://developer.apple.com/documentation/healthkit/hkhealthstore/requestauthorization%28toshare%3Aread%3A%29) says a new, previously unanswered data type displays the form, while a request whose types were all already granted or prohibited returns without prompting. It also says that on watchOS 6 and later the permission form is displayed on Apple Watch. Read and share permissions are separate.
- [`getRequestStatusForAuthorization`](https://developer.apple.com/documentation/healthkit/hkhealthstore) reports whether a request would present a permission sheet. [`shouldRequest`](https://developer.apple.com/documentation/healthkit/hkauthorizationrequeststatus/shouldrequest) means not every specified type has previously been requested; `unnecessary` means all have.
- [Authorizing access to health data](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data) states that apps cannot distinguish read denial from no visible data. `authorizationStatus(for:)` describes **sharing/writing**, not read grant status.
- [Configuring HealthKit access](https://developer.apple.com/documentation/xcode/configuring-healthkit-access) requires HealthKit capability per iOS/watchOS target. The shipped archive evidence verifies it on both app targets.

Legitimate reasons for a sheet include a genuinely new access type or direction, first authorization on the target/device, or authorization state that is no longer recorded (for example after a privacy reset or a materially different app identity). The person can also change permissions in Settings or Health. A different device and the Watch target have their own request flow. Reinstall/reset and OS behavior were not exercised here, so they remain environmental hypotheses, not findings. An ordinary TestFlight update with unchanged identity and already-answered type set is not, by itself, an expected reason for another sheet.

## Complete call-site and timing inventory

All line references below are from exact shipped Build 91 `106f0518`.

### iPhone automatic read authorization

The phone's `initialRead` is a single union of every V1 read domain (`ios/PhysiqueOS/Networking/HealthKitTypeRegistry.swift:24-75`):

- Activity: Activity Summary, Active Energy, Exercise Time, Stand Time, Steps, Walking/Running Distance, Flights Climbed.
- Nutrition: Dietary Energy, Protein, Carbohydrates, Total Fat, Fiber.
- Workouts: Workouts, Active Energy, Heart Rate, Walking/Running Distance, Cycling Distance.
- Sleep: Sleep Analysis.

After set de-duplication this is 16 readable object types and no writable types. Sleep is included even when its ingestion lane is dormant. Workouts is therefore present in every phone `.initialRead` request, not only at workout time.

`SystemHealthKitService` implements both the correct preflight and the raw request (`ios/PhysiqueOS/Networking/HealthKitService.swift:42-81`). However:

- `HealthKitAuthorizationCoordinator.evaluateAuthorizationRequirement` calls the preflight (`ios/PhysiqueOS/Networking/HealthKitAuthorizationCoordinator.swift:37-64`), but production code never calls that method; only unit tests do.
- `requestAuthorization` goes directly to the raw request and then flips `authorizationWasRequested` (`HealthKitAuthorizationCoordinator.swift:66-88`). That Boolean begins `false` on every process launch (`:7-9`), is not keyed by scope/type set, is not durable, and has no in-flight task.
- At app construction, a process-launch task calls `registerHealthKitObserversForLaunch` (`ios/PhysiqueOS/App/PhysiqueOSApp.swift:99-103`). When Founder Production is selected, that path calls `.initialRead` whenever the process-memory Boolean is false (`HealthKitAutomaticSynchronizationCoordinator.swift:287-297`). This can run during a HealthKit background relaunch, before any foreground scene.
- Independently, every active scene transition launches `bootstrap` (`PhysiqueOSApp.swift:164-192`). Its internal bootstrap is single-flight with respect to other bootstrap calls (`HealthKitAutomaticSynchronizationCoordinator.swift:429-457`), but `runBootstrap` makes the same authorization decision (`:459-474`). The single-flight does **not** cover the process-launch registration path.
- Protected-data recovery also invokes `bootstrap` (`ios/PhysiqueOS/App/AppEnvironment.swift:877-887`).

Consequences:

- **Verified:** every new phone process attempts full read authorization at least once when Founder Production is selected, even when the OS already has a decision.
- **Verified:** a foreground cold launch can allow process-launch registration and foreground bootstrap to both observe `authorizationWasRequested == false` before either request completes. There is no coordinator-level in-flight guard spanning those callers.
- **Not proven:** that HealthKit presents two sheets for concurrent identical calls. Apple may serialize/coalesce them; device instrumentation is required.

### Explicit iPhone diagnostic request

`AppEnvironment` constructs a second authorization coordinator over the same service for the Founder canary (`ios/PhysiqueOS/App/AppEnvironment.swift:848-865`). The temporary Sleep-canary button calls that separate coordinator (`ios/PhysiqueOS/Presentation/You/HealthKitSleepCanaryView.swift:34-39,55-68`), and `HealthKitFounderCanaryCoordinator` requests `.initialRead`, not Sleep alone (`ios/PhysiqueOS/Networking/HealthKitFounderCanaryCoordinator.swift:217-221`). Its process-memory flag is independent of the automatic coordinator. This request is user initiated, but its scope is broader than the button's Sleep label suggests.

### DEXA write authorization

DEXA is a separate, explicit, write-only request for Body Fat Percentage and Lean Body Mass (`ios/PhysiqueOS/Networking/DEXAHealthKitWriteback.swift:153-163`). It occurs only after the Founder confirms the opt-in and `enable()` runs (`:356-365`; `ios/PhysiqueOS/Presentation/You/YouPlaceholderView.swift:62-69`). Normal startup/foreground `reconcilePermanent()` checks the saved preference and per-type **write** status; it does not request authorization (`DEXAHealthKitWriteback.swift:372-385,479-489`).

DEXA cannot explain a sheet whose only topic is **READ Workouts**. Its use of `authorizationStatus(for:)` is appropriate because those are share/write permissions, which HealthKit exposes.

### Apple Watch workout authorization

The Watch target requests exactly:

- share/write: Workout;
- read: Heart Rate, Active Energy Burned, Basal Energy Burned.

`WatchWorkoutHealthController.start` always calls `authorize()` before creating a session (`ios/PhysiqueOSWatch/WatchWorkoutHealthController.swift:135-160`), and `authorize()` always calls HealthKit directly with that set (`:356-365`). It has no `getRequestStatusForAuthorization` preflight and no authorization-specific durable/session guard.

The surrounding workout controller does prevent duplicate workout starts for the same live session, and the Store has a workout-start task single-flight (`ios/PhysiqueOSWatch/WatchWorkoutStore.swift:1182-1195`). That protects workout identity, not authorization-call frequency across workouts.

Triggers are:

- a Watch-initiated prepared-workout start;
- explicit **Record to Health / Retry Health Start**;
- since Build 86, automatic HealthKit start for a phone-started structured workout once the Watch is active and recovery is complete (`WatchWorkoutStore.swift:1159-1195`);
- Watch activation/re-activation can evaluate that automatic start (`:496-503`);
- relaunch first attempts `recoverActiveWorkoutSession`; recovery itself does not request authorization, but after recovery completes the Store evaluates a new automatic start if no session was recovered (`:532-575,1551-1567`).

Thus Build 86 materially increased how often phone-started workouts reach the Watch authorization call, even though the requested Watch set did not change. This is a **likely timing/exposure contributor** to the recent Watch reports, not proof that watchOS lost an already-completed decision.

## Build 86–91 type, identity and entitlement comparison

Shipped Build 86 authority is `cec8af20a6121bb66ecca3ba9f667d91774a891c`; Build 87 is `f66c7fc6`; Build 88 is `7fce3b97`; Build 89 is `51399425`; Build 90 is `32baf1d5`; Build 91 is `106f0518`.

Static object comparison from shipped Build 86 to shipped Build 91 found these files byte-identical:

- `HealthKitTypeRegistry.swift` — phone read/write registry;
- `HealthKitAuthorizationCoordinator.swift`;
- `HealthKitAutomaticSynchronizationCoordinator.swift`;
- `WatchWorkoutHealthController.swift` — Watch authorization set and call;
- iPhone and Watch entitlements.

The generator records the same values across all six builds (`ios/Scripts/generate_project.py:652-673` in Build 91):

- app bundle: `com.physiqueos.native.dev`;
- Watch bundle: `com.physiqueos.native.dev.watchkitapp`;
- development team: `33GMTRM6G9`;
- marketing version: 1.0; only build number advances.

Release reports confirm the archives and uploads rather than merely the source settings:

- Build 86: exact app team, app HealthKit/background-delivery entitlement and Watch HealthKit entitlement; VALID.
- Builds 87–89: same established bundle/team/signing flow; VALID.
- Build 90: same team as 89, app HealthKit/background delivery, Watch HealthKit; VALID.
- Build 91: app and Watch bundle IDs above, same team as Build 90, matching team provisioning profiles, app HealthKit/background-delivery and Watch HealthKit; VALID (`agent-handoffs/reports/20261007T223913Z-build91-testflight-valid.md` in main commit `dd8e5b3b`).

The purpose strings are present and target-specific (`ios/PhysiqueOS/Supporting/Info.plist:33-36`; `ios/PhysiqueOSWatch/Info.plist:7-10`). The Watch declares the correct companion ID (`Watch Info.plist:19-22`). No repository or archived-release evidence supports bundle/team/entitlement churn as the cause.

The DEXA write types were introduced before this range (Build 84), and they are a separate write direction. No Build 86–91 release added a phone read type or Watch authorization type. Build 91 itself is a metadata bump over its reviewed integration candidate and has no HealthKit product change.

## Root-cause classification

| Classification | Finding |
|---|---|
| **Verified** | The phone invokes authorization unconditionally once per process instead of first asking the OS whether a sheet is necessary. |
| **Verified** | Two independent phone cold-launch paths can race the same request; the authorization coordinator has no cross-caller in-flight guard. |
| **Verified** | The Watch invokes authorization for every new HealthKit workout start; Build 86 expanded automatic starts to phone-originated workouts. |
| **Verified** | The production `getRequestStatusForAuthorization` implementation is unused outside tests. |
| **Verified** | The Sleep-canary button has an independent coordinator and requests the entire 16-type V1 read union, not Sleep alone. |
| **Verified** | Phone read scope, Watch scope, identities, signing team and HealthKit entitlements are stable from shipped Build 86 through shipped Build 91. |
| **Verified** | The app cannot truthfully report grant/deny for HealthKit read access. Existing empty-read handling correctly calls the state “no visible data” (`HealthKitAuthorizationCoordinator.swift:90-97`). |
| **Likely contributor** | More lifecycle and per-workout calls increase the chance and perceived frequency of a sheet whenever HealthKit says any requested type/direction is unresolved. The Build 86 Watch auto-start is the clearest recent exposure change. |
| **Possible contributor** | The phone process-launch/foreground race may produce duplicate or poorly timed request attempts. Static source does not prove how HealthKit serializes concurrent calls. |
| **Unknown** | Why an already-selected Workout read permission was considered unresolved on the reported device. Stable source/release identity argues against a Build 86–91 type or bundle change. Possibilities such as an incomplete prior flow, install/privacy-state reset, target/device distinction, or OS defect require read-only device telemetry or a controlled repro; none is asserted as fact. |

## Bounded repair recommendation

Implement one small authorization coordinator **per app target** (phone and Watch remain independent) with these boundaries:

1. **Exact-scope preflight.** Key requests by canonical read/share identifier sets. Call `getRequestStatusForAuthorization` first. If `.unnecessary`, mark the scope ready for this process and do not call `requestAuthorization`. If `.unknown`/error, fail closed and retry only at a later bounded lifecycle event.
2. **Single-flight and serialization.** Maintain one in-flight task per target and coalesce identical scope fingerprints. Serialize different phone scopes so automatic reads, the diagnostic UI and DEXA write opt-in cannot present overlapping HealthKit flows.
3. **No background presentation.** `registerObserversForBackgroundLaunch` must never present authorization. It may preflight; if `.shouldRequest`, record `authorization_request_required` and stop. Observer registration proceeds only when the OS says the exact active scope is already requested.
4. **Foreground timing.** A fresh phone install should request from one deliberate foreground/onboarding or Settings action, once. A normal app update/resume should preflight and silently continue when `.unnecessary`. Remove the separate automatic-versus-canary Boolean split.
5. **Scope by feature.** The permanent phone lane should request only currently active read domains. Do not include dormant Sleep merely because it exists in the registry. The Sleep diagnostic requests Sleep only (or becomes a status/open-settings action if Sleep is already part of the active production scope). DEXA remains its explicit two-type write-only opt-in.
6. **Watch timing.** Preflight the exact Watch set before starting. If `.unnecessary`, start without invoking authorization. If `.shouldRequest`, only a direct Watch user action (Start Workout or Record to Health) may present the sheet; a phone-driven automatic start shows a permission-needed state and waits for that action. Keep the existing workout identity/recovery guards.
7. **Truthful states and privacy-safe diagnostics.** Log build, target (`phone`/`watch`), trigger, exact type-set digest/identifiers, request-status result, and whether a request was coalesced/presented/completed—never health values and never a claimed read grant/denial. “Completed” means the authorization flow completed, not that read access was granted.

Do not persist a home-grown “permission granted” cache. HealthKit remains authority; an in-memory/session cache is only an optimization after an OS `.unnecessary` result, and each feature use can preflight again because permissions may change.

## Regression matrix for the fix

| Case | Expected result |
|---|---|
| Phone, same install + same 16-type legacy set after Build update | Preflight `.unnecessary`; zero `requestAuthorization` calls; no sheet; sync proceeds. |
| Phone cold foreground with process-launch registration racing scene activation | One shared preflight/single-flight; background path never presents; at most one foreground presentation if required. |
| Phone background HealthKit relaunch | No permission UI. Already-authorized observer registration proceeds; unresolved scope stops with a diagnostic. |
| Phone adds one genuinely new active read type | Preflight `.shouldRequest`; exactly one deliberate foreground sheet containing the delta/requested scope; subsequent launch is `.unnecessary`. |
| Dormant Sleep | No Sleep authorization request until activated or explicitly requested; no silent scope broadening. |
| Sleep diagnostic | Requests only Sleep, once, through the shared phone coordinator. |
| DEXA disabled/startup reconcile | Zero write authorization requests. |
| DEXA explicit enable | One serialized request for Body Fat Percentage + Lean Body Mass writes; write denial reported from share status; no read-permission claims. |
| Watch, second and later workout with same answered set | Preflight `.unnecessary`; zero raw authorization calls; workout starts normally. |
| Watch first workout / new Watch with unanswered set | Direct Watch action presents one Watch sheet; phone automatic start does not surprise-present. |
| Watch phone-started workout, activation and relaunch recovery | Existing session recovers without authorization; an eligible new auto-start preflights once and never starts a duplicate. |
| Watch adds a genuinely new read/share type | One Watch-local explicit prompt, then silent subsequent starts. |
| Empty phone read after completed authorization | Render “no visible data”/permission guidance; never “read denied” or “granted.” |
| Phone and Watch independently | Each target requests only its necessary set. Phone does not request Watch metric/write scope; Watch does not request phone Nutrition/Sleep/Workout-read scope. |

Tests should use injected fake HealthKit services and deterministic concurrent tasks; no simulator or permission reset is needed to prove coordinator behavior. Final physical acceptance can then observe request-status telemetry without reading health values or resetting permissions.

## Release impact and present user guidance

**Build 91:** do not roll it back for this audit. Its HealthKit authorization code and identities are unchanged from Build 86, and Apple should suppress sheets for fully answered identical requests. No evidence shows a new Build 91 scope or signing regression.

**Next release:** treat the coordinator/timing repair as a high-priority, bounded post-91 change and include it before the next general Native release if possible. It becomes a hard release blocker if a controlled same-install/same-target test completes the sheet and the identical sheet reappears, or if the prompt prevents HealthKit workout start/save. Without that repro, this is an important UX/reliability fix, not an emergency Build 91 rollback.

Current expected user behavior:

- Completing a newly required phone or Watch Health sheet is legitimate once for that target/device/type direction.
- A routine update with the same identity and answered types should not require reauthorization.
- Phone and Watch may each need their own one-time flow; granting phone Workout **read** does not substitute for Watch Workout **write**.
- If a sheet repeats now, complete or cancel it once; do not reset Health permissions or reinstall for diagnosis. Record device (phone/Watch), exact action and whether the prior sheet completed. Read authorization cannot be verified from an app-reported “granted” status.

## Audit validation and storage safety

- Static audit covered every raw `HKHealthStore.requestAuthorization` call site and every shipping caller at Build 91, plus Build 86–91 Git objects and release reports.
- Deterministic hashes proved the key authorization/type/entitlement files identical from shipped Build 86 to Build 91. No tests were run because no code changed and source comparison answered the requested build-delta question.
- Free space before the audit snapshot: 18,324,684 KiB = 17.48 GiB on `/System/Volumes/Data`. Free space after report preparation: unchanged within measurement tolerance; **0 MiB reclaimed**.
- No cleanup occurred. Categories removed: none.
- Active/protected worktrees, including the locked Build 91 release worktree, were identified and left untouched. Builds 85–91 archives, upload receipts, credentials, simulators, DerivedData, other lanes' scratch, Git repositories/worktrees and Founder data were all untouched.
- The sandbox did not permit process-list inspection. No Xcode, simulator, build or test process was launched, interrupted or killed by this audit.
- Required audit gates completed. Remaining uncertainty is device authorization-state causation, intentionally not probed through resets or health-data access.

## Publication boundary

This is the one authorized new report under `agent-handoffs/reports/`. Publication is report-only to `dustinginn/physiqueos` `main` through the guarded publisher. `agent-handoffs/latest.json` and `agent-handoffs/latest.md` remain unchanged. No candidate/code branch is pushed.
