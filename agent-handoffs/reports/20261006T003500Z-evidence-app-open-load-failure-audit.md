# Evidence app-open load failure audit — "Evidence could not be loaded."

- Task id: `evidence-app-open-load-failure-audit-20261006`
- Prompt: `agent-handoffs/inbox/prompts/20261006T000500Z-evidence-app-open-load-failure-audit.md` (commit 5b23e46e)
- Agent: Claude (Remote Control lane `claude/build87-evidence-app-open-reliability-20261006`)
- Base: Apple-VALID Build 87 `f66c7fc690b1b61094e620791ee2d4a40caf3799`
- Production Server (read-only, unchanged): `b7eb1e397f0238df9ae904fd182ddbb51602e8d8`, deployment `6fa4e887`
- Native candidate: `c3d9d2571b7e881577c393d37d11475fccd891a8` (branch `claude/build87-evidence-app-open-reliability-20261006`)
- Batch 3 integration preview: `9fa2428c9fb5204b03c8f9930c6ace83ce63c262` (branch `claude/evidence-reliability-batch3-preview-20261006`, NOT merged)

No TestFlight upload, no build bump, no Server deploy, no production mutation, no merge.

## 1. Verdict

**The root cause is outside the app: a public DNS defect.** The two authoritative nameservers for `dustinginn.com` (GoDaddy) disagree:

| Nameserver | SOA serial | `physiqueos.dustinginn.com` |
|---|---|---|
| `ns65.domaincontrol.com` | `2026090800` (Sep 8) | NOERROR → CNAME `physiqueos-foundation-staging-a9or4.ondigitalocean.app` |
| `ns66.domaincontrol.com` | `2026082000` (Aug 20) | **NXDOMAIN** |

`ns66` is serving a zone from before the `physiqueos` CNAME was added. Every other checked record (`www`, `mail`, apex) is identical on both servers; only the production host is missing.

Any recursive resolver that asks `ns66` caches the NXDOMAIN for up to **3600 s** (the SOA negative TTL). During that hour:
- every Native request fails in transport with `NSURLErrorCannotFindHost` (−1003), mapped to `ProductionNativeError.networkFailure`;
- the web app is unreachable from the same network.

The Server itself is healthy throughout.

**The Native contribution is a UX defect.** Evidence was the only tab root that turned a transient failure into a dead end. Home masks the same outage with its persisted last-known snapshot. Evidence had:
- a catch-all `"Evidence could not be loaded."`;
- no Retry action, no pull to refresh and no foreground retry;
- a failed refresh that also blanked an already-loaded hub.

That is why the symptom shows up as Evidence on app open.

## 2. Source of the string and the loading path (Build 87)

- String: `ios/PhysiqueOS/Presentation/Evidence/EvidenceViewModel.swift` `load()`. Every error from `api.fetchEvidenceHub()` became `state = .failed("Evidence could not be loaded.")`, including network, server, contract, session and cancellation errors.
- View: `EvidenceView.swift`. `.task(id: environment.nativeAuthority)` creates the VM once per authority and calls `load()` on every appearance. `.reloadsOnDailyDriverDayChangeWhenVisible` reloads on a local-day change. The `.failed` case rendered only a `Text`: no button, no `.refreshable`, no foreground hook.
- Composition: `ProductionDailyDriverAPI.swift` `ProductionEvidenceAPI.fetchEvidenceHub()` runs 7 **required** concurrent reads plus a fail-soft Recovery read:
  - required: `weight`, `training-landing` (which also reads `training-library`), `nutrition`, `activity`, `energy`, `dexa`, `photos`, all `scope: .all`;
  - fail-soft: `recovery-sleep`.
  Any one required failure fails the whole hub.
- Transport: `FounderServerAPI.swift` `ProductionNativeAPI`:
  - `readResource` uses a 90 s cache-first policy (30 s for `home`), coalesces in-flight reads, and runs reads as unstructured Tasks, so caller cancellation does not cancel the shared read;
  - `authenticatedResponse` calls `validAccessToken()`; with no memory token it refreshes through the single shared `refreshTask`; a 401 that is refreshable triggers one refresh and a retry;
  - `perform()` uses `URLSession.shared` with `timeoutInterval = 15` and maps **every** transport error to `.networkFailure`, after `NetworkFailureDiagnostics.record(path:error:)` stores the NSError domain/code on device.
- Recovery state: when `rotateSenderConstrainedRefresh` or `resolveStoredSession` hits `.networkFailure` or `.temporaryServer`, the state becomes `.temporarilyOfflineLastKnown`. You → Founder Production then shows "Temporarily offline", which is exactly the Founder's 17:06 PDT screenshot with Wi-Fi connected.

### Error conditions that produced the terminal state

| Condition | Mapped error | Before (B87) | After (candidate) |
|---|---|---|---|
| DNS NXDOMAIN / no route / timeout / reset | `.networkFailure` | terminal generic | "PhysiqueOS couldn't be reached…" + Try Again / pull / foreground retry |
| 5xx / 503 | `.temporaryServer` / `.server` | terminal generic | unreachable copy (`.temporaryServer`) or generic, both retryable |
| Refresh proof retryable / cancelled refresh | `.sessionRecoveryUnavailable` | terminal generic | "Recovering the secure session…" + retry |
| Refresh credential revoked/reuse | `.reconnectRequired` | terminal generic | reconnect copy (retry harmless; Home owns Reconnect action) |
| Decode/contract mismatch | `.invalidResponse` etc. | terminal generic | generic copy + retry (contract failure stays visible, not masked) |
| Caller cancelled mid-read | `CancellationError` / `.networkFailure` while `Task.isCancelled` | terminal generic (if it surfaced) | no state change; next appearance reloads |
| Older load finishing after a newer one | any | could overwrite | dropped (load generation guard) |
| Refresh failure while hub already loaded | any | blanked valid hub | keeps hub + "Couldn't refresh" note |

## 3. Production / log evidence (read-only)

- `doctl apps logs … web --type run` covers deployment 6fa4e887, 21:39Z–00:10Z. The context used was `physiqueos-final-cutover-config`, because `physiqueos-audit` now returns 401.
  - Server-side failures: 22 `api.request.failed`. 21 are `401 ACCESS_TOKEN_EXPIRED`, each followed within ~0.3 s by `native.auth.refresh_challenge_issued` + `refresh_succeeded`, so the normal refresh path is working. 1 is `CREDENTIAL_MALFORMED` at 21:40:35Z.
  - No 403, 408, 429 or 5xx; no decode or contract problems; no restarts after deploy.
  - One `provider.readiness.failed {stage: object_storage, code: ECONNRESET}` at 23:50:10Z: a one-off readiness probe. The App Platform health check uses `/live`, not `/ready`.
- **No request at all reached the Server between 23:50Z and 00:10Z.** The Founder's failing opens (~00:00–00:06Z) left no Server trace, which is consistent with failure before the request leaves the device (name resolution).
- At 00:10–00:33Z (rechecked 00:33Z: ns66 still serial 2026082000/NXDOMAIN, router still NXDOMAIN, prod still 6fa4e887 @ b7eb1e39), health returned 200 for both `/live` and `/ready`:
  - via `physiqueos-foundation-staging-a9or4.ondigitalocean.app`;
  - via the custom domain pinned to its Cloudflare IP with `--resolve`.
- DNS probes (00:10–00:17Z):
  - the home router `10.0.0.1` answers NXDOMAIN with SOA serial `2026082000`; the TTL remaining at 00:12Z was 3069 s, so it was cached at about 00:03Z, right before the screenshot;
  - `1.1.1.1` answered NXDOMAIN on 2 of 6 queries; `8.8.8.8` and `9.9.9.9` resolved.
- Exact per-request Founder correlation is not available: client requests that never reach the Server leave no Server-side id. On device, You → Network diagnostics (`NetworkDiagnosticsExport`) should show `NSURLErrorDomain −1003` events for `/read/*` and `/auth/*` at those times. That would confirm the classification without a device log.
- Payload context, not causal for this incident: a cold-launch Evidence Hub burst moves about 20 MB:
  - weight 3.6 MB, DEXA 3.6, energy 3.6, activity 3.6, nutrition 4.5, photos 1.5, plus training;
  - this runs alongside Home (6.2 MB) and Log (9.5 MB, read 3× in 10 s at 22:03Z) on a single 1 vCPU / 1 GB web instance;
  - Server elapsed time peaked at 5.2 s (nutrition `.all`).
  This is headroom risk against the 15 s idle timeout, but it is not today's failure.

## 4. Root-cause classification

| Cause | Classification |
|---|---|
| Stale `ns66.domaincontrol.com` zone → NXDOMAIN for the prod host, negative-cached ≤1 h | **Proven**: direct authoritative queries, serial mismatch, router cache serial matches `ns66` |
| Evidence root has no recovery from any failure (no Retry/pull/foreground) | **Proven** (code) |
| Failed refresh blanks a loaded hub | **Proven** (code + test) |
| Home's persisted last-known snapshot hides the same outage, so it looks Evidence-specific | **Strongly supported** (code: `lastKnownSnapshotResources = ["home"]`) |
| Founder iPhone resolves through the same router `10.0.0.1` | Strongly supported (same home Wi-Fi; screenshot "Temporarily offline" with Wi-Fi up; zero Server traffic) |
| Auth/pairing not ready at launch → transient error treated as terminal | Ruled out as a separate race: reads await the shared `refreshTask` inline; refresh succeeded every time it reached the Server |
| Request cancellation from lifecycle/view recreation → terminal error | Ruled out in practice (reads are unstructured shared Tasks; a recreated VM discards the old VM's result); now also guarded |
| Stale response ordering | Possible before (no guard); now guarded and tested |
| Server 5xx/429/timeouts/decode mismatch | Ruled out for this window (none logged) |
| Deploy/restart correlation | Ruled out for the screenshot (no deploy after 21:35Z); 4 deploys on Oct 5 could each cause brief resets, unproven |
| 20 MB Evidence burst vs 15 s idle timeout on weak networks | Possible but unproven (headroom risk) |

**Increasing frequency:** this is not proven.
- The defect has existed since the Sep 8 zone edit, and earlier lanes recorded "custom domain NXDOMAINs" on Sep 30 and Oct 2.
- Whether a resolver hits `ns66` depends on its nameserver selection (often RTT-based), so a shift toward `ns66` would raise the hit rate. Each hit costs up to an hour.
- More app opens per day, plus HealthKit, widget and Live Activity traffic, also mean more re-resolutions once the 3600 s CNAME TTL expires.
- I cannot see the historical resolver choice.

## 5. Required Founder action (not done; outward DNS change)

1. GoDaddy → DNS for `dustinginn.com` → edit and re-save the `physiqueos` CNAME. Lowering its TTL (e.g. 1 h → 600 s) is enough to bump the serial. This should push the zone to both nameservers.
2. Verify: `dig @ns66.domaincontrol.com physiqueos.dustinginn.com +norecurse` returns the CNAME, and both nameservers report the same SOA serial.
3. If `ns66` stays on `2026082000` after ~30 min, open a GoDaddy support case: "ns66.domaincontrol.com serves stale serial 2026082000; ns65 serves 2026090800".
4. Until it propagates, resolvers that already cached NXDOMAIN keep failing for up to 1 h. Restarting the router clears its cache, but the next lookup still has a ~50% chance of hitting `ns66`.

Durable option (decision, not required now): move DNS for the host to a provider with a consistent anycast authority, e.g. Cloudflare or DigitalOcean DNS. The edge is already Cloudflare.

## 6. Native fix (bounded; no authority/persistence/schema/auth change)

Files changed:
- `ios/PhysiqueOS/Presentation/Evidence/EvidenceViewModel.swift`
  - Load generation guard: only the newest load may change `state`.
  - A cancelled load changes nothing: `Task.isCancelled`, `CancellationError` or `URLError.cancelled`.
  - A failed refresh over a loaded hub keeps it and sets `refreshFailed` (in memory only; nothing persisted).
  - A retry from `.failed` shows `.loading`.
  - Classified copy, following Home's `ProductionNativeError` mapping:
    - unreachable (network/temporaryServer);
    - session recovering;
    - reconnect;
    - otherwise the original `"Evidence could not be loaded."`.
  - `retryAfterForegroundIfNeeded()` retries only when failed. Resuming onto a healthy hub adds no 20 MB burst.
  - `LoadTrigger` plus `EvidenceHubLoadDiagnostics`: an os.Logger line (category `EvidenceHubLoad`) with load id, trigger, outcome, error category, prior state, duration and consecutive failures. It records no payloads, identifiers, tokens or error text.
- `ios/PhysiqueOS/Presentation/Evidence/EvidenceView.swift`
  - Failed state: message plus a **Try Again** button (`evidence.hub.retry`; message id `evidence.hub.failure`).
  - `.refreshable` (pull to refresh) and `.refreshesOnForegroundWhenVisible`, the existing Goals / Evidence-stream convention.
  - Loaded + `refreshFailed`: a non-blocking "Couldn't refresh. Showing Evidence loaded earlier — pull to refresh." note (`evidence.hub.refreshFailed`).

Deliberately **not** done (STOP rules):
- no persisted last-known Evidence Hub (that would be a new persistence source of truth);
- no per-stream fail-soft hub (it changes hub semantics);
- no hostname fallback to `*.ondigitalocean.app` (it changes the authority endpoint and TLS identity);
- no Server change.

## 7. Tests

Build 87 lane (`c3d9d257`, dedicated simulator, iOS 27.0):
- Focused: `EvidenceViewModelLoadReliabilityTests` 9/9, `EvidenceReadModelTests` 6/6, `EvidenceHubUsageTests` 9/9, production Evidence Hub composition + DNS-outage tests 2/2. Total 26/0.
- Transport/auth lifecycle: full `FounderServerAPITests` 247/0, plus the 9 reliability tests.
- Generic Release compile (`generic/platform=iOS`, Release, unsigned): BUILD SUCCEEDED.

Batch 3 preview (`9fa2428c`): focused unit 28/0, `EvidenceHubTimelineUITests` 3/3, generic Release compile: BUILD SUCCEEDED.

Not run: full unit and UI suites. Build 87's UI suite has no Evidence failure seam, so the accessible Try Again UI assertion lives in the Batch 3 preview.

New deterministic coverage:
- `PhysiqueOSTests/EvidenceReadModelTests.swift`, class `EvidenceViewModelLoadReliabilityTests`:
  - network failure → retry succeeds;
  - classified messages;
  - failed refresh keeps the last loaded hub, then pull to refresh recovers;
  - cancelled first load is not terminal;
  - task cancellation during a read (transport reports `.networkFailure`) does not become a failure;
  - a stale success cannot overwrite a newer success;
  - a stale failure cannot overwrite a newer success;
  - foreground retries only after failure (no extra read on a healthy resume);
  - a retry from failure shows loading while in flight.
- `PhysiqueOSTests/FounderServerAPITests.swift` `testEvidenceHubRecoversFromHostResolutionOutage`: the full production path (`ProductionNativeAPI` + `ProductionEvidenceAPI` + VM) under `URLError(.cannotFindHost)`:
  - unreachable state;
  - every `NetworkFailureDiagnostics` event is `NSURLErrorDomain −1003`;
  - recovery on retry with no duplicate per-resource reads.

## 8. Integration map

- **Batch 2 RC `793462b1`, workout Native `e9f8a957`, preview `70ebf753`:** these files are byte-identical to Build 87, so the fix applies with no conflict.
- **Batch 3 `f5257ae1`:**
  - The bug survives Batch 3: the VM is identical to Build 87, the `.failed` case renders `EvidenceStateCard(.message)` with no action, and there is no `.refreshable` or foreground hook.
  - `EvidenceViewModel.swift` merges cleanly.
  - `EvidenceView.swift` conflicts in the `.failed` case and the modifier chain. Resolution: keep Batch 3's locked chrome and `EvidenceStateCard(kind: .message(...), identifier: "evidence.hub.failure")`, then add:
    - the Try Again button below the card;
    - `.refreshable { await viewModel?.load(trigger: .pullToRefresh) }`;
    - `.refreshesOnForegroundWhenVisible { await viewModel?.retryAfterForegroundIfNeeded() }`;
    - `load(trigger: .dayChange)`;
    - the `refreshFailed` note above the header.
  - The resolved preview is `9fa2428c9fb5204b03c8f9930c6ace83ce63c262` (pushed; unit 28/28, Batch 3 EvidenceHubTimelineUITests 3/3 incl. new accessible Try Again assertion, generic Release build OK; preview x 70ebf753 conflicts only in the already-known HomeJourneyFieldView.swift (take release side)). It has not been merged into Batch 3.

## 9. Remaining telemetry

- The existing on-device `NetworkFailureDiagnostics` already captures domain/code per path. Ask the Founder for one You → Network diagnostics export after the next occurrence to confirm −1003.
- The next build's `EvidenceHubLoad` log adds trigger, outcome, category and duration per load.
- Optional later: capture `NWPath` plus the resolved-address family on read failures, as commands already do. Not needed to prove this incident.
