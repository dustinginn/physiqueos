# Build 95 — Home startup stabilization release VALID

Date: `2026-10-10T05:26:21Z`  
Operator: Codex A  
Task id: `build95-founder-authorized-stabilization-release-20261009`  
Assignment commit: `72778f94`  
Result: **PASS — PhysiqueOS 1.0 (95) uploaded exactly once and is build VALID, import VALID, and present on App Store Connect. Production Server remained unchanged and Recovery remains OFF.**

## Final release authority

| Surface | Exact authority | Result |
|---|---|---|
| Previously accepted Native release | [`49829781`](https://github.com/dustinginn/physiqueos/commit/498297815a3e20b1038fac9260d9f6649cad044a) | Build 94 release source |
| Founder-approved product candidate | [`cb3d520d`](https://github.com/dustinginn/physiqueos/commit/cb3d520d6bcd4253c9ff542987997e43b4ce4d3c) | Direct child of Build 94; Home-startup correction only |
| Native Build 95 release | [`59223a41`](https://github.com/dustinginn/physiqueos/commit/59223a41052201121ca1ade24aaf3a4ad0db637e) | Direct child of `cb3d520d`; deterministic build-number-only delta |
| Release branch | [`codex/native-build95-testflight-release-20261009`](https://github.com/dustinginn/physiqueos/tree/codex/native-build95-testflight-release-20261009) | Remote head exact `59223a41` |
| Production Server | [`85a98025`](https://github.com/dustinginn/physiqueos/commit/85a9802587de0ef23ff2021e803258dea825254d) | Unchanged; Web, Worker, runtime, and production branch exact |
| Production deployment | `40122906-34f0-4d0a-91cf-8c943a15e603` | Unchanged, `ACTIVE`, `9/9`, no in-progress deployment |
| TestFlight delivery | `06b8bf23-a439-4edb-9d01-50ad25721fe1` | Build `VALID`, import `VALID`, present on App Store Connect |
| Released app | `com.physiqueos.native.dev` `1.0 (95)` | Uploaded exactly once |

The release commit changes only:

- the authoritative `APP_BUILD_NUMBER` from 94 to 95;
- the generated app, Watch, widget/Live Activity and Watch-test build numbers;
- the source-controlled bundle-version assertion from 94 to 95.

No product behavior changed after the approved `cb3d520d` candidate.

## Product scope and review

Build 95 contains only the accepted Home-startup stabilization correction:

- one structured SwiftUI task now owns automatic Home loading across appearance, activation, day rollover and canonical Priority refresh changes;
- competing detached lifecycle loads were removed;
- genuine network, temporary Server, ended-session and contract failures retain truthful distinct handling;
- explicit retry and pull-to-refresh remain available;
- release-visible diagnostics report only sanitized local trigger/outcome/category/duration metadata;
- the deterministic startup delay remains enclosed by `#if DEBUG` and its launch-argument string is absent from the Release binary.

The accepted Home hierarchy, adaptive priority layout, secondary Editorial Rail, navigation, Watch experience and widget/Live Activity behavior were preserved.

## Test evidence

### Credited exact-candidate evidence

Candidate `cb3d520d` previously passed:

- `FounderServerAPITests`: 268/268;
- `HomeReadModelTests`: 38/38;
- `BriefingReadModelTests`: 46/46;
- total affected units: **352/352**;
- delayed 8-second cold-launch UI: **1/1**;
- unsigned generic Release compile, including Watch and extension products.

This evidence remains applicable because `59223a41` is a direct child whose only delta is the deterministic build-number update.

### Fresh final-SHA focused units — PASS

**20/20 passed, 0 failures.** Coverage included:

- single cold-start activation ownership and duplicate-active identity stability;
- delayed/overlapping request arbitration and cancellation;
- first-content loading behavior and labelled last-known content;
- genuine offline visibility and explicit retry recovery;
- temporary Server and ended-session classification;
- stored-session rotation, access-token refresh and one narrow read retry;
- foreground visibility policy and explicit Home refetch behavior;
- odd/adaptive Home priority grid contracts;
- accepted Editorial Rail geometry/reading order;
- Build 95 bundle-version assertion.

### Fresh final-SHA focused UI — PASS

**4/4 passed, 0 failures** on the retained iPhone 17 Pro simulator, iOS 27.0:

1. delayed 8-second cold launch transitioned `loading → authoritative content` without `home.state.message` appearing;
2. odd final Priority spanned the full bottom row in Dark and Mineral Light;
3. adaptive Priority rows promoted long content while retaining compact short pairs in Dark and Mineral Light;
4. the accepted secondary Midweek Editorial Rail preserved placement and full-card navigation in Dark and Mineral Light.

The unrelated 87-minute UI suite was not repeated; no changed source justified it.

### Project and Release gates — PASS

- project generation ran twice and was byte-identical;
- generated project SHA-256: `aab20dd5fde5052e302c82497332a68f40e8b37942330e51f1f89dc78cb3082b`;
- release configuration verifier passed for `1.0 (95)`;
- `git diff --check` passed;
- fresh unsigned generic iOS Release compilation passed on Xcode 27.0 (`27A266a`), compiling and embedding the unchanged Watch and widget/Live Activity targets;
- only pre-existing Swift warnings remained;
- Xcode work was serialized, with no competing build, test or runner process.

## Signed archive validation

Archive retained at:

`~/Library/Developer/Xcode/Archives/2026-10-09/PhysiqueOS-Build95-59223a41.xcarchive`

Validation passed:

- archive identity `com.physiqueos.native.dev`, version `1.0`, build `95`, team `33GMTRM6G9`, arm64;
- iPhone app, Watch app and widget/Live Activity extension all report build 95;
- deep strict code-signature verification and embedded-binary validation passed;
- iPhone entitlements: HealthKit, background delivery and the shared app group;
- Watch entitlement: HealthKit, with the expected companion identity;
- extension entitlement: shared app group, with no HealthKit entitlement;
- app binary and dSYM UUID matched: `4F38A791-6CF4-320C-8E1C-01DEBE5BBBE6`.

## Guarded TestFlight upload

The trusted release helper first completed a non-mutating dry run:

- App Store Connect API-key authority passed;
- archive identity, bundle/team/version/build, signatures, embedded version parity and dSYM passed;
- last locally accepted/uploaded build was 94;
- this archive had no recorded successful upload;
- verdict: `WOULD UPLOAD` Build 95.

The exact archive was then uploaded once using the required confirmation. Xcode reported `Upload succeeded` and `EXPORT SUCCEEDED`. Delivery `06b8bf23-a439-4edb-9d01-50ad25721fe1` reached:

- build status: `VALID`;
- import status: `VALID`;
- present on App Store Connect: `true`;
- uploaded: October 9, 2026 at approximately 10:24 PM Pacific.

An independent delivery-ID status readback confirmed the same result.

## Production and Recovery postflight

No Server deployment or production data mutation occurred.

Final read-only verification showed:

- production branch, Web, Worker and runtime exact `85a9802587de0ef23ff2021e803258dea825254d`;
- deployment `40122906-34f0-4d0a-91cf-8c943a15e603` remains `ACTIVE`, `9/9`, with no in-progress deployment;
- public liveness `ok` with build stamp `physiqueos-85a98025-20261009`;
- public readiness `ready`, all 9 checks green, schema `PROVIDER_MIGRATION_000014_APPLIED`;
- bounded production audit used `REPEATABLE READ READ ONLY`, verified `transaction_read_only=on`, selected only the Recovery publication-authority row, and rolled back;
- Recovery publication-authority rows: `0`; effective Recovery state: **OFF**.

No Recovery activation, policy change, historical edit, evidence write, Goal Adaptation work, deployment, migration or Server branch mutation occurred.

## Storage and retained evidence

- free space before heavy release validation: approximately 25 GiB;
- free space after signed archive and upload: approximately 22 GiB;
- the 12 GiB hard floor was never approached;
- signed Build 94 and Build 95 archives were retained;
- no protected history, credential, active worktree or production tooling was removed.

Reviewable candidate artifact retained on the release lineage:

- [Candidate commit containing the delayed cold-launch Dark simulator screenshot](https://github.com/dustinginn/physiqueos/commit/cb3d520d6bcd4253c9ff542987997e43b4ce4d3c). The artifact remains under `agent-handoffs/artifacts/` → `20261009-build95-home-startup/` → `build95-home-delayed-cold-launch-dark.png`.

## No-go findings and remaining acceptance

No new failed gate, drift, unsafe storage condition or release no-go finding was observed.

The remaining gate is human acceptance: the Founder should install Build 95 from TestFlight and verify terminated cold launch, warm launch, background/foreground, genuine offline/retry, Home layout and Watch presence on physical devices. Candidate diagnostics can distinguish any remaining Home failure category without collecting Founder evidence.

## Final status

**PASS — Build 95 is VALID in TestFlight.** The accepted Native release pointer may now move from Build 94 `49829781` to Build 95 `59223a41`. Production Server remains exact `85a98025`; Recovery remains OFF.
