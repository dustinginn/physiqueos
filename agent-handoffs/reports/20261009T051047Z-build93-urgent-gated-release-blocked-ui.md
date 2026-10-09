# Build 93 urgent gated release — BLOCKED at iPhone UI gate

Task: `build93-urgent-gated-testflight-20261008`  
Prompt: `agent-handoffs/inbox/prompts/20261008-codex-build93-urgent-gated-testflight.md` at `e1090a1c`  
Generated: 2026-10-09T05:10:47Z  
Status: **BLOCKED / fail closed**

Build 93 was integrated into isolated Native and Server candidates, but the required one-pass iPhone UI suite failed. Per the Founder-authorized stop condition, no Server deployment, archive, export, Build 93 TestFlight upload, release-pointer update, Recovery activation, or production-data mutation was performed.

## Exact candidates published

| Lane | Branch | Exact SHA | Base |
|---|---|---|---|
| Native | `codex/native-build93-final-integration-20261008` | `1b209ebf3cd8d68dc6a84efdacea9f0862c7ae2d` | shipped Build 92 `beaf5eff9d3c4147fba4dec095e8092c0fae9b91` |
| Server | `codex/build93-final-server-integration-20261008` | `e03f6768627f49175c476208eca79c99ae3d5ee9` | reviewed integrated Server `d2b39b6d283d1033c8894e96c9720039befdd881` |

Both remote refs were read back from GitHub and match the SHAs above. Both worktrees were clean after the stopped test run.

## Integration result

Native includes only the authorized Build 93 inputs:

- Home / Morning Check-In / DEXA: `89378f31` ancestry;
- Logger suggestion actionability: `f92f2291` ancestry;
- Recovery Native Founder correction: `766bd9dc` ancestry;
- Watch / Live Activity theme and widget Option B: `895e4a1e` ancestry;
- DEBUG-only test-harness stabilization: `a7e8a363`;
- build-number bump to version **1.0 (93)**.

The expected generator/project overlap was resolved by retaining Recovery at reserved block `0x20FF` and theme parity at `0x21FF`, then regenerating the project. Two consecutive generations produced byte-identical `project.pbxproj` SHA-256 `f38c5dd889f10a1453a8b0d181e4dd9c0260ef3a6c1a9f5dccf442e51c11ef53`. `git diff --check` passed. Held Energy candidates, the optional September 12 DEXA cleanup, and unrelated changes were not integrated.

Server is the required clean cherry-pick of Recovery correction `208edfc7` onto `d2b39b6d`, producing `e03f6768`. It contains no migration, schema, Prisma, dependency, lockfile, infra, or deployment-spec change. Recovery publication remains OFF when explicit authority is absent, Weekly/Monthly only when authorized, and the OFF path performs zero Sleep reads or historical backfill. No Recovery activation or calibration occurred.

## Server gates completed before the stop

- Focused DEXA / Priority / Recovery / Sleep / cadence matrix: **269 passed, 0 failed** across 17 files.
- Approved relevant broad filter (`Briefing Recovery Priority Reminder HealthKitSleep DEXA`): **1,872 passed / 16 failed / 3 skipped**. This is the exact approved `d2b39b6d` baseline reported before integration: the same 16 environment-dependent failures, with no new failing test.
- Changed JavaScript/JSX ESLint: passed.
- `git diff --check`: passed.
- Production webpack build: compiled successfully, TypeScript passed, and all **50/50** static pages completed.
- No migration/schema file in `84cc64e4..e03f6768`.

The repository-wide diagnostic sweep was not used as a release pass/fail gate: it depends on intentionally absent private runtime fixtures and includes known non-hermetic repository tests. It reported 10,041 passed / 294 failed / 5 skipped. The scoped relevant filter above exactly reproduced the previously approved 1,872/16 baseline, and every changed-area test was green.

## Native gate and exact blocker

Preflight had 27.35 GiB free; 24.4 GiB remained before the heavy Native gate. Claude had no active `xcodebuild`, `xctest`, or `XCTRunner` process. A fresh Build 93 iPhone 17 Pro simulator and isolated DerivedData were used.

- Integrated `build-for-testing`: **TEST BUILD SUCCEEDED**.
- Full one-pass `PhysiqueOSUITests`: **stopped after 19 passed / 1 failed** because the prompt requires fail-closed behavior on the first failed gate.
- All **8 Recovery UI tests passed** before the failure, including the comprehensive Dark/Mineral Light Weekly/Monthly capture journey.
- Failed test: `EnergyRecoveryRedesignUITests.testEnergyEstimateWordingSheetsLinksAndBackTrail`.
- Exact assertion: `RecoverySleepAcceptanceUITests.swift:1176` expected the `evidence.back` label **“Daily Energy History”** but received **“Evidence Hub”** after opening `energy.day.2026-08-30.nutrition`.
- Xcode observed the navigation result and emitted a normal XCTest assertion failure; this was not a simulator crash or infrastructure timeout.

The failure was unexpected and is in the held Energy/evidence-navigation area that this assignment explicitly excluded. It was not patched, waived, rerun in isolation, or relabeled as known. The Codex-owned Xcode runner was terminated after the failure. Full iPhone unit, remaining UI, Watch unit/UI at both sizes, archive, signing/export, Release binary seam scan, and Build 93 upload gates were therefore **not reached**.

Morning Weight integration is present in the candidate, including the authoritative `{label,destination}` decoder and retry/typed-input preservation work from the tested source candidate, but the required fresh integrated full gate did not complete. No real Founder weight was written or backfilled, and 178.1 lb was not treated as confirmed persisted.

## Production and release state — unchanged

### Server

- Production branch: `combined-app-platform-cutover` at `84cc64e4e7205b2540bf78ea43afd1cbfb068d06`.
- Active deployment: `32143aa4-90d4-496a-81b2-17f35a609fde`, phase **ACTIVE**.
- `/api/v1/health/live`: `status=ok`, build `physiqueos-84cc64e4-20261008`.
- `/api/v1/health/ready`: `status=ready`, all **9/9** checks ready, schema remains `000014`.
- Build 93 Server candidate `e03f6768` was **not deployed**. There is no Build 93 deployment ID.

### TestFlight

- Build 93 was **not archived, exported, validated, or uploaded**. There is no Build 93 delivery ID and no duplicate upload attempt.
- Existing Build 92 delivery `56b0c334-b8f5-42e4-979b-78e68a6d0573` was rechecked read-only: build-status **VALID**, import-status **VALID**, on App Store Connect.
- Release authority remains Build 92 `beaf5eff9d3c4147fba4dec095e8092c0fae9b91`, Native 1.0 (92), Server `84cc64e4` / deployment `32143aa4`.
- `agent-handoffs/latest.json`, `latest.md`, and the release backlog were not changed.

## Safety and cleanup

- Production data writes: **zero**.
- Founder weight writes/backfills: **zero**.
- Recovery activation/calibration/Sleep reads: **zero in production**.
- Deployments/uploads/releases: **zero**.
- Existing archives 85–92 and credentials were untouched.
- Only this lane’s regenerable DerivedData, temporary Server build output/dependency symlink, and three newly created Build 93 simulators were removed after the stop. Free space recovered from 12.47 GiB at stop to 15.88 GiB.

## Rollback and next action

No production rollback is necessary because nothing was deployed or uploaded. The production rollback anchors remain Server `84cc64e4` / deployment `32143aa4` and Native Build 92 `beaf5eff` / delivery `56b0c334`.

Next action requires a new bounded assignment: determine whether the Energy back-trail expectation or the integrated navigation behavior is authoritative, correct only that discrepancy if authorized, then rerun the complete gated matrix from the clean published Native SHA. Do not deploy `e03f6768` or release Build 93 until that fresh full matrix passes.
