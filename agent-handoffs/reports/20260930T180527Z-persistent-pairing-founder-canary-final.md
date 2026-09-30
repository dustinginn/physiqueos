# Founder persistent-pairing canary — final

Status: **accepted for ongoing Founder use; controlled canary complete**.

Decision executed: `agent-handoffs/inbox/decisions/20260930T174500Z-persistent-pairing-post-enrollment-verification.md`. Parent decisions and the pre-enrollment checkpoint remain the authority chain. No HealthKit Sleep or Photo work was started. No destructive revocation, sign-out, or reconnect test was performed.

## Exact authorities

- Repository: `dustinginn/physiqueos`.
- Production branch: `combined-app-platform-cutover`.
- Production Server source: **`372c306ba45ffaa0f93f7bf74e4c0c266070d9a5`**.
- Active deployment: **`efd356b0-99ad-4928-90cf-a037024c28eb`**, ACTIVE 9/9.
- Web and worker deployment source: exact `372c306b`.
- Runtime build: `physiqueos-372c306b-20260930`.
- Native canary branch: `codex/persistent-pairing-founder-canary-20260930`.
- Exact Native Build 72 source: **`279103107f044141aa4c9a7487f281dc6fd19423`**.
- The remote production and Native branch tips were reverified at those exact SHAs at closeout.
- Physical Founder iPhone inventory showed PhysiqueOS **1.0 (72)** installed under `com.physiqueos.native.dev`.

Final `/live` and `/ready` checks were green. Migration `000015_sender_constrained_refresh_recovery` remains present. The web-only enrollment flag remains enabled; the worker has no enrollment flag. No configuration or code deployment occurred during post-enrollment verification.

## Enrollment proof — exactly one intended installation

Pre-enrollment baseline from the mandatory checkpoint:

- installation signing keys: 0;
- capable devices: 0;
- proof-bound sessions: 0;
- active legacy sessions: 6.

Immediately after the Founder-reported Build 72 connection, bounded read-only production evidence showed:

- installation signing keys: **1 total / 1 active / 1 device / 1 user**;
- proof-bound sessions: **1 total / 1 active / 1 device / 1 user**;
- capable devices: **1**;
- exact session/key/device/user binding checks: **1 of 1 valid**, ES256 and active;
- active legacy sessions: **5**, exactly one fewer than baseline, explained by the instructed intentional disconnect;
- no second key, capable device, proof-bound session, or unrelated migration;
- no challenge or exchange existed yet at that first snapshot, proving this was the new enrollment state rather than a later inferred association.

The installation key and proof-bound session were created together after the Founder action. No key, credential, device/session identifier, or Founder payload is included here.

## Real production normal refresh and relaunch

The paired physical iPhone was non-destructively terminated and relaunched with the system device tooling. Build 72 reopened without re-pairing and performed authenticated production reads.

Post-relaunch production state:

- one challenge, consumed once, with zero pending challenges;
- one exchange bound to one exact successor;
- two proof-session refresh records: one predecessor used, one current successor active/unused, zero revoked;
- two proof-session access records, both first-used, zero revoked;
- one active proof-bound session and one active installation key remained;
- the session last-seen timestamp advanced after relaunch.

Result: **PASS** for ordinary proof-bound refresh, authenticated reads, relaunch without re-pair, exact successor promotion, and retained active session.

The real session stayed `refresh_proof_version = 1` through the rotation. No bearer-only fallback occurred. The refresh required an unattended installation-key signature and completed during the automated relaunch without Founder interaction. The Build 72 archive has no `NSFaceIDUsageDescription`, the source contains no LocalAuthentication gate, and the focused Native key-attribute test passed. Result: **PASS** for non-downgrade and absence of a Face ID/user-presence refresh gate.

## Non-destructive lost-response and negative probes

The shipped production app intentionally exposes no operator endpoint that can extract its Keychain credential/private key or manufacture an attack proof. After the real relaunch, its exchange access credential was already first-used; manipulating that live session to force an artificial loss would be destructive or would require an unreviewed hook. Therefore the authorized negative and response-loss probes were run through the reviewed deterministic harnesses on the exact deployed Server SHA and exact Build 72 source. The live Founder session was not used as an attack target.

Exact Server `372c306b`:

- focused auth/schema invocation: **3 files, 24/24 tests passed**;
- verbose threat/persistence matrix: **2 files, 22/22 tests passed**.

The matrix passed:

- normal proof-bound rotation;
- durable exact-successor lost-response recovery after suspension/relaunch, without creating C;
- captured bearer/missing-proof rejection without revoking the legitimate family;
- captured old request, nonce replay, and proof-ID replay rejection without bearer recovery;
- wrong installation-key rejection without revoking the family;
- conflicting valid-key intent/commitment fail-closed behavior;
- denial after successor use and after any associated access first use;
- Server-time recovery window, bounded recovery count, revoked authority, and concurrency serialization;
- strict Build 69 legacy behavior and no proof-bound downgrade;
- secret-free security-event construction.

Exact Native Build 72 source `27910310`:

- six focused `FounderServerAPITests`: **6/6 passed**;
- durable pending intent before transmission;
- lost response survives relaunch and recovers the exact successor with fresh proof;
- stale/replayed proof keeps the pending intent and retries with a fresh challenge;
- failed atomic promotion publishes no access and retains recovery state;
- installation key is non-exportable, device-only, and unattended;
- pairing advertises and persists the sender-constrained envelope.

The earlier exact-candidate focused suite remains **243/243 passed**. Broad suites were not rerun for this operational continuation.

Results:

- reviewed non-destructive lost-response recovery: **PASS**;
- stale challenge/retry semantics: **PASS**;
- nonce/proof replay rejection: **PASS**;
- wrong-key rejection: **PASS**;
- access-first-use/reuse protection: **PASS**;
- retained valid session after negative probes: **PASS** (the probes were isolated harness probes; production stayed active);
- terminal revocation/reconnect was not triggered.

## Privacy and logging audit

A sanitized scan of 521 current production web-log lines found:

- one device-registration event and one challenge-issued event;
- expected refresh-success events;
- **0** forbidden auth-secret field labels;
- **0** bearer headers;
- **0** credential-shaped material.

Production security-event aggregation since enrollment contains exactly one accepted pairing-consumption event and one accepted proof-bound rotation event. Only field names and value shapes were inspected: none of their values were credential-shaped. No pairing code, token, private/public key material, raw proof, nonce, proof ID, signature, successor credential, credential hash, or private Founder payload was printed, stored in the report, or pushed.

## Product/data drift

No auth canary command mutated goals, plans, protocols, executions, check-ins, briefings, confidence, evidence intake, media, uploads, stored objects, or relationships.

The requested real app relaunch did invoke Build 72's already-established automatic HealthKit workflow: one operational `activity_summary` observation was committed and its Activity canonical day updated. This was a normal existing daily-driver side effect, not canary test fabrication, not Sleep, and not a code or policy change. One pre-existing briefing cadence operation also advanced independently on its normal worker schedule. No Sleep or Photo record changed and no HealthKit/Photo implementation was touched.

Build 72 remained usable after the real refresh and relaunch. Final production health remained green.

## Final state and rollout recommendation

- intended Founder installation key: active;
- intended proof-bound session: active;
- capable/proof-bound installations: exactly one;
- current successor refresh state: active, not revoked;
- new-enrollment flag: still enabled on web only;
- proof-capable Server and migration 000015: retained.

Recommendation: **accept persistent pairing for ongoing Founder use and disable new enrollment now**, while preserving the active proof-bound session. The canary objective is complete and there is no reason to leave an enrollment window open before a separate rollout decision. This report recommends that next operation but does not silently change the flag because this decision requested a recommendation, not another configuration deployment.

Disable-new-enrollment procedure:

1. remove or disable only the web `PHYSIQUEOS_SENDER_CONSTRAINED_REFRESH_ENROLLMENT` runtime entry through the complete reviewed live spec;
2. wait for the config deployment to reach ACTIVE 9/9;
3. reverify exact approved web/worker source, `/live`, `/ready`, runtime flag false, and worker flag absent;
4. verify the existing one proof-bound session/key remains active;
5. retain Server proof support and migration 000015; never route that session to bearer-only refresh.

Rollback remains: stop new enrollment first; retain proof-capable code and schema for the active Founder session. If proof support itself must be withdrawn, that requires explicit destructive authorization to revoke the session and reconnect. Never add bearer grace or downgrade the proof-bound session.

## Destructive tests intentionally not run

No live session revocation, sign-out, wrong-key attack, credential replay, terminal recovery exhaustion, or forced reconnect was performed. The reviewed non-destructive harness supplies those rejection proofs without risking Founder repair. A destructive live test remains outside this authorization and requires separate Founder approval.

## Local-only state

- Build 72 archive remains in Xcode Archives from the release step.
- The exact Native worktree remains clean at `27910310`.
- Temporary simulator DerivedData/XCResult and a stream-only log-shape scanner remain under `/private/tmp`; they contain no production credential or Founder payload and were not pushed.
- Final disk free: approximately 37.3 GiB. Simulator activity raised encrypted swap to approximately 1.34 GiB; no resource floor was approached.

## Final recommendation

**Persistent sender-constrained pairing is accepted for ongoing Founder use.** Keep the intended session active, disable new enrollment in the next explicitly authorized config-only operation, and do not broaden enrollment or start a destructive session test without a separate decision.
