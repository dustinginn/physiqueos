# Incident: Build 90 Home and Goals production load failure

**Status: ROOT CAUSE IDENTIFIED — SERVER/DATA PROJECTION DEFECT.**

At approximately 06:11 PDT on 2026-10-07, the Founder’s physical iPhone on TestFlight Build 90 showed **“Home could not be loaded.”** and **“Goals could not be loaded.”** after two force-close/relaunch attempts. Evidence remained usable and You → Founder Production continued to report **“Production session available.”**

The immediate cause is a newly published, structurally valid canonical Confidence V3 assessment whose movement is `increase` (79% → 80%) but whose generic narrative does not contain an increase/decrease word. Home and Goals share `resolveActiveGoalConfidencePresentation`; its V3 projection treats that generic narrative as the movement display sentence and then rejects it with:

`CANONICAL_CONFIDENCE_PRESENTATION_INCREASE_DIRECTION_CONTRADICTION`

This is a latent Server read-projection incompatibility activated by production data at 05:47 PDT. It is **not** an Adaptive Progression V1 regression, Build 90 decoder defect, session/pairing failure, provider outage, or transient network failure.

## Classification and action

| Item | Conclusion |
|---|---|
| Classification | **SERVER/DATA PROJECTION DEFECT** |
| Confidence | **High** |
| Immediate Founder action | **None. Founder: do not re-pair or reinstall yet.** Preserve the current session/cache evidence. |
| Rollback | **Do not roll back.** `b7eb1e39` contains byte-identical failing Confidence projection/invariant code, and rollback would not remove the persisted assessment. |
| Native replacement | Not required for this root cause; do not modify/upload Build 91 or a Build 90 replacement. |
| Safest remediation | Deploy the isolated Server compatibility hotfix candidate `e7ffc6716706ae4d2140008a1655bfed95a93889` only after separate Founder authorization. |
| Production mutations during audit | **None.** No data write, rollback, deployment, credential change, re-pair, Native release, or Build 91 change occurred. |

## Production authority and health

Fresh checks were made before reading incident data.

| Authority | Observed |
|---|---|
| Production ref | `refs/heads/combined-app-platform-cutover` → `1b6687ffbf016575e674d12406200c3792eb90a7` |
| Active deployment | `cbe6be96-12c5-474f-a8bf-f01ba8076121` — `ACTIVE`, 9/9 |
| Transitional deployment | None |
| Web source | `1b6687ffbf016575e674d12406200c3792eb90a7` |
| Worker source | `1b6687ffbf016575e674d12406200c3792eb90a7` |
| Runtime build | `physiqueos-1b6687ff-20261006` |
| `/api/v1/health/live` | HTTP 200, `ok` |
| `/api/v1/health/ready` | HTTP 200, `ready` |

All nine readiness checks were true: access gate, provider configuration, database reachability, database identity, owner identity, migration `000014`, runtime authority, object storage, and readiness budget.

The staged `d789ce27` production doctor independently confirmed the exact runtime SHA, required database bindings without emitting their values, `transaction_read_only=on`, a successful bounded query, explicit rollback, and stable control-plane authority afterward.

## Incident window and bounded logs

The bounded active-deployment web log review covered the incident window without emitting Founder payloads.

- 06:09:58.005 and 06:09:58.010 PDT: two initial reads received `401 ACCESS_TOKEN_EXPIRED`.
- 06:09:58.181 and 06:09:58.266 PDT: refresh challenge and refresh both completed with HTTP 200.
- 06:10:06.580 PDT: the first application HTTP 500 appeared. The exception is `CANONICAL_CONFIDENCE_PRESENTATION_INCREASE_DIRECTION_CONTRADICTION` (surfaced to the request log as `INTERNAL_ERROR`).
- The same projection failure repeated through 06:12:13 PDT, matching relaunch/retry behavior.
- Additional refresh challenge/refresh pairs at 06:10:38–06:10:39 and 06:11:56 PDT also completed with HTTP 200.
- The available active-deployment tail contained no earlier occurrence of this invariant error.

The failure log record does not retain the resource route, so individual 500 request IDs cannot be labeled Home versus Goals from logs alone. The exact exception is nevertheless on the one shared dependency used by both resources, and the simultaneous physical-device messages provide the matching surface correlation.

Successful production reads are not logged at the same request-summary level, so the log sample cannot independently prove a same-window Evidence 200. The Founder’s direct observation that Evidence remained usable is consistent with source tracing: Evidence uses the same transport/session but does not use the failing active-goal Confidence presentation.

## Production read reproduction

The authorized canonical-owner production path was exercised inside `REPEATABLE READ READ ONLY`, after verifying `transaction_read_only=on`; the transaction was explicitly rolled back. No narrative text or other Founder payload was emitted.

Sanitized facts:

| Fact | Result |
|---|---|
| `goalConfidenceSnapshots` | 2 records |
| `goalConfidenceHistory` | 33 records |
| `goalConfidenceContinuitySeeds` | 1 record |
| Active/latest user-facing assessment | `canonical_confidence_assessment_v3` |
| Publisher | `midweek_briefing` |
| Publication | `2026-10-07T12:47:27.289Z` (05:47:27 PDT) |
| Movement | `increase`, magnitude `small` |
| Percentages | prior 79, current 80, delta +1 |
| V3 presentation | Present |
| Generic narrative | Present, 159 characters; contains neither increase nor decrease language |
| Prior publication | Weekly V3, held at 79, direction-neutral narrative; valid for a hold |

Re-evaluating those sanitized production facts through the exact deployed invariant reproduces:

`CANONICAL_CONFIDENCE_PRESENTATION_INCREASE_DIRECTION_CONTRADICTION`

The data exists and is structurally readable; the Server throws while projecting the shared active-goal Confidence child. Therefore neither Home nor Goals reaches a successful contract-v1 resource envelope or Native decoding. This matches the observed HTTP 500s and excludes a missing-field/JSON decode failure as the primary cause.

## Shared Server dependency

The Native resource router sends:

- `home` → `NativeProductionContractService.read` → `CoreNavigationReadService.getHome()` → Home presentation assembly → `resolveActiveGoalConfidencePresentation()`.
- `goals` → `NativeProductionContractService.read` → `CoreNavigationReadService.getGoals()` → `GoalsHubReadService` → `resolveActiveGoalConfidencePresentation()`.

Both flows call `assertCanonicalConfidencePresentation`. For Confidence V2, the shared explanation model creates a direction-explicit sentence. For V3, `buildConfidenceExplanationModel` intentionally returns no model; the read service falls back to `assessment.narrativeExplanation.text`, even though V3 stores movement semantically in structured fields and its narrative is not required to repeat a movement verb. The invariant then requires lexical increase wording for structured movement `increase` and throws.

Evidence reads use the same `ProductionNativeAPI`, base URL, access token, refresh flow, request signer, authority, and owner-scoped session, but their resource services do not invoke this active-goal Confidence projection.

## Adaptive Progression V1 diff audit

The complete `b7eb1e397f0238df9ae904fd182ddbb51602e8d8..1b6687ffbf016575e674d12406200c3792eb90a7` diff contains 17 files: a report, tests/configuration, Training Logger UI/preview changes, the Adaptive Progression selector/policy/services, Training protocol builder behavior, and `CoreNavigationReadService` integration.

The only shared navigation change is scoped to `getTrainingLogger`: it loads protocol/version collections, resolves the active Training progression strategy, and projects progression metadata. Home and Goals collection lists and execution branches are unchanged. The new imported progression modules have no top-level production I/O.

Explicit coupling result:

| Area requested for audit | `b7eb1e39` → `1b6687ff` finding |
|---|---|
| Home projection/read | No behavior change |
| Goals projection/read | No behavior change |
| Operating-plan reads used by Home/Goals | No incident-path change |
| Goal confidence | No change |
| Priorities | No change |
| Briefing/Home assembly | No change |
| Authentication/owner resolution | No change |
| Resource router | No change |
| Canonical protocol/evidence loaders | Training Logger-only protocol additions; no Home/Goals coupling |
| Shared DB/read utilities | No change |
| Cache invalidation | No change |
| Serialization/JSON projection | No change |
| Migrations/data writes | None |

`ActiveGoalConfidencePresentationReadService.js` and `CanonicalConfidencePresentationInvariant.js` are byte-identical in `b7eb1e39` and `1b6687ff`. Adaptive Progression was deployed at approximately 19:05 PDT on 2026-10-06 and remained healthy; the activating Confidence publication arrived the next morning. A rollback would retain both the persisted data and the defect.

## Build 90 exact paths and failure mapping

Native authority is `32baf1d5f43120cd07088df1210e1dc84ed26a78` (TestFlight Build 90, VALID). The Build 90 commit is a metadata-only release bump; these read paths predate it.

### Home

- `ProductionHomeAPI.fetchHome()` performs `GET /api/v1/native/read/home?presentationVersion=2&timeZone=<device zone>`.
- The contract decodes a contract-v1 envelope with `JSONDecoder.convertFromSnakeCase`, verifies resource `home` and authority `founder-production`, then requires `header`, `hero`, `nextBestAction`, `briefingCards`, `goals`, and `todaysFocus`.
- Home uses a 30-second memory cache and a persisted same-device/same-canonical-day last-known snapshot.
- A valid last-known snapshot remains visible when refresh fails. The exact generic **“Home could not be loaded.”** state means no applicable last-known Home was available and the error was not the specially mapped reconnect, session-recovery, or network case.

### Goals

- `ProductionGoalsAPI.fetchGoalsHub()` performs `GET /api/v1/native/read/goals`.
- The hub requires `activeGoals` and `completedGoals`. Goal detail resources are not needed to render the landing page.
- Goals uses the common 90-second read cache but catches all load errors into **“Goals could not be loaded.”**

### Session behavior

Both resources use the same singleton `ProductionNativeAPI` as Evidence and You. On `ACCESS_TOKEN_EXPIRED`/`ACCESS_TOKEN_INVALID`, it performs one refresh and retries once. The production logs show multiple refreshes succeeding. You’s **“Production session available”** is evidence from stored-session resolution rather than proof of every resource, but the successful refresh transactions prove the pairing/session remained usable during this incident.

The Server 500 occurs before a response payload exists, so no optional/new Home or Goals field reaches Build 90’s decoder. Native cache orchestration and strict decoding are not the root cause.

## Isolated hotfix candidate

Candidate: `e7ffc6716706ae4d2140008a1655bfed95a93889` on `codex/incident-home-goals-confidence-v3-20261007`, based directly on deployed `1b6687ff` and pushed for review. It is **not deployed**.

The candidate changes only:

- `src/domain/services/ActiveGoalConfidencePresentationReadService.js`
- `src/domain/services/StrategicInterpretationPublicationServiceV3.test.js`

For V3 only, it derives a direction-explicit display sentence from canonical structured movement and percentages (for this row, “Confidence increased from 79% to 80%.”) before running the existing invariant. It preserves the full published V3 narrative in `canonicalNarrativeExplanation`, narrative fields, and rich explanation detail. V1/V2 behavior and the invariant itself are unchanged.

Verification:

- Production-shaped direction-neutral V3 increase regression: pass.
- Active presentation, invariant, Core Home/Goals navigation, weekly Confidence integration: **68 tests passed, 0 failed** across five focused files.
- `git diff --check`: clean.
- A broader parity attempt produced 70 passes and four environment-only failures because this read-audit checkout intentionally lacks `private/founder/runtime-store.json` and `private/founder/migration-control.json`; there was no candidate assertion failure in that run.

## Remediation gate

Recommended next action, requiring separate Founder authorization: review and deploy Server candidate `e7ffc671` using the normal production gate, then verify fresh Home and Goals reads on the preserved Build 90 session. Do not rewrite the production Confidence record, roll back Adaptive Progression, rotate credentials, re-pair, reinstall, clear app data, or release a new Native build for this incident.

No production mutation occurred during this audit.
