# Command Network Transport Isolation (reviewed candidate) + Oversized Read-Model Payload Audit

Generated: 2026-09-27T19:43:21Z

Task: the evidence-backed Native networking fix from the 9:38 AM connectivity diagnosis, plus a separate measured audit of the oversized read-model payloads identified in that same investigation. **Stops at a reviewed candidate — no build number bump, no archive, no upload, no Strength attempt solicited.**

## Part A — Command network transport isolation (implemented, tested, reviewed, pushed)

Commit `3b0ccbed`, on top of `73edf2c1` (the exact uploaded Build 65 source), on `codex/native-batched-candidate-post-build62`, pushed to origin.

### What changed

`ProductionNativeAPI.submitCommand` (`FounderServerAPI.swift`) now runs through a separately-injectable `commandTransport`, isolating command submissions from the bulk-read connection pool that a prior investigation proved was the actual cause of the Build 65 Strength `-999` (a stalled multi-megabyte read connection idle-timing-out and taking a multiplexed command down with it, with the app's own Swift Task never touched).

- **New file `CommandNetworkTransport.swift`**:
  - `CommandNetworkDiagnosticsTransport`: a `FounderHTTPTransport` wrapping its own dedicated `URLSession` (never `.shared`, so it has its own connection pool — two independently-instantiated `URLSession` objects are guaranteed separate CFNetwork connection caches, confirmed by review).
  - `.production()`: the real configuration — `waitsForConnectivity = true` (ride out a brief connectivity gap instead of failing immediately) and `timeoutIntervalForResource = 60` (a bounded ceiling on that wait plus the actual transfer). Per-request idle timeouts (`URLRequest.timeoutInterval`, set by `perform()`) are unchanged.
  - `NetworkPathObserver`: one process-wide `NWPathMonitor`, exposing the latest `NetworkPathSnapshot` (interface, constrained/expensive, path status) as a cheap synchronous read.
  - `CommandNetworkDiagnostics`: a bounded, 64-entry, `UserDefaults`-backed diagnostic log (the same established pattern as `NetworkFailureDiagnostics`/`WorkoutReconciliationDiagnostics`), capturing `URLSessionTaskMetrics` (protocol name, connection reuse, multipath, per-phase timings) plus the `NetworkPathSnapshot`, for every command attempt, success or failure — so the next real failure of any cause can say what protocol (h2/h3) and interface (Wi-Fi/cellular) were actually in play, the one question the prior diagnosis could not answer from the Server side.
- **`FounderServerAPI.swift`**: `ProductionNativeAPI` gained `commandTransport: FounderHTTPTransport? = nil`, stored as `commandTransport ?? transport` — **`nil` means commands share the read transport, the exact pre-existing behavior**, unchanged for every existing test and any caller that doesn't explicitly opt in. `perform()` gained `overrideTransport: FounderHTTPTransport? = nil`, used only by `submitCommand`'s three call sites (initial attempt, post-401-refresh retry, retry-on-networkFailure). Every read call site (`readResource`, `readMedia`, `pair`, auth refresh) is untouched. **No control-flow change**: auth, idempotency (`Idempotency-Key`/`If-Match` headers, `UUIDv7` command IDs), the existing bounded retry-on-networkFailure, and `invalidateReadResources` are all byte-identical.
- **`AppEnvironment.swift`**: the real app's `ProductionNativeAPI` now passes `commandTransport: CommandNetworkDiagnosticsTransport.production()`.

### Validation

- **Ten new tests**: five test the diagnostics event/storage layer in isolation (pure, deterministic). Two exercise `CommandNetworkDiagnosticsTransport` against **real network I/O deliberately** — a connection-refused `http://127.0.0.1:1/...` request (fails fast, fully local, no external dependency) proving the failure path records a diagnostic event, and a real GET to Founder Production's own `/api/v1/health/live` (meant to be pinged freely, zero side effects) proving the `URLSessionTaskMetrics` extraction works against genuine Foundation-delivered metrics, not a hand-built stand-in. One proves `NetworkPathObserver` reports a real satisfied path. Two integration tests in `FounderServerAPITests.swift` prove `submitCommand` routes through `commandTransport` when one is given, and falls back to sharing the read transport when it isn't.
- **A genuine compile-time RED check**: reverting only `FounderServerAPI.swift`'s wiring broke the whole project's compile at `AppEnvironment.swift`'s new `commandTransport:` argument (`"extra argument 'commandTransport' in call"`) — proving the wiring is real and load-bearing. Restoring it passed clean again.
- **Full regression**: unit suite **1463/1463 passing** (1453 prior + 10 new), UI suite (`GoalsAcceptanceUITests` + `TrainingAcceptanceUITests`) **13/13 passing**, both after a clean build.
- **Independent fresh-context review**, given only the diff and background: confirmed `submitCommand`'s control flow is byte-identical apart from which transport it routes through; confirmed the nil-default fallback preserves every existing test unchanged (spot-checked several); confirmed locking in `NetworkPathObserver`/`MetricsCollectingDelegate` is sound with no deadlock risk, and that `URLSession` retains its delegate for the task's full lifetime (Apple-documented), so the metrics-collecting delegate cannot be prematurely deallocated; confirmed connection-pool isolation is genuinely achieved (two independent `URLSession` instances, one being `.shared`, are guaranteed separate connection caches — this is the real fix, since both paths literally shared the same `URLSession.shared` object before); confirmed no unintended changes elsewhere (the `project.pbxproj` diff is purely the two new file registrations under the same positional-ID-renumbering pattern as every prior commit in this branch). The review independently reproduced the RED check itself. **No blocking issues found.** Two minor, explicitly-non-blocking observations were noted: a theoretical double-record if a non-HTTP response somehow reached the guard (practically impossible for an HTTPS endpoint), and a possible rare lost diagnostic event under concurrent `UserDefaults` writes (diagnostics-only, no effect on command correctness) — neither warrants a change.

### What this does and does not claim

This directly fixes the confirmed root cause of the Build 65 correlation (shared connection pool). It cannot guarantee the next real Strength attempt succeeds if a genuine external network-path disruption occurs independently of the shared-pool issue — but it removes the specific, proven mechanism by which a stalled bulk read could take a write down with it, and it adds the instrumentation needed to tell the two apart if it happens again.

## Part B — Oversized read-model payload audit (measured, diagnosis + plan only, nothing implemented)

**Calibration**: the byte figures that motivated this audit (Home 4.7 MB, Log 9.4 MB, etc.) are logged as the raw **database row bytes a read query fetches** (`Buffer.byteLength(JSON.stringify(rows.map(r => r.payload)))`), not the serialized HTTP response size actually sent to the device. This is still directly relevant to the connectivity fix above (DB I/O, JSON parse/stringify CPU, and how long the request holds a connection open all scale with it), but it means the wire-size story below carries one open reconciliation gap, called out explicitly rather than glossed over.

### Measured per-collection totals (Founder's account, zero-write `canonical_*` reads)

| Collection | Rows | Total bytes | Avg/row | Max/row |
|---|---|---|---|---|
| `analyses` (confidence records) | 411 | **27.35 MB** | 66.6 KB | 666 KB |
| `dailyBriefings` | 54 | **16.31 MB** | 302 KB | 3.03 MB |
| `evidenceReviews` | 243 | **7.39 MB** | 30.4 KB | 65.8 KB |
| `canonicalEvidenceObjects` | 573 | 2.52 MB | 4.4 KB | 41 KB |
| everything else (goals, weight, DEXA, photos, protocols, reminders, training) | — | <0.7 MB combined | — | — |

`analyses` and `dailyBriefings` alone total 43.7 MB and, per the query in `PostgresCoreNavigationReadStore.js`, are fetched with **zero date or count limit** — only `canonicalEvidenceObjects` gets a narrowing predicate in `canonicalEvidencePredicate()` today.

### Per-model measured findings

- **`core.navigation.home` / `core.navigation.goals`**: both pull `dailyBriefings` + `analyses` unbounded. Two measured contributing causes: (1) verbose per-item artifacts — sampled `weekly_briefing_*` records run 0.78–1.17 MB each; (2) `analysis_*_images` records (training-evidence and goal-evaluation submission images) run 20–354 KB versus ~1.6 KB for a routine analysis record, strongly suggesting image/binary data embedded directly in the confidence-analysis JSONB rather than a media reference — the same class of problem this lane already fixed once for Completed Goal photos. Both collections also grow forever (411 analyses, 54 briefings accumulated since 2024, no window). **Open gap**: summing the unbounded fetch (~44 MB) exceeds the observed 4.7 MB max for Home, so the composed output likely projects only a slice of what it fetches — meaning the primary proven cost right now is server-side (DB I/O and hold time, which does affect connection duration and thus the exact failure mode this whole investigation started from), with the wire-size reduction still to be confirmed once someone can actually run `HomeBriefingService`/`GoalsHubReadService`'s composition logic (not possible from a zero-write, no-code-execution audit against a deployed container with no importable source tree).
- **`core.navigation.log`, `core.navigation.morning-check-in`, `core.navigation.coaching-updates-detail`**: all three include `evidenceReviews` unbounded, no status filter. The cleanest, most confident finding in the whole audit: **202 of 243 rows (83%, 6.74 MB) are already `status: confirmed`** — resolved, no longer actionable — versus 1 `pending` row (1.7 KB). These navigation surfaces almost certainly only need pending/actionable reviews.
- **`goals.active.build-lean-mass`**: shares the same briefings/confidence-narrative architecture as Home/Goals (per this lane's own earlier work on `PhaseAwareActiveGoalPreviewService.js`), so the same unbounded-fetch pattern plausibly extends here — **not traced this pass, flagged as unconfirmed** rather than asserted.

### Prioritized, measured reduction plan (none of this implemented)

1. **Filter `evidenceReviews` to actionable status** for Log/Morning-Check-In/Coaching-Updates-Detail — add a predicate alongside the existing `canonicalEvidenceObjects` one in `canonicalEvidencePredicate()` (e.g. exclude anything but `status: 'pending'` for that collection). Measured effect: 7.39 MB → ~1.7 KB, a >99.9% cut for that collection. The smallest, safest, most confidently-justified item here — close to "independently justified" for its own follow-up patch, but still needs someone to confirm no other consumer of these three reads relies on seeing resolved reviews before it's implemented.
2. **Bound `dailyBriefings` and `analyses` to a recent window** (e.g. last 90 days, or last N per cadence) for Home/Goals, mirroring the date-bound pattern already used for `canonicalEvidenceObjects`. This is a larger, cross-cutting change (affects two established, high-traffic surfaces) and needs the composed-output reconciliation above resolved first, plus a decision from whoever owns those two services on how far back either surface actually needs to look.
3. **Investigate the `analysis_*_images` record shape directly** — if these embed image bytes rather than a media reference, moving them to a reference-based model (the pattern already proven for Completed Goal photos) would be the single highest-leverage change found, but the actual field shape wasn't confirmed this pass.
4. **Confirm actual composed-output size vs. raw-fetch size** for Home/Goals before sizing any fix by wire bytes saved specifically — the DB-side savings from #1/#2 are real and worth doing regardless (latency, connection hold time, CPU), independent of this open question.

Two read-only forensic scripts used for this audit are left in `/private/tmp/physiqueos-production-readonly-mac-bootstrap/scripts/operations/` for reuse (`payloadAuditByCollection.entry.mjs`, `payloadAuditEvidenceReviewStatus.entry.mjs`).

## Explicitly confirmed NOT done, per this task's instructions

- No build number bumped, no archive, no upload.
- No Founder confirmation attempt requested.
- No Server code changed or deployed (Part B is diagnosis + plan only).
- No broad redesign of the audited read-model contracts — every recommendation above is a plan item, not an implemented change.
- No production data mutated (zero-write, `ROLLBACK`-guaranteed DB reads only; read-only `doctl apps logs`).

## Candidate state

`origin/codex/native-batched-candidate-post-build62` now at `3b0ccbed`, containing (on top of Build 65's exact uploaded source `73edf2c1`): the reviewed, tested command-transport-isolation fix. Ready for whenever cutting the next Native build is separately authorized. The payload-reduction plan is a separate, unimplemented backlog for whoever picks up the Server-side follow-up.
