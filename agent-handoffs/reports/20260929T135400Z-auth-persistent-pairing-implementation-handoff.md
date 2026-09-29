# Founder handoff — sender-constrained persistent pairing

Status: implementation and validation complete; no deployment, TestFlight upload, or merge performed.

Decision authority: `origin/main` at `a7986df74e3fbb10da3b73785023da58a595cad4`, file `agent-handoffs/inbox/decisions/20260929T070000Z-auth-persistent-pairing-proceed-faceid-deferred.md`.

## Exact implementation branches and SHAs

- Server branch: `codex/auth-persistent-pairing-server-20260929`
- Server reviewed implementation: `5f51dc4db34995c201d9e5f97aa69ab70043b080`
- Server authority base: `98534bf8e91dd48da62fc807beae5d14c282aa04` (`origin/combined-app-platform-cutover`)
- Native branch: `codex/auth-persistent-pairing-native-20260929`
- Native reviewed implementation: `0555485511d9b65944cfbf072079b3928cd4599b`
- Native authority base: `efa65db15a734af76fb10d01dbf6ab8cc630d7e2` (`origin/claude/native-build69-integrated-20260929`)
- Architecture audit input only: `origin/codex/auth-session-resilience-faceid` at `0420560b`; it was not merged.

The Server and Native branches were implemented independently from their respective authorities. Claude peptide branches and worktrees were not modified.

## Protocol and persistence

1. A capable Native installation creates a permanent P-256 Secure Enclave private key with `WhenUnlockedThisDeviceOnly`. The private key is non-exportable and has no Face ID, LocalAuthentication, user-presence, or app-lock policy.
2. Pairing advertises ES256 plus DER SubjectPublicKeyInfo only when the Native Info.plist rollout key `PHYSIQUEOSSenderConstrainedRefreshEnrollment` is true and Server enrollment flag `PHYSIQUEOS_SENDER_CONSTRAINED_REFRESH_ENROLLMENT=1` is enabled. Both default off.
3. Before any refresh network call, Native atomically persists one versioned Keychain envelope containing predecessor A, random rotation intent, and precommitted successor B.
4. Native requests a Server challenge bound to A, intent, B commitment, installation key, user, device, session, and family. Only one unconsumed challenge row can exist per refresh credential; replacement is atomic.
5. Native signs the canonical request digest, one-time nonce, and fresh proof ID with the Secure Enclave key. Swift and Node share a deterministic canonicalization vector.
6. The first valid request atomically consumes A and the challenge/proof identity, creates B, issues access X, and records the durable exchange. There is no bearer grace.
7. A lost response can issue a fresh challenge and recover only that exact exchange while B and every exchange access credential remain unused, authority remains active and matching, Server time remains inside two minutes, and fewer than two recoveries have occurred. Recovery revokes prior unused exchange access tokens, replaces only access X, and retains B.
8. Used B, used exchange access, conflicting valid-key intent/commitment, expired recovery, exhausted recovery, or revoked device/session fails closed. Invalid or replayed proof rejects without attacker-triggered family revocation and does not erase Native's recoverable envelope.
9. Native promotes B and publishes access state only after the atomic Keychain update succeeds. Relaunch resolves pending rotation before ordinary authenticated reads.
10. Explicit pairing may reenroll the same Secure Enclave public key after a terminal reconnect. Thumbprints are indexed for audit correlation but are not globally unique because Keychain material may survive reconnect or reinstall.

## Schema changes

Migration `db/migrations/000015_sender_constrained_refresh_recovery.cjs` adds:

- `devices.refresh_proof_capability`;
- `installation_signing_keys` with device/user ownership, ES256 SPKI, thumbprint index, active/revoked state, and one current key association per device enrollment;
- proof-version/key binding on `sessions` with a consistency constraint;
- `access_credentials.first_used_at`;
- durable `refresh_proof_challenges` with nonce/intent/commitment HMAC digests, globally unique consumed proof-ID digests, expiry, and a partial unique index bounding pending challenges;
- durable `refresh_exchanges` binding predecessor, successor, intent, commitment, key/device/session/family, Server recovery deadline, and maximum recovery count;
- `refresh_exchange_access_credentials` so every access token issued by an exchange is checked before recovery.

Do not destructively roll this migration back while any proof-bound session or retained audit/replay record exists.

## Compatibility rollout and deployment order

1. Apply migration `000015`.
2. Deploy Server SHA `5f51dc4db34995c201d9e5f97aa69ab70043b080` with `PHYSIQUEOS_SENDER_CONSTRAINED_REFRESH_ENROLLMENT` unset/off.
3. Verify existing Build 69 devices continue strict `legacy-refresh-v1` one-use rotation. Existing proof-bound sessions, if any, remain proof-required and never downgrade.
4. Release Native SHA `0555485511d9b65944cfbf072079b3928cd4599b` with Info.plist `PHYSIQUEOSSenderConstrainedRefreshEnrollment=false`.
5. Enable the Server flag first.
6. Produce a separately reviewed controlled Native canary with the Info.plist gate true for only the intended installation. Pair/reconnect that installation so Server returns `sender-constrained-refresh-v1`.
7. Verify normal rotation, simulated lost response, stale challenge retry, access-first-use denial, revocation, reconnect with the same install key, bounded challenge persistence, and secret-free security events before broader enablement.
8. Expand enrollment only after operational evidence is clean. Never deploy only Native or remove proof support from Server while enrolled sessions remain.

Existing Build 69 Keychain strings remain readable and migrate to the versioned envelope on the next successful strict legacy save. They are not silently upgraded to sender-constrained sessions; enrollment requires a controlled pairing/reconnect ceremony.

## Rollback

- First disable `PHYSIQUEOS_SENDER_CONSTRAINED_REFRESH_ENROLLMENT` to stop new Server enrollments.
- Keep the proof-capable Server code and migration for already enrolled sessions; turning enrollment off does not and must not downgrade them.
- Roll Native back to Build 69 if necessary; legacy sessions continue strict rotation. Enrolled sessions cannot be serviced by Build 69 and must be explicitly revoked/re-paired if that Native rollback is required on an enrolled installation.
- If the proof path must be withdrawn, revoke affected proof-bound sessions and require explicit reconnect. Do not add bearer grace and do not reuse a consumed predecessor.
- Preserve exchange/challenge replay records through their operational/audit retention window. Do not drop migration state as a hot rollback.

## Threat matrix and validation

Server deterministic coverage includes normal rotation, lost response/relaunch, captured refresh bearer without proof, captured old request, nonce replay, proof-ID replay, wrong installation key, intent mismatch, commitment mismatch, successor use, exchange-access use, Server-time window, recovery exhaustion, revoked device/session, same/different-intent serialization, multiple devices, same-key re-pair, bounded pending challenges, Build 69 compatibility, shared Swift/Node canonicalization, and secret-free security events.

Native deterministic coverage includes durable pre-network A/intent/B, lost response and relaunch, fresh proof identities, retry after `DEVICE_PROOF_INVALID`, Keychain promotion failure, terminal reconnect cleanup, unknown 401 preservation, rollout default-off, Secure Enclave/device-only/no-local-gate attributes, shared canonicalization, explicit recovery/offline/reconnect UI, and background assertion lifecycle.

Validation on the exact implementation SHAs:

- Server `npm run test:phase2`: 13 files, 121 tests passed.
- Server `npm run test:foundation`: 9 files, 38 tests passed.
- Server exact auth/schema set: 5 files, 59 tests passed.
- Server ESLint on every changed JS/CJS file: passed.
- Server diff whitespace check: passed.
- Broader `vitest.native-sandbox.config.js`: 297/299 passed; two untouched `PostgresEvidenceReviewReadStore.test.js` assertions fail because production now returns an additional `presentation` object. Neither the failing tests nor their implementation are changed by this branch; all auth files in this configuration passed.
- Native complete `PhysiqueOSTests`: 1,512 tests passed, 0 failed, 0 skipped on iPhone 17 Pro simulator (iOS 26.5).
- Native focused remediation tests: the four security-remediation cases and the final two proof-recovery/explicit-UX cases passed.
- Native unsigned Release `iphoneos` generic-device build with whole-module optimization: passed.
- Native Info.plist lint and Git diff whitespace check: passed.

## Fresh-context security review

The first review of Server `19f0ff6d8ca9d7591d213f037c99a80141546e09` and Native `e1555c6a30afdcaac6701ed61c65d8620dc0a4c8` blocked shipment. It found that `DEVICE_PROOF_INVALID` incorrectly erased recoverable Native state, same-key reconnect collided with a globally unique thumbprint, Native lacked a local canary gate, and pending challenges were unbounded. Those findings were remediated and regression-tested in the final SHAs above.

A second clean-context review of exact Server `5f51dc4db34995c201d9e5f97aa69ab70043b080` and Native `8cbb5c3faeaf1b89d4335544ac9d68b9f7105dd7` returned SHIP with no P0/P1 issue and one P2: retryable proof rejection still reached generic Home failure. Native `0555485511d9b65944cfbf072079b3928cd4599b` maps that condition to explicit `sessionRecoveryUnavailable` without changing the terminal allowlist or deleting the envelope.

The final independent fresh-context review inspected exact Server `5f51dc4db34995c201d9e5f97aa69ab70043b080` and Native `0555485511d9b65944cfbf072079b3928cd4599b` and returned **SHIP** for the prescribed staged, default-off rollout:

- P0: 0
- P1: 0
- P2: 0

It explicitly confirmed that stale/replayed/invalid/wrong-key proofs remain unable to rotate or recover; fresh nonce/proof ID and exact authority/intent/successor binding remain mandatory; used successor, used exchange access, expired/exhausted recovery, valid-key conflict, and revocation remain terminal; Build 69 stays strict legacy; both rollout gates default off; reconnect, Keychain atomicity, Secure Enclave/no-biometric properties, bounded challenges, explicit UX, and secret-free logging are intact. The review was read-only and made no workspace or external changes.

## Founder acceptance checklist

- [x] Persistent trusted-installation/session recovery implemented without bearer grace.
- [x] Build 69 behavior remains strict and compatible.
- [x] Non-exportable unattended installation key; public enrollment only.
- [x] Durable client intent and durable exact Server exchange.
- [x] Fresh nonce/proof ID replay defense.
- [x] Successor/access first-use denial and bounded fail-closed recovery.
- [x] Atomic Keychain transition and relaunch resolution.
- [x] Authenticated, recovering, temporarily offline/last-known, reconnect-required, and unpaired states represented.
- [x] Reconnect routes to the production pairing experience.
- [x] No Face ID, LocalAuthentication, local app lock, or biometric timeout policy.
- [x] No HealthKit `deliveryDeviceId` coupling change; decoupling remains a separate follow-up.
- [x] No credential, intent, successor, nonce, proof, signature, or key material in security events.
- [x] No deployment, TestFlight upload, or merge performed.
- [x] Claude/Fable peptide work remained untouched.
