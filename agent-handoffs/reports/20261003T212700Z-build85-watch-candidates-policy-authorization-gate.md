# Build 85 Watch corrections — reviewed candidates and production-policy authorization gate

Generated: 2026-10-03T21:27:00Z  
Status: **IMPLEMENTED / TESTED / INDEPENDENTLY APPROVED / PRODUCTION UNCHANGED / STOPPED FOR FOUNDER AUTHORIZATION**

## Authority and isolation

- Founder prompt authority: `999498283bb3fc7b7a268d3d2c0c934fe89479f1`.
- Early root-cause checkpoint: `agent-handoffs/reports/20261003T201500Z-build85-watch-physical-acceptance-corrections.md`, published on main at `6782704027ef99bf26908c0847ad1ca69a8b220b`.
- Installed authority remains Native Build 84 `bcd92c74602695766c270fe6af052de45afece4b`, delivery `a4b7b504-e0ba-4cb5-9909-3e01cc8156d5` (VALID and physically exercised).
- Production Server remains `b47663b32372a78010dbc8e4aa41303012d98dc7`, build `physiqueos-b47663b3-20261003`, deployment `b9449c52-5444-4dae-9f44-fd0261b1a9d3`, ACTIVE with web and worker on the same exact SHA.
- Build 84 Native and Server worktrees remain preserved. The separate Home UI/design project was not edited or mixed into Build 85.
- DEXA HealthKit, Sleep v3, Cardio/Cooldown semantics, Training/Watch finish and cancel, Live Activities and strategic artifacts were not changed.

## Exact reviewed candidates

### Native Build 85

Exact pushed candidate: `b8ee8690b194cb90086b62816b9a2c8c400dc026`  
Branch: `codex/build85-watch-native-20261003`  
Base: exact Build 84 `bcd92c74602695766c270fe6af052de45afece4b`

The candidate:

- treats immediate `WCSession.isReachable=false` as passive transport state, not proof of lost phone authority;
- suppresses false connectivity warnings while the display is inactive/Always-On;
- surfaces an actionable warning when an active display has no fresh authoritative contact or a command is actually waiting;
- keeps every structured mutation fail-closed when the phone command lane is unavailable;
- makes Retry/foreground recovery resend the exact pending mutation ID before using a refresh fallback;
- does not treat cached application context as fresh live contact and does not manufacture OFFLINE from a fresh terminal/cancel projection;
- wires the prospective trusted-workout capability into HealthKit upload, limited to exact PhysiqueOS source, Traditional Strength type 50, indoor workouts, owner/session registry, and the effective boundary;
- bridges the legitimate HealthKit-before-Server-commit finish race from durable Watch finish state while excluding pre-activation workouts;
- expands the local PR burst from 20 pieces at 4–6 points to 36 pieces at 7–10 points with broader spread, while preserving the persisted one-time claim, 0.95-second duration, celebratory haptic and Reduce Motion behavior;
- carries build number 85 consistently.

Verification:

- full iOS Debug build-for-testing: pass;
- focused `TrainingSessionAuthorityTests` + `HealthKitWorkoutIndoorOutdoorFidelityTests`: pass;
- Watch build-for-testing: pass;
- final `WatchWorkoutFinishStateTests`: 27/27 pass, including inactive display, stale authority, cached context, unavailable command, reconnect, exact-mutation retry and terminal cancellation;
- release verifier and diff/whitespace checks: pass.

Fresh independent review **APPROVED** exact Native SHA `b8ee8690b194cb90086b62816b9a2c8c400dc026` with no remaining release-blocking finding. Physical Build 85 Watch/Always-On acceptance remains a post-TestFlight gate.

### Server

Exact pushed candidate: `3c0f4aefddbb9a6886f6ad012443978303d47024`  
Branch: `codex/build85-watch-server-20261003`  
Base: production `b47663b32372a78010dbc8e4aa41303012d98dc7`

The candidate:

- adds a Server-owned, fail-closed, prospective trusted-Watch correlation policy pinned to the audited production bundle `com.physiqueos.native.dev`, activity type 50 and a 120-second envelope tolerance;
- exact-confirms only after the source observation, bundle, type, indoor fact, owner/session identity, effective boundary and time envelope are revalidated immediately before every confirmation, including idempotent confirmation;
- handles both orderings: Logger-first HealthKit ingestion and HealthKit-first followed by independent Logger commit, without opening a heuristic review for the trusted race;
- refreshes observation versions during same-workout replay, preventing transactional version conflict;
- exits the generic heuristic matcher after an exact decision;
- preserves explicit Founder unlink and terminal Founder reconciliation choices across Activity ingestion and workout replay; relinking remains an explicit act;
- pins a production policy create to the exact reviewed desired-record digest, refuses foreign singleton bundles, plan/effective-boundary drift and concurrent creation, and limits apply to one policy row plus one audit row;
- reports each new trusted confirmation exactly once and reports zero for no-op replay;
- never duplicates Logger evidence and keeps HealthKit workout/link records strategically quarantined.

Verification on the final lineage:

- Build 85 selected package-7 suites: 89/89 pass locally; independent expanded package-7 selection: 128/128 pass;
- relationship/unit boundary: 27/27 pass locally; independent eight-file boundary selection: 115/115 pass;
- phase 4: 156/156 pass;
- changed-file ESLint: pass;
- production webpack build: pass;
- broad package-7 run: 618/624 pass; the six failures are the unchanged missing-private-fixture baseline (`private/founder/migration-control.json` and dependent invalid-date fixtures), not Build 85 behavior.

Fresh independent review **APPROVED** exact Server SHA `3c0f4aefddbb9a6886f6ad012443978303d47024` with no remaining finding.

## Exact production policy operation

The current production runtime was reverified before the dry run: ACTIVE, web and worker source `b47663b32372a78010dbc8e4aa41303012d98dc7`.

Exact proposed policy:

- effective boundary: `2026-10-05T07:00:00.000Z`;
- source bundle: exactly `com.physiqueos.native.dev`;
- activity type: exactly `50` (Traditional Strength Training);
- indoor required by the correlation contract;
- tolerance: 120 seconds;
- `prospectiveOnly=true`, `historicalBackfill=false`;
- no workout, review, Logger, Activity, strategic or Sleep mutation.

The dry-run payload was built from the exact reviewed candidate code and gated to the current live SHA for pre-deploy execution:

- payload SHA-256: `d70439953d591a56b8ca13d165ebd99e40bf9a20f6cbbdfaa43f01bcd159b766`;
- size: 20,764 bytes;
- success marker: `PHYSIQUEOS_HEALTHKIT_TRUSTED_WATCH_POLICY_DRYRUN_SUCCESS_5e8dc040`;
- approved console-runner SHA-256: `aa2d3247917184199b718d5e7558a74cc8dcf46bf34713b3f73b8e506816a608`.

Two independent production executions each used `REPEATABLE READ READ ONLY`, verified `transaction_read_only=on`, rolled back, exited zero and returned byte-equivalent facts:

- current policy digest: `null`;
- current policy version: `null`;
- planned desired-record digest: `fc028029635cb7ba1de6301206f5f8a8`;
- predicted mutation 1: create `healthKitConfiguration/healthkit_trusted_watch_workout_correlation_policy`;
- predicted mutation 2: create one `healthkit_trusted_watch_correlation_audit_*` row;
- workout records touched: 0;
- strategic artifacts touched: 0;
- Sleep records touched: 0.

Independent review **APPROVED** this exact plan and independently reproduced the payload digest, byte size, marker and planned digest. Apply must be rebuilt with runtime gate `3c0f4aefddbb9a6886f6ad012443978303d47024`, must carry a new attributable Founder authorization reference and the exact dry-run facts, and will refuse runtime/policy/plan drift, an elapsed effective boundary or concurrent creation.

## Today’s untouched Pending Review

The 2026-10-03 95% Pending Review remains untouched and unmodified. Its stored HealthKit observation predates activation and has no durable `physiqueOSSessionId`; therefore it cannot be safely promoted into exact trusted authority after the fact. No heuristic workaround or repair mutation is proposed. It remains for an explicit Founder reconciliation choice, separate from the prospective correction.

## Required authorization and sequence

Production mutation is still **zero**. This checkpoint intentionally stops before deployment or configuration.

Founder authorization is requested for this exact bounded sequence:

1. deploy exact Server SHA `3c0f4aefddbb9a6886f6ad012443978303d47024` through the guarded production workflow;
2. verify ACTIVE 9/9, web and worker on that exact SHA, and live/ready healthy;
3. rebuild and dry-run the exact policy payload against the deployed SHA; require the same facts and planned digest above;
4. if and only if unchanged and the effective boundary remains future, apply exactly the policy row plus one audit row with the Founder authorization reference;
5. independently verify the stored policy and audit row, zero historical workout/review/strategic/Sleep mutation, and continued health;
6. then run final Native archive/signature/profile/entitlement gates for exact Native `b8ee8690b194cb90086b62816b9a2c8c400dc026`, or a separately reviewed descendant only if a legitimate release correction is required;
7. use the normal guarded TestFlight-first upload path and wait for VALID.

If the effective boundary has passed or any fact differs, **STOP** and publish a refreshed dry run rather than mutating production.

Build 85 archive and TestFlight upload have not begun. DEXA HealthKit remains READY/HOLD. Sleep v3 remains untouched.
