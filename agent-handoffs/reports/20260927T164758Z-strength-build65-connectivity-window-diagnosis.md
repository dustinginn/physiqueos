# Build 65 Strength Attempt: Connectivity-Window Diagnosis (9:38 AM PT / 16:38 UTC)

Generated: 2026-09-27T16:47:58Z

Task: correlate the Founder's 2026-09-27 ~09:38 America/Los_Angeles Build 65 Strength reconciliation attempt — which failed again (`guard_check_passed`, Version 1, `submit_attempt`, `submit_threw` / `acceptance_uncertain`, `App task cancelled at catch: no`) while ordinary `/api/v1/native/read/home` reads at 9:38 and 9:39 AM and a Goals read failed with `NSURLErrorDomain -1001 "The request timed out"` — against production ingress/application logs and latency. **No build cut, no retry requested, no reconciliation-specific fix added.**

## Bottom line

The 9:38 window was a **client-side network-path stall between the Founder's device and the Cloudflare edge that fronts the app**, not a Server problem and not a reconciliation-specific bug:

- Every request that reached the Server in the window was served fast (max 1.7 s of DB time; DB pool never queued; no errors except a routine expired-token 401 immediately followed by a successful refresh). No deployment, no restart, no ingress change.
- The Home and Goals reads the device reported as timed out **did reach the Server and completed there** — repeatedly. The Server logged six completed Home reads in under three minutes (16:38:15, :32, :47, 16:39:17, 16:40:00, 16:40:56) — the signature of a client that never received the responses and kept re-requesting. A -1001 is URLSession's **15-second idle timeout** (no bytes received for 15 s), so the responses were leaving the origin and stalling on the path to the device.
- The reconciliation command has **zero trace upstream of the application**: no `native.command.receipt_committed`, no `api.request.failed`, no `command_receipts` row (still zero, all-time), no `security_events` row. It never reached the application layer.
- `-1001` on the bulk reads and `-999` on the command at the same moment, on the same `URLSession.shared`, is the signature of a shared connection dying: when URLSession abandons a connection because one request on it idle-timed out (or a QUIC/HTTP-2 connection is torn down on a lossy link), the *other* in-flight requests multiplexed on that same connection are reported as **cancelled (-999)**, not timed out. That is why `Task.isCancelled` was `false` and why Build 65's background-execution assertion could not help — the assertion guards against iOS suspending the app, not against the connection underneath the request dying.

## Exact window, Server side (application log, same process since 2026-09-26 22:38 UTC; 1 boot marker; `run_restarted` log empty; last deployment `3134643d` ACTIVE since 22:39 UTC 9/26)

All times UTC, 9:38:xx PT = 16:38:xx UTC.

| Time | Event | Server-side result |
|---|---|---|
| 16:38:14.070 | `api.request.failed` `ACCESS_TOKEN_EXPIRED` 401 | routine — token expired |
| 16:38:14.296 | `native.auth.refresh_succeeded` | 19 ms |
| 16:38:15.8 | Home read | 1385 ms DB, pool idle |
| 16:38:16.3 | `healthkit.observations.ingest.v1` committed | 499 ms — **a POST from the same device succeeded** |
| 16:38:17.3 | Goals read | 1326 ms |
| 16:38:30.3 | second `refresh_succeeded` | 181 ms |
| 16:38:30–38 | profile 65 ms, Home 1744 ms, Log 561 ms, briefing 238 ms, weight 654 ms, training-day 31 ms, Goals 785 ms, Goals 843 ms, active-goal 277 ms | all normal |
| 16:38:32.3 / 16:38:36.5 | two more HealthKit ingests committed | 1079 ms / 792 ms — **POSTs still landing** |
| 16:38:39.7 / 16:38:41.4 | `evidence.review.detail` ×2 | 6 ms / 2 ms — the Founder opening the reconciliation review |
| 16:38:47.1 | Home read | 1419 ms |
| **16:38:47 → 16:39:17** | **30-second gap, nothing logged** | the attempt window |
| 16:39:17.3 | Home read | 1221 ms |
| 16:39:19.4 | `evidence.review.detail` | 2 ms |
| **16:39:19 → 16:40:00** | **41-second gap** | |
| 16:40:00.0 / 16:40:56.1 | Home reads | 880 ms / 1340 ms |

No reconciliation command anywhere. The device was still able to get small requests through (the 1.7 KB evidence-review reads at :39, :41, and 16:39:19) while it was abandoning the multi-megabyte ones.

## Zero-write Server ledger for the window (read-only, `ROLLBACK`-guaranteed)

- `command_receipts`, 16:18–16:58 UTC: exactly 3 rows, all `healthkit.observations.ingest.v1`, all `committed` (16:38:15.9, 16:38:31.2, 16:38:35.9).
- `workout-reconciliation.resolve.v1`: **0 rows, all-time** (unchanged).
- Same day: `check-in.submit.v1` committed at 15:36 UTC and `priority.complete.v1` at 15:58 UTC — manual writes from the same device worked an hour earlier.
- `security_events` 16:00–17:00 UTC: 0 rows.

## Server latency and capacity in the window

- Max DB `elapsedMs` in the window: 1744 ms (Home). No read ≥ 3 s anywhere in the retained log (since 22:38 UTC 9/26).
- DB pool queuing (`waitingCount > 0`) occurred only at 03:24, 14:37, 14:39 and 14:43 UTC today — **never in the 16:38 window**.
- Single instance, `apps-s-1vcpu-1gb-fixed`, region `sfo`, ingress `/ → web`, `http_port 8080`.

## What the client had to pull through the path

Per-read-model response sizes from the Server's own diagnostics (uncompressed JSON; Next.js default compression plus Cloudflare compression apply on the wire, so the transferred size is smaller but was not measured):

| readModel | reads today | max bytes | avg bytes |
|---|---|---|---|
| core.navigation.morning-check-in | 2 | 9.8 MB | 9.8 MB |
| core.navigation.log | 4 | 9.4 MB | 9.4 MB |
| core.navigation.coaching-updates-detail | 1 | 7.3 MB | 7.3 MB |
| core.navigation.home | 36 | 4.7 MB | 4.4 MB |
| core.navigation.goals | 16 | 4.7 MB | 4.3 MB |
| goals.active.build-lean-mass | 11 | 3.5 MB | 2.8 MB |
| evidence.review.detail | 9 | 1.7 KB | 1.7 KB |

In the 25 seconds after the 16:38:14 token refresh the app fired Home ×2, Goals ×3, Log, briefing, weight, active-goal and three HealthKit ingests — tens of megabytes of concurrent transfers on whatever link the phone had — with every read on a 15 s *idle* timeout. That is the load the reconciliation POST was competing with.

## Network path (verified now, from this machine)

- `physiqueos.dustinginn.com` → CNAME `physiqueos-foundation-staging-a9or4.ondigitalocean.app` → **Cloudflare edge** (`162.159.140.98`, `172.66.0.96`, IPv6 `2606:4700:7::60`, `2a06:98c1:58::60`); responses carry `server: cloudflare`, `cf-cache-status: BYPASS`, `x-do-app-origin`. HTTP/2 negotiated; **`alt-svc: h3` advertised** (so iOS URLSession may use HTTP/3/QUIC over UDP once it learns it).
- TLS: Google Trust Services WE1, valid 2026-09-08 → 2026-12-07. Not a certificate problem.
- Live probes now: `/api/v1/health/live` 150–243 ms total (DNS 3–7 ms, TLS ~40 ms), `/ready` 321 ms, all HTTP 200. Origin and ingress are healthy from here.

## Native side (unchanged code, re-read)

- `URLSession.shared` with **no** custom configuration: no `waitsForConnectivity`, no HTTP/3 opt-out (`assumesHTTP3Capable`), no constrained/expensive-network flags, no dedicated session for writes. Reads and the command POST both use the default 15 s `timeoutInterval` (idle). Bulk reads and the reconciliation POST share the same connection pool.
- No `URLSessionTaskMetrics` or `NWPathMonitor` capture, so the device diagnostics cannot say which protocol (h2/h3) or interface (Wi-Fi/cellular) was in use when it failed.

## Why this command "always" fails while others work

Not because of anything in the command itself. Every real reconciliation attempt on record has been made in the same situation: the app just came to the foreground, refreshed its token, and started pulling 4–9 MB screens, and the Founder navigated straight to the review and tapped confirm while those transfers were in flight. The writes that reliably succeed (HealthKit ingests in this very window, check-in, priority-complete) happen on their own schedule, are tiny, and are retried by their engines. In this window the three HealthKit POSTs at 16:38:16/32/36 landed *before* the stall; the reconciliation POST fell inside it.

## Evidentiary limits

- No Cloudflare/App Platform edge access logs are available through `doctl` (only the application's own log), so the exact moment the edge stopped delivering to the device cannot be read from the Server side. The Server's repeated completed Home reads plus the device's -1001s are the strongest available proof the responses were produced but not received.
- No device-side network capture: HTTP/2 vs HTTP/3 and Wi-Fi vs cellular at 9:38 are unknown.
- The Server does not log response-send completion; `elapsedMs` covers DB time only.

## Recommended next steps (none implemented here, per instruction)

1. **Separate the write path from the bulk-read path** — a dedicated `URLSession` for command POSTs (with `waitsForConnectivity` and a longer resource timeout) so a stalled multi-megabyte read connection can no longer cancel a 1 KB write.
2. **Shrink the reads**: Home/Goals/Log/check-in payloads of 4–10 MB on a 15 s idle timeout are the fragility here for *every* screen, not just reconciliation.
3. **Capture `URLSessionTaskMetrics` + `NWPath` at failure** (protocol, interface, DNS/connect/TLS timings) so the next natural attempt says whether it was HTTP/3 on a lossy link — the one remaining question this evidence cannot answer — before deciding whether to opt the app out of HTTP/3.
4. Do not solicit another reconciliation attempt; the next natural attempt, ideally on a known-good network, is the test.

## Confirmed NOT done

No build cut, no build number bumped, no archive/upload, no Native or Server code changed, no retry requested, no production data mutated (two read-only DB audits + read-only log/health probes only).
