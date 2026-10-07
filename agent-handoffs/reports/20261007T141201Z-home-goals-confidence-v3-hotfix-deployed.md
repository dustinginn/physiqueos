# Home/Goals Confidence V3 incident hotfix deployed and verified

**Final status: Home/Goals Confidence V3 incident hotfix deployed and verified.**

- Founder-authorized hotfix: `e7ffc6716706ae4d2140008a1655bfed95a93889`
- Previous production / retained rollback: `1b6687ffbf016575e674d12406200c3792eb90a7`
- Production deployment: `b98c26e4-22dc-40fd-9e3e-b9944fe9c7d8`
- Runtime build: `physiqueos-e7ffc671-20261007`
- Rollback invoked: **NO**
- Founder data rewrite / migration / backfill: **NO / NO / NO**
- Credential / pairing / Native Build 90 or 91 mutation: **NO / NO / NO**

## Result

The isolated one-commit Server compatibility hotfix was normally fast-forwarded from exact production `1b6687ff` to exact `e7ffc671`, then deployed through the established release-stamp update plus one intended force rebuild.

The deployment reached ACTIVE 9/9. Production ref, web source, worker source, runtime SHA, and health build identity all agree on `e7ffc671`. Live and readiness return HTTP 200, all nine readiness checks are green, and no deployment remains in progress.

Fresh canonical-owner read-only execution of the exact Native production resource service now succeeds for both Build 90 resources:

- `home`, presentation version 2 with `America/Los_Angeles` device-compatible timezone semantics;
- `goals`.

The active Confidence V3 projection is current 80, derived prior 79, delta +1, and movement `increased`. The displayed movement sentence is direction-explicit. The canonical V3 narrative and rich explanation remain present in separate fields and were verified only by schema, lengths, and presence—not emitted. The exact contradiction that caused the incident no longer occurs.

Adaptive Progression V1 remains present. The hotfix contains no Training change, and its focused progression tests remain green.

## Predeploy authority

All checks were refreshed before the first mutation.

| Gate | Accepted result |
|---|---|
| Production ref | exact `1b6687ffbf016575e674d12406200c3792eb90a7` |
| Active deployment | `cbe6be96-12c5-474f-a8bf-f01ba8076121` |
| Phase / progress | ACTIVE / 9 of 9 |
| In-progress deployment | none |
| Web / worker source | exact `1b6687ff` / exact `1b6687ff` |
| Runtime build | `physiqueos-1b6687ff-20261006` |
| Live | HTTP 200 / `ok` |
| Ready | HTTP 200 / `ready`; all nine checks ready |
| Runtime console | exact `1b6687ff`, `transaction_read_only=on`, explicit rollback |

Readiness codes were all green:

- `ACCESS_GATE_READY`;
- `PROVIDER_CONFIGURATION_READY`;
- `PROVIDER_DATABASE_REACHABLE`;
- `PROVIDER_DATABASE_IDENTITY_MATCHED`;
- `PROVIDER_OWNER_IDENTITY_READY`;
- `PROVIDER_MIGRATION_000014_APPLIED`;
- `PROVIDER_RUNTIME_AUTHORITY_READY`;
- `PROVIDER_OBJECT_STORAGE_REACHABLE`;
- `PROVIDER_READINESS_COMPLETED_IN_BUDGET`.

## Candidate and test gate

The remote candidate branch and local clean HEAD were exact `e7ffc671`. Its merge base with production was exact `1b6687ff`, and it was exactly one commit ahead and zero behind.

The complete candidate diff contained only:

- `src/domain/services/ActiveGoalConfidencePresentationReadService.js`;
- `src/domain/services/StrategicInterpretationPublicationServiceV3.test.js`.

There was no database, migration, backfill, infrastructure, image, topology, dependency, package-lock, or Native diff.

Focused incident regression gate:

- production-shaped V3 direction-neutral increase;
- active-goal Confidence presentation;
- canonical Confidence invariant;
- Core Home and Goals reads;
- Weekly/Midweek V3 publication integration.

Result: **5 files, 68 tests passed, 0 failed**. `git diff --check` passed and the candidate worktree was clean.

## Spec guard and deployment

The live App Platform spec was read without printing secret values. It retained one web service and one worker, each one `apps-s-1vcpu-1gb-fixed` instance, region `sfo`, source branch `combined-app-platform-cutover`, and the established domain/ingress/alert/environment topology.

Predeploy spec digest: `63c366ecc0338f15b96dd3e3438be1411615654cbe539a2af512e9398347ecde`.

Candidate spec digest: `8edff2d8ca02462cb0ee629f511ef794571979b1013b3c21c9557bec3c63c999`.

The semantic diff was exactly four values:

1. web `PHYSIQUEOS_GIT_SHA` → full `e7ffc671`;
2. web `PHYSIQUEOS_BUILD_ID` → `physiqueos-e7ffc671-20261007`;
3. worker `PHYSIQUEOS_GIT_SHA` → full `e7ffc671`;
4. worker `PHYSIQUEOS_BUILD_ID` → `physiqueos-e7ffc671-20261007`.

Deployment sequence:

1. Re-read production ref and required exact `1b6687ff`.
2. Non-force exact refspec fast-forwarded `combined-app-platform-cutover` to `e7ffc671`; immediate remote readback matched.
3. Applied the prevalidated four-stamp-only spec with source update.
4. Created exactly one intended force rebuild: `b98c26e4-22dc-40fd-9e3e-b9944fe9c7d8`.
5. Observed PENDING_BUILD → BUILDING → DEPLOYING → ACTIVE 9/9.

Final deployment inventory:

| Deployment | Cause | Phase | Progress |
|---|---|---|---|
| `b98c26e4-22dc-40fd-9e3e-b9944fe9c7d8` | manual force rebuild | **ACTIVE** | **9/9** |
| `0c0ad206-23f1-4765-9d51-fe254f56573f` | app spec updated | CANCELED | 1/9 |
| `cbe6be96-12c5-474f-a8bf-f01ba8076121` | prior `1b6687ff` deployment | SUPERSEDED | 9/9 |

The automatic spec-update deployment was canceled by the intended force rebuild, matching the established procedure. No second rebuild or cancel mutation was issued.

## Postdeploy authority and health

| Gate | Final value |
|---|---|
| Production ref | exact `e7ffc6716706ae4d2140008a1655bfed95a93889` |
| Active deployment | `b98c26e4-22dc-40fd-9e3e-b9944fe9c7d8` |
| Phase / progress | **ACTIVE / 9 of 9** |
| In-progress deployment | none |
| Web source | exact `e7ffc671` |
| Worker source | exact `e7ffc671` |
| Runtime `PHYSIQUEOS_GIT_SHA` | exact `e7ffc671` |
| Build ID | `physiqueos-e7ffc671-20261007` |
| Live | HTTP 200 / `ok` / exact build ID |
| Ready | HTTP 200 / `ready` / all nine checks ready |
| Runtime console | exact SHA, database bindings present, `transaction_read_only=on`, explicit rollback |

Authority and health were rechecked after all resource verification and remained stable.

## Fresh Build 90 resource verification

The established exact Native production service harness ran against canonical production data inside one `REPEATABLE READ READ ONLY` transaction. It allowed only `SELECT`/`WITH`, disabled commands/media, required exact runtime `e7ffc671`, explicitly rolled back, performed a post-rollback probe, and emitted no payload values or identifiers.

### Home

| Assertion | Result |
|---|---|
| Contract / resource / authority | `1` / `home` / `founder-production` |
| Required Build 90 sections | all present |
| Fresh exact read | success, no failure code |
| Cold / warm | 2068.0 ms / 1449.2 ms |
| Confidence value | 80 |
| V3 detail schema | `home_confidence_presentation_v3` |
| Movement / delta | `increased` / +1 |
| Derived prior | 79 |
| Rich `whyConfidence` | present, 184 characters |
| Canonical narrative alias | present, 159 characters |
| `whatIncreasedIt` | 2 structured entries |
| Rich narrative separate from movement sentence | true |

### Goals

| Assertion | Result |
|---|---|
| Contract / resource / authority | `1` / `goals` / `founder-production` |
| Fresh exact read | success, no failure code |
| Cold / warm | 1199.6 ms / 1079.4 ms |
| Active goals | 1 |
| Completed-goals collection | present |
| Active Confidence value | 80 |
| Movement sentence | direction-explicit increase, no decrease contradiction |
| Rich narrative handling | separate V3 Home detail preserved; no V2 explanation model fabricated |

The exact resource harness also read the existing `evidence-review-queue` control successfully with no failure, consistent with Evidence remaining usable.

## Adaptive Progression V1 preservation

`e7ffc671` descends directly from `1b6687ff`, and the candidate diff contains no Training Logger, progression selector, policy, protocol builder, training UI, or Training integration change.

Postdeploy source/targeted control:

- `AdaptiveTrainingProgressionStepSelector.test.js`;
- `TrainingLoggerProgressionService.test.js`;
- `TrainingProgressionPolicy.test.js`;
- `TrainingProtocolBuilderService.test.js`.

Result: **4 files, 38 tests passed, 0 failed**. Adaptive Progression V1 remains deployed under the exact `e7ffc671` runtime.

## Rollback and mutation record

No rollback trigger occurred. The hotfix source, deployment, live/readiness, Home contract, Goals contract, V3 Confidence projection, rich narrative preservation, Evidence control, and Adaptive Progression control all passed. Rollback to `1b6687ff` was therefore not invoked.

Authorized production mutations were limited to:

- the exact non-force production branch fast-forward;
- the four release-stamp spec update;
- one force-rebuild deployment.

There was no Founder data write, Confidence rewrite, migration, backfill, database change, credential change, pairing/session change, reinstall, cache clear, Native release, or Build 90/91 modification. Every production database verification transaction was read-only and explicitly rolled back. The temporary live-spec file and verification bundles were removed after use.

## Founder next action

On the existing paired TestFlight Build 90 installation, reopen or refresh **Home** and **Goals**. Do not re-pair, reinstall, or clear app data.

If either screen still fails despite the verified green Server reads, capture the new timestamp and investigate the preserved client cache/session evidence separately before taking any destructive client action.

Notification: **PhysiqueOS incident — Home/Goals production reads restored; Founder verification requested.**
