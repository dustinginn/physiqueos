# Auth session resilience and local authentication architecture

Status: Phase A security decision. No production behavior is changed by this document or its companion executable policy model.

## Decision

Do not implement the proposed rule as “accept token A again when successor B is unused.” That rule cannot distinguish a lost reply from an attacker who acquired A after the legitimate rotation. It would let that attacker invalidate B and receive fresh credentials during the grace window, changing a detected replay into session takeover.

Use an exactly retryable rotation instead:

1. Native generates a cryptographically random `rotationAttemptId` and atomically persists `{refreshCredential: A, pendingRotationAttemptId}` in one Keychain item before sending anything.
2. Native sends A and the attempt ID over TLS. A relaunch or retry reuses the same attempt ID until the response is durably committed.
3. Server locks A. On first use, it stores only a digest of the attempt ID and durable links to the issued access credential and successor B.
4. Server can reproduce the same credential values without storing plaintext by deriving them with a dedicated versioned HMAC key from the credential row ID and attempt ID. The existing credential pepper must not be reused for derivation.
5. A repeat of A is accepted only when the attempt digest is identical, Server time is inside a short window (recommended 120 seconds), the linked access response remains live, B exists, B is unused/unrevoked, and every user/device/session/family binding matches. The response is byte-equivalent credential material with the original expirations; no C is created.
6. Any different attempt ID, retry outside the window, used/missing/revoked B, missing/expired access response, or ownership mismatch retains current family revocation and `REFRESH_REUSE_DETECTED` behavior.

This is retry idempotency, not a bearer-token grace period.

## Current-state audit

The Sep 28 incident report establishes the production sequence: R1 rotated successfully at 15:32:27Z; R2 was committed but never used; R1 reappeared about three minutes later; the Server revoked its family; the app deleted its credential and showed “Not connected.” No canonical data changed.

### Server

- Pairing credentials are single-use, 10-minute high-entropy values. Pairing creates a new `devices` row, session, access token, and refresh family.
- Access tokens live for 10 minutes. Refresh credentials have a 30-day idle and 90-day absolute lifetime.
- Credentials are stored as HMAC-SHA-256 hashes with a server-held pepper.
- `rotateRefreshCredential` locks the presented row. Any `used_at` value currently revokes the entire family. A normal rotation creates access and successor refresh rows and then sets `used_at`/`replaced_by_id` in one transaction.
- Session and device status are checked. Revocation invalidates access and refresh rows.
- Production routes and runtime logging are on `origin/combined-app-platform-cutover`, not this task's `origin/main`. The refresh success event includes route/request ID/duration and no token. The failure logger supplies request ID, but reuse-specific safe metadata is absent.
- Current schema has the successor link needed for detection, but not an attempt digest or access-response link needed for exact retry.
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
| Attacker steals unused A before rotation | Existing bearer-token risk remains: attacker can rotate first. Phase 2 should bind refresh to a device-held signing key. |
| Attacker steals used A but not its random attempt ID | Different/missing attempt ID revokes the family. No recovery response. |
| Attacker observes A and attempt ID | TLS is the primary network control. Full endpoint compromise remains out of scope; device-bound proof is the next hardening layer. |
| Legitimate client loses B response | Same A + same attempt ID returns exactly B and the original access response. |
| Client saved B but accidentally retries A | If B is still unused, exact retry returns B; once B is used, A reuse revokes. |
| Concurrent refresh, same attempt | Row lock serializes; both responses are identical. |
| Concurrent refresh, different attempts | First commits; second is replay and revokes. |
| Delayed first response | Both responses contain the same B; Keychain replacement is idempotent. |
| App suspension mid-refresh | Pending attempt survives; relaunch retries exactly. Background assertion reduces frequency but is not the correctness mechanism. |
| Device clock manipulation | Irrelevant; Server time alone controls the retry window and expirations. |
| Repeated lost replies | Same response may be replayed repeatedly only inside the window and while B remains unused. |
| Replay outside window | Revoke family. |
| B already used | Revoke family. |
| Revoked session/device | Reject; never recover. |
| Multiple devices | User/device/session/family equality is mandatory; no cross-device recovery. |

The companion `RefreshRotationRecoveryPolicy` encodes these server-observable decisions and intentionally accepts no raw credential values.

## Server integration contract

Integrate on a fresh branch from the then-current production Server lineage, not by merging this audit branch wholesale.

- Extend refresh request with a required 128-bit-or-stronger `rotationAttemptId` for capable clients. Keep legacy clients on strict current semantics until upgraded; do not silently grant legacy grace.
- Add a `refresh_rotation_attempts` table (preferred over widening credential rows) keyed by previous refresh ID with: versioned attempt digest, successor refresh ID, access credential ID, created/expiry timestamps, and the credential-derivation key version. Enforce user/device/session/family ownership with foreign keys where possible.
- Derive access/refresh secrets with domain-separated HMAC labels and a dedicated rotation-derivation key. Store only normal credential hashes. Key rotation must retain old versions through the maximum retry window.
- Lock the previous refresh row before classifying. The attempt row, access row, successor row, and previous-row consumption must commit together.
- Log only event type, request ID, credential-row IDs if policy permits, ages, and the decision reason. Never log token or attempt-ID values/digests.
- Add metrics for `exact_retry_replayed`, `reuse_revoked`, `retry_window_expired`, and `successor_already_used` without high-cardinality secrets.
- Roll out behind an explicit capability/version gate. First deploy schema + strict-compatible server, then upgraded Native, then enable exact retry after production observation.

## Native renewal contract

Integrate separately on a fresh descendant of the accepted Native release lineage after Claude's Build 69 work is frozen.

- Replace the string-only Keychain item with one versioned Codable envelope containing refresh credential plus optional pending attempt ID. One `SecItemUpdate` is the atomic commit boundary.
- Before sending refresh, persist a new pending attempt ID. On transport interruption, cancellation, decoding failure, process death, or Keychain write failure, retain A + the same attempt ID. Never invent a new attempt for the same A.
- After a valid response, atomically replace the envelope with B and clear pending state, then publish access token/device ID in memory.
- Wrap foreground refresh with `UIApplication.beginBackgroundTask` and end it only after Keychain commit. Treat expiration as cancellation and leave pending state. This reduces suspensions but is not relied on for correctness.
- Keep `WhenUnlockedThisDeviceOnly`. If protected data is unavailable after reboot/lock, show “Unlock iPhone to reconnect securely” and retry after protected data becomes available. Do not weaken storage to make background refresh easier.
- Delete the Keychain session only for terminal Server states (confirmed revoke, expired absolute session, explicit disconnect), not network failures, task cancellation, invalid response, or local Keychain failure.
- Unit-test suspension after Server acceptance, Keychain write failure, relaunch with pending attempt, repeated identical response, concurrent reads, and terminal revocation. Assert request/body/debug descriptions never contain credentials or attempt IDs.

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

A later hardening phase may register a Secure Enclave public key at pairing and require signed refresh proofs. That key must allow background cryptographic use without a Face ID prompt; app-unlock Face ID remains a separate UI policy. Attestation can strengthen initial key registration but is not currently present and should not be improvised into this incident fix.

## Recovery UX state machine

Native should expose distinct states:

- `locallyLocked`: show Face ID/passcode unlock; preserve Server session.
- `refreshRecovering`: retry the persisted attempt; show existing last-known content as explicitly stale when allowed.
- `protectedDataUnavailable`: ask the user to unlock the phone; do not pair.
- `networkUnavailable`: retain credentials and offer retry.
- `reconnectRequired`: explain that this iPhone's secure connection ended and route directly to the production pairing view.
- `contentLoadFailed`: generic Home failure only for non-auth content errors.

## HealthKit identity recommendation

Do not change HealthKit identity in this workstream. The current coupling to `principal.deviceId` is real and undesirable for a persistent physical-phone delivery stream, but changing it affects observation identity, daily revision recovery, deduplication, and canonical history.

Follow up with a separate migration that registers a stable HealthKit delivery-source ID to the Founder and physical installation (ideally derived from a device-bound public-key fingerprint), survives session replacement/re-pair, and can be revoked independently. Preserve the existing local Keychain cursor identity. Provide migration/alias rules so historical and new delivery IDs do not split the same phone's stream.

## Verification and release gates

Before enabling exact retries:

1. Run deterministic service tests for every threat-model row, including real concurrent database transactions.
2. Run Native tests for Keychain failures, process relaunch, background-task expiry, LocalAuthentication success/failure/cancel/passcode/no-biometric/biometric-change, UX routing, and log redaction.
3. Run an integration fault injector that drops the first successful refresh response after Server commit, relaunches Native, and proves the same successor is recovered without session revocation.
4. Obtain a fresh security review of exact deployed candidates and migration SQL.
5. Deploy Server compatibility first, release Native second, enable the gated behavior last. No deploy or TestFlight action is authorized by this report.
