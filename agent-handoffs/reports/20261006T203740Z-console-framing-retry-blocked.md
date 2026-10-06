# Production console framing retry + Training progression verification — blocked

Task: `codex-fix-console-framing-complete-progression-verification-20261006`

Generated: 2026-10-06T20:37:40Z

Status: **Mac zero-data console doctor retry failed closed; Founder progression verification was not authorized.**

Recommendation: **DO NOT DEPLOY**

This report supersedes `agent-handoffs/reports/20261006T202645Z-production-access-portability-stage1-blocked.md`.

## Outcome

The narrow structured-output fix was implemented and passed all local and synthetic PTY tests. The updated Mac `local` and `control-plane` doctors passed. The task's single newly authorized zero-data `console` doctor attempt then failed closed again with:

`AUDIT_JSON_MISSING`

The exact success marker and bounded/credential-shape output validation completed before structured-frame parsing. The parser still did not observe exactly one canonical framed result in the real console stream. No raw production console output was printed or inspected.

The continuation task required an immediate stop after this single failed retry. No Founder table/record read, Training Strategy query, Cable Machine Front Raises query, current/candidate shadow, control sample, deployment, or production mutation occurred.

## Authorities and candidates

- Continuation task: `03cafc8a55a66adc57ccb8da4b163f78d732ba80`
- Prior operational candidate: `f1b5b330f119a3506a55aa1a9d96246d83f0f71c`
- Updated operational candidate: `d84973a894e2900fc5609d77c623dff22b7a7d19`
- Operational branch: `codex/production-access-portability-stage1`
- Current production Server: `b7eb1e397f0238df9ae904fd182ddbb51602e8d8`
- Progression candidate, unchanged and held separate: `999a225a38ced9ddb16a65bbe840896472265468`

The updated operational candidate remains **not merge-ready** because real-console acceptance did not pass.

## Diagnosed original defect

The `f1b5b330` parser used an unframed line contract:

`PREFIX:{json}`

It required the prefix at byte zero of a reconstructed line and performed no ANSI/control normalization. A real PTY can prepend terminal modes or prompt fragments, use CRLF/bare carriage returns, and split transport chunks at arbitrary byte boundaries. That made `AUDIT_JSON_MISSING` possible even when the exact success marker survived.

## Narrow fix in `d84973a8`

Only four operational files changed:

- `scripts/operations/productionAccessSafety.mjs`
- `scripts/operations/productionAccessSafety.test.mjs`
- `scripts/operations/productionAccessDoctor.mjs`
- `scripts/operations/productionAccessDoctor.test.mjs`

The updated payload emits:

1. an exact begin sentinel with output schema prefix and encoded length;
2. canonical base64 of the schema-bounded JSON;
3. an exact end sentinel;
4. the separate exact success marker.

The parser now:

- reassembles arbitrary WebSocket chunks before parsing;
- strips only recognized CSI/OSC/single-character terminal sequences;
- normalizes CRLF, bare carriage overwrite, and backspace behavior;
- requires exactly one matching begin/end frame;
- verifies declared length and canonical base64;
- parses only the decoded framed JSON, never arbitrary console JSON;
- rescans decoded JSON for credential shapes;
- rejects missing/duplicate/malformed frames;
- rejects unexpected application payload outside explicitly allowed blank, prompt, connection, marker, and zero-exit framing;
- preserves exact-marker, overall output-bound, and raw credential-shape guards.

## Local validation — PASS

Production-access suite: **37/37 passed**.

Fixtures/gates covered:

- ANSI prefix/suffix and OSC/CSI normalization;
- CRLF and bare-carriage overwrite behavior;
- bounded shell prompt/connection noise;
- structured sentinel split across chunks;
- success marker split across chunks;
- malformed frame and length mismatch;
- duplicate and missing frames;
- unexpected surrounding application payload;
- raw and encoded credential-shaped output rejection;
- generated read-only transaction success and failure with rollback/resource-close ordering;
- exact-context selection and deploy/migration rejection;
- WSS validation, timeout, non-zero exit, error, and unexpected closure;
- local/control-plane/console doctor mocked success and failure paths.

Additional gates:

- full repository lint: **0 errors**, two pre-existing `<img>` warnings outside this task;
- Node syntax checks: passed;
- `npm ci --ignore-scripts`: passed;
- `git diff --check`: passed.

## Mac doctor sequence

### 1. Local — PASS

- updated candidate `d84973a894e2900fc5609d77c623dff22b7a7d19` tracked and clean;
- Darwin arm64;
- Node `v22.23.2`, doctl `1.168.0-release`, Git available;
- owner-only platform-default doctl config;
- exact approved `physiqueos-final-cutover-config` present;
- no credential value emitted.

### 2. Control-plane — PASS

- intended app uniquely discovered;
- active deployment `6fa4e887-8849-450b-b068-5bdb11b90009`, phase `ACTIVE`, 9/9;
- no in-progress deployment;
- `web` and `worker` both exactly `b7eb1e397f0238df9ae904fd182ddbb51602e8d8`;
- public live health `ok`, build `physiqueos-b7eb1e39-20261005`;
- existing approved Mac context only; no login, rotation, or alternate context.

### 3. Console zero-data — FAIL CLOSED

Authorized scope was limited to runtime SHA, binding-presence booleans, one bounded connection, `REPEATABLE READ READ ONLY`, `transaction_read_only=on`, `SELECT 1`, rollback, closure, exact frame/marker, and post-check.

Sanitized result: `AUDIT_JSON_MISSING`.

The success marker passed before frame parsing, but no accepted frame was located. Because the raw stream was intentionally not exposed, this task cannot responsibly claim whether the remaining mismatch is a prompt concatenation form not represented in fixtures, terminal rendering behavior around the new sentinels, or a transport-level distinction between application output and combined PTY output.

## Progression verification

Not run. All three doctor stages were a hard prerequisite for the already-authorized bounded Founder read. Therefore this task did not access or calculate:

- active Training Strategy/protocol/version;
- Cable Machine Front Raises finalized history;
- current production recommendation;
- `999a225a` recommendation;
- Maintain or Progression-Opportunity controls.

The existing 128/128 focused and 167/167 Phase 6 gates, clean three-commit fast-forward, no migration/backfill, and backward-compatible Native contract cannot replace the required production shadow.

## Deployment decision

**DO NOT DEPLOY.**

Reason: Stage 1 real-console acceptance remains incomplete, so the required Founder production verification and identical-row current-vs-candidate shadow could not lawfully run. This is an unresolved operational evidence gate, not proof that `999a225a` is behaviorally wrong.

## Exact next action

1. Do not merge `d84973a8` yet.
2. Add fail-closed, non-content diagnostics at the transport/parser boundary: bounded counts/booleans for begin-token presence, end-token presence, marker count, normalized line count, and token-relative ordering—never raw bytes, decoded content, hashes of sensitive content, or console text.
3. Add synthetic fixtures for any newly distinguished framing state and keep zero/multiple/malformed/unexpected cases rejected.
4. Obtain explicit authorization for another single zero-data console attempt; do not reuse this task's consumed retry authorization.
5. Only after all three doctors pass, perform the narrow Founder Training Strategy/Cable shadow and issue a fresh deployment decision.

## Safety and unchanged state

- Server deployments: **0**
- Production data writes: **0**
- Founder production reads: **0**
- Credential changes/logins/rotations: **0**
- Alternate contexts: **0**
- Native Build 89/90 changes: **0**
- Progression candidate changes: **0**
- Additional worktrees, chats, or delegated tasks: **0**

## Safety flags

- CONTAINS_SECRETS: NO
- CONTAINS_CREDENTIALS: NO
- CONTAINS_PRODUCTION_EXPORTS: NO
- CONTAINS_FOUNDER_EVIDENCE: NO
- SAFE_FOR_CHATGPT_RETRIEVAL: YES
