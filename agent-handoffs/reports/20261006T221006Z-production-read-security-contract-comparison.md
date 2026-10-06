# Production read security-contract comparison

Task: `codex-historical-production-read-contract-comparison-20261006`

Generated: 2026-10-06T22:10:06Z

Status: **Production access contract comparison complete — safe acceptance boundary identified.**

Selected boundary: **Option B — restore the established historical acceptance boundary plus narrow reserved-control guards.**

Recommendation: **Proceed with one separately authorized zero-data Mac console-doctor proof from operational candidate `d789ce2770eda2f9bdb13a48bbc572901f2c61e2`. Do not perform a Founder-data read in that proof.**

No production console call, Founder-data access, deployment, credential operation, production mutation, progression verification, or Native Build 89/90 change occurred in this task.

## Authorities

- Task authority: `87a3fdd32da9f657a601450d7a43179cc628a627`
- Prior operational candidate: `ec9f28dffb48d0822849a2ecf9958b71988dd16c`
- Updated operational candidate: `d789ce2770eda2f9bdb13a48bbc572901f2c61e2`
- Operational branch: `codex/production-access-portability-stage1`
- Historical portable runner authority: `4025f17560e926b7e33a1cad6757a06716b16d24`
- Progression candidate, unchanged and separate: `999a225a38ced9ddb16a65bbe840896472265468`

The implementation candidate is pushed. It is not production-proven and must not be merged as accepted production transport until the separately authorized zero-data proof passes.

## Executive conclusion

The strict requirement that every provider-generated line outside the controlled result frame match a prompt/banner/echo allowlist was not part of the known-successful PhysiqueOS production-read authority. It was added during the new Stage 1 doctor work after `4025f175`.

Historical successful audits accepted the App Platform PTY as a noisy transport and based success on:

- independently verified production/runtime authority;
- a reviewed bounded payload;
- exact owner scope;
- one read-only transaction with `transaction_read_only=on`;
- bounded SELECT-only reads;
- explicit rollback;
- sanitized output;
- one post-rollback success marker;
- one zero remote process status and successful console closure.

Stage 1 materially improves that boundary with a 2 MiB raw-output ceiling, raw and normalized credential-shape rejection, a length-declared canonical base64 frame, a 64 KiB decoded-report ceiling, exact report schema, shared SQL guards, and pre/post authority checks. Those controls remain intact.

Outside-line allowlisting adds anomaly sensitivity but not a material data-integrity, transaction-safety, credential-isolation, or anti-spoofing property once the stronger Stage 1 controls are enforced. It cannot prevent PTY bytes from reaching the local runner, cannot attest the provider terminal, and cannot stop a compromised runtime capable of emitting an otherwise valid frame. It can only reject benign provider rendering variants after the authoritative result has already passed every material control.

Option B therefore restores the established accepted transport boundary while retaining all Stage 1 protections and adding narrow ambiguity guards for reserved sentinels, markers, exits, explicit failure controls, and ordering.

## Representative known-successful contracts

### 2026-10-02 Mac console acceptance

Main-visible report: `agent-handoffs/reports/20261002T025604Z-mac-do-console-pat-maintenance-final.md`.

- Runner: exact blob `f7123347a43fb5dcfe8ae2a3029897d5ddb11fa7` from `4025f175`, restored under ignored `.tmp` storage.
- Wrapper behavior: direct WebSocket App Platform console, fixed `resize`/`stdin` operations, `stty -echo`, gzip/base64 Node source, bounded timeout and output.
- Payload: constant smoke marker plus remote Node version; no SQL and no production data.
- Remote completion: exactly one `__PHYSIQUEOS_REMOTE_EXIT__:<status>` occurrence, status zero, normal WebSocket close, local status zero.
- Output bound: 32 MiB in the historical runner.
- PTY noise: not line-allowlisted. The runner accumulated and printed the combined provider terminal stream.
- Failure: invalid WSS URL, request/socket failure, timeout, output limit, early/abnormal close, missing/duplicate status, or non-zero remote status.

This is direct known-successful Mac evidence for the same console family without strict outside-line classification.

### `4025f175` portable runner and wrapper

- The primary runner enforced exact named-context selection, WSS, bounded output/time, one zero remote status, and close semantics.
- The file wrapper required one source-declared standalone success marker, zero local runner stderr, zero local exit, and no timeout/truncation.
- The payload safety contract required runtime SHA, canonical owner, one bounded connection, `REPEATABLE READ READ ONLY`, `transaction_read_only=on`, parameterized bounded SELECTs, rollback/finally, resource close, sanitized output, and marker only after rollback.
- It did not define canonical structured JSON framing, credential-shape scanning, report-schema validation, or an outside-line allowlist.

The new candidate retains the historical transport checks and adds the stronger Stage 1 result controls.

### Earlier successful PC SQL audits

The exact ignored `.tmp` runner revision is not recoverable for every early PC audit, so no false commit-level attribution is made. The reports consistently establish the accepted contract:

- 2026-09-21 photo production verification: approved console runner, exact owner scope, `REPEATABLE READ READ ONLY`, `transaction_read_only=on`, rollback, and success marker.
- 2026-09-22 HealthKit completed-day audit: exact live SHA gate, bounded owner/collection/date SELECTs, read-only assertion, and explicit rollback in every payload.
- 2026-09-23 HealthKit workout readiness: accepted runner, `--no-values`, hashed identifiers, rollback, and marker only after rollback.
- 2026-09-27 Strength production verification: two bounded zero-write reads, owner scope, read-only assertion, explicit rollback, and success-marker gating.
- 2026-10-01 Sleep historical verification: exact active runtime, owner gate before database access, bounded owner/collection/date reads, no raw samples/private fields, and rollback.
- 2026-10-02 Sleep prospective audit: the byte-exact `4025f175` runner on the approved least-privilege context, three bounded payloads, runtime/owner gates, read-only transactions, owner-scoped SELECTs, rollback, and zero mutation.

Across these successful records, PTY prompt/banner/command-echo content was not an acceptance authority and was not exhaustively classified.

## Contract comparison

| Control | Historical accepted contract | Strict Stage 1 before this task | Selected Option B |
|---|---|---|---|
| Approved context | Required by policy/runner | Exact single allowed context | Unchanged |
| App/component/deployment/SHA | Reverified per audit; runtime SHA gate | Structured pre-check, Web/worker agreement, health, runtime SHA, post-check | Unchanged |
| Console transport | Provider PTY over WSS | Same provider PTY | Unchanged |
| Output ceiling | 32 MiB historical runner | 2 MiB raw console output | Keep 2 MiB |
| Credential protection | Payload non-disclosure and sanitized output | Raw credential-shape scan plus payload forbidden-value/schema checks | Keep; also scan normalized output |
| Result framing | Task-specific sanitized text/JSON plus marker | One length-declared canonical base64 frame, 64 KiB decoded bound | Unchanged |
| Result schema | Reviewed task-specific payload | Exact allowed top-level keys and doctor field validation | Unchanged |
| Transaction | Read-only, verified, rollback | Shared generated guard, statement/idle timeout, finally rollback | Unchanged |
| SQL | Bounded owner-scoped SELECTs | Shared SELECT-only parser, forbidden/side-effect function guards, row bounds | Unchanged |
| Success marker | Exactly one, post-rollback | Exactly one standalone and exactly one literal occurrence | Strengthened occurrence guard kept |
| Remote status | Exactly one zero status; normal closure | Runner check plus parser zero-exit/order check | Strengthened check kept |
| Explicit failure output | Non-zero/no-marker failed | Structured `PHYSIQUEOS_*FAILED` code | Any occurrence fails |
| Outside PTY lines | Tolerated as transport output | Every line had to match content allowlist | Bounded/scanned, ignored, never parsed or returned |
| Prompt/banner classification | None | Acceptance-critical | Diagnostic-only |

## Essential data and safety controls

These controls protect material properties and remain mandatory:

1. Exact approved host context; no deploy/migration/fallback context.
2. Fresh app, active deployment, component, Web/worker source, public health, and runtime SHA authority.
3. Reviewed canonical payload transported as canonical base64/gzip, with bounded command construction.
4. Runtime database URL and CA consumed only inside the component and forbidden from the result.
5. Raw and normalized credential-shape rejection.
6. Total raw output bound and decoded report bound.
7. One canonical structured frame with exact sentinel counts, declared encoded length, canonical base64, and valid JSON object.
8. Schema-bounded sanitized report.
9. Canonical owner assertion before database access.
10. One bounded connection, statement timeout, `REPEATABLE READ READ ONLY`, and verified `transaction_read_only=on`.
11. Parameterized bounded SELECT-only operations and explicit side-effecting-function rejection.
12. Explicit rollback on success; finally rollback on failure; release and pool close.
13. Exactly one post-frame/post-rollback success marker.
14. Exactly one later zero remote exit, normal console close, and zero local runner status.
15. Stable post-console authority/health check.

## Transport-hygiene controls

These remain useful for non-content diagnostics but are not material authorization controls:

- identifying prompt text;
- classifying connection banners;
- recognizing controlled command echo;
- requiring every outside line to match a provider-text allowlist;
- treating an unknown outside line as audit failure solely because its text shape is unknown.

The parser still normalizes bounded ANSI/CR/backspace terminal behavior and rejects unsupported/incomplete terminal control sequences. Structural diagnostics remain content-free.

## Threat model for unknown outside-frame PTY output

### Credential or environment leakage

Risk: a shell/profile/provider line could contain a database URL, certificate, bearer token, or DigitalOcean token.

Guards:

- credential-shape scanning runs on both raw and normalized output;
- generated payload result validation rejects the exact runtime URL, CA, and owner identifier;
- the result schema excludes arbitrary environment fields;
- outside material is not returned by `parseFramedJson` or included in doctor output/diagnostics;
- the total stream is bounded.

An arbitrary non-credential-shaped environment value could still enter the runner's in-memory PTY buffer. Outside-line allowlisting would detect but could not prevent that receipt. The confidentiality boundary is therefore reviewed payload non-disclosure plus discard/no-surface behavior, not provider prompt recognition.

### Founder-data leakage

Risk: unexpected application text could contain Founder-like content.

Guards:

- only the canonical frame is decoded;
- outside text and fake JSON never enter the returned report;
- report keys/size are bounded and payload sanitation happens after rollback;
- diagnostics contain counts/booleans only;
- the doctor payload queries only `SELECT 1` and binding-presence booleans.

Synthetic Founder-like outside text is accepted as non-authoritative transport but is proven absent from the returned object and diagnostics.

### Structured-result spoofing or a second result

Risk: outside text could contain a fake JSON object or extra frame.

Guards:

- arbitrary JSON outside the frame is never parsed;
- exactly one global begin sentinel and one global end sentinel are permitted, including same-line occurrences;
- the begin line declares exact canonical base64 length;
- decoded bytes must be a bounded JSON object;
- schema validation constrains the authoritative object;
- any second/different-prefix/same-line sentinel fails.

### Success-marker spoofing

Risk: a prompt or injected command could echo the marker.

Guards:

- the marker must be one standalone line after the frame;
- its literal token may occur exactly once in the entire normalized stream;
- `echo <marker>`, prefix/suffix forms, and duplicates fail.

### Remote-exit spoofing or hidden failure

Risk: outside text could claim zero while the remote command failed, or present more than one status.

Guards:

- the transport runner requires exactly one numeric remote status and requires zero;
- the parser independently requires exactly one remote-exit prefix, an exact standalone zero line, and ordering after the marker;
- non-zero, duplicate, missing, or early status fails;
- abnormal/early WebSocket close fails;
- local runner stderr/status/timeout/truncation remain failure conditions;
- any `PHYSIQUEOS_*FAILED:<code>` occurrence fails even when a valid frame follows.

### Command injection or shell/profile compromise

Risk: an unknown command-like line could indicate that unreviewed shell content executed.

Guards:

- context/app/component inputs are grammar constrained and URL encoded;
- transported source is canonical base64 split into fixed-size chunks, with no shell metacharacter alphabet;
- the shell program and here-document delimiter are fixed repository code;
- payload SQL is separately constrained and read-only fenced;
- unexpected reserved marker/sentinel/failure/exit controls fail.

An attacker already controlling the runtime/provider shell could emit allowlisted prompts as easily as unknown text and could attempt to emit an entire valid frame. Outside-line allowlisting is therefore not an integrity boundary against shell compromise. Runtime/control-plane authority, reviewed payload construction, and the canonical result controls are the relevant defenses. Provider/runtime trust remains an explicit residual dependency; this protocol is structural, not cryptographic attestation.

### Encoded payload-source echo

Risk: PTY echo can expose part of the gzip/base64 command stream.

The encoded program is repository-owned audit source and contains no production credential or Founder record. It is bounded, uses the base64 alphabet, and is non-authoritative outside the result frame. Credential/output/token scans and global reserved-token checks still apply.

## Selected acceptance boundary

Option B is implemented as follows:

1. Bound and credential-scan the complete raw stream.
2. Normalize terminal sequences and credential-scan again.
3. Require exactly one global begin and end sentinel.
4. Require exact standalone canonical frame lines, declared base64 length, canonical encoding, decoded-size limit, JSON object, and schema validation.
5. Require exactly one standalone and one total success-marker occurrence after the frame.
6. Reject any explicit `PHYSIQUEOS_*FAILED:<code>` occurrence.
7. Require exactly one standalone zero remote exit after the marker; keep the runner's independent zero-status/close checks.
8. Ignore all other outside-frame PTY bytes as non-authoritative. Do not parse or return them.
9. Retain prompt/banner/echo classifications only for sanitized structural diagnostics.

This restores established transport authority while leaving the total system materially stronger than the historical boundary. It does not weaken transaction, owner, SQL, credential, authority, output, marker, or exit protection.

## Implementation

Candidate `d789ce2770eda2f9bdb13a48bbc572901f2c61e2` changes only:

- `scripts/operations/productionAccessSafety.mjs`
- `scripts/operations/productionAccessSafety.test.mjs`
- `scripts/operations/productionAccessDoctor.mjs`
- `scripts/operations/productionReadonlyRunner.test.mjs`
- `scripts/operations/README-production-readonly.md`
- `agent-handoffs/PRODUCTION_READONLY_ACCESS.md`

No application runtime, Training logic, progression candidate, database schema, migration, infrastructure, or Native source changed.

## Mock and local validation

- Production-access suite: **48/48 passed**, 11 suites.
- Full repository lint: **0 errors**, two pre-existing `<img>` warnings outside this work.
- Node syntax checks: passed.
- `git diff --check`: passed.
- Operational branch: committed, clean, and pushed.
- Production console/control-plane doctor calls: **0** in this task.

Malicious/ambiguous fixtures cover:

- credential-shaped outside output, including ANSI-obfuscated credential shape;
- duplicate begin/end sentinel, including an additional same-line/different-prefix sentinel;
- duplicate success marker;
- command-like line containing an extra marker;
- arbitrary fake JSON outside the frame;
- oversized outside noise;
- non-zero, duplicate, and early remote exit;
- truncated frame;
- valid frame after explicit failure control;
- arbitrary Founder-like outside text never entering the decoded result or diagnostics;
- duplicate remote-exit status at the WebSocket runner layer;
- existing ANSI/PTY/carriage-return/chunk-split fixtures;
- transaction fence failure with rollback/resource-close order.

## Exact next zero-data proof

After explicit Founder authorization, run exactly one proof from candidate `d789ce2770eda2f9bdb13a48bbc572901f2c61e2` using only the already-approved `physiqueos-final-cutover-config` context:

1. Reverify candidate branch/commit and clean tracked tooling.
2. Run the local doctor; stop on any tool/config/context/permission mismatch.
3. Freshly discover the intended app and exact active Web/worker SHA; require ACTIVE/complete, no in-progress deployment, Web/worker agreement, and matching public health build.
4. Run one console doctor only. The payload may verify runtime SHA, database-binding presence booleans, one bounded connection, `REPEATABLE READ READ ONLY`, `transaction_read_only=on`, parameterized `SELECT $1::int` with value `1`, explicit rollback, resource close, exact frame, marker, zero exit, and nothing else.
5. Require the selected Option B parser boundary and all reserved-control guards.
6. Run the post-console authority/health check and require exact stability.
7. Publish only the sanitized doctor result and non-content safety ledger.
8. Do not read Founder tables in this proof. If it passes, obtain a separate explicit authorization for the bounded Training Strategy/Cable Machine Front Raises shadow.
9. If it fails, stop without retry and report only sanitized error/structural diagnostics.

Recommendation: **PROCEED with that one zero-data proof.** Do not deploy or perform the Founder progression read under this task.

## Safety ledger

- PRODUCTION_CONSOLE_CALLS: **0**
- PRODUCTION_CONTROL_PLANE_CALLS: **0**
- FOUNDER_RECORDS_ACCESSED: **0**
- PRODUCTION_SQL_OPENED: **0**
- PRODUCTION_DATA_MUTATED: **0**
- SERVER_DEPLOYED: **NO**
- CREDENTIAL_CHANGED_OR_REAUTHENTICATED: **NO**
- ALTERNATE_CONTEXT_USED: **NO**
- PROGRESSION_CANDIDATE_CHANGED: **NO**
- NATIVE_BUILD_89_90_TOUCHED: **NO**
- NEW_WORKTREE_OR_SUBTASK: **NO**

## Safety flags

- CONTAINS_SECRETS: NO
- CONTAINS_CREDENTIALS: NO
- CONTAINS_PRODUCTION_EXPORTS: NO
- CONTAINS_FOUNDER_EVIDENCE: NO
- SAFE_FOR_CHATGPT_RETRIEVAL: YES
