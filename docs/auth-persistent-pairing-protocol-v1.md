# Persistent pairing protocol v1

Status: implementation contract. Face ID and local app locking are out of scope.

## Authority and compatibility

- Server implementation base: `origin/combined-app-platform-cutover` at `98534bf8e91dd48da62fc807beae5d14c282aa04`.
- Native implementation base: accepted post-Build-69 lineage `origin/claude/native-build69-integrated-20260929` at `efa65db15a734af76fb10d01dbf6ab8cc630d7e2`.
- Existing Build 69 pairings remain on `legacy-refresh-v1` and keep strict one-use refresh semantics.
- New enrollment is guarded by `PHYSIQUEOS_SENDER_CONSTRAINED_REFRESH_ENROLLMENT=1`.
- A session persisted with `refresh_proof_version = 1` can never fall back to legacy refresh, even if enrollment is later disabled.

## Pairing

The capable client creates a non-exportable Secure Enclave P-256 signing key. Pairing may add:

```json
{
  "refreshProof": {
    "algorithm": "ES256",
    "publicKeySpki": "base64url-DER-SubjectPublicKeyInfo"
  }
}
```

The Server canonicalizes the SPKI, verifies P-256, stores the public key and SHA-256 thumbprint, and binds the new session to that key. The pair response declares either `sender-constrained-refresh-v1` or `legacy-refresh-v1`.
The same non-exportable installation key may be enrolled again by an explicit pairing ceremony after a terminal session. Thumbprints are indexed for audit correlation, not globally unique, because iOS Keychain material may survive a reconnect or app reinstall.

## Durable rotation intent

Before any refresh transmission, Native atomically persists one versioned Keychain envelope containing:

- predecessor refresh credential A;
- random 256-bit rotation intent ID;
- random precommitted successor refresh credential B;
- state `pending`.

The successor commitment is:

```text
base64url(SHA-256("physiqueos-refresh-successor-v1\0" || B))
```

Native first posts A, the intent ID, and commitment to `/api/v1/native/auth/refresh-challenge`. The Server persists only keyed digests, associates the one-time nonce with the exact credential/key/device/session/family, and returns the nonce plus challenge ID.
There is at most one unconsumed challenge row per refresh credential. Issuing a replacement challenge atomically overwrites that pending row; consumed proof identities remain durable and globally unique.

## Proof

Native signs this UTF-8 message with ECDSA P-256/SHA-256, using newline separators and no trailing newline:

```text
physiqueos-device-proof-v1
POST
/api/v1/native/auth/refresh
<body digest>
<server nonce>
<random proof ID>
```

The body digest is base64url SHA-256 of:

```text
physiqueos-refresh-request-v1
<A>
<intent ID>
<B>
<successor commitment>
```

The proof signature is DER-encoded ECDSA, base64url encoded. The refresh request carries A, intent, B, commitment, challenge ID, nonce, proof ID, and signature. Neither endpoint may log those values.

## Atomic Server behavior

For an unused A with a valid fresh proof, one transaction creates access token X, stores B as the only successor, consumes A, consumes the nonce/proof ID, and creates the durable exchange. The response returns X and B.

For a used A, recovery is allowed only when a new nonce and proof validate against the same enrolled key and exact committed intent/B, Server time is within two minutes, B is unused and unrevoked, every access credential ever issued by the exchange has `first_used_at IS NULL`, all authority bindings match, and fewer than two recoveries have occurred. Recovery revokes prior unused exchange access credentials, creates only a replacement access credential, retains B, and increments the durable count. It never creates C.

Invalid or missing proof rejects without bearer recovery and without attacker-triggered family revocation. A valid enrolled-key presentation that conflicts with the committed exchange, a used B, any used exchange access token, an expired recovery window, or exhausted recovery fails closed. Device/session revocation remains authoritative.

## Rollout and rollback

1. Apply migration `000015_sender_constrained_refresh_recovery` and deploy the compatible Server with enrollment disabled.
2. Observe legacy Build 69 pair/refresh/session behavior.
3. Release the capable Native build with local enablement disabled.
4. Enable Server enrollment, then Native enrollment for a controlled installation.
5. Verify challenge, first rotation, simulated lost-response recovery, access first-use denial, revocation, and secret-free events.
6. Expand only after the exact Server and Native SHAs pass fresh security review.

Rollback disables new enrollment first. Existing proof-bound sessions must continue using the proof-capable Server; never route them to legacy refresh. If the proof path itself must be withdrawn, revoke affected proof-bound sessions and require explicit reconnect. Do not drop migration state until no proof-bound session or recovery window remains.

## Separate follow-up

HealthKit `deliveryDeviceId` decoupling remains a separate recommendation. This protocol does not change HealthKit identity.
