# Build 67 Strength: root cause proven — reconciliation sends an illegal Idempotency-Key header

Task: `build67-strength-http200-then-empty400-diagnosis-20260927` (`agent-handoffs/inbox/prompts/20260927T220000Z-build67-strength-http200-empty400-diagnosis.md`).

## Answer in one line

The Strength confirm has **never** been accepted because Native sends its raw idempotency *signature*, which contains the control character U+001F, as the `Idempotency-Key` HTTP header. Cloudflare's edge rejects any such request with an **empty-bodied HTTP 400** before it reaches DigitalOcean or the app. That is Event B. Event A (the 200) was unrelated HealthKit sync traffic that shares the same command transport. **No production mutation occurred.**

## Event A vs Event B, correlated

| | Event A | Event B |
|---|---|---|
| Transport result | 200, 2,578 bytes, h3, new connection | 400, 0 bytes, h3, reused connection |
| What it was | A `healthkit.observations.ingest.v1` command (HealthKit auto-sync) | The Founder's `workout-reconciliation.resolve.v1` confirm |
| Reached the app? | Yes | No, rejected at Cloudflare |

Evidence:
- **Zero-write production read** (`REPEATABLE READ READ ONLY`, rolled back): `command_receipts` for 21:44–22:04 UTC holds exactly **7 receipts, all `healthkit.observations.ingest.v1`, all committed** (21:54:10.152, 21:54:34.950, 21:54:40.412, 21:55:04.659, 21:55:10.460, 21:55:31.756, 21:55:45.875). `workout-reconciliation.resolve.v1` has **0 receipts, all-time**.
- **Application logs** for the same window show only `native.command.receipt_committed` for HealthKit ingest, two `native.auth.refresh_succeeded`, and **no `api.request.failed`**. `executeApiRequest` logs that event for every thrown error on the commands route, so the 400 never reached the route handler.
- HealthKit ingest goes through the same `ProductionNativeAPI.submitCommand`, so it uses the same dedicated `CommandNetworkDiagnosticsTransport` (`HealthKitServerUploader.swift:158`). That's why its traffic shows up in Command Network Diagnostics. Timing points to the 21:54:40.412 ingest (164 ms server time, within Event A's 278 ms total after its 108 ms connect) as the best fit for Event A. Event A isn't matched to one receipt with certainty. What *is* certain is that it cannot have been the reconciliation (see below).
- **Answer to Q5/Q6:** Event B was **not** a second submission caused by Event A. There was one reconciliation submission, and it was the 400. The 200 before it was a separate HealthKit command on the same connection. `resolveWorkoutReconciliation` makes no second POST after a 400: `validateHTTP` throws `.server(nil)`, which is not `.networkFailure`, so the existing retry does not fire. Native did not resubmit after a valid 200.

## Root cause, proven from source and reproduced

`EvidenceReviewAPI.swift` in shipped Build 67 (`8359bdcb`):

```swift
let signature = ProductionIdempotentSubmission.signature([
    ProductionCommandType.resolveWorkoutReconciliation, reviewId, expectedVersion, action, loggerSessionCanonicalId ?? "-",
])   // == components.joined(separator: "\u{1F}")
...
outcome = try await api.submitCommand(..., idempotencyKey: signature, ...)
```

`submitCommand` puts that value in `Idempotency-Key` (and in the body's `metadata.idempotencyKey`). The RED test captured the exact header the shipped code sends: `workout-reconciliation.resolve.v1\u{1F}healthkit_workout_reconciliation_36a18cc3…\u{1F}…`.

- **Edge behavior, reproduced read-only** against the public health endpoint (`GET /api/v1/health/live`, no auth, no data). A clean header returns `200`, 113 bytes, with `x-do-app-origin`, `x-do-orig-status`, `x-request-id` and `x-physiqueos-*` headers. The same request with one 0x1F byte in any header returns **`400`, `content-length: 0`, and only a `cf-ray` header**, on both HTTP/2 and HTTP/1.1. Posting to `/api/v1/native/commands` gives the identical result. The strongest supported boundary is therefore **Cloudflare's edge**, ahead of DigitalOcean and the app.
- **The server would reject it too.** `src/contracts/v1/command.js` requires `^[A-Za-z0-9._:\/-]{16,200}$`.
- **This is the only caller that does this.** Every other write domain passes `idempotencyStore.resolvedKey(...)` (a UUID), a partition identity, or a stored key. Only `EvidenceReviewAPI.swift:204/211` passed the signature itself. The line dates to the flow's introduction (`2d79f0b0`), which explains why the confirm has failed on every build and never produced a receipt.
- Why earlier builds showed `-999` and not a 400 is not verified. The most likely reason is that HTTP/2 edges reject an invalid header by resetting the stream rather than sending a response. Build 67's diagnostics were the first to capture the HTTP status.

## Current authoritative state (Q7/Q8)

Zero-write read of `canonical_evidence_records` / `evidenceReviews` / `healthkit_workout_reconciliation_36a18cc3ea586489ca963abd1f04300ce23b9eb0`: **status `pending`, version `1`, resolution `null`**. The review still shows pending because the mutation never happened. Native's post-mutation verification is not the cause.

## Fix candidate — `dc7763e5` (parent `8359bdcb`), pushed, not built

- New `ProductionIdempotentSubmission.deterministicKey(forSignature:)` returns the lowercase SHA-256 hex of the same signature. The same confirm still replays under the same key, and a different review, version, action or logger gets a different key. The key is 64 characters, inside the server grammar, and contains no control characters. Read-only probe: a 64-hex `Idempotency-Key` gets `200` from the edge.
- `resolveWorkoutReconciliation` uses it for both the first attempt and the existing retry.
- Nothing else changed: no new retry, and the transport, background assertion, `validateHTTP`, diagnostics and UI are untouched.
- Changing the key is safe because the server has never stored a receipt under the old one, so no replay link is lost.

**Tests**
- New `testWorkoutReconciliationIdempotencyKeyIsHeaderSafeAndMatchesTheServerGrammar` asserts on the real outgoing request. The header and body key must match the server regex and contain no control characters; an identical confirm must reuse the key; a different version must change it.
- **RED** on shipped Build 67 source: it failed with the `\u{1F}` header shown above.
- **GREEN**: 1465/1465 unit tests (1464 + 1 new).
- UI tests were not re-run. The change is limited to a production-only write path that UI tests don't exercise. The release task's full validation will run them.

**Fresh-context review: PASS, no blocking issues.** An independent agent with no prior context checked the following:
- **Completeness.** Every other write domain goes through `ProductionIdempotencyKeyStore.resolvedKey`, which returns only a stored key or a fresh UUID and never the signature. HealthKit uses `partition.identity`. No other path puts a U+001F signature on the wire.
- **Idempotency semantics.** The key is computed once and shared by the first attempt, the `.networkFailure` retry and `submitCommand`'s 401-refresh retry. No on-device state holds the old key.
- **The test is genuine.** It asserts on the real captured `URLRequest`, both header and body metadata.
- **Scope.** Retry, transport, background assertion, `validateHTTP` and diagnostics are untouched.
- **Tests.** It re-ran `FounderServerAPITests`: 216/216 passed.

The reviewer raised one caveat, recorded here as a risk: this fix removes the edge/grammar rejection, but it cannot prove the server will then accept the command. This command has never reached server-side validation in production, so the first post-release confirm is also the first real test of the server handler. Check for a receipt immediately after that attempt.

## Confirmations

- No production mutation. All production access was read-only: one rolled-back `REPEATABLE READ READ ONLY` transaction, app log reads, and GET/unauthenticated probes against public endpoints that Cloudflare rejected before the app.
- No Founder attempt requested, no device operated.
- No build-number bump, archive, upload, or Server deploy.

## Next release recommendation

Once approved, cut the next TestFlight build from `dc7763e5` with a build-number-only bump. One Founder confirm should then produce a real `workout-reconciliation.resolve.v1` receipt. Command Network Diagnostics should show a `200` for it, and the Sep 24 review should move out of `pending`.
