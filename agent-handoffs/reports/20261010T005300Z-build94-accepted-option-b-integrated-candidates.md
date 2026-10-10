# Build 94 — accepted Option B resume, integrated candidates

Date: `2026-10-10T00:53:00Z`  
Operator: Codex A, existing Mac conversation  
Governing assignment: `agent-handoffs/inbox/prompts/20261009-codex-build94-resume-from-accepted-option-b.md` at `664558d7`  
Founder-accepted Native start: `b1535c7d558a7e16a4098110c575de26734840bb`  
Result: **Native candidate and separate gated Server dependency published; no deployment, archive, build bump, release-pointer change, or TestFlight action**

## Published candidates

| Surface | Branch | Commit | Status |
|---|---|---|---|
| Native integrated Build 94 candidate | `codex/native-build94-integrated-candidate-20261009` | [`d0104815`](https://github.com/dustinginn/physiqueos/commit/d0104815) | Published; starts exactly at accepted Option B `b1535c7d` |
| Server Morning evidence dependency | `codex/server-build94-morning-evidence-20261009` | [`85a98025`](https://github.com/dustinginn/physiqueos/commit/85a98025) | Published; **not deployed**; existing HealthKit projection policy remains OFF by default |

Option B Editorial Rail was not redesigned. Its placement, primary-before-secondary hierarchy, copy, and briefing navigation are unchanged from the accepted candidate. The Native candidate contains only the remaining locked Build 94 integration work and focused DEBUG-only evidence fixtures.

## Outcome by locked scope

### 1. DEXA direct upload and automatic completion

The production lifecycle was already correctly implemented on the accepted starting candidate and Server base:

- At the appointment's scheduled local time, the Server changes the occurrence from the appointment view to `Upload DEXA Results` and routes to `/evidence/dexa`.
- Native maps that route to the existing DEXA PDF intake (`BodySpec PDF` / `Choose PDF`).
- DEXA remains non-completable and non-skippable. There is no manual Complete or Skip control on the post-appointment priority.
- The reminder clears only after verified canonical DEXA evidence is reconciled to the current appointment. A failed, declined, unmatched, or missing ingestion retains the actionable upload state.

The old Mark Complete refusal was not a new persistence failure. It was an inappropriate generic/manual completion path being offered for an evidence-owned reminder. Build 93 had already made the Server occurrence non-completable and removed the Native manual disposition. Build 94 now adds direct end-to-end regression coverage of the correct post-time path rather than reintroducing a completion command.

No additional Server DEXA source change was justified. The Native candidate adds a DEBUG-only source-shaped post-time fixture and verifies ordinary priority presentation, direct PDF navigation, and the absence of manual disposition.

### 2. Adaptive Home priority layouts

`Today's Priorities` now packs rows deterministically while preserving canonical item order:

- adjacent short priorities remain paired;
- any priority with an action/status chip, grouped session, predictably long title/subtitle/metadata, or an unmatched tail spans both columns;
- a lone priority spans the full row;
- arbitrary 3+ row sets are supported;
- accessibility Dynamic Type uses one full-width item per row;
- the existing odd-tail behavior remains intact.

The layout decision is presentation-only. It does not alter identity, copy, completion rules, skip rules, or Server ordering. Dark and Mineral Light simulator renders show the long DEXA action row and final Evening Walk row at full width while short items remain paired.

### 3. Morning Check-In evidence-aware prompts

#### Actual gap

`MorningEvidenceRecoveryService` already had the correct owner/date semantics once it received canonical objects: it suppresses duplicate Activity/Nutrition recovery actions for partial HealthKit days, handles pending review, daily protocol expectations, date matching, and the local-date rollover case.

The production PostgreSQL read store, however, graduated HealthKit canonical-day overlays only into Log and Operating Plan. `core.navigation.morning-check-in` therefore could read the same owner/date without seeing canonical HealthKit Activity/Nutrition that Log already saw, producing false `Add Activity` / `Add Nutrition` prompts.

#### Smallest Server correction

`85a98025` adds only `core.navigation.morning-check-in` to the existing policy-controlled HealthKit graduated read-model set. Tests prove:

- the query remains owner-scoped;
- canonical `localDate` is preserved rather than inferred by UTC slicing;
- partial Activity and partial Nutrition are presence evidence and do not create duplicate recovery actions;
- the projection remains policy-controlled and OFF by default;
- no Weight domain, manual weigh-in flow, evidence fabrication, or mutation path changes.

Delayed sync behavior is evidence-driven: before a canonical owner/date object exists, the genuinely missing prompt may remain; once the canonical day arrives, the read-time projection suppresses the duplicate. Multiple sources still flow through the existing canonical/dedup semantics.

This is a Server dependency and must receive separate deployment authority. It was not activated or deployed here.

### 4. HealthKit iPhone/Watch Workouts permission investigation

No new HealthKit product defect was demonstrated, so no HealthKit source patch was made.

Findings:

- The iPhone coordinator preflights the exact requested type set with `authorizationRequestRequirement`, serializes/coalesces concurrent requests, never presents from a prohibited background context, and permits a later foreground retry when the OS reports that a request is needed.
- The Watch coordinator preflights its exact workout share/read set, never presents from the automatic path, only requests from a direct user path when the OS returns `shouldRequest`, and coalesces concurrent calls.
- `HealthKitTypeRegistry.swift` is unchanged between released Build 92 `beaf5eff` and final Build 93 `9d0a2069`; Build 93 did not silently expand the automatic/workout read set.
- The current preflight/coalescing correction is already present in the candidate lineage (introduced by `6c52df29`).

The reported one-time iPhone/Watch Workout prompt is therefore consistent with the OS reporting an outstanding authorization requirement, or with behavior predating the existing preflight correction. There is no evidence that the current app repeatedly requests an already-satisfied unchanged type set. Permissions were not reset or mutated.

The available Mac has no registered Watch simulator device. The complete Watch app, Watch unit-test bundle, and Watch UI-test bundle were nevertheless compiled for the generic watchOS Simulator SDK. A controlled real-device prompt test would require explicit acceptance of the OS prompt state; it is not a prerequisite silently inferred by this task.

### 5. Claude lane coordination

- Claude DEXA presentation-only worktree was clean at `bedb807d` on `claude/dexa-oct9-presentation-republication-20261009`. It changes guarded presentation republication, not this DEXA appointment lifecycle or Morning read-model dependency.
- Claude Goal Intelligence worktree was clean at `7e92c1f8` on `claude/goal-intelligence-existing-engine-audit-20261009`. It is an audit/handoff lane; no Goal Adaptation implementation was merged.
- No overlapping Claude changes were copied, reset, amended, or deployed. Xcode work was serialized; no Claude `xcodebuild`/XCTest process was active when these focused gates ran.

## Verification

### Native focused units — PASS

Command scope:

```text
PhysiqueOSTests/HomeReadModelTests
PhysiqueOSTests/HealthKitCapabilityTests
```

Result: **52 passed, 0 failed** (`38` Home + `14` HealthKit capability).

Coverage includes content-aware row packing, long/action rows, unmatched tails, accessibility rows, DEXA non-completability, Morning completion/skip rules retained from Build 93, exact HealthKit preflight decisions, foreground/background behavior, and coalescing.

Result bundle: `/tmp/physiqueos-build94-native-dd/Logs/Test/Test-PhysiqueOS-2026.10.09_17-37-44--0700.xcresult` (local regenerable evidence; screenshots below are preserved in GitHub).

### Native focused simulator UI — PASS

Final focused checks: **5 passed, 0 failed** across two clean result bundles:

1. adaptive long/short/tail rows in Dark and Mineral Light;
2. existing odd-tail full-width behavior in both themes;
3. accessibility Dynamic Type single-column readability;
4. post-appointment DEXA direct PDF intake with no Complete/Skip;
5. accepted Editorial Rail hierarchy and navigation in Dark and Mineral Light.

The first development pass exposed two evidence-fixture assertions, not product regressions: the synthetic short-pair subtitle was initially long, and Sandbox initially used its legacy intake surface. The fixture was made genuinely short, the test selected the existing production intake seam, and the visible DEXA action assertion was corrected to query its static text. The consolidated final runs above are green without weakening any layout or behavior assertion.

Final result bundles:

- `/tmp/physiqueos-build94-native-dd/Logs/Test/Test-PhysiqueOS-2026.10.09_17-47-27--0700.xcresult` — 4/4
- `/tmp/physiqueos-build94-native-dd/Logs/Test/Test-PhysiqueOS-2026.10.09_17-48-54--0700.xcresult` — 1/1 Editorial Rail

### Watch compile gate — PASS

```text
xcodebuild build-for-testing
  -scheme PhysiqueOSWatch
  -destination generic/platform=watchOS Simulator
```

Result: **TEST BUILD SUCCEEDED**. Targets compiled: `PhysiqueOSWatch`, `PhysiqueOSWatchTests`, and `PhysiqueOSWatchUITests` for arm64/x86_64 watch simulator.

### Server focused contracts — PASS

Focused Vitest scope:

- `PostgresCoreNavigationReadStore.test.js`
- `HealthKitGraduationReader.test.js`
- `MorningEvidenceRecoveryService.test.js`
- `MorningPriorityReconciliationService.test.js`
- `DexaHomeLifecycle.test.js`
- `DexaPriorityDetailService.test.js`
- `DexaAppointmentLifecycleService.test.js`

Result: **7 files, 96 tests, 96 passed, 0 failed** in `965 ms`.

### Source hygiene and storage — PASS

- `git diff --check`: pass before sealing Native candidate.
- Native and Server candidate worktrees: clean after commit.
- Root pre-existing `.pnpm-store/` was not touched.
- Lowest observed APFS availability during final gates: about **27 GiB**, above the protected **12 GiB** floor.
- Build 93 archives, signed binaries, credentials, production runner, release pointers, and production data were untouched.

## Real simulator screenshots

All screenshots are XCUITest attachments from the final green candidate. Direct image links are provided for GitHub review.

| Evidence | GitHub | Direct image |
|---|---|---|
| Adaptive priorities — Dark | [view](https://github.com/dustinginn/physiqueos/blob/main/agent-handoffs/artifacts/20261009-build94-accepted-option-b/adaptive-priorities-dark.png) | [PNG](https://raw.githubusercontent.com/dustinginn/physiqueos/main/agent-handoffs/artifacts/20261009-build94-accepted-option-b/adaptive-priorities-dark.png) |
| Adaptive priorities — Mineral Light | [view](https://github.com/dustinginn/physiqueos/blob/main/agent-handoffs/artifacts/20261009-build94-accepted-option-b/adaptive-priorities-mineral-light.png) | [PNG](https://raw.githubusercontent.com/dustinginn/physiqueos/main/agent-handoffs/artifacts/20261009-build94-accepted-option-b/adaptive-priorities-mineral-light.png) |
| DEXA post-time priority — Dark | [view](https://github.com/dustinginn/physiqueos/blob/main/agent-handoffs/artifacts/20261009-build94-accepted-option-b/dexa-upload-priority-dark.png) | [PNG](https://raw.githubusercontent.com/dustinginn/physiqueos/main/agent-handoffs/artifacts/20261009-build94-accepted-option-b/dexa-upload-priority-dark.png) |
| Existing BodySpec PDF intake — Dark | [view](https://github.com/dustinginn/physiqueos/blob/main/agent-handoffs/artifacts/20261009-build94-accepted-option-b/dexa-pdf-intake-dark.png) | [PNG](https://raw.githubusercontent.com/dustinginn/physiqueos/main/agent-handoffs/artifacts/20261009-build94-accepted-option-b/dexa-pdf-intake-dark.png) |
| Accepted Editorial Rail — Dark | [view](https://github.com/dustinginn/physiqueos/blob/main/agent-handoffs/artifacts/20261009-build94-accepted-option-b/editorial-rail-dark.png) | [PNG](https://raw.githubusercontent.com/dustinginn/physiqueos/main/agent-handoffs/artifacts/20261009-build94-accepted-option-b/editorial-rail-dark.png) |
| Accepted Editorial Rail — Mineral Light | [view](https://github.com/dustinginn/physiqueos/blob/main/agent-handoffs/artifacts/20261009-build94-accepted-option-b/editorial-rail-mineral-light.png) | [PNG](https://raw.githubusercontent.com/dustinginn/physiqueos/main/agent-handoffs/artifacts/20261009-build94-accepted-option-b/editorial-rail-mineral-light.png) |

SHA-256:

```text
b9dcdbce487a15c1d149cbc87420fbf4590dfdcc37cf53799f5ccbf1381a7c20  adaptive-priorities-dark.png
10dd6865b8b6aee40023cd9ba06235dfb5326e6fb1856d3a27a8ed38260ba8bf  adaptive-priorities-mineral-light.png
f839d1a341dfe9c6aa3540e6a7f2bf92258d8ea6d0ba87a4c36847fe8a5ee0bb  dexa-pdf-intake-dark.png
9d95f4d8b51ff79f00238422d8731f416ca98063c31de55a3b7bdc52f3049f99  dexa-upload-priority-dark.png
a589d393fc72405542874c38be9dfbed8cc7edc238956df9596fe175b7edd973  editorial-rail-dark.png
351cf1ad920056c64a855f193778c397b3522ae83844a0df172fded1e5b45eeb  editorial-rail-mineral-light.png
```

## Proposed efficient Build 94 final release matrix

This is a proposal for Founder review, not a gate change or release authorization:

1. Merge the accepted Native candidate and, only after separate Server authority, deploy/verify the Server dependency behind the existing OFF-by-default HealthKit graduation policy.
2. Run the complete Server unit suite plus explicit Morning owner/date/partial/timezone and DEXA lifecycle contracts.
3. Run the complete iPhone unit suite on the final integrated SHA.
4. Run a targeted iPhone UI integration matrix covering the five checks above, Morning manual weight/navigation, failed DEXA intake retention, and final Home/Log/Evidence routing rather than repeating unrelated historical visual suites.
5. Run focused Watch authorization/workout tests on an available Watch simulator; retain the generic Watch test-build gate. Do not reset real-device permissions. If the Founder wants real-hardware prompt evidence, execute it as a separately accepted smoke test because OS authorization state is not deterministic.
6. Retain all normal Release configuration, signing, archive, storage-floor, Server preflight, Recovery-OFF, and TestFlight gates. No release work begins from this report alone.

## Acceptance questions

1. Accept Native `d0104815` as the Build 94 integrated visual/DEXA candidate?
2. Accept Server `85a98025` as the bounded Morning evidence dependency for a later separately authorized guarded deployment, with HealthKit graduation still OFF by default?
3. Accept the HealthKit investigation's no-code conclusion, or request a controlled real-device authorization smoke test before final release gates?
4. Approve the proposed targeted Build 94 final UI matrix after final integration, while retaining the full unit, Watch compile/test, Server, Release, signing, archive, storage, and production preflight gates?

## Explicit stop state

- No Server deployment or production mutation.
- No Recovery activation.
- No Goal Adaptation implementation.
- No build-number change.
- No archive or TestFlight upload.
- No release-pointer update.
- No Build 93 archive or signed-binary mutation.

Work stops here for Founder review.
