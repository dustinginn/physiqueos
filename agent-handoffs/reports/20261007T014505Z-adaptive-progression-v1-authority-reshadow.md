# Adaptive progression V1 authority resolved — DEPLOY RECOMMENDATION READY

- Generated: 2026-10-06 18:45 PDT / 2026-10-07T01:45:05Z
- Task authority: `2ad4a48f870e9a8f47bc9fb2830d8a9d94448b3b`
- Adaptive V1 candidate: `1b6687ffbf016575e674d12406200c3792eb90a7`
- Validated eligibility base: `999a225a38ced9ddb16a65bbe840896472265468`
- Current production Server / rollback authority: `b7eb1e397f0238df9ae904fd182ddbb51602e8d8`
- Production-read tooling: byte-identical `d789ce2770eda2f9bdb13a48bbc572901f2c61e2`
- Previous blocked report: `8ace3021941ed728785d5b796c9eaa7b8452e6e7`
- Recommendation: **DEPLOY RECOMMENDATION READY — STOP FOR FOUNDER AUTHORIZATION**
- Deployment or production mutation: **NO**
- Native Build 89 / Build 90 touched: **NO**

## Executive decision

Production does **not** have multiple executable Training authorities. The narrowly authorized authority-only diagnostic resolved exactly one active owned Training protocol and exactly one executable current version under the application’s real projection, owner, status, pointer, linkage, and lifecycle semantics.

The earlier `STRATEGY_AUTHORITY_AMBIGUOUS` result was a shadow-harness table mismatch. The failed harness queried `protocols` and `protocolVersions` from `physiqueos.canonical_evidence_records`; production `PostgresCoreNavigationReadStore`, through `PHASE4_DOMAIN_TABLES`, reads both collections from `physiqueos.canonical_protocol_records`. The wrong table produced an empty authority projection. It did not reveal a production data ambiguity.

The temporary shadow harness was corrected only to:

1. query `canonical_protocol_records` for `protocols` and `protocolVersions`;
2. project each row exactly as production does (`row.payload`, with no generic nested-payload unwrap);
3. apply the application’s owner match, active Training classification, current-version pointer, protocol linkage, non-superseded status, and open-ended version checks.

No candidate runtime code changed. A focused regression now proves the canonical table identity, direct payload projection, exact current-pointer resolution, and fail-closed duplicate/stale behavior.

After the diagnostic proved one supported authority, the one authorized three-exercise shadow passed. On identical sanitized production evidence, V1 produces the required outcomes:

- weighted Pull-Up: **REP**, +25 lb, 4 × 8, `same_load_rep_rebuild_supported`;
- Cable Machine Front Raise: **REP**, 150 lb, 4 × 11, `same_load_rep_rebuild_supported`;
- Spider Curl: **Maintain**, selector not invoked, 13 of 14 exposure days.

All required local gates remain green. Candidate `1b6687ff` is therefore **DEPLOY RECOMMENDATION READY**, subject to a separate explicit Founder deployment authorization. This task did not deploy it.

## 1. Fresh production authority and safety

Both the authority diagnostic and the conditional shadow required exact production `b7eb1e39` before opening their bounded read. Each completed a post-read equality check.

| Authority | Accepted value |
| --- | --- |
| App | `bf57cf56-48cc-4cd6-90e4-a23ee5381741` / `physiqueos-foundation-staging` |
| Active deployment | `6fa4e887-8849-450b-b068-5bdb11b90009` |
| Phase / progress | ACTIVE / 9 of 9 |
| Transitional deployment | none |
| Web source | exact `b7eb1e397f0238df9ae904fd182ddbb51602e8d8` |
| Worker source | exact `b7eb1e397f0238df9ae904fd182ddbb51602e8d8` |
| Public health / build | `ok` / `physiqueos-b7eb1e39-20261005` |
| Post-read equality | app, deployment, web, worker, and build unchanged |

Safety controls accepted on both production reads:

- existing approved `physiqueos-final-cutover-config` context only;
- exact d789ce27 runner and safety files verified byte-for-byte against Git;
- owner scope enforced inside the guarded payload but not emitted;
- one `REPEATABLE READ READ ONLY` transaction per call;
- `transaction_read_only=on` required and accepted;
- parameterized SELECT-only SQL with hard row limits;
- exact runtime SHA required inside the component;
- explicit rollback before framed output;
- one canonical frame, one success marker, one zero remote exit;
- output size, report schema, credential-shape, and forbidden-value checks accepted;
- no raw protocol JSON, raw session, notes/free text, database binding, certificate, credential, or owner identifier emitted;
- no write, deployment, reauthentication, credential change, or alternate context.

The authority diagnostic made one console call and read no exercise history. The conditional exercise shadow made one console call. A preceding local `node` invocation failed during static module resolution before any credential load, control-plane request, or console connection; it was corrected offline to the repository’s `tsx` loader and was not a production attempt or transport retry.

## 2. Authority root cause

### Exact production application semantics

The production read path groups requested collections by `PHASE4_DOMAIN_TABLES`, queries their mapped domain table, and appends `row.payload` directly to the runtime collection. For Training Logger in candidate/base semantics, executable authority then requires:

- protocol `userId` equals the current owner;
- protocol status is `active`;
- category or protocol type is `training`;
- exactly one such protocol exists and has `currentVersionId`;
- version ID equals that pointer;
- version `protocolId` links back to the protocol;
- version status is not `superseded`;
- version has no `endedAt`;
- exactly one matching version supplies `trainingStrategy`.

The failed V1 harness implemented the later filters but selected the two collections from the wrong physical table. Its ambiguity assertion therefore conflated **zero projected authority rows** with genuine authority ambiguity.

### Bounded production diagnostic

| Field | Result |
| --- | --- |
| Physical table matching app map | `canonical_protocol_records` |
| Active Training protocol rows | 1 |
| Current-version rows by pointer | 1 |
| Executable versions | 1 |
| Exactly one executable Training authority | **yes** |
| Protocol | `protocol_training_founder_maintenance` |
| Protocol category / type / status | `training` / `training` / `active` |
| Current version | `protocol_training_founder_maintenance_v2` |
| Version linkage | current version links to the active protocol |
| Version status / effective date | `active` / 2026-07-11 |
| Ended / archived / deprecated / superseded | no / no / no / no |
| Strategy present | yes |
| Nested wrapper shape | absent on protocol and version; direct payload is authoritative |

The live authority is supported by V1:

| Strategy field | Production value |
| --- | --- |
| Phase | maintenance |
| Rule type | `double_progression_confirmed_sessions` |
| Condition | `reach_top_of_rep_range` |
| Action | `increase_load` |
| Successful sessions required | 2 |
| Configured minimum exposure days | absent |
| Exercise overrides | 0 |

The candidate preserves the already validated compatibility behavior: absent configured minimum exposure resolves to the Founder-locked 14-day floor.

## 3. Local correction and gates

The correction exists only in temporary report/shadow tooling. Candidate `1b6687ff` stayed byte-for-byte frozen, clean, and equal to its pushed remote branch.

| Gate | Result |
| --- | --- |
| Focused authority-projection regression | **2/2** |
| V1 adaptive selector | **17/17** |
| Focused progression / Logger / authority tests | **115/115 across 7 files** |
| Exact Phase 6 Training subset | **185/185 across 17 files** |
| Extracted current service vs Git b7 object | byte-identical SHA-256 |
| `git diff --check` | clean |
| Candidate worktree | clean; no source or test changes |

The authority regression includes a decoy nested `payload` field to ensure the harness mirrors production’s direct `row.payload` projection rather than silently unwrapping arbitrary domain content. It also verifies fail-closed behavior for duplicate active Training protocols and a superseded current version.

## 4. Bounded production shadow

The read selected only canonical Training records containing one of the three predeclared exercise identities. It reused the previously proven lifecycle, variant, relationship, load-semantics, set-completion, and date semantics.

| Bound | Result |
| --- | --- |
| Source rows | 54 |
| Sanitized finalized sessions containing accepted target context | 45 |
| Lifecycle-excluded rows | 5 |
| Variant/relationship-context exclusions | 4 |
| Unrelated exercises emitted | 0 |
| Raw sessions emitted | 0 |

### Cable Machine Front Raise

| Field | Current production b7 | V1 candidate `1b6687ff` |
| --- | --- | --- |
| Exact-context occurrences | 12 | same sanitized evidence |
| Current load run | 7 occurrences at 150 lb | same |
| Current profile | 4 × 10 | same |
| First current-load profile | 4 × 9 | same |
| Immediate prior-load profile | 4 × 12 | same |
| Compatible historical increment | +10 lb | same evidence; current rebuild unresolved |
| Eligibility | progression opportunity | **eligible** |
| Qualifying sessions | implicit old logic | **5 / 2 required** |
| Exposure | implicit old logic | 2026-09-08 anchor; **28 / 14 days** |
| Selector invoked | n/a | **yes** |
| Rep / load support | n/a | **true / false** |
| Recommendation | 160 lb × 8 | **150 lb × 11** |
| Step reason / confidence | none | `same_load_rep_rebuild_supported` / `supported` |
| Legacy fields | `use_suggestion`, 160, 8 | `use_suggestion`, 150, 11 |

V1 correctly keeps load at 150 lb and advances all four sets from 10 to 11 reps. It does not take the evidence-supported +10 lb increment while the post-transition rep rebuild remains below the prior 4 × 12 profile.

### Weighted Pull-Up

| Field | Current production b7 | V1 candidate `1b6687ff` |
| --- | --- | --- |
| Exact-context occurrences | 12 | same sanitized evidence |
| Current added-load run | 6 occurrences at +25 lb | same |
| Current profile | 4 × 7 | same |
| First weighted profile | 4 × 6 | same |
| Prior bodyweight profile | 4 × 13 | same material-transition evidence |
| Compatible positive added-load increments | none | same |
| Eligibility | Maintain | **eligible** |
| Qualifying sessions | implicit old logic | **2 / 2 required** |
| Exposure | implicit old logic | 2026-09-20 anchor; **16 / 14 days** |
| Selector invoked | n/a | **yes** |
| Rep / load support | n/a | **true / false** |
| Recommendation | +25 lb × 7 | **+25 lb × 8** |
| Step reason / confidence | none | `same_load_rep_rebuild_supported` / `supported` |
| Legacy fields | `maintain`, 25, 7 | `use_suggestion`, 25, 8 |

V1 correctly treats bodyweight-to-weighted as a material load-semantics transition rather than an increment vote, then advances reps within the established +25 lb context.

### Spider Curl

| Field | Current production b7 | V1 candidate `1b6687ff` |
| --- | --- | --- |
| Exact-context occurrences | 21 | same sanitized evidence |
| Current load run/profile | 3 occurrences; 50 lb, 4 × 11 | same |
| Qualifying sessions | implicit old logic | **3 / 2 required** |
| Exposure | implicit old logic | 2026-09-23 anchor; **13 / 14 days** |
| Eligibility | Maintain | **not eligible** |
| Selector invoked | n/a | **no** |
| Rep / load support | n/a | false / false |
| Recommendation | 50 lb × 11 | **50 lb × 11** |
| Reason | none | `minimum_exposure_gate_pending` |
| Legacy fields | `maintain`, 50, 11 | `maintain`, 50, 11 |

The validated eligibility engine retains precedence. The adaptive selector is not called one day early.

## 5. Deployment and rollback package — not executed

### Candidate

- deploy candidate: `1b6687ffbf016575e674d12406200c3792eb90a7`;
- exact parent / validated eligibility base: `999a225a38ced9ddb16a65bbe840896472265468`;
- candidate branch: `codex/adaptive-progression-step-v1-20261007`;
- pushed remote identity: exact `1b6687ffbf016575e674d12406200c3792eb90a7`;
- current production source prerequisite: exact `b7eb1e397f0238df9ae904fd182ddbb51602e8d8`;
- migration / backfill / new collection / persisted learned state: none;
- Native change: none.

### Rollback

- rollback Server source: `b7eb1e397f0238df9ae904fd182ddbb51602e8d8`;
- rollback deployment at verification time: `6fa4e887-8849-450b-b068-5bdb11b90009`;
- database down migration: none;
- Training Strategy rewrite: none;
- Native rollback: none.

Any future deployment still requires a new explicit Founder authorization and the established guarded deployment procedure with exact source/deployment/health verification. No deploy or rollback command was run here.

## Final recommendation

**DEPLOY RECOMMENDATION READY for `1b6687ffbf016575e674d12406200c3792eb90a7`.**

The prior authority blocker is conclusively resolved as a harness table-projection defect, not a production ambiguity. The corrected bounded production shadow is coherent with the audited real evidence and mandatory fixtures, all required gates are green, and the candidate remains isolated and unchanged.

**STOP for Founder deployment authorization. Do not deploy from this report alone.**

Notification: **Adaptive progression-step V1 is ready for a separate Founder deployment decision. Production authority is singular; the bounded Cable/Pull-Up/Spider shadow passed; no deployment, production mutation, credential change, or Native Build 89/90 change occurred.**
