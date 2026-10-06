# Production access portability Stage 1 + Training progression verification — blocked

Task: `codex-portability-remediation-and-progression-verification-20261006`

Generated: 2026-10-06T20:26:45Z

Status: **Production access portability Stage 1 blocked at Mac console doctor; Training progression production shadow not authorized.**

Recommendation: **DO NOT DEPLOY**

## Outcome

The Stage 1 repository tooling and authorized-host runbook were implemented in an isolated operational candidate, and all local/mocked tests passed. The Mac `local` and harmless `control-plane` doctor modes passed against current production authority.

The explicitly authorized zero-data `console` doctor then failed closed with:

`AUDIT_JSON_MISSING`

The console transport returned an exact success marker and passed the bounded/credential-shape output validation, but the doctor could not locate the required structured JSON frame. Because the doctor result was not fully parseable, console acceptance is **not valid** even though the success marker was present.

The staged task required an immediate stop on any doctor-stage failure. No retry was attempted. No Founder table or record was queried, no Training Strategy or exercise history was read, and no progression shadow was run.

## Authorities

- Task authority: `71ff9fbca10eb3c3f86319673086aa2ee7a1911f`
- Portability audit: `d2c34b1213888fb8950a588c2ffda05b6b874d9f`
- Accepted transport source reviewed: `4025f17560e926b7e33a1cad6757a06716b16d24`
- Operational candidate: `f1b5b330f119a3506a55aa1a9d96246d83f0f71c`
- Operational branch: `codex/production-access-portability-stage1`
- Expected/current production Server: `b7eb1e397f0238df9ae904fd182ddbb51602e8d8`
- Progression candidate held separate and untouched: `999a225a38ced9ddb16a65bbe840896472265468`

The operational candidate is **not merge-ready** until a corrected console doctor passes a newly authorized acceptance.

## Operational candidate contents

Changed only operational tooling, tests, dependency metadata, and the standing runbook:

- `agent-handoffs/PRODUCTION_READONLY_ACCESS.md`
- `package.json`
- `package-lock.json`
- `scripts/operations/README-production-readonly.md`
- `scripts/operations/productionAccessDoctor.mjs`
- `scripts/operations/productionAccessDoctor.test.mjs`
- `scripts/operations/productionAccessSafety.mjs`
- `scripts/operations/productionAccessSafety.test.mjs`
- `scripts/operations/productionReadonlyRunner.test.mjs`
- `scripts/operations/runAppConsoleContextGzipFile.mjs`
- `scripts/operations/runAppConsoleContextGzipSourceOnOpen.mjs`

Implemented:

- Windows/macOS/Linux doctl config discovery;
- exact `physiqueos-final-cutover-config` allowlisting;
- no deploy/migration context fallback;
- bounded WSS transport and output;
- exact success-marker and credential-shape checks;
- shared generated payload guard for one bounded connection, statement timeout, `REPEATABLE READ READ ONLY`, `transaction_read_only=on`, parameterized SELECT-only calls, rollback/finally, resource closure, and schema-bounded output after rollback;
- three doctor modes: `local`, `control-plane`, and separately authorized `console`;
- authorized-host runbook semantics with per-host credentials and task-level authorization.

The documentation continues to state that App Platform console access is powerful and is not itself database-read-only.

## Local and mocked validation

Passed:

- production-access tests: **34/34**;
- Windows/macOS/Linux path-discovery fixtures;
- exact-context selection and deploy/migration rejection;
- no-secret-output checks;
- WSS validation;
- timeout, non-zero exit, WebSocket error, and unexpected-closure checks;
- marker validation;
- local doctor tests;
- control-plane doctor success/403/transition/source-mismatch tests;
- console doctor structured-result, missing-binding, and post-console-drift tests;
- generated payload success and transaction-fence failure tests, including rollback/resource-close order;
- full repository lint: **0 errors**, two pre-existing `<img>` warnings outside this task;
- Node syntax checks;
- package-lock consistency via `npm ci --ignore-scripts`;
- `git diff --check`.

## Mac doctor results

### Local — PASS

- platform/architecture: Darwin arm64;
- operational candidate commit: `f1b5b330f119a3506a55aa1a9d96246d83f0f71c`;
- repo-owned tooling tracked, clean, and hashed;
- Node `v22.23.2` with WebSocket support;
- doctl `1.168.0-release`;
- Git available;
- one platform-default doctl config path with owner-only permissions;
- exact approved context present;
- no credential value emitted.

### Control-plane — PASS

- intended app uniquely discovered;
- active deployment `6fa4e887-8849-450b-b068-5bdb11b90009`;
- deployment phase `ACTIVE`, progress 9/9;
- no in-progress deployment;
- `web` and `worker` both exactly `b7eb1e397f0238df9ae904fd182ddbb51602e8d8`;
- public live health `ok` with build `physiqueos-b7eb1e39-20261005`;
- existing approved Mac context only; no login, reauthentication, rotation, or alternate context.

### Console zero-data — FAIL CLOSED

- intended operation: runtime SHA check, binding-presence booleans only, `SELECT 1`, read-only assertion, rollback, resource closure, exact marker, then control-plane post-check;
- observed local failure: `AUDIT_JSON_MISSING`;
- exact marker/output bound/credential-shape validation completed before the JSON parse failure;
- acceptance not credited because the structured report was unavailable;
- no raw console output, binding value, credential, or database value was published.

The most likely repair area is PTY output framing/normalization: `parsePrefixedJson` currently requires a line to begin directly with the prefix, while a real console can add terminal control bytes around output. That is a diagnosis from code path and marker behavior, not a proven raw-output finding because the raw console stream was intentionally not exposed.

## Training progression verification

Not run. The task authorized the bounded Founder production read only after all three doctor stages passed. That prerequisite failed.

Consequently, this task did not retrieve or calculate:

- active Training Strategy/protocol authority;
- Cable Machine Front Raises history;
- current-production recommendation;
- `999a225a` shadow recommendation;
- Maintain or Progression-Opportunity controls.

Existing staged candidate gates—focused 128/128, Phase 6 Training 167/167, clean three-commit fast-forward from `b7eb1e39`, no migration/backfill, backward-compatible Native contract, and prior deployment-tooling readiness—do not substitute for the required real-production shadow.

## Deployment decision

**DO NOT DEPLOY.**

Reason: the newly repository-authoritative production-read path did not complete its zero-data Mac console acceptance, so the task was not authorized to read the bounded Founder production rows or establish the required current-vs-candidate shadow. This is an evidence gate, not evidence that the progression candidate itself is incorrect.

## Exact next action

1. On a follow-up operational branch, normalize or explicitly frame PTY JSON output before `parsePrefixedJson`; add a fixture containing realistic ANSI/control bytes and split console chunks.
2. Re-run all 34+ local/mocked tests, lint, lockfile, and diff checks.
3. Obtain explicit authorization for a new zero-data console doctor attempt.
4. Require local, control-plane, and console doctor passes in order.
5. Only then perform the narrowly bounded Founder Training Strategy/Cable shadow and make a new DEPLOY/DO NOT DEPLOY recommendation.
6. Merge the operational candidate only after successful real-console acceptance.

## Safety and unchanged state

- Server deployments: **0**
- Production data writes: **0**
- Founder production reads: **0**
- Credential changes/logins/rotations: **0**
- Native Build 89/90 changes: **0**
- Progression candidate changes: **0**
- Additional worktrees, chats, or delegated tasks: **0**

## Safety flags

- CONTAINS_SECRETS: NO
- CONTAINS_CREDENTIALS: NO
- CONTAINS_PRODUCTION_EXPORTS: NO
- CONTAINS_FOUNDER_EVIDENCE: NO
- SAFE_FOR_CHATGPT_RETRIEVAL: YES
