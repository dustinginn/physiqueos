# Auth session resilience and local authentication architecture

Status: Phase A security decision. No production behavior is changed by this document or its companion executable policy model.

## Decision

Do not implement the proposed rule as “accept token A again when successor B is unused.” That rule cannot distinguish a lost reply from an attacker who acquired A after the legitimate rotation. It would let that attacker invalidate B and receive fresh credentials during the grace window, changing a detected replay into session takeover.

Exact-attempt idempotency alone is also insufficient. An attacker who captures the complete first refresh request receives A and its attempt ID and can replay both. Recovery therefore requires the coordinated combination of durable rotation intent and sender constraint:

1. Pairing registers a non-exportable per-installation signing key with the Server device. Every normal rotation and recovery presentation requires a fresh application-level proof from that key.
2. Before transmission, Native atomically persists `{current: A, intentId, proposedSuccessor: B, state: pending}` in one Keychain item. The request carries A, the intent ID, and a domain-separated commitment to B, all covered by the device proof.
3. The proof binds HTTP method, canonical refresh URL, request-body digest, intent, successor commitment, a Server nonce, and a unique proof ID. A captured request cannot be replayed after its nonce/proof ID is consumed, and a new proof cannot be constructed without the enrolled private key.
4. Server locks A and commits one exchange that binds predecessor, successor hash, device key, device, session, family, intent, issued access credential, Server timestamps, and recovery count.
5. A used A is recoverable only under a fresh valid proof from the same key, for the exact committed intent and B commitment, within a short Server-clock window, while B is unused and no access credential issued by the exchange has ever authenticated a request.
6. Recovery retains B, revokes the earlier unused access credential, and issues one replacement access credential. It never creates C. Any valid-key mismatch, used B, used exchange access, expired window, or ownership mismatch retains family revocation.
7. Missing or invalid device proof is rejected and security-logged without granting recovery. It must not let an attacker revoke a family merely by presenting a stolen bearer with a bad proof.

This is a sender-constrained, idempotent exchange—not a bearer-token grace period. Server and Native must ship it as a coordinated protocol; neither half is safe alone.

## Current-state audit

The Sep 28 incident report establishes the production sequence: R1 rotated successfully at 15:32:27Z; R2 was committed but never used; R1 reappeared about three minutes later; the Server revoked its family; the app deleted its credential and showed “Not connected.” No canonical data changed.

### Server

- Pairing credentials are single-use, 10-minute high-entropy values. Pairing creates a new `devices` row, session, access token, and refresh family.
- Access tokens live for 10 minutes. Refresh credentials have a 30-day idle and 90-day absolute lifetime.
- Credentials are stored as HMAC-SHA-256 hashes with a server-held pepper.
- `rotateRefreshCredential` locks the presented row. Any `used_at` value currently revokes the entire family. A normal rotation creates access and successor refresh rows and then sets `used_at`/`replaced_by_id` in one transaction.
- Session and device status are checked. Revocation invalidates access and refresh rows.
- Production routes and runtime logging are on `origin/combined-app-platform-cutover`, not this task's `origin/main`. The refresh success event includes route/request ID/duration and no token. The failure logger supplies request ID, but reuse-specific safe metadata is absent.
- Current schema has the successor link needed for detection, but not a durable exchange, enrolled device key, nonce/proof replay state, recovery counter, or access `first_used_at` marker.
- No device-bound signing key or attestation participates in pairing or refresh.

### Native (Build 69 lineage inspected read-only)

- `ProductionNativeAPI` is an actor with one in-memory access token and a single-flight `refreshTask`.
- The refresh credential is a single Keychain generic-password item with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`. Access tokens are memory-only.
- `SecItemUpdate` atomically replaces that one value, but there is no durable “refresh in progress” state. If the Server commits and the response is lost before `persist`, the Keychain still contains A.
- The client uses ordinary `URLSession.data(for:)`; no background-task assertion surrounds refresh.
- On any 401 mapped as `.unauthenticated`, the client clears memory, deletes the Keychain credential, and retires snapshots. It does not preserve a recoverable pending attempt.
- Auth failures flow into generic view-model failures. `HomeViewModel` emits “Home could not be loaded.” The connection UI exists under You but is not the primary recovery state.
- LocalAuthentication/Face ID is not present in the inspected Native lineage.
- A separate Keychain value provides a stable local HealthKit cursor identity, but Server ingestion deliberately overwrites `deliveryDeviceId` with the authenticated session's `principal.deviceId`. Re-pairing therefore changes canonical delivery identity despite the stable local cursor identity.

## Threat model and required outcomes

| Scenario | Required outcome |
| --- | --- |
| Attacker steals unused A before rotation | Reject without a fresh proof from A's enrolled installation key. |
| Attacker steals A after legitimate rotation | Bearer and attempt state are insufficient; reject without the enrolled key. |
| Attacker captures the complete first request | Its Server nonce/proof ID is one-time. Replay is rejected; attacker cannot sign a fresh proof. |
| Legitimate client loses B response | Fresh device proof + exact durable intent/B commitment may recover while B and exchange access remain unused. |
| Client saved B but accidentally retries A | Recover only if neither B nor exchange access was used; otherwise revoke. |
| Concurrent refresh, same intent | Row lock serializes; recovery retains the one precommitted B. |
| Concurrent refresh, different intents | First commits; a later valid-key mismatch is replay and revokes. |
| Delayed first response | One intent owns one B. A recovery response issues only replacement access, not a competing successor. |
| App suspension mid-refresh | Pending A/intent/B survives; relaunch resolves it under a fresh proof before normal reads. Background assertion reduces frequency but is not the correctness mechanism. |
| Device clock manipulation | Irrelevant; Server time alone controls the retry window and expirations. |
| Repeated lost replies | Bound recovery count and Server time; then require reauthorization without silently creating a new device. |
| Replay outside window | Revoke family. |
| B already used | Revoke family. |
| Access token issued with B already used | Revoke family even when B itself is unused; the exchange demonstrably progressed. |
| Revoked session/device | Reject; never recover. |
| Multiple devices | User/device/session/family equality is mandatory; no cross-device recovery. |

The companion `RefreshRotationRecoveryPolicy` encodes these server-observable decisions and intentionally accepts no raw credential values.

## Server integration contract

Integrate on a fresh branch from the then-current production Server lineage, not by merging this audit branch wholesale.

- Register a per-installation P-256 public key during pairing; keep the private key non-exportable. Require a fresh nonce-bound proof on every refresh, not only recovery. Follow the sender-constrained direction of RFC 9700 and the proof properties of RFC 9449 without claiming interoperability.
- Extend refresh with a 128-bit-or-stronger intent ID and a domain-separated commitment to Native's precommitted B. Apply a Server-held pepper before persisting commitment lookup material; never store raw B or a directly usable client hash.
- Add a durable refresh-exchange table keyed by predecessor with device-key thumbprint, intent digest, successor hash/link, access credential IDs, Server timestamps, replay window, and bounded recovery count. Enforce user/device/session/family ownership with constraints.
- Add `first_used_at` (or an equivalent exchange-use fact) to access credentials and update it on successful access authentication. `B unused` is not enough.
- Lock the predecessor before classification. Exchange, successor, access, nonce/proof replay state, and predecessor consumption must commit atomically.
- On exact recovery, retain B, revoke the earlier unused exchange access credential, and issue one replacement access token. Missing/invalid proof rejects without recovery; a valid-key mismatch revokes the family.
- Log only event type, request ID, opaque row IDs where permitted, ages, count, and reason. Never log credentials, intents, successor commitments, nonces, signatures, or full public keys.
- Roll out without downgrade: legacy sessions retain today's strict bearer semantics; once a session/device is proof-bound it can never fall back, even if recovery is disabled or an older request shape appears.

## Native renewal contract

Integrate separately on a fresh descendant of the accepted Native release lineage after Claude's Build 69 work is frozen.

- Create/register the per-installation signing key independently of Face ID. Its unattended proof operation must not prompt on every refresh; physical-device tests must establish the correct Secure Enclave/Keychain accessibility policy.
- Replace the string-only Keychain item with one versioned Codable envelope containing A plus optional pending `{intentId, proposedSuccessor: B}`. One `SecItemUpdate` is the atomic commit boundary.
- Before sending refresh, atomically precommit A/intent/B. On interruption, cancellation, decode failure, process death, or Keychain promotion failure, retain the exact pending state. Never invent a new intent or B for A.
- Sign each first presentation or retry with a fresh Server nonce and proof ID over the exact request. A retry reuses intent/B but never reuses a consumed proof.
- After a valid response, atomically promote B and clear pending state before exposing its access token/device ID to any caller.
- Wrap foreground refresh with `UIApplication.beginBackgroundTask` and end it only after Keychain commit. Treat expiration as cancellation and leave pending state. This reduces suspensions but is not relied on for correctness.
- Keep `WhenUnlockedThisDeviceOnly`. If protected data is unavailable after reboot/lock, show “Unlock iPhone to reconnect securely” and retry after protected data becomes available. Do not weaken storage to make background refresh easier.
- Delete the Keychain session only for terminal Server states (confirmed revoke, expired absolute session, explicit disconnect), not network failures, task cancellation, invalid response, or local Keychain failure.
- Unit-test suspension after Server acceptance, Keychain failure, relaunch with pending intent, captured-request replay, nonce/proof replay, access-use recovery denial, concurrent reads, and terminal revocation. Assert request/body/debug descriptions never contain credentials, intent IDs, B commitments, proofs, or nonces.

## Face ID / local device authentication

Face ID is a local privacy and theft-resistance control, not Server authentication and not a fix for refresh rotation.

Recommended UX:

- Use `LAContext.evaluatePolicy(.deviceOwnerAuthentication, ...)` so Face ID normally appears and device passcode is the supported fallback.
- Gate cold launch and foreground return after a configurable inactivity interval (recommended five minutes). Do not prompt on each log, read, write, or 10-minute token refresh.
- A Face ID failure/cancel leaves the app locally locked. It must not delete credentials, call Server revocation, or route to pairing.
- After reboot, wait for first device unlock before credential access, then present the local gate according to policy.
- Biometric enrollment changes should cause the next local authorization to follow iOS policy; do not bind the refresh credential to `.biometryCurrentSet`, which would silently orphan the Server session and prevent background/session recovery. A separately stored local-lock secret may use stronger access control if product requirements justify it.
- No-biometric devices use device passcode. Devices without any configured device authentication should clearly explain that local app lock is unavailable; Server pairing remains valid.
- Re-pairing is reserved for terminal Server recovery, not local-auth cancellation.

The installation signing key is mandatory for safe refresh recovery, but it is not Face ID and must not require a biometric prompt for routine unattended renewal. App-unlock Face ID remains a separate UI policy. Attestation may strengthen initial key registration, but it is not currently present and must not be treated as a substitute for proof validation.

## Recovery UX state machine

Native should expose distinct states:

- `locallyLocked`: show Face ID/passcode unlock; preserve Server session.
- `refreshRecovering`: retry the persisted attempt; show existing last-known content as explicitly stale when allowed.
- `protectedDataUnavailable`: ask the user to unlock the phone; do not pair.
- `networkUnavailable`: retain credentials and offer retry.
- `reconnectRequired`: explain that this iPhone's secure connection ended and route directly to the production pairing view.
- `contentLoadFailed`: generic Home failure only for non-auth content errors.

## HealthKit identity recommendation

Do not change HealthKit identity in this workstream. Server stamping of authenticated `principal.deviceId` is a sound authorization boundary; the continuity problem is that routine re-pairing creates a new device row for the same installation.

Follow up with a key-proven reauthorization path that reuses the existing active device record for the same installation while replacement-device pairing still creates a new device. HealthKit can then retain authenticated `deviceId` without splitting a phone's delivery stream. Test key loss, reinstall, restored backup, revoked/lost device, duplicate keys, and a legitimate second iPhone.

## Verification and release gates

Before enabling sender-constrained recovery:

1. Run deterministic service tests for every threat-model row, including real concurrent database transactions.
2. Run Native tests for Keychain failures, process relaunch, background-task expiry, LocalAuthentication success/failure/cancel/passcode/no-biometric/biometric-change, UX routing, and log redaction.
3. Run an integration fault injector that drops the first successful refresh response after Server commit, relaunches Native, and proves the precommitted successor is recovered under a fresh device proof without session revocation.
4. Obtain a fresh security review of exact deployed candidates and migration SQL.
5. Deploy Server compatibility first, release Native second, enable the gated behavior last. No deploy or TestFlight action is authorized by this report.
