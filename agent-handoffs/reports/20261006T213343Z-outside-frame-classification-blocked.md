# Outside-frame classification + Training progression verification — blocked

Task: `codex-outside-frame-diagnostics-retry-20261006`

Generated: 2026-10-06T21:33:43Z

Status: **Canonical frame remained green; strict outside-frame validation failed closed on four unknown PTY lines; Founder progression verification was not authorized.**

Recommendation: **DO NOT DEPLOY**

This report supersedes `agent-handoffs/reports/20261006T205832Z-deterministic-console-boundary-blocked.md` (`a192d88d211292486c276b1e46d3774cecfebaa4`).

## Outcome

Strict opt-in diagnostics now classify outside-frame lines without emitting content. Synthetic coverage distinguishes empty, prompt, connection, controlled-command echo, marker, zero-exit, and unknown classes, including pre-begin versus post-end positions.

The transport exposes only resize and stdin operations. Its first shell command must pass through the still-echoing PTY before it can disable echo, so pre-command suppression is not available through the current interface. The narrow correction therefore accepts only the exact composition of the already bounded prompt grammar with the established echo-disable command. Arbitrary prompts, arbitrary commands, and arbitrary outside lines remain rejected.

All local gates passed. The Mac `local` and `control-plane` doctors passed. The task's one explicitly authorized zero-data `console` doctor attempt then failed closed with:

`AUDIT_OUTPUT_UNEXPECTED`

The new diagnostics show four unknown outside-frame lines: the unknown set spans both pre-begin and post-end positions and does not match the bounded prompt, connection, or controlled-command-echo classes. This does not uniquely identify a safe deterministic wrapper class, so no additional tolerance was added and no retry was performed.

No raw production console output was printed or inspected. No Founder table/record read, Training Strategy query, Cable Machine Front Raises query, current/candidate shadow, control sample, deployment, or production mutation occurred.

## Authorities and candidates

- Continuation task: `311268806eb7ec9c43adef957ceb49dbddd0e514`
- Prior operational candidate: `b147cbfd66061a5f0e6367a011a08117f6e6e3f5`
- Updated operational candidate: `ec9f28dffb48d0822849a2ecf9958b71988dd16c`
- Operational branch: `codex/production-access-portability-stage1`
- Current production Server: `b7eb1e397f0238df9ae904fd182ddbb51602e8d8`
- Progression candidate, unchanged and held separate: `999a225a38ced9ddb16a65bbe840896472265468`

The updated operational candidate is pushed but remains **not merge-ready** because real-console acceptance did not pass.

## Structural diagnostics and narrow correction

Only two files changed from `b147cbfd`:

- `scripts/operations/productionAccessSafety.mjs`
- `scripts/operations/productionAccessSafety.test.mjs`

The opt-in diagnostic schema adds bounded counts for:

- total, pre-begin, and post-end outside lines;
- empty, prompt, connection, controlled-command echo, marker, and zero-exit classes;
- unknown outside lines;
- whether all unknowns are pre-begin or post-end;
- whether there is exactly one unknown;
- whether the exact controlled-command-echo structure is present.

Diagnostics remain available only when explicitly requested by the console doctor. Exact schema validation, bounded serialization, credential-shape rejection, and fixed boolean/integer/error-stage types prevent content leakage.

The parser acceptance change is limited to one exact wrapper class: the established bounded prompt grammar immediately followed by the established echo-disable command. The canonical begin/payload/end frame was not changed. Unknown outside content remains an unconditional failure.

## Synthetic and local validation — PASS

- Production-access suite: **46/46 passed**, 11 suites.
- Pure prompt fixture: classified and accepted.
- Connection banner fixture: classified and accepted.
- Exact controlled-command echo fixture: classified and accepted.
- Exact prompt-plus-controlled-command composition: classified and accepted.
- Marker and zero-exit after end: classified and accepted.
- One unknown pre-begin line: rejected and classified.
- Multiple unknown pre-begin lines: rejected and classified.
- Unknown post-end payload: rejected and classified.
- Arbitrary command composition: rejected.
- Diagnostic fixture/credential leakage tests: passed.
- Full repository lint: **0 errors**; two pre-existing `<img>` warnings outside this task.
- Node syntax checks: passed.
- `npm ci --ignore-scripts`: passed; lock consistency confirmed.
- `git diff --check`: passed.
- Operational branch: committed, clean, and pushed.

## Mac doctor sequence

### 1. Local — PASS

- candidate `ec9f28dffb48d0822849a2ecf9958b71988dd16c` tracked and clean;
- Darwin arm64;
- Node `v22.23.2`, doctl `1.168.0-release`, Git available;
- owner-only platform-default doctl configuration;
- exact approved `physiqueos-final-cutover-config` present;
- no credential value emitted.

### 2. Control-plane — PASS

- intended app uniquely discovered;
- active deployment `6fa4e887-8849-450b-b068-5bdb11b90009`, phase `ACTIVE`, 9/9;
- no in-progress deployment;
- `web` and `worker` both exactly `b7eb1e397f0238df9ae904fd182ddbb51602e8d8`;
- public live health `ok`, build `physiqueos-b7eb1e39-20261005`;
- existing approved Mac context only; no login, rotation, credential change, or alternate context.

### 3. Console zero-data — FAIL CLOSED

Authorized scope was limited to runtime SHA, required binding-presence booleans, one bounded connection, `REPEATABLE READ READ ONLY`, `transaction_read_only=on`, `SELECT 1`, rollback, closure, exact frame/marker, and post-console authority check.

Sanitized error code: `AUDIT_OUTPUT_UNEXPECTED`

Allowed structural diagnostics:

```json
{
  "rawByteCount": 574,
  "normalizedByteCount": 562,
  "chunkCount": 1,
  "normalizedLineCount": 9,
  "beginSentinelCount": 1,
  "endSentinelCount": 1,
  "successMarkerCount": 1,
  "zeroExitMarkerCount": 1,
  "beginBeforeEnd": true,
  "endBeforeMarker": true,
  "markerOrderingValid": true,
  "beginContiguous": true,
  "endContiguous": true,
  "expectedFrameLinePosition": true,
  "ansiSequenceCount": 1,
  "carriageReturnEventCount": 8,
  "backspaceEventCount": 0,
  "outsideLineCount": 6,
  "preBeginOutsideLineCount": 2,
  "postEndOutsideLineCount": 4,
  "emptyLineCount": 0,
  "recognizedPromptLineCount": 0,
  "recognizedConnectionLineCount": 0,
  "recognizedCommandEchoLineCount": 0,
  "recognizedMarkerLineCount": 1,
  "recognizedZeroExitLineCount": 1,
  "unrecognizedOutsideLineCount": 4,
  "allUnrecognizedLinesPreBegin": false,
  "allUnrecognizedLinesPostEnd": false,
  "unrecognizedLineCountExactlyOne": false,
  "controlledCommandEchoPatternPresent": false,
  "parserStage": "outside_validation",
  "errorCode": "AUDIT_OUTPUT_UNEXPECTED"
}
```

## Exact engineering conclusion

The structured frame remains fully canonical. The remaining failure is not a single deterministic prompt-plus-command echo. There are two unknown lines before the frame and two after it. None match the current bounded prompt, connection, or controlled-command-echo forms, and the unknowns span both sides of the frame.

That structure does not justify allowing another wrapper class. Accepting all pre-begin lines, all post-end lines, broad prompt prefixes, or arbitrary terminal output would weaken the audit boundary and is prohibited.

## Production authority and progression verification

Control-plane authority is coherent at production Server `b7eb1e397f0238df9ae904fd182ddbb51602e8d8`, with matching active web/worker sources and healthy public status.

Founder progression verification was not run because passing all three doctors was a hard prerequisite. Therefore this task did not access or calculate:

- active Training Strategy/protocol/version authority;
- Cable Machine Front Raises finalized history;
- current production recommendation;
- `999a225a` recommendation;
- Maintain or Progression-Opportunity controls.

The existing 128/128 focused progression and 167/167 Phase 6 gates, clean fast-forward, no migration/backfill, and backward-compatible Native contract cannot replace the required production shadow.

## Deployment decision

**DO NOT DEPLOY.**

Reason: Mac Stage 1 real-console acceptance remains incomplete at strict outside-frame validation, so the required bounded Founder production verification and identical-row current-versus-candidate shadow could not run. This is an unresolved operational evidence gate, not evidence that `999a225a` is behaviorally wrong.

## Exact next action

1. Do not merge `ec9f28df` yet.
2. Do not broaden outside-frame acceptance from the current evidence.
3. Add another strictly non-content diagnostic layer for the four unknown lines: ordered pre/post position slots, bounded length buckets, printable-versus-terminal-control classification, and exact boolean matches for each already controlled wrapper token. Do not emit exact lengths, text, substrings, hashes, character samples, command text, payloads, database values, or credentials.
4. Investigate whether the provider console supports a non-interactive or no-echo exec mode through an authoritative API capability; prefer eliminating interactive PTY wrapper output over adding parser classes.
5. Rerun all local gates and obtain explicit authorization for another single zero-data console attempt; this task's authorization is consumed.
6. Only after all three doctors pass, perform the narrow Founder Training Strategy/Cable shadow and issue a fresh deployment decision.

## Safety and unchanged state

- Server deployments: **0**
- Production data writes: **0**
- Founder production reads: **0**
- Credential changes/logins/rotations: **0**
- Alternate contexts: **0**
- Native Build 89/90 changes: **0**
- Progression candidate changes: **0**
- Additional worktrees, chats, or delegated tasks: **0**
- Zero-data console attempts in this task: **1**

## Safety flags

- CONTAINS_SECRETS: NO
- CONTAINS_CREDENTIALS: NO
- CONTAINS_PRODUCTION_EXPORTS: NO
- CONTAINS_FOUNDER_EVIDENCE: NO
- SAFE_FOR_CHATGPT_RETRIEVAL: YES
