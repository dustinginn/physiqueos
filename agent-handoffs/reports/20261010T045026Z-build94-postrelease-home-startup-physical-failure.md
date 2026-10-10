# Build 94 post-release Home startup physical-failure investigation

Date: `2026-10-10T04:50:26Z`  
Operator: Codex A  
Assignment: `agent-handoffs/inbox/prompts/20261009-codex-build94-postrelease-home-startup-physical-failure.md` at `9d28cf0dd5560256f09cc76ed92632b822f71d6e`  
Result: **Native root cause isolated and corrected in a tested post-release candidate; no Server or TestFlight mutation**

## Candidate

| Surface | Exact authority | Result |
|---|---:|---|
| Released Native base | [`49829781`](https://github.com/dustinginn/physiqueos/commit/498297815a3e20b1038fac9260d9f6649cad044a) | Exact TestFlight Build 94 source |
| Product base | [`f643d845`](https://github.com/dustinginn/physiqueos/commit/f643d8456f8b493d6461a6d2c9078184e5c88b1c) | Prior startup fix |
| Post-release Native candidate | [`cb3d520d`](https://github.com/dustinginn/physiqueos/commit/cb3d520d6bcd4253c9ff542987997e43b4ce4d3c) | Direct child of released Native; tested |
| Branch | `codex/build95-home-startup-physical-fix-20261009` | Isolated candidate branch |
| Production Server | [`85a98025`](https://github.com/dustinginn/physiqueos/commit/85a9802587de0ef23ff2021e803258dea825254d) | Read-only inspection only; unchanged |

The candidate changes Home lifecycle arbitration, failure classification and release-safe diagnostics. It does not change the accepted Home hierarchy or Editorial Rail, Morning Check-In, HealthKit behavior, Goal behavior, Recovery, version/build metadata, signing, entitlements, release pointers or Server code.

## Root cause

The visible failure was not the same `.networkFailure` branch fixed before Build 94. The Founder's exact copy — **“Home could not be loaded.”** — proves Build 94 entered Home's generic error branch. That branch combined multiple materially different failures: Server errors, unreadable/contract-mismatched responses, non-terminal authentication failures and local secure-storage errors. Build 94 had transport/decode diagnostics but no Home load category/timing log, so the historical device event cannot be narrowed safely to one of those categories after the fact.

The automatic recovery is explainable from source and is a Native lifecycle defect, not an internal retry:

1. `HomeView` started an appearance load from `.task(id: nativeAuthority)`.
2. It independently started another load from `scenePhase == .active`.
3. Day rollover and canonical Priority refresh used two more independent automatic paths.
4. Build 94's request-ID guard protected only an older request that completed **after a newer request had already started**. It did not protect the sequential gap in which request 1 failed, published the generic page, and request 2 began afterward and succeeded.
5. `ProductionNativeAPI` does not retry generic Home failures. Its only authenticated-read retry is the deliberate one-time 401/access-token refresh. Therefore the observed later success came from a newer Home lifecycle request (or another later lifecycle trigger), not from the failed request repairing itself.

This is why the previous overlapping-request test passed while the physical TestFlight sequence still failed: the test covered `request 2 starts → request 1 fails`; the phone exposed `request 1 fails → error page → request 2 starts → success`.

## Why cold startup is slow

Cold Founder Production launch has no in-memory access token. Sender-constrained session recovery intentionally performs a refresh-challenge request and a refresh request before the authenticated Home request. Other launch work (HealthKit bootstrap, DEXA reconciliation and Home Widget reads) also begins on activation and shares the same single-flight authentication boundary.

The last-known Home snapshot is intentionally not guaranteed. A successful canonical write invalidates Home and retires its persisted snapshot so a later launch cannot show a completed or otherwise stale Priority as current. The no-snapshot loading branch is therefore expected after normal use and must be correct on its own.

Production itself was not restarting during the incident:

- `/api/v1/health/live` and `/api/v1/health/ready` returned healthy on exact runtime `85a98025`;
- readiness remained 9/9 with schema `PROVIDER_MIGRATION_000014_APPLIED`;
- runtime `startedAt` was `2026-10-10T04:01:04.304Z`, before the approximately 04:24Z physical failure, and remained unchanged.

A bounded, sanitized production console audit ran twice in `REPEATABLE READ READ ONLY` through the approved Mac runner. It returned aggregate counts/bytes only — no payloads, health evidence, identifiers or credentials:

- 18 Home source collections;
- 1,517 source rows;
- 52,284,513 raw JSON payload bytes;
- aggregate query time 748 ms, then 636 ms;
- largest raw collections: analyses 27.39 MB/425 rows, daily briefings 17.46 MB/59 rows, goal-confidence history 4.22 MB/34 rows.

That 52.3 MB is an upper bound, not the Native response size: the live Home SQL compacts analyses and briefing payloads and filters canonical evidence to training before returning rows. It nevertheless proves a historical Server work set that contributes material database work to the cold three-request authentication/Home path. It does **not** prove that the incident's one generic failure was Server-originated. Raw production logs were intentionally not retrieved; the bounded aggregate and public health checks were sufficient and privacy-safe.

## Correction

Candidate `cb3d520d` makes the smallest safe Native lifecycle correction:

- one structured `.task(id:)` now owns all automatic Home loads;
- its identity includes authority, active/inactive state, daily-driver day and canonical Priority refresh generation;
- inactive startup initializes the model without issuing a request; activation owns one request;
- a phase/day/authority/generation transition cancels and replaces the prior structured task instead of creating a detached competing request;
- the independent `scenePhase`, Priority-generation and visible-day reload tasks were removed;
- pull-to-refresh remains explicit and still preserves last-known content on failure;
- genuine offline remains visible; Server-temporary failure now says PhysiqueOS is temporarily unavailable; an ended/unpaired session routes to reconnect instead of the generic page; contract/unknown failure remains truthful and generic;
- release-visible `HomeLoad` diagnostics now record only local load number, trigger, prior state, outcome, category and duration. They contain no dates, payloads, IDs, URLs, credentials or Server text;
- a DEBUG-only delayed fixture seam enables deterministic first-content/state-transition UI coverage and is absent from Release behavior.

This does not suppress or defer an error timer. One active request owns the screen. If that request genuinely fails, its correctly classified state remains visible until explicit retry or a later real lifecycle change.

## Verification

### Focused startup unit matrix — PASS

Seven targeted tests passed, 0 failures:

1. single cold-launch activation plan and stable duplicate-active identity;
2. temporary Server failure and ended-session categorization;
3. older overlapping failure cannot replace a newer success;
4. lifecycle cancellation collapsed by transport to network failure remains non-user-facing;
5. genuine offline remains visible and explicit retry recovers;
6. no-network cold launch paints labelled, non-completable last-known Home when available;
7. stored-session refresh replaces last-known with authoritative Home and reuses the warm cache.

### Complete affected-unit matrix — PASS

| Suite | Passed | Failed |
|---|---:|---:|
| `FounderServerAPITests` | 268 | 0 |
| `HomeReadModelTests` | 38 | 0 |
| `BriefingReadModelTests` | 46 | 0 |
| **Total** | **352** | **0** |

This covers authentication rotation/recovery, request coalescing/cache/snapshot invalidation, HTTP/decode contracts, Home priority/briefing presentation and the accepted Editorial Rail.

### Delayed cold-launch UI — PASS

The real iPhone 17 Pro simulator used an 8,000 ms DEBUG-only delayed Home success with no cached Home:

- loading panel observed at XCUITest `t=7.30s` (the timeline includes `4.29s` of simulator automation setup);
- authoritative Home content observed at `t=13.51s`;
- `home.state.message` did not exist before or after first content;
- state sequence was `loading → authoritative content`, with no offline or generic failure page;
- 1/1 focused UI test passed.

[Real Dark simulator screenshot after delayed success](https://github.com/dustinginn/physiqueos/blob/cb3d520d6bcd4253c9ff542987997e43b4ce4d3c/agent-handoffs/artifacts/20261009-build95-home-startup/build95-home-delayed-cold-launch-dark.png?raw=1)  
PNG SHA-256: `50a2cf200b4e6077b0b36e9a9b9a69172b3920b6395c8720c9a9b6c638fc4dc7`

The first UI attempt used a 1,500 ms artificial delay; XCUITest's launch-idleness handshake outlasted it, so the test could not observe the intermediate loading panel. No product behavior changed in response. The DEBUG delay was lengthened to 8,000 ms and the exact test then passed.

### Compile and release-shape gates — PASS

- unsigned generic iOS Release build passed on Xcode 27.0 (`27A266a`), including Watch and Live Activity/Home Widget products;
- release configuration verifier passed at intentionally unchanged `1.0 (94)`;
- project regeneration was byte-identical, SHA-256 `5c83efe44d26be3a3e57fc8e0a3ccf1f28ce4141f7a52b6a395623ea6e0641e5`;
- `git diff --check` passed;
- only pre-existing Swift warnings remained;
- Xcode work was serialized and no Claude/Xcode process overlapped;
- free space began near 26 GiB and remained near 24 GiB after retained temporary test products, always above the protected 12 GiB floor.

## Residual uncertainty and Server follow-up

The exact historical generic-error subtype cannot be recovered from Build 94 because that binary did not emit a Home load category. Candidate `cb3d520d` closes that observability gap without collecting Founder data. A physical cold launch can now distinguish `network`, `server`, `session`, `session-recovering`, `contract`, `request`, cancellation and authoritative completion with exact duration.

No Server candidate is proposed in this task. The read-only aggregate proves a performance opportunity, but safely bounding historical analyses/briefings/confidence rows requires parity tests against the active Goal, briefing routing/freshness and canonical Confidence selection. Treat that as a separate Build 95 Server performance assignment, not an emergency production edit. The current Server remains healthy and unchanged.

## Guarded next-release plan

Before any separately authorized Build 95/hotfix upload:

1. install/update from Build 94 on a physical iPhone with an existing sender-constrained session and exercise terminated cold launch, warm launch, background/foreground and genuine offline;
2. capture privacy-safe `HomeLoad` category/duration evidence and confirm one automatic active load per transition;
3. verify no-cache launch, labelled last-known launch, session recovery and reconnect states;
4. retain the credited Build 94 full units/UI/Watch evidence because this direct-child delta is confined to Home lifecycle/error behavior, while rerunning the 352 affected units, focused delayed UI and Release compile on the final build-number commit;
5. investigate the Server Home historical work set separately and deploy it only if an exact-lineage candidate proves output parity and improved endpoint timing;
6. bump/build/sign/archive/upload only after explicit Founder authorization.

## Stop state

**Candidate is tested and ready for physical acceptance, not release.** No production write, Server deployment, Recovery activation, HealthKit policy change, Goal mutation, build bump, archive, TestFlight upload or release-pointer update was performed. The accepted secondary Editorial Rail was preserved. Morning Check-In remains pending the Founder's next-day test.
