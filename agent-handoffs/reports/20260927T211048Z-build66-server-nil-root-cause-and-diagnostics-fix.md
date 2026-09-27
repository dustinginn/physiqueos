# Build 66 Strength reconciliation: server(nil) traced to a response that never touched the app; diagnostics fix built (not shipped)

Generated: 2026-09-27T21:10:48Z

Task: correct and extend the prior diagnosis (`agent-handoffs/reports/20260927T205304Z-build66-strength-1-37pm-diagnostics-gap-explained.md`) using new Founder-supplied evidence — the exact underlying error identity — and build the smallest justified diagnostics fix. No build cut, no Strength attempt requested, per standing instruction.

## Correction to the prior report

The prior report (20:53 UTC) hypothesized the 1:37 PM `submit_threw` event was most likely a local, pre-network JSON-encode failure (`ProductionNativeError.invalidResponse`), reasoned from the *absence* of evidence rather than the error's actual identity. The Founder has since confirmed the real red "Underlying" line on that event: **`PhysiqueOS.ProductionNativeError #7 — server(nil)`.** This refutes the pre-network-throw hypothesis outright: `.server(...)` is thrown from exactly one place in the shipped `04a58911` source, `FounderServerAPI.validateHTTP(_:data:)`, which only ever runs **after** `perform()`'s `URLSession` call has already returned successfully — i.e., a real HTTP response reached the device. This is not a local/pre-network failure; it is a real network round trip that produced an unexpected response.

## What `.server(nil)` actually requires, traced from source

`validateHTTP`'s exact status-code switch (`FounderServerAPI.swift:1174-1193`):

```swift
private func validateHTTP(_ response: HTTPURLResponse, data: Data) throws {
    guard !(200..<300).contains(response.statusCode) else { return }
    let problem = try? decoder.decode(ProductionProblemDetails.self, from: data)
    switch response.statusCode {
    case 401: throw ProductionNativeError.unauthenticated(problem)
    case 404: throw ProductionNativeError.notFound(problem)
    case 400: if let problem { throw .validation(problem) }; throw .server(nil)
    case 412: if let problem { throw .failedPrecondition(problem) }; throw .server(nil)
    case 428: if let problem { throw .preconditionRequired(problem) }; throw .server(nil)
    case 409: if let problem { throw .conflict(problem) }; throw .server(nil)
    case 500...599: throw ProductionNativeError.temporaryServer(problem)
    default: throw ProductionNativeError.server(problem)   // <- problem is nil here unless it decodes
    }
}
```

`.server(nil)` fires only when: (a) status is 400/412/428/409 **and** the body doesn't decode as `ProductionProblemDetails`, or (b) status falls in the **`default:`** bucket — anything not 2xx, 401, 404, 400, 412, 428, 409, or 500-599 (e.g. 403, 405, 413, 429, or any other/non-standard code) — **and** the body doesn't decode either. Either way, a genuine HTTP response with a real status code was received.

## Why this is fully consistent with every prior finding, not a contradiction

- `perform()`'s catch (which unconditionally logs to `NetworkFailureDiagnostics` before rethrowing `.networkFailure`) only fires on an actual `URLSession` **exception** — a non-2xx response is not an exception, so `perform()` returns normally and `NetworkFailureDiagnostics` correctly stays silent. This is why the Founder found nothing new there.
- `taskWasCancelledAtCatch: false` remains correct and uninformative either way — no cancellation occurred; the request completed with a response.
- `CommandNetworkDiagnostics` (Build 66's own transport-level diagnostic) *was* on this path in principle — but see below, it never captured the one field that would have proven this immediately.

## Ruling out every in-app source, with evidence

1. **Founder-gate middleware** (`src/middleware.js`) — explicitly exempts every path under `/api/v1/native/` via `isPublicPath()` (`NATIVE_FOUNDER_API_ROUTE_PATH_PREFIX`). Confirmed by reading `publicRoutes.js` directly: native routes bypass this gate, including its Origin/CSRF check, unconditionally. Not the source.
2. **The route handler itself** (`src/app/api/v1/native/commands/route.js`, wrapped by `executeApiRequest` in `src/platform/http/apiResponse.js`) — its catch block calls `logger?.warn("api.request.failed", { requestId, code, status, error })` **unconditionally**, for every thrown error of any kind (confirmed against real examples already in the logs: 409 `HEALTHKIT_OBSERVATION_IDENTITY_COLLISION`, 401 `ACCESS_TOKEN_EXPIRED`). Zero such event exists anywhere for this command, in the hour around the attempt or the entire account's history. The request never reached this handler.
3. **A deployment/restart at that moment** — the currently-active deployment (`3134643d-9284-4cd5-82a3-b91cff346a9f`) was created 2026-09-26T22:35:29Z, ~22 hours before the 1:37 PM PT attempt. No deploy activity coincided with the failure window.

This confines the actual response to something **ahead of the Next.js application** — most plausibly DigitalOcean App Platform's own ingress/routing layer — returning a real, uncategorized-status response that our own request/response logging has no visibility into. The exact infra mechanism (rate limit, edge rejection, brief routing gap, or something else) is not directly provable with the tooling available from here (no access to DO's own edge/LB logs), and this report does not claim more certainty than that.

## The diagnostic gap this exposed, and the fix built for it

`CommandNetworkDiagnostics` (Build 66) already captures protocol/interface/connection-phase timings for every command attempt, success or failure — but never captured the one field that would have made this immediately obvious on the device: **the actual HTTP status code and response body size**. A `succeeded: true` transport outcome was indistinguishable between "our app returned a 4xx/5xx" and "something else returned an unexpected response entirely." Separately, `CommandNetworkDiagnostics` had **zero UI surface anywhere in the shipped app** (confirmed by exhaustive `git grep` across the whole `ios/PhysiqueOS` tree at `04a58911` in the prior report) — captured on-device, never displayed.

**Fix, on `codex/native-batched-candidate-post-build62` (parent `04a58911`), pushed to origin, NOT built or shipped:**

- Commit `6cbd32e4`: `CommandNetworkDiagnostics.Event` gains `httpStatusCode: Int?` and `responseBodyByteCount: Int?`.
- `CommandNetworkDiagnosticsTransport.data(for:)` populates both from the transport's already-available `(Data, HTTPURLResponse)` on every attempt (nil only when no response was ever obtained, i.e. a genuine `URLSession` exception).
- `WorkoutReconciliationDiagnosticsView` gets a third section rendering `CommandNetworkDiagnostics.recentEvents()` — status code, body size, path/protocol/interface, connection-phase timings — closing the UI gap identified in the prior report.
- Commit `bd45edd6` (review fix, see below): the status line only renders red when the status is actually outside 2xx.
- Purely additive: no change to control flow, retries, or what gets thrown or when.

**Verification:**
- RED-checked: temporarily reverted the transport's new status/body-size wiring, confirmed the new hermetic test (`testRecordsHTTPStatusCodeAndResponseBodyByteCountOnASuccessfulTransportCallEvenWhenTheStatusIsNot2xx`, using a local `URLProtocol` stub — no external network dependency) failed exactly as expected (`nil` vs. expected `429`/`12`). Restored, confirmed GREEN.
- Full regression: **1464/1464 unit tests passing** (1462 existing + 2 new), before and after the review fix below.

## Independent fresh-context review — PASS, one issue found and fixed

A separate agent with no prior context reviewed `6cbd32e4` against the parent commit, independently re-ran the new tests, and checked correctness in all three transport outcomes (2xx success, non-2xx success, genuine exception), diagnostic-only-ness (byte-for-byte control-flow diff against `04a58911`), the `URLProtocol` test stub's isolation (query-string-encoded response, no shared mutable state, real `URLSession` path exercised), and Sendable/backward-compat decoding of the new optional fields against pre-existing on-device diagnostic logs. Verdict: **PASS**, with one real, non-blocking UI issue: the new HTTP-status line rendered `.destructive` (red) for *every* captured status, including an ordinary 200 — misleading in a view whose whole purpose is fast anomaly triage. Fixed immediately in `bd45edd6`: red only when the status is outside 2xx. Re-ran the full suite after the fix — 1464/1464 still passing.

## Explicitly not done

- No build cut, no archive, no upload.
- No Strength reconciliation attempt requested or implied.
- No claim of certainty about the exact infrastructure mechanism behind the uncategorized HTTP response — only that it is proven to originate outside this application's own code.

## Recommended next step

Reviewed, fixed, and green. This is ready to ship as the next build candidate (final source `bd45edd6`) whenever authorized: the new diagnostics would make the *next* occurrence of this failure (or any future command-path anomaly) immediately self-diagnosing on-device, without requiring another multi-hour server-log/source-tracing investigation like this one. Not cutting a build without explicit authorization, per standing instruction.
