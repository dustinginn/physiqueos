# Build 94 — final integration validation and guarded release plan

Date: `2026-10-10T02:38:27Z`
Operator: Codex A
Governing assignment: `agent-handoffs/inbox/prompts/20261009-codex-build94-founder-accepted-final-integration-gates.md` at `d66b9cab`
Result: **accepted Native and Server candidates validated; guarded release plan ready; no deployment, archive, build bump, TestFlight upload, policy mutation, production data mutation, or release-pointer change**

## Release-set integrity

Build 94 is a coordinated two-candidate release set, not one safe monorepo merge commit:

| Surface | Published branch | Exact candidate | Integrity result |
|---|---|---:|---|
| Native | `codex/native-build94-integrated-candidate-20261009` | [`d0104815`](https://github.com/dustinginn/physiqueos/commit/d01048154e41dfc71a3c41cfc185b22bc4c81ce2) | Remote head exact; starts from accepted Editorial Rail `b1535c7d`; accepted iOS tree tested below |
| Server | `codex/server-build94-morning-evidence-20261009` | [`85a98025`](https://github.com/dustinginn/physiqueos/commit/85a9802587de0ef23ff2021e803258dea825254d) | Remote head exact; parent is the exact live Server SHA `5e91aa5d`; exactly 3 files, `+120/-2` |

The Native and production Server branches have deliberately separate lineages. A local trial that literally cherry-picked the Server change onto the Native history exposed a dangerous result: that history's Server tree predates production and would remove or regress hundreds of current Server files. The trial was rejected before publication and is being deleted locally. No unsafe combined commit was pushed. The release plan therefore keeps the accepted Native binary source and exact-production-lineage Server source separate, as the deployed products already are.

Exact Server delta from live production:

- `src/platform/database/PostgresCoreNavigationReadStore.js`
- `src/platform/database/PostgresCoreNavigationReadStore.test.js`
- `src/domain/services/MorningEvidenceRecoveryService.test.js`

The Server correction adds only `core.navigation.morning-check-in` to the existing graduated HealthKit read-model set. It creates no migration, write path, new policy record, or evidence object.

## Production authority and policy audit

All production checks were read-only. The approved Mac console runner recovered from commit `4025f175` matched its pinned Git blobs before use. Both database audits ran inside `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, confirmed `transaction_read_only=on`, and explicitly rolled back.

Current production authority after all validation:

- App: `bf57cf56-48cc-4cd6-90e4-a23ee5381741`
- Deployment: `fc523740-94be-4abc-a900-02f18cdf8831`, `ACTIVE`, `9/9`
- Web source SHA: `5e91aa5d11d34e9b717d456a1620cc8303373947`
- Worker source SHA: `5e91aa5d11d34e9b717d456a1620cc8303373947`
- Runtime build: `physiqueos-5e91aa5d-20261009`
- `/live`: healthy
- `/ready`: all 9 checks ready; schema `000014`; runtime authority ready
- No deployment is in progress.

### Morning HealthKit activation finding

The earlier candidate report's phrase “OFF by default” accurately describes code defaults but not current production policy state. Production already has `healthkit_canonical_graduation_policy` version `4`:

- projection: **enabled** for `activity` and `nutrition`, effective `2026-09-22`, open-ended;
- evidence eligibility: enabled for `activity`, `cardio_training`, `nutrition`, and `sleep`, effective `2026-09-22`, open-ended;
- historical briefing regeneration: `false`.

Therefore **deploying `85a98025` would immediately activate the Morning Check-In read-time overlay without any policy write**. No policy APPLY is required or permitted by this assignment. Although the dependency is approved for integration, its future Server deployment is the behavioral activation boundary and still requires the later explicit Server deployment authorization required by this assignment.

Sanitized owner/date audit for `2026-10-07` through `2026-10-08`:

| Date | Domain | Canonical coverage | Revision | Ordinary duplicate | Pending review | Candidate presence |
|---|---|---|---:|---|---|---|
| 2026-10-07 | Activity | `complete_day` | 38 | no | no | yes |
| 2026-10-07 | Nutrition | `complete_day` | 4 | no | no | yes |
| 2026-10-08 | Activity | `complete_day` | 48 | no | no | yes |
| 2026-10-08 | Nutrition | `complete_day` | 4 | no | no | yes |

The expected behavioral delta is bounded: Morning Check-In stops asking for Activity/Nutrition when the same owner/date canonical HealthKit day already exists. Manual weight, DEXA, evidence persistence, pending-review semantics, and genuinely missing-day prompts do not change.

### Recovery remains OFF

A separate read-only audit found no `recovery_briefing_publication_authority` record in production. Effective Recovery publication state is **OFF**. Candidate `85a98025` does not touch Recovery code or policy. Weekly/Monthly-only source constraints remain intact, and no Recovery activation occurred.

## Validation results

### Native full unit gate — PASS

Exact accepted iOS tree: `d0104815` (verified byte-identical to the tested checkout).

- Full `PhysiqueOSTests`: **2,287 executed, 0 failures, 2 intentional local-only skips**.
- Includes the accepted adaptive Home layout, DEXA upload, Editorial Rail, Logger progression, Energy back trail, Morning weight, HealthKit authorization, and current Watch projection contracts.
- Result bundle was generated under `/tmp/physiqueos-build94-final-dd/Logs/Test/` and treated as regenerable local evidence.

### Focused iPhone UI integration — PASS

The first matrix launch encountered an Xcode simulator infrastructure failure before any test body ran: `Timed out while loading Accessibility`. No product assertion failed and no source changed. The dedicated test simulator was cleanly rebooted; a one-test accessibility smoke passed, then the remaining seven tests passed on the same build products.

Final result: **8/8 passed, 0 product failures**:

1. every Priority Detail family exposes only its allowed actions (including Morning Skip/no Complete and DEXA no Complete/Skip);
2. post-appointment DEXA opens the existing PDF intake directly;
3. Morning Check-In dispositions and atomic save/return flow;
4. manual weight exposes Return to Log only after durable success;
5. odd Home tail spans the full row in Dark and Mineral Light;
6. adaptive short-pair/long-row/tail layout in Dark and Mineral Light;
7. accessibility Dynamic Type uses readable single-column priorities;
8. accepted Option B Editorial Rail retains primary-before-secondary hierarchy and Midweek navigation in Dark and Mineral Light.

The accepted source-identical screenshots remain published at `agent-handoffs/artifacts/20261009-build94-accepted-option-b/`; this task did not redesign or replace them.

### Watch gate — PASS

A temporary watchOS 27 Apple Watch Ultra 3 simulator was created solely for validation:

- Full `PhysiqueOSWatchTests`: **76/76 passed, 0 failures**.
- The temporary simulator was shut down and deleted afterward.
- No real-device HealthKit authorization state was reset or changed.

### Exact Server gate — PASS

Run on exact `85a98025`, not the rejected synthetic lineage:

- focused Morning/HealthKit/DEXA lifecycle matrix: **7 files, 96/96 passed**;
- production Next webpack build: compiled and type-checked successfully; all 50 static pages generated;
- `git diff --check`: pass;
- no migration and no production access during build/test.

### Release configuration and readiness — PASS with expected later signing work

- Deterministic Xcode generator: project SHA-256 stayed exactly `f38c5dd889f10a1453a8b0d181e4dd9c0260ef3a6c1a9f5dccf442e51c11ef53` before, between, and after two generations; no project diff.
- Release verifier: pass at intentionally unchanged `1.0 (93)`.
- Unsigned generic-device Release compile: exit `0`; only existing Swift warnings, no compile failure.
- Release settings: automatic signing, team `33GMTRM6G9`, bundle `com.physiqueos.native.dev`.
- Local keychain: one valid Apple Development identity. No cached provisioning profile was present. Distribution signing must therefore be proven during the later networked archive/export gate after the authorized Build 94 bump; no archive was attempted here.
- Storage: about 30 GiB available at start; lowest observed about 27 GiB, always above the protected 12 GiB floor; 29 GiB available after removing only the completed regenerable DerivedData and rejected local trial worktree.

## Claude DEXA republication coordination

The separate Claude operation remains isolated:

- branch `claude/dexa-oct9-presentation-republication-20261009` is still remotely at `bedb807d`;
- its worktree is clean;
- no DEXA republication or Xcode process was active during Codex testing;
- the guarded one-row operation has not published an execution result yet.

Nothing from that operation was merged, replayed, or executed here. The Server deployment gate below must remain closed until Claude publishes the exact DEXA APPLY/postverification result and production authority is re-read. The operation is presentation-only and remains independent of Morning evidence projection.

## Guarded release plan

### Gate A — DEXA operation settlement

1. Require Claude's final report for the authorized one-row October 9 DEXA presentation republication.
2. Re-read production deployment, runtime SHA, health, and relevant DEXA row state after that operation.
3. Stop on any unexpected Server deployment, candidate change, DEXA row drift, or operation still in progress.

### Gate B — immediate Server preflight (future authorization required)

Immediately before a future deployment, require all of the following to match:

1. production branch, Web source, Worker source, runtime stamp, and healthy deployment all remain exact `5e91aa5d` / `fc523740` (or a separately reviewed successor explicitly incorporated first);
2. no deployment in progress; 9/9 readiness checks green; schema still `000014`;
3. Server candidate remains exact `85a98025`, parent exact `5e91aa5d`, and diff remains exactly the three files above;
4. HealthKit graduation policy remains version 4 with the exact projection window/domains audited above;
5. Oct 7–8 canonical day revisions/coverage, ordinary-evidence absence, and pending-review absence match the sealed audit, or any newer date window is freshly sealed;
6. Recovery publication authority remains absent/OFF;
7. rerun 96/96 focused Server tests and the production build if candidate or toolchain inputs changed.

Any mismatch is a hard stop. Because policy is already enabled, do not perform a separate policy APPLY. The later explicit Server deployment authorization must acknowledge that deployment activates the Morning overlay immediately.

### Gate C — guarded Server deployment and verification

After explicit authorization only:

1. fast-forward the production Server branch from exact live base to `85a98025`;
2. apply the established two-step deployment procedure, changing only Web/Worker `PHYSIQUEOS_GIT_SHA` and `PHYSIQUEOS_BUILD_ID`, then forcing the exact rebuild;
3. prove Web and Worker `source_commit_hash` and runtime stamps equal `85a98025`;
4. require `/live` and all `/ready` checks green, schema unchanged, and no cost/instance/config drift;
5. rerun the bounded read-only Morning audit: HealthKit-backed owner/date Activity/Nutrition is present, ordinary duplicate count remains zero, pending review unchanged, and genuinely missing evidence still prompts;
6. verify HealthKit configuration/canonical-day records and Recovery authority were not mutated by deployment.

Rollback is code-only: redeploy exact `5e91aa5d` with matching stamps and force rebuild, then repeat health and read-only parity checks. There is no policy rollback because this plan performs no policy write.

### Gate D — Native Build 94 archive/TestFlight (future authorization required)

1. keep Native source exact `d0104815` and Server source exact authorized production candidate;
2. explicitly authorize and apply the Build 94 number bump;
3. regenerate twice, require byte-identical project output, and rerun Release verification;
4. recheck at least 12 GiB free and serialize Xcode use;
5. archive with automatic signing; verify distribution identity/profile, app + Watch/widget version parity, entitlements, dSYMs, and archive validation;
6. upload to TestFlight only after separate release authorization and all Server postdeployment gates pass;
7. move release pointers only after App Store Connect reports the Build 94 upload `VALID`.

## Remaining gates / stop state

Not yet satisfied:

- Claude DEXA republication execution/postverification report;
- explicit Server deployment authorization acknowledging deployment-time Morning activation;
- explicit Build 94 bump/archive/TestFlight authorization;
- live distribution signing/profile proof and archive validation;
- Server postdeployment read-only parity and TestFlight `VALID` evidence.

Explicitly unchanged:

- no Server deployment or app-spec mutation;
- no HealthKit or Recovery policy write;
- no production evidence write;
- no Build 94 number bump;
- no archive or TestFlight upload;
- no Recovery activation;
- no release-pointer update.
