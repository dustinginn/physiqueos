# Build 94 — Home startup transient offline fix and release readiness

Date: `2026-10-10T03:40:11Z`
Operator: Codex A
Assignment: `agent-handoffs/inbox/prompts/20261009-codex-build94-home-startup-transient-offline-fix.md` at `4ddb15f4`
Result: **root cause confirmed, minimal Native correction tested and published; guarded Server/TestFlight plan updated; no deployment, upload, build bump, archive, production mutation, Recovery activation, or release-pointer change**

## Final candidate

| Surface | Branch | Exact SHA | Relationship |
|---|---|---:|---|
| Native Build 94 | `codex/native-build94-home-startup-fix-20261009` | [`f643d845`](https://github.com/dustinginn/physiqueos/commit/f643d8456f8b493d6461a6d2c9078184e5c88b1c) | Direct child of the Founder-accepted `d0104815`; no intermediate commit |
| Server Morning dependency | `codex/server-build94-morning-evidence-20261009` | [`85a98025`](https://github.com/dustinginn/physiqueos/commit/85a9802587de0ef23ff2021e803258dea825254d) | Unchanged from the previously validated exact-production-lineage candidate |

The candidate delta from accepted Native `d0104815` is deliberately small:

- `ios/PhysiqueOS/Presentation/Home/HomeViewModel.swift`
- `ios/PhysiqueOS/Presentation/Home/HomeView.swift`
- focused tests in `ios/PhysiqueOSTests/FounderServerAPITests.swift`
- two simulator evidence PNGs plus their Xcode attachment manifest

No Server, Watch, HealthKit, DEXA, data model, navigation, Home hierarchy, Home content, or release metadata changed.

## Root cause

The observed text identifies the exact Native error branch: only `HomeViewModel` maps `ProductionNativeError.networkFailure` to `Temporarily offline`. The screen was not evidence of a sustained Server outage.

The startup lifecycle can legitimately issue overlapping Home loads:

1. `HomeView.task(id: environment.nativeAuthority)` loads on view appearance.
2. `HomeView.onChange(of: scenePhase)` loads when the scene becomes active.
3. Foreground/day-change paths can issue a newer load while older view-bound work is still completing.

Before this correction, every completion could publish to the same `state`. There was no request identity or cancellation guard. An older startup request could therefore finish with a transient transport failure and set the full-page offline state even though a newer healthy foreground request was already running. The newer success replaced it moments later, exactly matching the Founder-observed flash.

Cancellation was a second part of the same defect. `ProductionNativeAPI.perform` intentionally records the original transport error and exposes the stable public case `.networkFailure`; this means cooperative SwiftUI task cancellation can reach `HomeViewModel` with the same public identity as a real connectivity loss. `HomeViewModel` did not consult `Task.isCancelled` before presenting the offline page.

The duplicate instruction was independent but adjacent: the model's network message already ended in `pull to refresh`, and `HomeView` appended `Pull to refresh.` to every failure.

No separate Server performance, authentication, or response-contract defect was found:

- stored-session/token-refresh Home startup succeeds in the production transport tests;
- authoritative Home caching and in-flight read coalescing remain intact;
- reconnect-required and retryable proof-recovery states remain distinct;
- a genuine current network failure remains visible and recovers on the existing pull-to-refresh path.

## Correction

`HomeViewModel.load` now assigns a monotonically increasing request identity. Only the newest request may publish last-known, success, or failure state. An obsolete completion returns without changing the screen.

View-lifecycle cancellation is neutral: if the current task is cancelled, it does not publish an offline error. Its replacement appearance/foreground task owns the next state.

This does **not** add an automatic retry, timeout, or grace-period mask. A lone current `.networkFailure` still produces the genuine full-page offline panel, last-known Home still remains visible with its refresh-failed notice, session revocation still routes to reconnect, and manual pull-to-refresh still retries.

Failure copy is now composed once. The truthful network state reads:

> Temporarily offline. Reconnect and try again. Pull to refresh.

The view also refuses to append a second instruction if a future error already contains `pull to refresh`.

## Verification

### New startup regression matrix — PASS

Seven focused tests passed, 0 failures:

1. older network failure while a newer delayed-success startup is in flight — no offline flash, then authoritative Home;
2. cancelled startup whose transport error is collapsed to `.networkFailure` — loading state preserved, no false offline page;
3. genuine network failure — offline state remains visible;
4. explicit retry after genuine failure — authoritative Home restores;
5. cold launch with stale/last-known Home plus failed refresh — last-known content remains visible and non-completable;
6. cold launch with stored-session token refresh — authoritative Home replaces last-known;
7. reconnect-required and retryable sender-constrained proof recovery remain distinct.

The tests also assert the final failure copy and prevent duplicate `Pull to refresh` text.

### Broader affected-unit matrix — PASS

Using the same compiled products:

| Suite | Passed | Failed |
|---|---:|---:|
| `FounderServerAPITests` | 266 | 0 |
| `HomeReadModelTests` | 38 | 0 |
| `BriefingReadModelTests` | 46 | 0 |
| **Total** | **350** | **0** |

This covers production transport/auth, Home persistence and invalidation, priority capabilities, adaptive Home layouts, briefing projection and Option B Editorial Rail behavior.

### Focused simulator UI — PASS

Three targeted iPhone UI tests passed, 0 failures:

- Home physical parity in Dark;
- Home physical parity in Mineral Light;
- accessibility Dynamic Type uses full-width readable priority rows.

The Home visual hierarchy and accepted content are unchanged. Real simulator captures:

- [Dark Home screenshot](https://github.com/dustinginn/physiqueos/blob/f643d8456f8b493d6461a6d2c9078184e5c88b1c/agent-handoffs/artifacts/20261009-build94-home-startup-fix/FD9C5C05-EFEA-40E9-AB0A-2DA29E97C5E8.png?raw=1)
- [Mineral Light Home screenshot](https://github.com/dustinginn/physiqueos/blob/f643d8456f8b493d6461a6d2c9078184e5c88b1c/agent-handoffs/artifacts/20261009-build94-home-startup-fix/9AA2A603-1D45-43D3-A877-C78E8DDEEF2B.png?raw=1)

VoiceOver semantics were not redesigned: the loading/failure panel remains one contained accessibility element with the same stable `home.state.loading` / `home.state.message` identifiers. The accessibility-sized layout test passed on the final candidate.

### Release gates — PASS

- Xcode project generation run twice; `project.pbxproj` SHA-256 stayed exactly `f38c5dd889f10a1453a8b0d181e4dd9c0260ef3a6c1a9f5dccf442e51c11ef53` before, between and after.
- Release verifier passed at intentionally unchanged version `1.0 (93)`.
- Unsigned generic iOS Release build passed, including the Watch app and Live Activity/widget extension. Only the previously recorded Swift warnings remain.
- `git diff --check` passed.
- Xcode work was serialized. No Claude Xcode/test process overlapped.
- Free space began around 30 GiB, never approached the protected 12 GiB floor, and was about 28 GiB after retaining the two completed DerivedData trees for evidence reconciliation.

## Existing release evidence reconciliation

The expensive accepted-candidate evidence is still applicable because `f643d845` is the direct child of `d0104815`, and the only product change is Home startup state arbitration/failure copy:

- accepted full iPhone unit suite on `d0104815`: **2,287 passed, 0 failures, 2 intentional local-only skips**;
- accepted integrated iPhone UI matrix on `d0104815`: **8/8 passed**;
- full Watch suite on `d0104815`: **76/76 passed**;
- exact Server `85a98025`: **96/96 focused tests**, production build passed.

The final candidate then adds 350 affected-unit passes, 3 focused UI passes, and a fresh Release compile. Repeating the unrelated 87-minute UI suite would not add meaningful coverage for this three-file Native delta. The next archive gate should retain this evidence ledger unless the candidate or toolchain changes.

## Claude coordination correction

Claude's DEXA candidate worktree is clean and its code branch remains at `bedb807d`, whose commit message says the operation itself was not executed from that commit. However, GitHub main now contains the later authoritative operation report [`20261010T010213Z-dexa-oct9-presentation-applied.md`](https://github.com/dustinginn/physiqueos/blob/main/agent-handoffs/reports/20261010T010213Z-dexa-oct9-presentation-applied.md).

That report proves the authorized operation completed once:

- exactly one October 9 DEXA briefing row changed, version 1 → 2;
- 18/18 postflight checks passed;
- Confidence remained 70% down from 80;
- the other 58 briefings were unchanged;
- no Server deployment, policy change, Goal evaluation, or release-pointer mutation occurred;
- production remained on Server `5e91aa5d`, deployment `fc523740`, ACTIVE 9/9.

This supersedes the earlier Build 94 report's stale conclusion that DEXA execution was still pending. DEXA settlement Gate A is now satisfied, while the immediate pre-deployment authority recheck remains mandatory.

Claude's current Goal lane is also clean and isolated on `claude/goal-adaptation-design-mockups-20261010`; it does not overlap this Native candidate and is not part of the Build 94 release set.

## Guarded Server deployment plan — prepared, not executed

Server candidate remains exact `85a9802587de0ef23ff2021e803258dea825254d`, whose parent is live Server `5e91aa5d`. Production HealthKit graduation policy was previously verified at version 4 with Activity/Nutrition projection already enabled. Therefore deploying `85a98025` is itself the Morning Check-In behavior activation boundary; no policy APPLY is needed or allowed.

Immediately before a separately authorized deployment:

1. prove production Web, Worker and runtime source remain exact `5e91aa5d`; deployment `fc523740` is ACTIVE 9/9; no deployment is in progress; health/readiness are green; schema remains `000014`;
2. prove Server candidate remains exact `85a98025`, parent exact `5e91aa5d`, with only its reviewed three-file delta;
3. re-read HealthKit policy version/domains/window and current canonical Activity/Nutrition day coverage; stop on drift;
4. prove Recovery publication authority remains absent/OFF and no Recovery code/config enters the deployment;
5. reconcile the already-completed DEXA row/postflight state and stop on unexpected later mutation;
6. rerun the 96-test Server matrix and production build if candidate, base, dependencies or toolchain changed.

After explicit deployment authorization, fast-forward only the production Server lineage to `85a98025`, use the established Web/Worker stamp-and-force-rebuild sequence, and require exact source/runtime parity plus healthy 9/9 readiness. Then rerun the bounded read-only Morning audit and confirm no duplicate ordinary evidence, no review drift, genuinely missing evidence still prompts, and Recovery remains OFF.

Rollback remains code-only to exact `5e91aa5d` with matching Web/Worker stamps and repeated health/read-only parity checks. There is no policy rollback because this plan performs no policy write.

## Guarded Native/TestFlight plan — prepared, not executed

1. Freeze Native source at exact `f643d845` and Server source at the separately authorized production candidate.
2. After explicit release authorization, bump all app/Watch/extension build numbers together from 93 to 94.
3. Regenerate twice, require byte-identical project output, rerun release verification, and recheck the 12 GiB floor.
4. Archive with automatic signing; verify distribution identity/profile, bundle/version parity, entitlements, embedded Watch/widget products and dSYMs.
5. Do not upload until the guarded Server deployment and postdeployment Morning/Recovery verification pass.
6. Upload the exact archive, wait for App Store Connect `VALID`, and only then move any release pointers under separate authority.

## Stop state

Implementation and preparation gates are green. Remaining release-time gates are:

- explicit Server deployment authorization acknowledging immediate Morning overlay activation;
- fresh production preflight and postdeployment read-only verification;
- explicit Build 94 bump/archive/TestFlight authorization;
- distribution signing/profile proof, archive validation and App Store Connect `VALID` status.

Explicitly not performed here: Server deployment, Server spec mutation, policy write, production data write, Build 94 number bump, archive, TestFlight upload, Recovery activation, or release-pointer update.
